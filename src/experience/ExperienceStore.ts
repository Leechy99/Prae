import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { ProcessingResult } from '../types';
import type { ExperienceRecord } from './ExperienceRecord';

export type ExperienceRecordFilter = 'recent' | 'learnable';

export interface ExperienceRecordQuery {
  filter?: ExperienceRecordFilter;
  tenantId?: string;
  sourceType?: string;
  outcome?: ProcessingResult['outcome'];
  limit?: number;
}

export interface ExperienceStore {
  record(result: ProcessingResult, tenantId?: string): Promise<void>;
  getLatest(sourceType: string, tenantId?: string): Promise<ExperienceRecord | null>;
  getByOutcome(
    outcome: ProcessingResult['outcome'],
    tenantId?: string
  ): Promise<ExperienceRecord[]>;
  getRecords(query?: ExperienceRecordQuery): Promise<ExperienceRecord[]>;
  addHumanFeedback(
    recordId: string,
    feedback: string,
    correctedResult?: unknown,
    tenantId?: string
  ): Promise<boolean>;
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

  async getRecords(query: ExperienceRecordQuery = {}): Promise<ExperienceRecord[]> {
    await this.ensureLoaded();

    const tenantId = query.tenantId ?? 'default';
    const results: Array<{ record: ExperienceRecord; order: number }> = [];
    let order = 0;

    for (const records of this.records.values()) {
      for (const record of records) {
        const isLearnable = Boolean(record.humanFeedback && !record.learning.isLearned);
        const shouldInclude =
          record.tenantId === tenantId &&
          (!query.sourceType || record.input.sourceType === query.sourceType) &&
          (!query.outcome || record.outcome === query.outcome) &&
          (query.filter !== 'learnable' || isLearnable);

        if (shouldInclude) {
          results.push({ record, order });
        }

        order += 1;
      }
    }

    const sorted = results
      .sort((a, b) => b.record.createdAt - a.record.createdAt || b.order - a.order)
      .map(({ record }) => record);

    return query.limit === undefined ? sorted : sorted.slice(0, query.limit);
  }

  async addHumanFeedback(
    recordId: string,
    feedback: string,
    correctedResult?: unknown,
    tenantId: string = 'default'
  ): Promise<boolean> {
    await this.ensureLoaded();

    let matchingRecord: ExperienceRecord | undefined;

    // Generated record IDs are explicit targets and must keep their exact-match behavior.
    for (const records of this.records.values()) {
      for (let index = records.length - 1; index >= 0; index--) {
        const record = records[index];
        if (record.id === recordId && record.tenantId === tenantId) {
          matchingRecord = record;
          break;
        }
      }
      if (matchingRecord) break;
    }

    // A content item may have multiple attempts; feedback belongs to its terminal record.
    if (!matchingRecord) {
      for (const records of this.records.values()) {
        for (let index = records.length - 1; index >= 0; index--) {
          const record = records[index];
          if (record.contentItemId === recordId && record.tenantId === tenantId) {
            const isNewer = !matchingRecord
              || record.createdAt > matchingRecord.createdAt
              || (
                record.createdAt === matchingRecord.createdAt
                && record.processing.retryCount > matchingRecord.processing.retryCount
              );
            if (isNewer) {
              matchingRecord = record;
            }
          }
        }
      }
    }

    if (matchingRecord) {
      matchingRecord.humanFeedback = {
        correctedResult,
        feedback,
      };
      matchingRecord.updatedAt = Date.now();
      await this.persist();
      return true;
    }

    return false;
  }

  async getLearnableRecords(tenantId: string = 'default'): Promise<ExperienceRecord[]> {
    return this.getRecords({ filter: 'learnable', tenantId });
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
