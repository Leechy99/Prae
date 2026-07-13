import type { ContentItem, ProcessingResult, StrategyExecution, ConfidenceScore } from '../types';
import { Strategy, StrategyType } from '../strategies/base/Strategy';
import { StrategyRegistry } from '../strategies/base/StrategyRegistry';
import { ConfidenceScorer } from './ConfidenceScorer';
import {
  createPipelineState,
  mergeStrategyOutput,
  projectContentItem,
  type PipelineState,
} from './PipelineState';
import type { RetryPolicy } from './RetryPolicy';
import type { ExperienceStore } from '../experience/ExperienceStore';

export interface PipelineConfig {
  maxRetries?: number;
  enableCloudEscalation?: boolean;
  retryPolicy?: RetryPolicy;
}

interface PipelineExecutedStrategies {
  executions: StrategyExecution[];
  fusedOutput: unknown;
}

function cloneMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneMetadataValue);
  }
  if (value instanceof Uint8Array) {
    return value.slice();
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, cloneMetadataValue(nestedValue)])
      );
    }
  }
  return value;
}

function cloneContentItem(contentItem: ContentItem): ContentItem {
  return {
    ...contentItem,
    raw: contentItem.raw.slice(),
    meta: cloneMetadataValue(contentItem.meta) as Record<string, unknown>,
    hints: {
      ...contentItem.hints,
      possibleTypes: contentItem.hints.possibleTypes?.slice(),
    },
  };
}

export class Pipeline {
  private registry: StrategyRegistry;
  private scorer: ConfidenceScorer;
  private experienceStore?: ExperienceStore;
  private maxRetries: number;
  private enableCloudEscalation: boolean;
  private retryPolicy?: RetryPolicy;

  constructor(config: PipelineConfig = {}) {
    this.registry = new StrategyRegistry();
    this.scorer = new ConfidenceScorer();
    this.maxRetries = config.maxRetries ?? 3;
    this.enableCloudEscalation = config.enableCloudEscalation ?? false;
    this.retryPolicy = config.retryPolicy;
  }

  setExperienceStore(store: ExperienceStore): void {
    this.experienceStore = store;
  }

  getRegisteredStrategies(): Strategy[] {
    return this.registry.getAll();
  }

  registerStrategy(strategy: Strategy): void {
    this.registry.register(strategy);
  }

  async process(contentItem: ContentItem): Promise<ProcessingResult> {
    const startTime = Date.now();
    const pristineOriginal = cloneContentItem(contentItem);
    let attempt = cloneContentItem(pristineOriginal);
    let retryCount = 0;

    while (true) {
      let result: ProcessingResult;
      try {
        result = await this.executePipelineWithRetry(attempt, retryCount, startTime);
      } catch (error) {
        result = this.createFailedResult(
          attempt,
          [],
          startTime,
          retryCount,
          error instanceof Error ? error.message : String(error)
        );
      }

      if (result.outcome === 'SUCCESS' || result.outcome === 'RETRY_SUCCESS') {
        return result;
      }

      const nextAttempt = retryCount + 1;
      if (
        nextAttempt > this.maxRetries
        || !this.retryPolicy
        || !this.retryPolicy.canRetry(result, nextAttempt)
      ) {
        return result;
      }

      retryCount = nextAttempt;
      attempt = this.retryPolicy.prepareAttempt(cloneContentItem(pristineOriginal), nextAttempt);
    }
  }

  private async executePipelineWithRetry(
    contentItem: ContentItem,
    retryCount: number,
    startTime: number
  ): Promise<ProcessingResult> {
    let state: PipelineState = {
      ...createPipelineState(contentItem),
      strategiesApplied: [],
    };

    const denoiseResult = await this.executeTransformStage(state, StrategyType.DENOISE);
    state = denoiseResult.state;
    const semanticResult = await this.executeTransformStage(state, StrategyType.SEMANTIC);
    state = semanticResult.state;
    const transformExecutions = [
      ...denoiseResult.executions,
      ...semanticResult.executions,
    ];

    // Get historical context if available
    const historicalContext = await this.getHistoricalContext(contentItem.id);

    // Score canonical transform state before rendering so every output sees one score.
    const confidence = this.scorer.calculateScore(projectContentItem(state), transformExecutions, {
      historicalScore: historicalContext as number | undefined,
      successfulStrategyIds: transformExecutions.filter(e => e.success).map(e => e.strategyId),
    });
    state = { ...state, confidence };

    const projectedState = projectContentItem(state);
    projectedState.meta.confidence = confidence.overall;
    Object.assign(contentItem.meta, projectedState.meta);

    const outputResult = await this.executeOutputStage(state);
    const allExecutions = [...transformExecutions, ...outputResult.executions];
    const fusedOutput = outputResult.fusedOutput;

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

  private async executeTransformStage(
    state: PipelineState,
    type: StrategyType.DENOISE | StrategyType.SEMANTIC
  ): Promise<{ state: PipelineState; executions: StrategyExecution[] }> {
    const strategies = this.registry.listByPriority(type);
    const executions: StrategyExecution[] = [];
    let nextState = state;

    for (const strategy of strategies) {
      const item = projectContentItem(nextState);
      if (!strategy.config.enabled || !strategy.canApply(item)) {
        continue;
      }

      const execution = await this.executeStrategy(strategy, item);
      executions.push(execution);

      if (execution.success) {
        nextState = {
          ...mergeStrategyOutput(nextState, execution.output),
          strategiesApplied: [...nextState.strategiesApplied, execution.strategyId],
        };
      }
    }

    return { state: nextState, executions };
  }

  private async executeOutputStage(state: PipelineState): Promise<PipelineExecutedStrategies> {
    const executions: StrategyExecution[] = [];

    for (const strategy of this.registry.listByPriority(StrategyType.OUTPUT)) {
      const item = projectContentItem(state);
      item.meta.confidence = state.confidence?.overall ?? 0;
      if (!strategy.config.enabled || !strategy.canApply(item)) {
        continue;
      }

      executions.push(await this.executeStrategy(strategy, item));
    }

    return {
      executions,
      fusedOutput: this.fuseFinalOutputs(executions),
    };
  }

  private async executeStrategy(strategy: Strategy, item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();
    try {
      return await strategy.execute(item);
    } catch (error) {
      const completedAt = Date.now();
      return {
        id: `exec-${strategy.id}-${startedAt}`,
        strategyId: strategy.id,
        startedAt,
        completedAt,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private fuseFinalOutputs(results: { success: boolean; output?: unknown }[]): unknown {
    const successfulResults = results.filter(result => result.success);

    if (successfulResults.length === 0) {
      return { type: 'failed', sources: 0, data: [] };
    }

    if (successfulResults.length === 1) {
      return successfulResults[0].output;
    }

    return {
      type: 'fused',
      sources: successfulResults.length,
      data: successfulResults.map(result => result.output),
    };
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
      if (output.chunks !== undefined) {
        contentItem.meta.chunks = output.chunks;
      }
      if (output.totalChunks !== undefined) {
        contentItem.meta.totalChunks = output.totalChunks;
      }
      if (output.removedTags !== undefined) {
        contentItem.meta.removedTags = output.removedTags;
      }
      if (output.navRemoved !== undefined) {
        contentItem.meta.navRemoved = output.navRemoved;
      }
      if (output.textLength !== undefined) {
        contentItem.meta.textLength = output.textLength;
      }
      if (output.removedRatio !== undefined) {
        contentItem.meta.removedRatio = output.removedRatio;
      }
      if (output.relevance !== undefined) {
        contentItem.meta.relevance = output.relevance;
      }
      if (output.mentions !== undefined) {
        contentItem.meta.mentions = output.mentions;
      }
      if (output.namedEntities !== undefined) {
        contentItem.meta.namedEntities = output.namedEntities;
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
