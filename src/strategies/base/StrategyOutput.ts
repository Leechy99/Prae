import type { ContentChunk } from '../../types';

export interface StrategyOutputFields {
  document?: string;
  cleanedText?: string;
  textContent?: string;
  filteredText?: string;
  chunks?: ContentChunk[];
  totalChunks?: number;
  removedTags?: number;
  navRemoved?: number;
  textLength?: number;
  removedRatio?: number;
  entities?: unknown[];
  mentions?: unknown[];
  namedEntities?: unknown[];
  structure?: Record<string, unknown>;
  relevance?: number;
  coherence?: number;
  context?: string;
}

type OutputWith<K extends keyof StrategyOutputFields> =
  Required<Pick<StrategyOutputFields, K>> & StrategyOutputFields;

export type StrategyOutput = {
  [K in keyof StrategyOutputFields]: OutputWith<K>;
}[keyof StrategyOutputFields];
