import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { ProcessingResult } from '../types';
import type { ExperienceRecord } from './ExperienceRecord';

export interface ExperienceStore {
  record(result: ProcessingResult, tenantId?: string): Promise<void>;
  getLatest(sourceType: string, tenantId?: string): Promise<ExperienceRecord | null>;
  getByOutcome(
    outcome: ProcessingResult['outcome'],
    tenantId?: string
  ): Promise<ExperienceRecord[]>;
  addHumanFeedback(
    recordId: string,
    feedback: string,
    correctedResult?: unknown,
    tenantId?: string
  ): Promise<void>;
  getLearnableRecords(tenantId?: string): Promise<ExperienceRecord[]>;
  // Pipeline-compatible methods
  getHistoricalContext(contentItemId: string): Promise<unknown>;
  recordProcessing(contentItemId: string, result: ProcessingResult): Promise<void>;
}

function hashContent(content: Uint8Array): string {
  return createHash('sha256').update(content).digest().slice(0, 16).toString('hex');
}

export interface LocalExperienceStoreOptions {
  filePath?: string;
}

interface PersistedExperienceStore {
  version: 1;
  records: Array<[string, ExperienceRecord[]]>;
}

export class LocalExperienceStore implements ExperienceStore {
  private records: Map<string, ExperienceRecord[]> = new Map();
  private readonly filePath?: string;
  private loadPromise?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: LocalExperienceStoreOptions = {}) {
    this.filePath = options.filePath;
  }

  async record(result: ProcessingResult, tenantId: string = 'default'): Promise<void> {
    await this.ensureLoaded();

    const sourceType = this.extractSourceType(result.contentItem);
    const contentType = result.contentItem.hints.mimeType ?? 'unknown';
    const rawHash = hashContent(result.contentItem.raw);
    const size = result.contentItem.raw.length;

    const strategiesUsed = result.strategiesUsed.map((s) => s.strategyId);
    const fusionMethod = 'default';
    const finalConfidence = result.confidence.overall;

    const record: ExperienceRecord = {
      id: `${tenantId}:${sourceType}:${randomBytes(8).toString('hex')}`,
      tenantId,
      contentItemId: result.contentItem.id,
      input: {
        sourceType,
        contentType,
        rawHash,
        size,
      },
      processing: {
        strategiesUsed,
        fusionMethod,
        finalConfidence,
        processingTimeMs: result.processingTimeMs,
        retryCount: result.retryCount,
      },
      outcome: result.outcome,
      learning: {
        isLearned: false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const key = `${tenantId}:${sourceType}`;
    const existing = this.records.get(key) ?? [];
    existing.push(record);
    this.records.set(key, existing);
    await this.persist();
  }

  async getLatest(sourceType: string, tenantId: string = 'default'): Promise<ExperienceRecord | null> {
    await this.ensureLoaded();

    const key = `${tenantId}:${sourceType}`;
    const records = this.records.get(key);
    if (!records || records.length === 0) {
      return null;
    }
    return records[records.length - 1];
  }

  async getByOutcome(
    outcome: ProcessingResult['outcome'],
    tenantId: string = 'default'
  ): Promise<ExperienceRecord[]> {
    await this.ensureLoaded();

    const results: ExperienceRecord[] = [];
    for (const [key, records] of this.records.entries()) {
      const keyTenantId = key.split(':')[0];
      if (tenantId !== keyTenantId) {
        continue;
      }
      for (const record of records) {
        if (record.outcome === outcome) {
          results.push(record);
        }
      }
    }
    return results;
  }

  async addHumanFeedback(
    recordId: string,
    feedback: string,
    correctedResult?: unknown,
    tenantId: string = 'default'
  ): Promise<void> {
    await this.ensureLoaded();

    for (const records of this.records.values()) {
      for (const record of records) {
        if ((record.id === recordId || record.contentItemId === recordId) && record.tenantId === tenantId) {
          record.humanFeedback = {
            correctedResult,
            feedback,
          };
          record.updatedAt = Date.now();
          await this.persist();
          return;
        }
      }
    }
  }

  async getLearnableRecords(tenantId: string = 'default'): Promise<ExperienceRecord[]> {
    await this.ensureLoaded();

    const results: ExperienceRecord[] = [];
    for (const [key, records] of this.records.entries()) {
      const keyTenantId = key.split(':')[0];
      if (tenantId !== keyTenantId) {
        continue;
      }
      for (const record of records) {
        if (record.humanFeedback && !record.learning.isLearned) {
          results.push(record);
        }
      }
    }
    return results;
  }

  // Pipeline interface adapters (Pipeline.ts expects getHistoricalContext + recordProcessing)
  async getHistoricalContext(contentItemId: string): Promise<unknown> {
    await this.ensureLoaded();

    for (const records of this.records.values()) {
      for (let index = records.length - 1; index >= 0; index--) {
        const record = records[index];
        if (record.contentItemId === contentItemId) {
          return record.processing.finalConfidence;
        }
      }
    }
    return undefined;
  }

  async recordProcessing(_contentItemId: string, result: ProcessingResult): Promise<void> {
    // Translate Pipeline's recordProcessing to our record method
    await this.record(result);
  }

  private extractSourceType(contentItem: { source: string; meta: Record<string, unknown> }): string {
    return contentItem.meta.sourceType as string ?? contentItem.source.split(':')[0];
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    this.loadPromise ??= this.load();
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const persisted = JSON.parse(raw) as PersistedExperienceStore;

      if (persisted.version !== 1 || !Array.isArray(persisted.records)) {
        throw new Error('Unsupported experience store format');
      }

      this.records = new Map(persisted.records);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  private async persist(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    const snapshot: PersistedExperienceStore = {
      version: 1,
      records: Array.from(this.records.entries()),
    };

    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath!), { recursive: true });
      const tempPath = `${this.filePath}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
      await rename(tempPath, this.filePath!);
    });

    await this.writeQueue;
  }
}
