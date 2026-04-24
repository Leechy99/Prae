import type { ContentItem, ProcessingResult, StrategyExecution, ConfidenceScore } from '../types';
import { Strategy, StrategyType } from '../strategies/base/Strategy';
import { StrategyRegistry } from '../strategies/base/StrategyRegistry';
import { StrategyExecutor } from '../strategies/base/StrategyExecutor';
import { ConfidenceScorer } from './ConfidenceScorer';
import type { ExperienceStore } from '../experience/ExperienceStore';

export interface PipelineConfig {
  maxRetries?: number;
  enableCloudEscalation?: boolean;
}

interface PipelineExecutedStrategies {
  executions: StrategyExecution[];
  fusedOutput: unknown;
}

export class Pipeline {
  private registry: StrategyRegistry;
  private executor: StrategyExecutor;
  private scorer: ConfidenceScorer;
  private experienceStore?: ExperienceStore;
  private maxRetries: number;
  private enableCloudEscalation: boolean;

  constructor(config: PipelineConfig = {}) {
    this.registry = new StrategyRegistry();
    this.executor = new StrategyExecutor();
    this.scorer = new ConfidenceScorer();
    this.maxRetries = config.maxRetries ?? 3;
    this.enableCloudEscalation = config.enableCloudEscalation ?? false;
  }

  setExperienceStore(store: ExperienceStore): void {
    this.experienceStore = store;
  }

  getRegisteredStrategies(): Strategy[] {
    return this.registry.getAll();
  }

  registerStrategy(strategy: Strategy): void {
    this.registry.register(strategy);
    this.executor.register(strategy);
  }

  async process(contentItem: ContentItem): Promise<ProcessingResult> {
    const startTime = Date.now();
    let retryCount = 0;
    let lastResult: ProcessingResult | null = null;

    while (retryCount <= this.maxRetries) {
      try {
        const result = await this.executePipelineWithRetry(contentItem, retryCount, startTime);

        if (result.outcome === 'SUCCESS' || result.outcome === 'RETRY_SUCCESS') {
          return result;
        }

        if (result.outcome === 'CLOUD_ESCALATED' || result.outcome === 'HUMAN_INTERVENTION') {
          return result;
        }

        if (result.outcome === 'FAILED') {
          if (retryCount < this.maxRetries && this.scorer.shouldRetry(result.confidence)) {
            retryCount++;
            continue;
          }
          return result;
        }

        return result;
      } catch (error) {
        if (retryCount >= this.maxRetries) {
          return this.createFailedResult(
            contentItem,
            [],
            startTime,
            retryCount,
            error instanceof Error ? error.message : String(error)
          );
        }
        retryCount++;
      }
    }

    return lastResult ?? this.createFailedResult(contentItem, [], startTime, retryCount, 'Max retries exceeded');
  }

  private async executePipelineWithRetry(
    contentItem: ContentItem,
    retryCount: number,
    startTime: number
  ): Promise<ProcessingResult> {
    const allExecutions: StrategyExecution[] = [];
    let fusedOutput: unknown;

    // Execute denoise strategies
    const denoiseStrategies = this.registry.listByPriority(StrategyType.DENOISE);
    if (denoiseStrategies.length > 0) {
      const denoiseExecutor = this.createExecutorForStrategies(denoiseStrategies);
      const denoiseResults = await denoiseExecutor.executeStrategies([contentItem]);
      const denoiseFused = denoiseExecutor.fuseResults(denoiseResults);
      allExecutions.push(...this.convertToStrategyExecutions(denoiseResults, denoiseStrategies));
      this.mergeOutput(contentItem, denoiseFused);
      fusedOutput = denoiseFused;
    }

    // Execute semantic strategies
    const semanticStrategies = this.registry.listByPriority(StrategyType.SEMANTIC);
    if (semanticStrategies.length > 0) {
      const semanticExecutor = this.createExecutorForStrategies(semanticStrategies);
      const semanticResults = await semanticExecutor.executeStrategies([contentItem]);
      const semanticFused = semanticExecutor.fuseResults(semanticResults);
      allExecutions.push(...this.convertToStrategyExecutions(semanticResults, semanticStrategies));
      fusedOutput = semanticFused;
    }

    // Execute output strategies
    const outputStrategies = this.registry.listByPriority(StrategyType.OUTPUT);
    if (outputStrategies.length > 0) {
      const outputExecutor = this.createExecutorForStrategies(outputStrategies);
      const outputResults = await outputExecutor.executeStrategies([contentItem]);
      const outputFused = outputExecutor.fuseResults(outputResults);
      allExecutions.push(...this.convertToStrategyExecutions(outputResults, outputStrategies));
      fusedOutput = outputFused;
    }

    // Get historical context if available
    const historicalContext = await this.getHistoricalContext(contentItem.id);

    // Calculate confidence score
    const confidence = this.scorer.calculateScore(contentItem, allExecutions, {
      historicalScore: historicalContext as number | undefined,
      successfulStrategyIds: allExecutions.filter(e => e.success).map(e => e.strategyId),
    });

    const processingTimeMs = Date.now() - startTime;

    // Determine outcome
    let outcome: ProcessingResult['outcome'] = 'SUCCESS';
    if (retryCount > 0 && confidence.isPassing) {
      outcome = 'RETRY_SUCCESS';
    } else if (!confidence.isPassing) {
      if (this.enableCloudEscalation && this.scorer.shouldEscalate(confidence)) {
        outcome = 'CLOUD_ESCALATED';
      } else if (this.scorer.shouldEscalate(confidence)) {
        outcome = 'HUMAN_INTERVENTION';
      } else if (this.scorer.shouldRetry(confidence)) {
        outcome = 'FAILED';
      } else {
        outcome = 'HUMAN_INTERVENTION';
      }
    }

    const result: ProcessingResult = {
      id: `${contentItem.id}-${Date.now()}`,
      contentItem,
      strategiesUsed: allExecutions,
      fusedOutput,
      confidence,
      outcome,
      processingTimeMs,
      retryCount,
    };

    // Record to experience store
    if (this.experienceStore) {
      await this.experienceStore.recordProcessing(contentItem.id, result).catch(() => {
        // Silently ignore experience store errors
      });
    }

    return result;
  }

  private createExecutorForStrategies(strategies: Strategy[]): StrategyExecutor {
    const executor = new StrategyExecutor();
    for (const strategy of strategies) {
      executor.register(strategy);
    }
    return executor;
  }

  private convertToStrategyExecutions(
    results: { strategyId: string; success: boolean; output?: unknown; error?: string }[],
    strategies: Strategy[]
  ): StrategyExecution[] {
    return results.map((result, index) => ({
      id: `exec-${Date.now()}-${index}`,
      strategyId: result.strategyId,
      startedAt: Date.now(),
      completedAt: Date.now(),
      success: result.success,
      output: result.output,
      error: result.error,
    }));
  }

  mergeOutput(contentItem: ContentItem, fusedOutput: unknown): void {
    if (typeof fusedOutput === 'string') {
      // Simple string output (e.g., cleanedText string from fuseResults)
      contentItem.meta.cleanedText = fusedOutput;
      contentItem.meta.textContent = fusedOutput;
    } else if (fusedOutput && typeof fusedOutput === 'object' && !Array.isArray(fusedOutput)) {
      const output = fusedOutput as Record<string, unknown>;
      if (output.cleanedText !== undefined) {
        contentItem.meta.cleanedText = output.cleanedText as string;
        contentItem.meta.textContent = output.cleanedText as string;
      }
      if (output.textContent !== undefined) {
        contentItem.meta.textContent = output.textContent as string;
      }
      if (output.filteredText !== undefined) {
        contentItem.meta.filteredText = output.filteredText as string;
        contentItem.meta.textContent = output.filteredText as string;
      }
      if (output.entities !== undefined) {
        contentItem.meta.entities = output.entities;
      }
      if (output.structure !== undefined) {
        contentItem.meta.structure = output.structure;
      }
    }
  }

  private async getHistoricalContext(contentItemId: string): Promise<unknown> {
    if (!this.experienceStore) {
      return undefined;
    }
    try {
      return await this.experienceStore.getHistoricalContext(contentItemId);
    } catch {
      return undefined;
    }
  }

  createFailedResult(
    contentItem: ContentItem,
    executions: StrategyExecution[],
    startTime: number,
    retryCount: number,
    error?: string
  ): ProcessingResult {
    const failedExecutions: StrategyExecution[] = [
      ...executions,
      {
        id: `exec-failed-${Date.now()}`,
        strategyId: 'pipeline',
        startedAt: startTime,
        completedAt: Date.now(),
        success: false,
        error: error ?? 'Max retries exceeded',
      },
    ];

    const confidence: ConfidenceScore = {
      overall: 0,
      components: {
        textQuality: 0,
        entityExtraction: 0,
        structuralIntegrity: 0,
        contextualCoherence: 0,
      },
      bonus: {
        historicalConsistency: 0,
        multiStrategyAgreement: 0,
      },
      isPassing: false,
    };

    return {
      id: `${contentItem.id}-failed-${Date.now()}`,
      contentItem,
      strategiesUsed: failedExecutions,
      fusedOutput: { type: 'failed', sources: 0, data: [] },
      confidence,
      outcome: 'FAILED',
      processingTimeMs: Date.now() - startTime,
      retryCount,
    };
  }
}