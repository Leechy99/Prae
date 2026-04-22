import { createHash, randomBytes } from 'crypto';
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
}

function hashContent(content: Uint8Array): string {
  return createHash('sha256').update(content).digest().slice(0, 16).toString('hex');
}

export class LocalExperienceStore implements ExperienceStore {
  private records: Map<string, ExperienceRecord[]> = new Map();

  async record(result: ProcessingResult, tenantId: string = 'default'): Promise<void> {
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
  }

  async getLatest(sourceType: string, tenantId: string = 'default'): Promise<ExperienceRecord | null> {
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
    for (const records of this.records.values()) {
      for (const record of records) {
        if (record.id === recordId && record.tenantId === tenantId) {
          record.humanFeedback = {
            correctedResult,
            feedback,
          };
          record.updatedAt = Date.now();
          return;
        }
      }
    }
  }

  async getLearnableRecords(tenantId: string = 'default'): Promise<ExperienceRecord[]> {
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

  private extractSourceType(contentItem: { source: string; meta: Record<string, unknown> }): string {
    return contentItem.meta.sourceType as string ?? contentItem.source.split(':')[0];
  }
}