import { ChunkingStrategy, Chunk } from '../../../src/strategies/semantic/ChunkingStrategy';
import { RelevanceFilterStrategy } from '../../../src/strategies/semantic/RelevanceFilterStrategy';
import { ContentItem } from '../../../src/types';

describe('ChunkingStrategy', () => {
  const strategy = new ChunkingStrategy();

  function createContentItem(text: string): ContentItem {
    return {
      id: 'test-id',
      source: 'test-source',
      raw: new Uint8Array(),
      meta: { textContent: text },
      hints: {}
    };
  }

  describe('canApply', () => {
    it('returns true when textContent length >= 100', () => {
      const item = createContentItem('a'.repeat(100));
      expect(strategy.canApply(item)).toBe(true);
    });

    it('returns false when textContent length < 100', () => {
      const item = createContentItem('short text');
      expect(strategy.canApply(item)).toBe(false);
    });

    it('returns true when cleanedText length >= 100 (no textContent)', () => {
      const item: ContentItem = {
        id: 'test-id',
        source: 'test-source',
        raw: new Uint8Array(),
        meta: { cleanedText: 'a'.repeat(100) },
        hints: {}
      };
      expect(strategy.canApply(item)).toBe(true);
    });
  });

  describe('execute', () => {
    it('splits text by sentence boundaries', async () => {
      const text = 'Hello world. This is a test. How are you? I am fine.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      expect(output.chunks.length).toBeGreaterThan(0);
    });

    it('assigns sequential indices to chunks', async () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      for (let i = 0; i < output.chunks.length; i++) {
        expect(output.chunks[i].index).toBe(i);
      }
    });

    it('returns correct totalChunks count', async () => {
      const text = 'Short. Sentence. Here.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      expect(output.totalChunks).toBe(output.chunks.length);
    });

    it('returns chunks with required fields', async () => {
      const text = 'This is a test sentence that should be chunked properly.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      expect(output.chunks.length).toBeGreaterThan(0);

      const chunk = output.chunks[0];
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('index');
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('startChar');
      expect(chunk).toHaveProperty('endChar');
      expect(chunk).toHaveProperty('tokenEstimate');
    });

    it('handles empty text gracefully', async () => {
      const item = createContentItem('');
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      expect(output.chunks).toEqual([]);
      expect(output.totalChunks).toBe(0);
    });

    it('uses cleanedText when textContent is not available', async () => {
      const item: ContentItem = {
        id: 'test-id',
        source: 'test-source',
        raw: new Uint8Array(),
        meta: { cleanedText: 'Cleaned text here.' },
        hints: {}
      };
      const result = await strategy.execute(item);
      expect(result.success).toBe(true);
    });
  });
});

describe('RelevanceFilterStrategy', () => {
  const strategy = new RelevanceFilterStrategy();

  function createContentItem(text: string): ContentItem {
    return {
      id: 'test-id',
      source: 'test-source',
      raw: new Uint8Array(),
      meta: { textContent: text },
      hints: {}
    };
  }

  describe('canApply', () => {
    it('returns true when textContent length >= 100', () => {
      const item = createContentItem('a'.repeat(100));
      expect(strategy.canApply(item)).toBe(true);
    });

    it('returns false when textContent length < 100', () => {
      const item = createContentItem('short');
      expect(strategy.canApply(item)).toBe(false);
    });
  });

  describe('execute', () => {
    it('removes short paragraphs (< 50 chars)', async () => {
      const text = 'This is a very short paragraph.\n\n' +
        'This is a much longer paragraph that contains more than fifty characters and should be kept in the filtered result.\n\n' +
        'Another short one.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { filteredText: string; removedRatio: number };
      expect(output.filteredText).not.toContain('This is a very short paragraph');
      expect(output.filteredText).toContain('longer paragraph');
      expect(output.removedRatio).toBeGreaterThan(0);
    });

    it('removes duplicate paragraphs with Jaccard similarity > 0.7', async () => {
      const text = 'This is the first unique paragraph that should be retained.\n\n' +
        'This is the first unique paragraph that should be retained.\n\n' +
        'This is a completely different paragraph with distinct content.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { filteredText: string; removedRatio: number };
      const paragraphs = output.filteredText.split('\n\n');
      expect(paragraphs.length).toBeLessThan(3);
    });

    it('keeps paragraphs with Jaccard similarity <= 0.7', async () => {
      const text = 'The cat sat quietly on the worn mat and purred softly in contentment.\n\n' +
        'The playful dog ran quickly through the green park and barked loudly with excitement.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { filteredText: string; removedRatio: number };
      const paragraphs = output.filteredText.split('\n\n');
      expect(paragraphs.length).toBe(2);
    });

    it('returns filteredText and removedRatio', async () => {
      const text = 'Short.\n\nThis is a longer paragraph that should be kept because it has enough characters.';
      const item = createContentItem(text);
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { filteredText: string; removedRatio: number };
      expect(output).toHaveProperty('filteredText');
      expect(output).toHaveProperty('removedRatio');
      expect(typeof output.filteredText).toBe('string');
      expect(typeof output.removedRatio).toBe('number');
    });

    it('handles empty input gracefully', async () => {
      const item = createContentItem('');
      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { filteredText: string; removedRatio: number };
      expect(output.filteredText).toBe('');
      expect(output.removedRatio).toBe(0);
    });
  });
});