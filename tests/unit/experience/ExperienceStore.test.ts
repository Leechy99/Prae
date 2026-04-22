import { LocalExperienceStore } from '../../../src/experience/ExperienceStore';
import type { ContentItem, ProcessingResult, StrategyExecution, ConfidenceScore } from '../../../src/types';

function createMockContentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'test-content-1',
    source: 'test://source',
    raw: new Uint8Array([1, 2, 3]),
    meta: { sourceType: 'test' },
    hints: { mimeType: 'text/plain' },
    ...overrides,
  };
}

function createMockProcessingResult(overrides: Partial<ProcessingResult> = {}): ProcessingResult {
  const mockExecutions: StrategyExecution[] = [
    {
      id: 'exec-1',
      strategyId: 'strategy-1',
      startedAt: Date.now() - 100,
      completedAt: Date.now(),
      success: true,
      output: { cleaned: true },
    },
  ];

  const mockConfidence: ConfidenceScore = {
    overall: 0.85,
    components: {
      textQuality: 0.9,
      entityExtraction: 0.8,
      structuralIntegrity: 0.85,
      contextualCoherence: 0.8,
    },
    bonus: {
      historicalConsistency: 0.1,
      multiStrategyAgreement: 0.05,
    },
    isPassing: true,
  };

  return {
    id: 'result-1',
    contentItem: createMockContentItem(),
    strategiesUsed: mockExecutions,
    fusedOutput: { success: true },
    confidence: mockConfidence,
    outcome: 'SUCCESS',
    processingTimeMs: 150,
    retryCount: 0,
    ...overrides,
  };
}

describe('LocalExperienceStore', () => {
  let store: LocalExperienceStore;

  beforeEach(() => {
    store = new LocalExperienceStore();
  });

  describe('record', () => {
    it('stores a processing result', async () => {
      const result = createMockProcessingResult();
      await store.record(result);

      const record = await store.getLatest('test');
      expect(record).not.toBeNull();
      expect(record?.outcome).toBe('SUCCESS');
    });

    it('stores with custom tenantId', async () => {
      const result = createMockProcessingResult();
      await store.record(result, 'tenant-2');

      const record = await store.getLatest('test', 'tenant-2');
      expect(record?.tenantId).toBe('tenant-2');
    });

    it('stores multiple records for same source type', async () => {
      const result1 = createMockProcessingResult({ id: 'result-1' });
      const result2 = createMockProcessingResult({ id: 'result-2' });

      await store.record(result1);
      await store.record(result2);

      const records = await store.getByOutcome('SUCCESS');
      expect(records.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getLatest', () => {
    it('returns most recent record', async () => {
      const result1 = createMockProcessingResult({ id: 'result-1' });
      const result2 = createMockProcessingResult({ id: 'result-2' });

      await store.record(result1);
      await store.record(result2);

      const latest = await store.getLatest('test');
      expect(latest?.outcome).toBe('SUCCESS');
    });

    it('returns null when no records exist', async () => {
      const record = await store.getLatest('nonexistent');
      expect(record).toBeNull();
    });
  });

  describe('getByOutcome', () => {
    it('filters records by outcome', async () => {
      const successResult = createMockProcessingResult({ outcome: 'SUCCESS' });
      const failedConfidence: ConfidenceScore = {
        overall: 0.2,
        components: {
          textQuality: 0.2,
          entityExtraction: 0.2,
          structuralIntegrity: 0.2,
          contextualCoherence: 0.2,
        },
        bonus: {
          historicalConsistency: 0,
          multiStrategyAgreement: 0,
        },
        isPassing: false,
      };
      const failedResult = createMockProcessingResult({
        id: 'result-2',
        outcome: 'FAILED',
        confidence: failedConfidence,
      });

      await store.record(successResult);
      await store.record(failedResult);

      const failedRecords = await store.getByOutcome('FAILED');
      expect(failedRecords.every((r) => r.outcome === 'FAILED')).toBe(true);
    });
  });

  describe('addHumanFeedback', () => {
    it('adds feedback to a record', async () => {
      const result = createMockProcessingResult();
      await store.record(result);

      const record = await store.getLatest('test');
      expect(record).not.toBeNull();

      await store.addHumanFeedback(record!.id, 'Needs better entity extraction', undefined, 'default');

      const updated = await store.getLatest('test');
      expect(updated?.humanFeedback?.feedback).toBe('Needs better entity extraction');
    });

    it('includes corrected result when provided', async () => {
      const result = createMockProcessingResult();
      await store.record(result);

      const record = await store.getLatest('test');
      expect(record).not.toBeNull();

      const correctedResult = { entities: [{ type: 'TEST', value: 'Corrected' }] };
      await store.addHumanFeedback(record!.id, 'Fixed entities', correctedResult, 'default');

      const updated = await store.getLatest('test');
      expect(updated?.humanFeedback?.correctedResult).toEqual(correctedResult);
    });
  });

  describe('getLearnableRecords', () => {
    it('returns records with feedback but not learned', async () => {
      const result1 = createMockProcessingResult({ id: 'result-1' });
      const result2 = createMockProcessingResult({ id: 'result-2' });

      await store.record(result1);
      await store.record(result2);

      const record1 = await store.getLatest('test');
      await store.addHumanFeedback(record1!.id, 'Good job', undefined, 'default');

      const learnable = await store.getLearnableRecords();
      expect(learnable.length).toBeGreaterThan(0);
      expect(learnable[0]?.humanFeedback?.feedback).toBe('Good job');
      expect(learnable[0]?.learning.isLearned).toBe(false);
    });
  });
});