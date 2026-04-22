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

function splitIntoSentences(text: string): string[] {
  const sentenceEnders = /([.!?]+[\s\n]+)|([\n]+)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceEnders.exec(text)) !== null) {
    const endIndex = match.index + match[0].length;
    const sentence = text.slice(lastIndex, endIndex).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    lastIndex = endIndex;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining.length > 0) {
    sentences.push(remaining);
  }

  return sentences;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
    const potentialChunk = currentChunk.length > 0
      ? currentChunk + ' ' + sentence
      : sentence;

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
      currentChunk = overlapText + ' ' + sentence;
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
    const textContent = (item.meta?.textContent as string) || (item.meta?.cleanedText as string) || '';
    return textContent.length >= 100;
  }

  async execute(item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();

    try {
      const textContent = (item.meta?.textContent as string) || (item.meta?.cleanedText as string) || '';
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