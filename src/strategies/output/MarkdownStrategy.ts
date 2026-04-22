import { ContentItem, StrategyExecution } from '../../types';
import { Strategy, StrategyConfig, StrategyType } from '../base/Strategy';

export interface MarkdownOutput {
  markdown: string;
  metadata: {
    source: string;
    processedAt: string;
    confidence: number;
  };
}

export class MarkdownStrategy implements Strategy {
  readonly id = 'markdown-output';
  readonly name = 'Markdown Output Strategy';
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
      const confidence = (item.meta?.confidence as number) || 0.8;

      // Split text into paragraphs and join with double newlines
      const paragraphs = text.split(/\n+/g).filter(p => p.trim().length > 0);
      const formattedParagraphs = paragraphs.map(p => p.trim());

      let markdown = formattedParagraphs.join('\n\n');

      // Add title as heading if present
      if (title) {
        markdown = `# ${title}\n\n${markdown}`;
      }

      const output: MarkdownOutput = {
        markdown,
        metadata: {
          source: item.source,
          processedAt: new Date().toISOString(),
          confidence,
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