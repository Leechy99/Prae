import type { ConfidenceScore, ContentChunk, ContentItem } from '../types';
import type { StrategyOutputFields } from '../strategies/base/StrategyOutput';

export interface PipelineMetrics {
  readonly [name: string]: number;
}

export interface PipelineSemanticState {
  readonly entities?: ReadonlyArray<unknown>;
  readonly mentions?: ReadonlyArray<unknown>;
  readonly namedEntities?: ReadonlyArray<unknown>;
  readonly structure?: Readonly<Record<string, unknown>>;
  readonly relevance?: number;
  readonly coherence?: number;
  readonly context?: string;
}

export type ReadonlyConfidenceScore = Readonly<
  Omit<ConfidenceScore, 'components' | 'bonus'> & {
    readonly components: Readonly<ConfidenceScore['components']>;
    readonly bonus: Readonly<ConfidenceScore['bonus']>;
  }
>;

export interface PipelineState {
  readonly contentItem: ContentItem;
  readonly document?: string;
  readonly text: string;
  readonly cleanedText?: string;
  readonly filteredText?: string;
  readonly chunks?: ReadonlyArray<Readonly<ContentChunk>>;
  readonly totalChunks?: number;
  readonly metrics: PipelineMetrics;
  readonly semantic: PipelineSemanticState;
  readonly strategiesApplied: ReadonlyArray<string>;
  readonly confidence?: ReadonlyConfidenceScore;
}

const metricNames = ['removedTags', 'navRemoved', 'textLength', 'removedRatio'] as const;
const arraySemanticNames = ['entities', 'mentions', 'namedEntities'] as const;
const numberSemanticNames = ['relevance', 'coherence'] as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function cloneContentItem(item: ContentItem): ContentItem {
  return {
    ...item,
    raw: item.raw.slice(),
    hints: { ...item.hints },
    meta: { ...item.meta },
  };
}

function isContentChunk(value: unknown): value is ContentChunk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const chunk = value as Record<string, unknown>;
  return typeof chunk.id === 'string'
    && typeof chunk.index === 'number'
    && typeof chunk.text === 'string'
    && typeof chunk.startChar === 'number'
    && typeof chunk.endChar === 'number'
    && typeof chunk.tokenEstimate === 'number';
}

function readChunks(value: unknown): ContentChunk[] | undefined {
  return Array.isArray(value) && value.every(isContentChunk)
    ? value.map(chunk => ({ ...chunk }))
    : undefined;
}

function cloneConfidence(value: unknown): ConfidenceScore | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const confidence = value as ConfidenceScore;
  return {
    ...confidence,
    components: { ...confidence.components },
    bonus: { ...confidence.bonus },
  };
}

function cloneSemanticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSemanticValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneSemanticValue(nestedValue)])
    );
  }
  return value;
}

function readMetrics(source: Record<string, unknown>): PipelineMetrics {
  const metrics: Record<string, number> = {};
  for (const name of metricNames) {
    if (typeof source[name] === 'number') {
      metrics[name] = source[name];
    }
  }
  return metrics;
}

function readSemantic(source: Record<string, unknown>): PipelineSemanticState {
  const semantic: {
    entities?: unknown[];
    mentions?: unknown[];
    namedEntities?: unknown[];
    structure?: Record<string, unknown>;
    relevance?: number;
    coherence?: number;
    context?: string;
  } = {};

  for (const name of arraySemanticNames) {
    if (Array.isArray(source[name])) {
      semantic[name] = source[name].map(cloneSemanticValue);
    }
  }
  if (source.structure && typeof source.structure === 'object' && !Array.isArray(source.structure)) {
    semantic.structure = cloneSemanticValue(source.structure) as Record<string, unknown>;
  }
  for (const name of numberSemanticNames) {
    if (typeof source[name] === 'number') {
      semantic[name] = source[name];
    }
  }
  if (typeof source.context === 'string') {
    semantic.context = source.context;
  }

  return semantic;
}

export function createPipelineState(item: ContentItem): PipelineState {
  const contentItem = cloneContentItem(item);
  const meta = contentItem.meta;
  const cleanedText = stringValue(meta.cleanedText);
  const filteredText = stringValue(meta.filteredText);
  const textContent = stringValue(meta.textContent) ?? '';
  const strategiesApplied = Array.isArray(meta.strategiesApplied)
    ? meta.strategiesApplied.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    contentItem,
    document: stringValue(meta.document),
    text: filteredText ?? cleanedText ?? textContent,
    cleanedText,
    filteredText,
    chunks: readChunks(meta.chunks),
    totalChunks: typeof meta.totalChunks === 'number' ? meta.totalChunks : undefined,
    metrics: readMetrics(meta),
    semantic: readSemantic(meta),
    strategiesApplied,
    confidence: cloneConfidence(meta.confidence),
  };
}

export function mergeStrategyOutput(state: PipelineState, output: unknown): PipelineState {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return state;
  }

  const source = output as Record<string, unknown>;
  const next: Partial<StrategyOutputFields> = {};
  let recognized = false;

  for (const name of ['document', 'cleanedText', 'textContent', 'filteredText', 'context'] as const) {
    if (typeof source[name] === 'string') {
      next[name] = source[name];
      recognized = true;
    }
  }
  const chunks = readChunks(source.chunks);
  if (chunks !== undefined) {
    next.chunks = chunks;
    recognized = true;
  }
  if (typeof source.totalChunks === 'number') {
    next.totalChunks = source.totalChunks;
    recognized = true;
  }
  for (const name of metricNames) {
    if (typeof source[name] === 'number') {
      next[name] = source[name];
      recognized = true;
    }
  }
  for (const name of arraySemanticNames) {
    if (Array.isArray(source[name])) {
      next[name] = [...source[name]];
      recognized = true;
    }
  }
  if (source.structure && typeof source.structure === 'object' && !Array.isArray(source.structure)) {
    next.structure = { ...(source.structure as Record<string, unknown>) };
    recognized = true;
  }
  for (const name of numberSemanticNames) {
    if (typeof source[name] === 'number') {
      next[name] = source[name];
      recognized = true;
    }
  }

  if (!recognized) {
    return state;
  }

  const cleanedText = next.cleanedText ?? state.cleanedText;
  const filteredText = next.filteredText ?? state.filteredText;
  const textContent = next.textContent ?? state.text;
  const nextMetrics = readMetrics(next as Record<string, unknown>);
  const nextSemantic = readSemantic(next as Record<string, unknown>);

  return {
    ...state,
    document: next.document ?? state.document,
    text: filteredText ?? cleanedText ?? textContent,
    cleanedText,
    filteredText,
    chunks: next.chunks ?? state.chunks,
    totalChunks: next.totalChunks ?? state.totalChunks,
    metrics: { ...state.metrics, ...nextMetrics },
    semantic: { ...state.semantic, ...nextSemantic },
  };
}

export function projectContentItem(state: PipelineState): ContentItem {
  const semantic = readSemantic(state.semantic as Record<string, unknown>);
  const meta: Record<string, unknown> = {
    ...state.contentItem.meta,
    textContent: state.text,
    ...state.metrics,
    ...semantic,
    strategiesApplied: [...state.strategiesApplied],
  };

  if (state.document !== undefined) meta.document = state.document;
  if (state.cleanedText !== undefined) meta.cleanedText = state.cleanedText;
  if (state.filteredText !== undefined) meta.filteredText = state.filteredText;
  if (state.chunks !== undefined) meta.chunks = state.chunks.map(chunk => ({ ...chunk }));
  if (state.totalChunks !== undefined) meta.totalChunks = state.totalChunks;
  if (state.confidence !== undefined) meta.confidence = cloneConfidence(state.confidence);

  return {
    ...state.contentItem,
    raw: state.contentItem.raw.slice(),
    hints: { ...state.contentItem.hints },
    meta,
  };
}
