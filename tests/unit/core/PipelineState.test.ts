import {
  createPipelineState,
  mergeStrategyOutput,
  projectContentItem,
} from '../../../src/core/PipelineState';
import type { ContentItem } from '../../../src/types';

const createItem = (meta: Record<string, unknown> = {}): ContentItem => ({
  id: 'item-1',
  source: 'HTMLInputSource',
  raw: new TextEncoder().encode('<p>raw</p>'),
  meta: { textContent: 'raw text', title: 'Title', ...meta },
  hints: { mimeType: 'text/html' },
});

describe('PipelineState', () => {
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
});
