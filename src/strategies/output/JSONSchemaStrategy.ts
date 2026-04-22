import { ContentItem, StrategyExecution } from '../../types';
import { Strategy, StrategyConfig, StrategyType } from '../base/Strategy';

export interface JSONSchemaOutput {
  version: string;
  content: {
    text: string;
    title?: string;
    url?: string;
  };
  metadata: {
    source: string;
    processedAt: string;
    confidence: number;
    strategiesApplied: string[];
  };
  chunks?: Array<{
    id: string;
    index: number;
    text: string;
    tokenEstimate: number;
  }>;
}

export class JSONSchemaStrategy implements Strategy {
  readonly id = 'json-schema-output';
  readonly name = 'JSON Schema Output Strategy';
  readonly type = StrategyType.OUTPUT;
  readonly version = '1.0.0';
  readonly config: StrategyConfig;

  constructor(config: StrategyConfig = { enabled: true, priority: 50, params: {} }) {
    this.config = config;
  }

  canApply(item: ContentItem): boolean {
    const text = item.meta?.cleanedText || item.meta?.textContent;
    return !!text;
  }

  async execute(item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();

    try {
      const rawCleaned = item.meta?.cleanedText;
      const rawTextContent = item.meta?.textContent;
      const text = String(rawCleaned || rawTextContent || '');
      const title = item.meta?.title as string | undefined;
      const url = item.meta?.url as string | undefined;
      const confidence = (item.meta?.confidence as number) || 0.8;
      const strategiesApplied = (item.meta?.strategiesApplied as string[]) || [];

      const output: JSONSchemaOutput = {
        version: '1.0.0',
        content: {
          text,
          ...(title && { title }),
          ...(url && { url }),
        },
        metadata: {
          source: item.source,
          processedAt: new Date().toISOString(),
          confidence,
          strategiesApplied,
        },
      };

      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: true,
        output,
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}