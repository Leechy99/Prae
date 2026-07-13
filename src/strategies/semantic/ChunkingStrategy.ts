import { ContentItem, StrategyExecution } from '../../types';
import { Strategy, StrategyConfig, StrategyType } from '../base/Strategy';

export interface Chunk {
  id: string;
  index: number;
  text: string;
  startChar: number;
  endChar: number;
  tokenEstimate: number;
}

export interface ChunkingResult {
  chunks: Chunk[];
  totalChunks: number;
}

const TARGET_CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;

function getCanonicalText(item: ContentItem): string {
  return (item.meta?.filteredText as string | undefined)
    ?? (item.meta?.cleanedText as string | undefined)
    ?? (item.meta?.textContent as string | undefined)
    ?? '';
}

function splitIntoSentences(text: string): string[] {
  const sentenceEnders = /[.!?。！？]+\s*|[\n]+/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceEnders.exec(text)) !== null) {
    const endIndex = match.index + match[0].length;
    const sentence = text.slice(lastIndex, endIndex);
    if (sentence.trim().length > 0) {
      sentences.push(sentence);
      lastIndex = endIndex;
    }
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim().length > 0) {
    sentences.push(remaining);
  }

  return sentences;
}

function estimateTokens(text: string): number {
  const cjkCharacters = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const latinWordCharacters = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const wordCharacters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  const otherWordCharacters = Math.max(0, wordCharacters - cjkCharacters - latinWordCharacters);

  return Math.max(1, Math.ceil(cjkCharacters + (latinWordCharacters + otherWordCharacters) / 4));
}

function createChunks(text: string): ChunkingResult {
  const sentences = splitIntoSentences(text);
  const chunks: Chunk[] = [];

  if (sentences.length === 0) {
    return { chunks: [], totalChunks: 0 };
  }

  let currentChunk = '';
  let currentStart = 0;
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const potentialChunk = currentChunk + sentence;

    if (potentialChunk.length <= TARGET_CHUNK_SIZE) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk.length > 0) {
        chunks.push({
          id: crypto.randomUUID(),
          index: chunkIndex++,
          text: currentChunk,
          startChar: currentStart,
          endChar: currentStart + currentChunk.length,
          tokenEstimate: estimateTokens(currentChunk)
        });
      }

      const overlapText = currentChunk.slice(-CHUNK_OVERLAP);
      currentStart = currentStart + currentChunk.length - overlapText.length;
      currentChunk = overlapText + sentence;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      id: crypto.randomUUID(),
      index: chunkIndex,
      text: currentChunk,
      startChar: currentStart,
      endChar: currentStart + currentChunk.length,
      tokenEstimate: estimateTokens(currentChunk)
    });
  }

  return {
    chunks,
    totalChunks: chunks.length
  };
}

export class ChunkingStrategy implements Strategy {
  readonly id = 'chunking';
  readonly name = 'Chunking Strategy';
  readonly type = StrategyType.SEMANTIC;
  readonly version = '1.0.0';
  readonly config: StrategyConfig;

  constructor(config: StrategyConfig = { enabled: true, priority: 100, params: {} }) {
    this.config = config;
  }

  canApply(item: ContentItem): boolean {
    return getCanonicalText(item).trim().length > 0;
  }

  async execute(item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();

    try {
      const textContent = getCanonicalText(item);
      const result = createChunks(textContent);

      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: true,
        output: result
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
