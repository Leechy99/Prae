import { StrategyExecutor, ExecutionResult } from '../../../src/strategies/base/StrategyExecutor';
import { Strategy, StrategyType, StrategyConfig } from '../../../src/strategies/base/Strategy';
import { ContentItem } from '../../../src/types';

const mockContentItem: ContentItem = {
  id: 'test-item-1',
  source: 'test-source',
  raw: new Uint8Array([1, 2, 3]),
  meta: {},
  hints: {},
};

describe('StrategyExecutor', () => {
  let executor: StrategyExecutor;
  let mockStrategy: Strategy;
  let mockStrategyConfig: StrategyConfig;

  beforeEach(() => {
    executor = new StrategyExecutor();
    mockStrategyConfig = {
      enabled: true,
      priority: 1,
      params: {},
    };
  });

  describe('executeStrategies', () => {
    it('should execute strategy and return success result', async () => {
      mockStrategy = {
        id: 'mock-strategy-1',
        name: 'Mock Strategy 1',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: mockStrategyConfig,
        canApply: () => true,
        execute: async () => ({
          id: 'exec-1',
          strategyId: 'mock-strategy-1',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: { processed: true },
        }),
      };

      executor.register(mockStrategy);

      const results = await executor.executeStrategies([mockContentItem]);

      expect(results).toHaveLength(1);
      expect(results[0].strategyId).toBe('mock-strategy-1');
      expect(results[0].success).toBe(true);
      expect(results[0].output).toEqual({ processed: true });
    });

    it('should catch error and return failure result', async () => {
      mockStrategy = {
        id: 'mock-strategy-error',
        name: 'Mock Error Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: mockStrategyConfig,
        canApply: () => true,
        execute: async () => {
          throw new Error('Strategy execution failed');
        },
      };

      executor.register(mockStrategy);

      const results = await executor.executeStrategies([mockContentItem]);

      expect(results).toHaveLength(1);
      expect(results[0].strategyId).toBe('mock-strategy-error');
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Strategy execution failed');
    });

    it('should skip disabled strategies', async () => {
      mockStrategy = {
        id: 'mock-disabled-strategy',
        name: 'Mock Disabled Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: { ...mockStrategyConfig, enabled: false },
        canApply: () => true,
        execute: async () => ({
          id: 'exec-disabled',
          strategyId: 'mock-disabled-strategy',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: {},
        }),
      };

      executor.register(mockStrategy);

      const results = await executor.executeStrategies([mockContentItem]);

      expect(results).toHaveLength(0);
    });

    it('should skip strategies that cannot apply', async () => {
      mockStrategy = {
        id: 'mock-non-applicable-strategy',
        name: 'Mock Non Applicable Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: mockStrategyConfig,
        canApply: () => false,
        execute: async () => ({
          id: 'exec-non-applicable',
          strategyId: 'mock-non-applicable-strategy',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: {},
        }),
      };

      executor.register(mockStrategy);

      const results = await executor.executeStrategies([mockContentItem]);

      expect(results).toHaveLength(0);
    });

    it('should stop on error when stopOnError is true', async () => {
      mockStrategy = {
        id: 'mock-error-strategy',
        name: 'Mock Error Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: mockStrategyConfig,
        canApply: () => true,
        execute: async () => {
          throw new Error('First error');
        },
      };

      const secondStrategy: Strategy = {
        id: 'mock-second-strategy',
        name: 'Mock Second Strategy',
        type: StrategyType.SEMANTIC,
        version: '1.0.0',
        config: mockStrategyConfig,
        canApply: () => true,
        execute: async () => ({
          id: 'exec-second',
          strategyId: 'mock-second-strategy',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: {},
        }),
      };

      executor.register(mockStrategy);
      executor.register(secondStrategy);

      const results = await executor.executeStrategies([mockContentItem], { stopOnError: true });

      expect(results).toHaveLength(1);
      expect(results[0].error).toBe('First error');
    });
  });

  describe('fuseResults', () => {
    it('should return single output when only one result succeeds', () => {
      const results: ExecutionResult[] = [
        { strategyId: 's1', success: true, output: { data: 'test' } },
      ];

      const fused = executor.fuseResults(results);

      expect(fused).toEqual({ data: 'test' });
    });

    it('should return failed result when all strategies fail', () => {
      const results: ExecutionResult[] = [
        { strategyId: 's1', success: false, error: 'error 1' },
        { strategyId: 's2', success: false, error: 'error 2' },
      ];

      const fused = executor.fuseResults(results);

      expect(fused).toEqual({ type: 'failed', sources: 0, data: [] });
    });

    it('should fuse multiple successful results', () => {
      const results: ExecutionResult[] = [
        { strategyId: 's1', success: true, output: { result: 'first' } },
        { strategyId: 's2', success: true, output: { result: 'second' } },
        { strategyId: 's3', success: false, error: 'failed' },
      ];

      const fused = executor.fuseResults(results);

      expect(fused).toEqual({
        type: 'fused',
        sources: 2,
        data: [{ result: 'first' }, { result: 'second' }],
      });
    });
  });
});