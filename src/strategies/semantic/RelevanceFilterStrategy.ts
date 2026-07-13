import { ContentItem, StrategyExecution } from '../../types';
import { Strategy, StrategyConfig, StrategyType } from '../base/Strategy';

export interface RelevanceFilterResult {
  filteredText: string;
  removedRatio: number;
}

const MIN_PARAGRAPH_LENGTH = 50;
const SIMILARITY_THRESHOLD = 0.7;

function getCanonicalText(item: ContentItem): string {
  return (item.meta?.filteredText as string | undefined)
    ?? (item.meta?.cleanedText as string | undefined)
    ?? (item.meta?.textContent as string | undefined)
    ?? '';
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\s+/).filter(word => word.length > 0));
}

function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0;
  }

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
}

function filterParagraphs(paragraphs: string[]): { filtered: string[]; removedCount: number } {
  const filtered: string[] = [];
  let removedCount = 0;

  for (const paragraph of paragraphs) {
    if (paragraph.length < MIN_PARAGRAPH_LENGTH) {
      removedCount++;
      continue;
    }

    const paragraphSet = tokenize(paragraph);
    let isDuplicate = false;

    for (const existing of filtered) {
      const existingSet = tokenize(existing);
      if (jaccardSimilarity(paragraphSet, existingSet) > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      filtered.push(paragraph);
    } else {
      removedCount++;
    }
  }

  return { filtered, removedCount };
}

export class RelevanceFilterStrategy implements Strategy {
  readonly id = 'relevance-filter';
  readonly name = 'Relevance Filter Strategy';
  readonly type = StrategyType.SEMANTIC;
  readonly version = '1.0.0';
  readonly config: StrategyConfig;

  constructor(config: StrategyConfig = { enabled: true, priority: 90, params: {} }) {
    this.config = config;
  }

  canApply(item: ContentItem): boolean {
    return getCanonicalText(item).trim().length > 0;
  }

  async execute(item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();

    try {
      const textContent = getCanonicalText(item);
      const paragraphs = splitIntoParagraphs(textContent);

      if (paragraphs.length > 0 && paragraphs.every(paragraph => paragraph.length < MIN_PARAGRAPH_LENGTH)) {
        return {
          id: crypto.randomUUID(),
          strategyId: this.id,
          startedAt,
          completedAt: Date.now(),
          success: true,
          output: { filteredText: textContent, removedRatio: 0 } satisfies RelevanceFilterResult
        };
      }

      const { filtered, removedCount } = filterParagraphs(paragraphs);
      const filteredText = filtered.join('\n\n');
      const removedRatio = paragraphs.length > 0 ? removedCount / paragraphs.length : 0;

      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: true,
        output: { filteredText, removedRatio } satisfies RelevanceFilterResult
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
