import { Pipeline } from '../../../src/core/Pipeline';
import type { RetryPolicy } from '../../../src/core/RetryPolicy';
import { Strategy, StrategyType, StrategyConfig } from '../../../src/strategies/base/Strategy';
import { ConfidenceScorer } from '../../../src/core/ConfidenceScorer';
import type { ExperienceStore } from '../../../src/experience/ExperienceStore';
import type { ContentItem, ProcessingResult } from '../../../src/types';

const createContentItem = (meta: Record<string, unknown> = {}): ContentItem => ({
  id: 'test-item-1',
  source: 'test-source',
  raw: new Uint8Array([1, 2, 3]),
  meta: { textContent: '<html><body>Test content</body></html>', ...meta },
  hints: {},
});

describe('Pipeline', () => {
  let pipeline: Pipeline;

  beforeEach(() => {
    pipeline = new Pipeline();
  });

  const createMockStrategy = (
    id: string,
    type: StrategyType,
    canApplyReturn = true,
    executeOutput: Record<string, unknown> = { cleanedText: 'Cleaned text', textContent: 'Cleaned text' }
  ): Strategy => ({
    id,
    name: `Mock ${id}`,
    type,
    version: '1.0.0',
    config: { enabled: true, priority: 1, params: {} },
    canApply: () => canApplyReturn,
    execute: async () => ({
      id: `exec-${id}`,
      strategyId: id,
      startedAt: Date.now(),
      completedAt: Date.now(),
      success: true,
      output: executeOutput,
    }),
  });

  describe('process() with HTML content', () => {
    it('passes each denoise transform output to the next denoise strategy', async () => {
      const receivedText: string[] = [];
      const first = createMockStrategy('denoise-first', StrategyType.DENOISE, true, {
        cleanedText: 'first transform',
      });
      const second: Strategy = {
        ...createMockStrategy('denoise-second', StrategyType.DENOISE),
        config: { enabled: true, priority: 2, params: {} },
        execute: async item => {
          receivedText.push(String(item.meta.textContent));
          return {
            id: 'actual-second-execution',
            strategyId: 'denoise-second',
            startedAt: 101,
            completedAt: 202,
            success: true,
            output: { cleanedText: 'second transform' },
          };
        },
      };

      pipeline.registerStrategy(first);
      pipeline.registerStrategy(second);

      const result = await pipeline.process(createContentItem());

      expect(receivedText).toEqual(['first transform']);
      expect(result.strategiesUsed[1]).toMatchObject({
        id: 'actual-second-execution',
        startedAt: 101,
        completedAt: 202,
      });
    });

    it('passes filtered canonical text to the following semantic strategy', async () => {
      const receivedText: string[] = [];
      const filter = createMockStrategy('semantic-filter', StrategyType.SEMANTIC, true, {
        filteredText: 'filtered canonical text',
      });
      const chunker: Strategy = {
        ...createMockStrategy('semantic-chunker', StrategyType.SEMANTIC),
        config: { enabled: true, priority: 2, params: {} },
        execute: async item => {
          receivedText.push(String(item.meta.textContent));
          return {
            id: 'exec-semantic-chunker',
            strategyId: 'semantic-chunker',
            startedAt: 1,
            completedAt: 2,
            success: true,
            output: { totalChunks: 0, chunks: [] },
          };
        },
      };

      pipeline.registerStrategy(filter);
      pipeline.registerStrategy(chunker);

      await pipeline.process(createContentItem());

      expect(receivedText).toEqual(['filtered canonical text']);
    });

    it('does not merge unrecognized successful transform output into canonical state', async () => {
      pipeline.registerStrategy(createMockStrategy('diagnostic-only', StrategyType.DENOISE, true, {
        arbitraryDiagnostic: 'must not become pipeline state',
      }));
      const output: Strategy = {
        ...createMockStrategy('state-observer', StrategyType.OUTPUT),
        execute: async item => ({
          id: 'exec-state-observer',
          strategyId: 'state-observer',
          startedAt: 1,
          completedAt: 2,
          success: true,
          output: { observed: item.meta.arbitraryDiagnostic },
        }),
      };
      pipeline.registerStrategy(output);

      const result = await pipeline.process(createContentItem());

      expect(result.strategiesUsed[0].output).toEqual({
        arbitraryDiagnostic: 'must not become pipeline state',
      });
      expect(result.fusedOutput).toEqual({ observed: undefined });
    });

    it('keeps an unsupported transform output diagnostic-only when no renderer applies', async () => {
      pipeline.registerStrategy(createMockStrategy('diagnostic-only', StrategyType.DENOISE, true, {
        arbitraryDiagnostic: 'must not become public output',
      }));

      const result = await pipeline.process(createContentItem());

      expect(result.strategiesUsed[0].output).toEqual({
        arbitraryDiagnostic: 'must not become public output',
      });
      expect(result.fusedOutput).toEqual({ type: 'failed', sources: 0, data: [] });
      expect(result.fusedOutput).not.toEqual(result.strategiesUsed[0].output);
    });

    it('executes denoise strategies and updates contentItem.meta with cleanedText', async () => {
      const htmlContent = '<html><body><nav>Nav</nav><p>Paragraph content here</p></body></html>';
      const contentItem = createContentItem({ textContent: htmlContent });

      const denoiseStrategy = createMockStrategy('html-clean', StrategyType.DENOISE, true, {
        cleanedText: 'Paragraph content here',
        textContent: 'Paragraph content here',
      });

      pipeline.registerStrategy(denoiseStrategy);

      const result = await pipeline.process(contentItem);

      // Verify strategy was executed
      expect(result.strategiesUsed).toHaveLength(1);
      expect(result.strategiesUsed[0].strategyId).toBe('html-clean');
      expect(result.fusedOutput).toBeDefined();
      expect(result.contentItem.meta.cleanedText).toBe('Paragraph content here');
      expect(contentItem.meta.cleanedText).toBeUndefined();
    });

    it('processes through strategy types in DENOISE -> SEMANTIC -> OUTPUT order', async () => {
      const contentItem = createContentItem({ textContent: '<html><body>Content</body></html>' });

      const denoiseStrategy = createMockStrategy('denoise-1', StrategyType.DENOISE, true, {
        cleanedText: 'Cleaned text',
        textContent: 'Cleaned text',
      });
      const semanticStrategy = createMockStrategy('semantic-1', StrategyType.SEMANTIC, true, {
        entities: ['Entity1'],
        relevance: 0.9,
      });
      const outputStrategy = createMockStrategy('output-1', StrategyType.OUTPUT, true, {
        format: 'json',
        data: { text: 'Cleaned text' },
      });

      pipeline.registerStrategy(denoiseStrategy);
      pipeline.registerStrategy(semanticStrategy);
      pipeline.registerStrategy(outputStrategy);

      const result = await pipeline.process(contentItem);

      // Verify all strategies were executed
      expect(result.strategiesUsed).toHaveLength(3);
      // Verify order is DENOISE -> SEMANTIC -> OUTPUT
      expect(result.strategiesUsed[0].strategyId).toBe('denoise-1');
      expect(result.strategiesUsed[1].strategyId).toBe('semantic-1');
      expect(result.strategiesUsed[2].strategyId).toBe('output-1');
    });

    it('passes semantic output into output strategies', async () => {
      const contentItem = createContentItem({
        textContent: 'Original content that is long enough for semantic processing.',
      });

      pipeline.registerStrategy(createMockStrategy('semantic-1', StrategyType.SEMANTIC, true, {
        filteredText: 'Filtered semantic text',
        chunks: [{
          id: 'chunk-1',
          index: 0,
          text: 'Filtered semantic text',
          startChar: 0,
          endChar: 22,
          tokenEstimate: 6,
        }],
        totalChunks: 1,
      }));

      const outputStrategy: Strategy = {
        id: 'output-1',
        name: 'Output 1',
        type: StrategyType.OUTPUT,
        version: '1.0.0',
        config: { enabled: true, priority: 1, params: {} },
        canApply: () => true,
        execute: async (item) => ({
          id: 'exec-output-1',
          strategyId: 'output-1',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: {
            text: item.meta.textContent,
            chunks: item.meta.chunks,
          },
        }),
      };

      pipeline.registerStrategy(outputStrategy);

      const result = await pipeline.process(contentItem);

      expect(result.contentItem.meta.filteredText).toBe('Filtered semantic text');
      expect(result.contentItem.meta.textContent).toBe('Filtered semantic text');
      expect(contentItem.meta.filteredText).toBeUndefined();
      expect(contentItem.meta.textContent).toContain('Original content');
      expect(result.fusedOutput).toEqual({
        text: 'Filtered semantic text',
        chunks: [{
          id: 'chunk-1',
          index: 0,
          text: 'Filtered semantic text',
          startChar: 0,
          endChar: 22,
          tokenEstimate: 6,
        }],
      });
    });

    it('keeps multiple final output strategy results as separate outputs', async () => {
      const contentItem = createContentItem({
        textContent: 'Original content that is long enough for output processing.',
      });

      pipeline.registerStrategy(createMockStrategy('semantic-1', StrategyType.SEMANTIC, true, {
        filteredText: 'Filtered semantic text',
        chunks: [{ id: 'chunk-1', index: 0, text: 'Filtered semantic text', tokenEstimate: 6 }],
      }));

      pipeline.registerStrategy(createMockStrategy('json-output', StrategyType.OUTPUT, true, {
        version: '1.0.0',
        content: { text: 'Filtered semantic text' },
        chunks: [{ id: 'chunk-1', index: 0, text: 'Filtered semantic text', tokenEstimate: 6 }],
      }));

      pipeline.registerStrategy(createMockStrategy('markdown-output', StrategyType.OUTPUT, true, {
        markdown: 'Filtered semantic text',
        metadata: { source: 'test-source' },
      }));

      const result = await pipeline.process(contentItem);

      expect(result.fusedOutput).toEqual({
        type: 'fused',
        sources: 2,
        data: [
          {
            version: '1.0.0',
            content: { text: 'Filtered semantic text' },
            chunks: [{ id: 'chunk-1', index: 0, text: 'Filtered semantic text', tokenEstimate: 6 }],
          },
          {
            markdown: 'Filtered semantic text',
            metadata: { source: 'test-source' },
          },
        ],
      });
    });

    it('renders every final output with the scored transform confidence', async () => {
      const contentItem = createContentItem({
        textContent: 'Substantial canonical content. '.repeat(30),
      });
      pipeline.registerStrategy(createMockStrategy('denoise-1', StrategyType.DENOISE, true, {
        cleanedText: 'Substantial canonical content. '.repeat(30),
      }));
      pipeline.registerStrategy(createMockStrategy('semantic-1', StrategyType.SEMANTIC, true, {
        filteredText: 'Substantial canonical content. '.repeat(30),
        entities: ['Prae'],
        coherence: 0.9,
      }));

      const render = (id: string): Strategy => ({
        ...createMockStrategy(id, StrategyType.OUTPUT),
        execute: async item => ({
          id: `exec-${id}`,
          strategyId: id,
          startedAt: 1,
          completedAt: 2,
          success: true,
          output: { metadata: { confidence: item.meta.confidence } },
        }),
      });
      pipeline.registerStrategy(render('renderer-one'));
      pipeline.registerStrategy(render('renderer-two'));

      const result = await pipeline.process(contentItem);
      const rendered = result.fusedOutput as {
        type: 'fused';
        data: Array<{ metadata: { confidence: number } }>;
      };

      expect(rendered.data.every(output =>
        output.metadata.confidence === result.confidence.overall
      )).toBe(true);
    });
  });

  describe('retries on low confidence', () => {
    it('does not retry a low-confidence result without a retry policy', async () => {
      const noPolicyPipeline = new Pipeline({ maxRetries: 3 });
      const retryableText = 'Retryable content. '.repeat(40);
      let executionCount = 0;
      const lowConfidenceStrategy: Strategy = {
        ...createMockStrategy('low-confidence', StrategyType.DENOISE),
        execute: async () => {
          executionCount++;
          return {
            id: `exec-low-${executionCount}`,
            strategyId: 'low-confidence',
            startedAt: executionCount,
            completedAt: executionCount,
            success: true,
            output: { cleanedText: retryableText, textContent: retryableText },
          };
        },
      };
      noPolicyPipeline.registerStrategy(lowConfidenceStrategy);

      const result = await noPolicyPipeline.process(createContentItem({ textContent: retryableText }));

      expect(executionCount).toBe(1);
      expect(result.retryCount).toBe(0);
    });

    it('uses a retry policy to prepare one pristine changed retry', async () => {
      const retryableText = 'Retryable content. '.repeat(40);
      const observedAttempts: Array<Record<string, unknown>> = [];
      const retryPolicy: RetryPolicy = {
        canRetry: (_result: ProcessingResult, nextAttempt: number) => nextAttempt === 1,
        prepareAttempt: (original: ContentItem, nextAttempt: number): ContentItem => ({
          ...original,
          raw: original.raw.slice(),
          meta: { ...original.meta, retryVariant: nextAttempt },
          hints: { ...original.hints },
        }),
      };
      const config = { maxRetries: 3, retryPolicy };
      const policyPipeline = new Pipeline(config);
      const strategy: Strategy = {
        ...createMockStrategy('policy-low-confidence', StrategyType.DENOISE),
        execute: async item => {
          observedAttempts.push({ ...item.meta });
          if (observedAttempts.length === 1) {
            item.meta.firstAttemptMutation = 'must not leak';
          }
          return {
            id: `exec-policy-${observedAttempts.length}`,
            strategyId: 'policy-low-confidence',
            startedAt: observedAttempts.length,
            completedAt: observedAttempts.length,
            success: true,
            output: { cleanedText: retryableText, textContent: retryableText },
          };
        },
      };
      policyPipeline.registerStrategy(strategy);
      const contentItem = createContentItem({ textContent: retryableText });

      const result = await policyPipeline.process(contentItem);

      expect(observedAttempts).toHaveLength(2);
      expect(observedAttempts[1]).toMatchObject({ retryVariant: 1 });
      expect(observedAttempts[1].firstAttemptMutation).toBeUndefined();
      expect(result.retryCount).toBe(1);
      expect(result.contentItem.meta.retryVariant).toBe(1);
      expect(result.contentItem).not.toBe(contentItem);
      expect(result.contentItem.raw).not.toBe(contentItem.raw);
      expect(contentItem.meta).toEqual({ textContent: retryableText });
    });

    it('passes a fresh clone of the pristine original to every retry preparation', async () => {
      const retryableText = 'Retryable content. '.repeat(40);
      const preparationInputs: Array<{
        rawByte: number;
        injectedMeta: unknown;
        encoding: string | undefined;
        nestedMarker: unknown;
        possibleTypes: string[] | undefined;
      }> = [];
      const retryPolicy: RetryPolicy = {
        canRetry: (_result: ProcessingResult, nextAttempt: number) => nextAttempt <= 2,
        prepareAttempt: (original: ContentItem, nextAttempt: number): ContentItem => {
          preparationInputs.push({
            rawByte: original.raw[0],
            injectedMeta: original.meta.injectedByPolicy,
            encoding: original.hints.encoding,
            nestedMarker: (original.meta.nested as Record<string, unknown>).marker,
            possibleTypes: original.hints.possibleTypes?.slice(),
          });
          original.raw[0] = 99;
          original.meta.injectedByPolicy = nextAttempt;
          (original.meta.nested as Record<string, unknown>).marker = `policy-${nextAttempt}`;
          original.hints.encoding = `attempt-${nextAttempt}`;
          original.hints.possibleTypes?.push(`policy-${nextAttempt}`);
          return original;
        },
      };
      const config = { maxRetries: 3, retryPolicy };
      const policyPipeline = new Pipeline(config);
      let executionCount = 0;
      const strategy: Strategy = {
        ...createMockStrategy('always-low-confidence', StrategyType.DENOISE),
        execute: async item => {
          executionCount++;
          if (executionCount === 1) {
            (item.meta.nested as Record<string, unknown>).marker = 'first-attempt-mutation';
            item.hints.possibleTypes?.push('first-attempt-mutation');
          }
          return {
            id: `exec-pristine-${executionCount}`,
            strategyId: 'always-low-confidence',
            startedAt: executionCount,
            completedAt: executionCount,
            success: true,
            output: { cleanedText: retryableText, textContent: retryableText },
          };
        },
      };
      policyPipeline.registerStrategy(strategy);
      const contentItem = createContentItem({
        textContent: retryableText,
        nested: { marker: 'original' },
      });
      contentItem.hints.possibleTypes = ['html'];

      const result = await policyPipeline.process(contentItem);

      expect(preparationInputs).toEqual([
        {
          rawByte: 1,
          injectedMeta: undefined,
          encoding: undefined,
          nestedMarker: 'original',
          possibleTypes: ['html'],
        },
        {
          rawByte: 1,
          injectedMeta: undefined,
          encoding: undefined,
          nestedMarker: 'original',
          possibleTypes: ['html'],
        },
      ]);
      expect(result.retryCount).toBe(2);
      expect(contentItem.raw).toEqual(new Uint8Array([1, 2, 3]));
      expect(contentItem.meta.injectedByPolicy).toBeUndefined();
      expect(contentItem.meta.nested).toEqual({ marker: 'original' });
      expect(contentItem.hints.encoding).toBeUndefined();
      expect(contentItem.hints.possibleTypes).toEqual(['html']);
    });

    it('does not retry a thrown pipeline failure without a retry policy', async () => {
      const noPolicyPipeline = new Pipeline({ maxRetries: 3 });
      let applicabilityChecks = 0;
      const throwingStrategy: Strategy = {
        ...createMockStrategy('throwing-applicability', StrategyType.DENOISE),
        canApply: () => {
          applicabilityChecks++;
          throw new Error('cannot determine applicability');
        },
      };
      noPolicyPipeline.registerStrategy(throwingStrategy);

      const result = await noPolicyPipeline.process(createContentItem());

      expect(applicabilityChecks).toBe(1);
      expect(result.outcome).toBe('FAILED');
      expect(result.retryCount).toBe(0);
    });

    it('retries a thrown pipeline failure only when the retry policy authorizes it', async () => {
      const requestedAttempts: number[] = [];
      const retryPolicy: RetryPolicy = {
        canRetry: (_result: ProcessingResult, nextAttempt: number) => {
          requestedAttempts.push(nextAttempt);
          return nextAttempt === 1;
        },
        prepareAttempt: (original: ContentItem): ContentItem => original,
      };
      const config = { maxRetries: 3, retryPolicy };
      const policyPipeline = new Pipeline(config);
      let applicabilityChecks = 0;
      const throwingStrategy: Strategy = {
        ...createMockStrategy('policy-throwing-applicability', StrategyType.DENOISE),
        canApply: () => {
          applicabilityChecks++;
          throw new Error('cannot determine applicability');
        },
      };
      policyPipeline.registerStrategy(throwingStrategy);

      const result = await policyPipeline.process(createContentItem());

      expect(applicabilityChecks).toBe(2);
      expect(requestedAttempts).toEqual([1, 2]);
      expect(result.outcome).toBe('FAILED');
      expect(result.retryCount).toBe(1);
    });

    it('enforces maxRetries when the retry policy always authorizes another attempt', async () => {
      const preparedAttempts: number[] = [];
      const retryPolicy: RetryPolicy = {
        canRetry: () => true,
        prepareAttempt: (original, nextAttempt) => {
          preparedAttempts.push(nextAttempt);
          return original;
        },
      };
      const customPipeline = new Pipeline({ maxRetries: 2, retryPolicy });
      let applicabilityChecks = 0;
      customPipeline.registerStrategy({
        ...createMockStrategy('always-throwing-applicability', StrategyType.DENOISE),
        canApply: () => {
          applicabilityChecks++;
          throw new Error('retryable applicability failure');
        },
      });

      const result = await customPipeline.process(createContentItem());

      expect(applicabilityChecks).toBe(3);
      expect(preparedAttempts).toEqual([1, 2]);
      expect(result.outcome).toBe('FAILED');
      expect(result.retryCount).toBe(2);
    });

    it('does not retry when max retries is 0', async () => {
      const zeroRetryPipeline = new Pipeline({ maxRetries: 0 });
      const contentItem = createContentItem({ textContent: 'x' });

      const failingStrategy: Strategy = {
        id: 'failing-strategy',
        name: 'Failing Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: { enabled: true, priority: 1, params: {} },
        canApply: () => true,
        execute: async () => ({
          id: 'exec-1',
          strategyId: 'failing-strategy',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: { cleanedText: 'x', textContent: 'x' },
        }),
      };

      zeroRetryPipeline.registerStrategy(failingStrategy);

      const result = await zeroRetryPipeline.process(contentItem);

      expect(result.retryCount).toBe(0);
    });
  });

  describe('failed result after max retries', () => {
    it('creates failed result with zero confidence score', async () => {
      const contentItem = createContentItem({});
      const startTime = Date.now();

      const result = pipeline.createFailedResult(contentItem, [], startTime, 3, 'Test error');

      expect(result.outcome).toBe('FAILED');
      expect(result.confidence.overall).toBe(0);
      expect(result.confidence.isPassing).toBe(false);
      expect(result.retryCount).toBe(3);
      expect(result.fusedOutput).toEqual({ type: 'failed', sources: 0, data: [] });
    });
  });

  describe('experience store diagnostics', () => {
    it('reports record-processing errors without failing processing', async () => {
      const error = new Error('experience store unavailable');
      const onDiagnostic = jest.fn();
      const diagnosticPipeline = new Pipeline({ onDiagnostic });
      const experienceStore: ExperienceStore = {
        record: jest.fn().mockResolvedValue(undefined),
        getLatest: jest.fn().mockResolvedValue(null),
        getByOutcome: jest.fn().mockResolvedValue([]),
        getRecords: jest.fn().mockResolvedValue([]),
        addHumanFeedback: jest.fn().mockResolvedValue(false),
        getLearnableRecords: jest.fn().mockResolvedValue([]),
        getHistoricalContext: jest.fn().mockResolvedValue(undefined),
        recordProcessing: jest.fn().mockRejectedValue(error),
      };
      diagnosticPipeline.setExperienceStore(experienceStore);

      const result = await diagnosticPipeline.process(createContentItem());

      expect(result.contentItem.id).toBe('test-item-1');
      expect(result.strategiesUsed).not.toContainEqual(expect.objectContaining({ strategyId: 'pipeline' }));
      expect(onDiagnostic).toHaveBeenCalledWith({
        source: 'experience-store',
        operation: 'record-processing',
        error,
      });
    });

    it('ignores a throwing diagnostic callback after successful processing', async () => {
      const diagnosticPipeline = new Pipeline({
        onDiagnostic: () => {
          throw new Error('diagnostic consumer failed');
        },
      });
      const experienceStore: ExperienceStore = {
        record: jest.fn().mockResolvedValue(undefined),
        getLatest: jest.fn().mockResolvedValue(null),
        getByOutcome: jest.fn().mockResolvedValue([]),
        getRecords: jest.fn().mockResolvedValue([]),
        addHumanFeedback: jest.fn().mockResolvedValue(false),
        getLearnableRecords: jest.fn().mockResolvedValue([]),
        getHistoricalContext: jest.fn().mockResolvedValue(undefined),
        recordProcessing: jest.fn().mockRejectedValue(new Error('experience store unavailable')),
      };
      diagnosticPipeline.setExperienceStore(experienceStore);

      const result = await diagnosticPipeline.process(createContentItem());

      expect(result.outcome).not.toBe('FAILED');
      expect(result.strategiesUsed).not.toContainEqual(expect.objectContaining({ strategyId: 'pipeline' }));
    });
  });

  describe('custom strategy registration', () => {
    it('registers and executes custom strategies', async () => {
      const contentItem = createContentItem({ textContent: 'test content' });

      const customStrategy: Strategy = {
        id: 'custom-denoise',
        name: 'Custom Denoise',
        type: StrategyType.DENOISE,
        version: '2.0.0',
        config: { enabled: true, priority: 10, params: { customParam: 'value' } },
        canApply: () => true,
        execute: async () => ({
          id: 'exec-custom',
          strategyId: 'custom-denoise',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: { cleanedText: 'Custom cleaned', textContent: 'Custom cleaned' },
        }),
      };

      pipeline.registerStrategy(customStrategy);

      const result = await pipeline.process(contentItem);

      expect(result.strategiesUsed).toHaveLength(1);
      expect(result.strategiesUsed[0].strategyId).toBe('custom-denoise');
    });

    it('skips disabled strategies', async () => {
      const contentItem = createContentItem({ textContent: 'test' });

      const disabledStrategy: Strategy = {
        id: 'disabled-strategy',
        name: 'Disabled Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: { enabled: false, priority: 1, params: {} },
        canApply: () => true,
        execute: async () => ({
          id: 'exec-disabled',
          strategyId: 'disabled-strategy',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: {},
        }),
      };

      pipeline.registerStrategy(disabledStrategy);

      const result = await pipeline.process(contentItem);

      expect(result.strategiesUsed).toHaveLength(0);
    });

    it('skips strategies where canApply returns false', async () => {
      const contentItem = createContentItem({ textContent: 'test' });

      const nonApplicableStrategy: Strategy = {
        id: 'non-applicable',
        name: 'Non Applicable',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: { enabled: true, priority: 1, params: {} },
        canApply: () => false,
        execute: async () => ({
          id: 'exec-na',
          strategyId: 'non-applicable',
          startedAt: Date.now(),
          completedAt: Date.now(),
          success: true,
          output: {},
        }),
      };

      pipeline.registerStrategy(nonApplicableStrategy);

      const result = await pipeline.process(contentItem);

      expect(result.strategiesUsed).toHaveLength(0);
    });

    it('records thrown strategy timing from before execution through failure completion', async () => {
      const throwingPipeline = new Pipeline({ maxRetries: 0 });
      const now = jest.spyOn(Date, 'now')
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(20)
        .mockReturnValueOnce(30)
        .mockReturnValueOnce(40)
        .mockReturnValueOnce(50)
        .mockReturnValue(60);
      const throwingStrategy: Strategy = {
        id: 'throwing-strategy',
        name: 'Throwing Strategy',
        type: StrategyType.DENOISE,
        version: '1.0.0',
        config: { enabled: true, priority: 1, params: {} },
        canApply: () => true,
        execute: async () => {
          throw new Error('strategy failed');
        },
      };

      try {
        throwingPipeline.registerStrategy(throwingStrategy);
        const result = await throwingPipeline.process(createContentItem());
        const execution = result.strategiesUsed[0];

        expect(execution).toMatchObject({
          id: 'exec-throwing-strategy-20',
          strategyId: 'throwing-strategy',
          startedAt: 20,
          completedAt: 30,
          success: false,
          error: 'strategy failed',
        });
        expect(execution.completedAt).toBeGreaterThanOrEqual(execution.startedAt);
      } finally {
        now.mockRestore();
      }
    });
  });

  describe('mergeOutput', () => {
    it('updates contentItem.meta with cleanedText from fusedOutput', () => {
      const contentItem = createContentItem();
      const fusedOutput = { cleanedText: 'Merged text', entities: ['e1', 'e2'] };

      pipeline.mergeOutput(contentItem, fusedOutput);

      expect(contentItem.meta.cleanedText).toBe('Merged text');
      expect(contentItem.meta.entities).toEqual(['e1', 'e2']);
    });

    it('updates contentItem.meta with textContent from fusedOutput', () => {
      const contentItem = createContentItem();
      const fusedOutput = { textContent: 'Text content only', structure: { sections: 2 } };

      pipeline.mergeOutput(contentItem, fusedOutput);

      expect(contentItem.meta.textContent).toBe('Text content only');
      expect(contentItem.meta.structure).toEqual({ sections: 2 });
    });

    it('updates textContent when fusedOutput is a string (cleanedText)', () => {
      const contentItem = createContentItem();
      pipeline.mergeOutput(contentItem, 'string output' as unknown);
      expect(contentItem.meta.textContent).toBe('string output');
      expect(contentItem.meta.cleanedText).toBe('string output');
    });

    it('does not update when fusedOutput is null or array', () => {
      const contentItem = createContentItem();
      const originalMeta = { ...contentItem.meta };

      pipeline.mergeOutput(contentItem, null);
      pipeline.mergeOutput(contentItem, [1, 2, 3]);

      expect(contentItem.meta).toEqual(originalMeta);
    });
  });

  describe('constructor options', () => {
    it('accepts custom maxRetries', () => {
      const customPipeline = new Pipeline({ maxRetries: 5 });
      expect(customPipeline).toBeInstanceOf(Pipeline);
    });

    it('accepts enableCloudEscalation option', () => {
      const escalatedPipeline = new Pipeline({ enableCloudEscalation: true });
      expect(escalatedPipeline).toBeInstanceOf(Pipeline);
    });

    it('uses default values when options not provided', () => {
      const defaultPipeline = new Pipeline();
      expect(defaultPipeline).toBeInstanceOf(Pipeline);
    });
  });

  describe('confidence scoring', () => {
    it('calculates confidence score after strategy execution', async () => {
      const contentItem = createContentItem({ textContent: 'This is a test document with meaningful content that should score reasonably well.' });

      const strategy = createMockStrategy('test-strategy', StrategyType.DENOISE, true, {
        cleanedText: 'This is a test document with meaningful content that should score reasonably well.',
        textContent: 'This is a test document with meaningful content that should score reasonably well.',
      });

      pipeline.registerStrategy(strategy);

      const result = await pipeline.process(contentItem);

      // Confidence score should be calculated (overall should be a number between 0 and 1)
      expect(typeof result.confidence.overall).toBe('number');
      expect(result.confidence.overall).toBeGreaterThanOrEqual(0);
      expect(result.confidence.overall).toBeLessThanOrEqual(1);
      expect(result.confidence.isPassing).toBe(false); // Short content unlikely to pass 0.85 threshold
    });
  });
});
