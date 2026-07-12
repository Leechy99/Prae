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
  Required<Pick<StrategyOutputFields, K>> & Partial<Omit<StrategyOutputFields, K>>;

type TextField = 'cleanedText' | 'textContent' | 'filteredText';
type MetricField = 'removedTags' | 'navRemoved' | 'textLength' | 'removedRatio';
type SemanticField = 'entities' | 'mentions' | 'namedEntities' | 'structure'
  | 'relevance' | 'coherence' | 'context';

type OutputWithOneOf<K extends keyof StrategyOutputFields> = {
  [P in K]: OutputWith<P>;
}[K];

export type HTMLStrategyOutput = {
  kind: 'html';
  document: string;
} & StrategyOutputFields;

export type TextStrategyOutput = {
  kind: 'text';
} & OutputWithOneOf<TextField>;

export type ChunkStrategyOutput = {
  kind: 'chunks';
  chunks: ContentChunk[];
} & StrategyOutputFields;

export type MetricStrategyOutput = {
  kind: 'metrics';
} & OutputWithOneOf<MetricField>;

export type SemanticStrategyOutput = {
  kind: 'semantic';
} & OutputWithOneOf<SemanticField>;

export type StrategyOutput =
  | HTMLStrategyOutput
  | TextStrategyOutput
  | ChunkStrategyOutput
  | MetricStrategyOutput
  | SemanticStrategyOutput;
