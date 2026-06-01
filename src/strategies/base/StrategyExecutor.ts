import { ContentItem, StrategyExecution } from '../../types';
import { Strategy } from './Strategy';

export interface ExecuteOptions {
  stopOnError?: boolean;
}

export interface ExecutionResult {
  strategyId: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

export class StrategyExecutor {
  private registry: Map<string, Strategy> = new Map();

  register(strategy: Strategy): void {
    this.registry.set(strategy.id, strategy);
  }

  unregister(strategyId: string): boolean {
    return this.registry.delete(strategyId);
  }

  async executeStrategies(
    items: ContentItem[],
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const item of items) {
      for (const strategy of this.registry.values()) {
        if (strategy.config.enabled && strategy.canApply(item)) {
          try {
            const execution = await strategy.execute(item);
            results.push({
              strategyId: strategy.id,
              success: execution.success,
              output: execution.output,
              error: execution.error,
            });

            if (!execution.success && options.stopOnError) {
              return results;
            }
          } catch (error) {
            results.push({
              strategyId: strategy.id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });

            if (options.stopOnError) {
              return results;
            }
          }
        }
      }
    }

    return results;
  }

  fuseResults(results: ExecutionResult[]): unknown {
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      return { type: 'failed', sources: 0, data: [] };
    }

    if (successfulResults.length === 1) {
      return successfulResults[0].output;
    }

    const mergeableKeys = new Set([
      'cleanedText',
      'textContent',
      'filteredText',
      'removedTags',
      'navRemoved',
      'textLength',
      'chunks',
      'totalChunks',
      'removedRatio',
      'entities',
      'mentions',
      'namedEntities',
      'structure',
      'schema',
      'format',
      'coherence',
      'context',
      'relevance',
    ]);

    const objectOutputs = successfulResults
      .map(r => r.output)
      .filter((output): output is Record<string, unknown> =>
        !!output && typeof output === 'object' && !Array.isArray(output)
      );

    const hasMergeableOutput = objectOutputs.some(output =>
      Object.keys(output).some(key => mergeableKeys.has(key))
    );

    if (hasMergeableOutput) {
      return objectOutputs.reduce<Record<string, unknown>>((merged, output) => {
        return { ...merged, ...output };
      }, {});
    }

    return {
      type: 'fused',
      sources: successfulResults.length,
      data: successfulResults.map(r => r.output),
    };
  }
}
