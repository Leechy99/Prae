import {
  createPipelineState,
  mergeStrategyOutput,
  projectContentItem,
} from '../../../src/core/PipelineState';
import type { ContentItem } from '../../../src/types';
import type { StrategyOutput } from '../../../src/strategies/base/StrategyOutput';

const createItem = (meta: Record<string, unknown> = {}): ContentItem => ({
  id: 'item-1',
  source: 'HTMLInputSource',
  raw: new TextEncoder().encode('<p>raw</p>'),
  meta: { textContent: 'raw text', title: 'Title', ...meta },
  hints: { mimeType: 'text/html' },
});

describe('PipelineState', () => {
  it('exposes strategy outputs as a literal-discriminated union', () => {
    const outputs: StrategyOutput[] = [
      { kind: 'html', document: '<p>cleaned</p>', cleanedText: 'cleaned' },
      { kind: 'text', filteredText: 'filtered' },
      {
        kind: 'chunks',
        chunks: [{ id: 'c1', index: 0, text: 'filtered', startChar: 0, endChar: 8, tokenEstimate: 2 }],
        totalChunks: 1,
      },
      { kind: 'metrics', removedTags: 2 },
      { kind: 'semantic', entities: ['Prae'] },
    ];

    expect(outputs.map(output => output.kind)).toEqual([
      'html',
      'text',
      'chunks',
      'metrics',
      'semantic',
    ]);
  });

  it('uses filtered text as canonical text and preserves chunks and metrics', () => {
    const item = createItem();
    const initial = createPipelineState(item);
    const cleaned = mergeStrategyOutput(initial, { cleanedText: 'cleaned', removedTags: 2 });
    const filtered = mergeStrategyOutput(cleaned, { filteredText: 'filtered', removedRatio: 0.25 });
    const chunked = mergeStrategyOutput(filtered, {
      chunks: [{ id: 'c1', index: 0, text: 'filtered', startChar: 0, endChar: 8, tokenEstimate: 2 }],
      totalChunks: 1,
    });

    expect(initial.text).toBe('raw text');
    expect(cleaned.text).toBe('cleaned');
    expect(chunked.text).toBe('filtered');
    expect(chunked.metrics).toMatchObject({ removedTags: 2, removedRatio: 0.25 });
    expect(chunked.chunks).toEqual([
      { id: 'c1', index: 0, text: 'filtered', startChar: 0, endChar: 8, tokenEstimate: 2 },
    ]);
    expect(projectContentItem(chunked).meta).toMatchObject({
      textContent: 'filtered',
      cleanedText: 'cleaned',
      filteredText: 'filtered',
      removedTags: 2,
      removedRatio: 0.25,
      totalChunks: 1,
    });
    expect(item.meta).toEqual({ textContent: 'raw text', title: 'Title' });
  });

  it('uses filteredText over cleanedText over textContent when creating state', () => {
    const filtered = createPipelineState(createItem({
      textContent: 'raw',
      cleanedText: 'cleaned',
      filteredText: 'filtered',
    }));
    const cleaned = createPipelineState(createItem({ textContent: 'raw', cleanedText: 'cleaned' }));

    expect(filtered.text).toBe('filtered');
    expect(cleaned.text).toBe('cleaned');
  });

  it.each([42, 0])('normalizes numeric filteredText %p at the state boundary', value => {
    const state = createPipelineState(createItem({
      filteredText: value,
      cleanedText: 'stale cleaned fallback',
      textContent: 'stale original fallback',
    }));

    expect(state.filteredText).toBe(String(value));
    expect(state.text).toBe(String(value));
    expect(projectContentItem(state).meta).toMatchObject({
      filteredText: String(value),
      textContent: String(value),
    });
  });

  it('projects fresh mutable values without changing the source item or state', () => {
    const item = createItem({ strategiesApplied: ['cleaner'] });
    const state = mergeStrategyOutput(createPipelineState(item), {
      entities: ['Prae'],
      structure: { sections: 1 },
    });

    const projected = projectContentItem(state);

    expect(projected).not.toBe(item);
    expect(projected.raw).not.toBe(item.raw);
    expect(projected.raw).toEqual(item.raw);
    expect(projected.hints).not.toBe(item.hints);
    expect(projected.meta).not.toBe(item.meta);
    expect(projected.meta).toMatchObject({
      textContent: 'raw text',
      entities: ['Prae'],
      structure: { sections: 1 },
      strategiesApplied: ['cleaner'],
    });

    projected.raw[0] = 0;
    projected.hints.mimeType = 'text/plain';
    projected.meta.title = 'Changed';

    expect(item.raw[0]).not.toBe(0);
    expect(item.hints.mimeType).toBe('text/html');
    expect(item.meta.title).toBe('Title');
    expect(projectContentItem(state).meta.title).toBe('Title');
  });

  it('isolates projected semantic values and confidence from pipeline state', () => {
    const confidence = {
      overall: 0.9,
      components: {
        textQuality: 0.9,
        entityExtraction: 0.8,
        structuralIntegrity: 1,
        contextualCoherence: 0.9,
      },
      bonus: { historicalConsistency: 0.1, multiStrategyAgreement: 0.05 },
      isPassing: true,
    };
    const state = mergeStrategyOutput(createPipelineState(createItem({ confidence })), {
      entities: [{ name: 'Prae' }],
      mentions: [{ text: 'platform' }],
      namedEntities: [{ name: 'Prae' }],
      structure: { outline: { sections: 1 } },
    });
    const projected = projectContentItem(state);

    (projected.meta.entities as Array<{ name: string }>)[0].name = 'changed';
    (projected.meta.mentions as Array<{ text: string }>)[0].text = 'changed';
    (projected.meta.namedEntities as Array<{ name: string }>)[0].name = 'changed';
    const projectedStructure = projected.meta.structure as { outline: { sections: number } };
    projectedStructure.outline.sections = 99;
    const projectedConfidence = projected.meta.confidence as typeof confidence;
    projectedConfidence.components.textQuality = 0;
    projectedConfidence.bonus.historicalConsistency = 0;

    expect(state.semantic.entities).toEqual([{ name: 'Prae' }]);
    expect(state.semantic.mentions).toEqual([{ text: 'platform' }]);
    expect(state.semantic.namedEntities).toEqual([{ name: 'Prae' }]);
    expect(state.semantic.structure).toEqual({ outline: { sections: 1 } });
    expect(state.confidence?.components.textQuality).toBe(0.9);
    expect(state.confidence?.bonus.historicalConsistency).toBe(0.1);
  });

  it('preserves a transformed HTML document across later merges and projection', () => {
    const withDocument = mergeStrategyOutput(createPipelineState(createItem()), {
      document: '<html><body><p>cleaned</p></body></html>',
      cleanedText: 'cleaned',
    });
    const withMetric = mergeStrategyOutput(withDocument, { navRemoved: 1, textLength: 7 });

    expect(withMetric.document).toBe('<html><body><p>cleaned</p></body></html>');
    expect(projectContentItem(withMetric).meta).toMatchObject({
      document: '<html><body><p>cleaned</p></body></html>',
      navRemoved: 1,
      textLength: 7,
    });
  });

  it('returns the original state reference for unsupported outputs', () => {
    const initial = createPipelineState(createItem());

    expect(mergeStrategyOutput(initial, { customRenderer: true })).toBe(initial);
  });

  it('returns the original state reference for malformed chunks', () => {
    const initial = createPipelineState(createItem());

    expect(mergeStrategyOutput(initial, { chunks: ['bad'] })).toBe(initial);
  });
});
