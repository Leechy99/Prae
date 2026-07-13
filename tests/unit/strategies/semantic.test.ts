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

    it('returns true for non-empty short Chinese text', () => {
      const item = createContentItem('这是一个简短但有效的中文句子。它应该进入语义处理！');
      expect(strategy.canApply(item)).toBe(true);
    });

    it('returns true when textContent is non-empty and shorter than 100 characters', () => {
      const item = createContentItem('short text');
      expect(strategy.canApply(item)).toBe(true);
    });

    it('returns false for whitespace-only canonical text', () => {
      const item = createContentItem('   \n\t');
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

    it('uses filteredText before cleanedText and textContent', async () => {
      const item: ContentItem = {
        id: 'test-id',
        source: 'test-source',
        raw: new Uint8Array(),
        meta: {
          filteredText: '保留的文本。',
          cleanedText: 'Cleaned text must not be selected.',
          textContent: 'Raw text must not be selected.',
        },
        hints: {}
      };

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      expect(output.chunks.map(chunk => chunk.text).join(' ')).toBe('保留的文本。');
    });

    it('treats an empty filteredText as the canonical value', () => {
      const item: ContentItem = {
        id: 'test-id',
        source: 'test-source',
        raw: new Uint8Array(),
        meta: { filteredText: '', cleanedText: 'Fallback text must not be selected.' },
        hints: {}
      };

      expect(strategy.canApply(item)).toBe(false);
    });

    it('retains CJK sentence punctuation and stable sentence order', async () => {
      const text = '第一句。第二句！第三句？';
      const item = createContentItem(text);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { chunks: Chunk[]; totalChunks: number };
      expect(output.chunks).toHaveLength(1);
      expect(output.chunks[0].text).toBe(text);
      expect(text.slice(output.chunks[0].startChar, output.chunks[0].endChar)).toBe(text);
    });

    it('returns at least one deterministic token for non-empty short text', async () => {
      const item = createContentItem('中 abcde');

      const first = await strategy.execute(item);
      const second = await strategy.execute(item);

      const firstChunk = (first.output as { chunks: Chunk[] }).chunks[0];
      const secondChunk = (second.output as { chunks: Chunk[] }).chunks[0];
      expect(firstChunk.tokenEstimate).toBe(3);
      expect(secondChunk.tokenEstimate).toBe(firstChunk.tokenEstimate);
      expect(firstChunk.tokenEstimate).toBeGreaterThanOrEqual(1);
    });

    it('keeps a meaningful token estimate for other non-Latin scripts', async () => {
      const item = createContentItem('مرحبا'.repeat(80));

      const result = await strategy.execute(item);

      const chunk = (result.output as { chunks: Chunk[] }).chunks[0];
      expect(chunk.tokenEstimate).toBeGreaterThan(1);
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

    it('returns true for non-empty short Chinese text', () => {
      const item = createContentItem('这是一个简短但有效的中文句子。它应该进入语义处理！');
      expect(strategy.canApply(item)).toBe(true);
    });

    it('returns true when textContent is non-empty and shorter than 100 characters', () => {
      const item = createContentItem('short');
      expect(strategy.canApply(item)).toBe(true);
    });

    it('returns false for whitespace-only canonical text', () => {
      const item = createContentItem('  \n\t');
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

    it('preserves a valid document when every paragraph is short', async () => {
      const text = '这是一个简短但有效的中文句子。\n\n它应该完整进入语义处理！';
      const item = createContentItem(text);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ filteredText: text, removedRatio: 0 });
    });

    it('uses filteredText before cleanedText and textContent', async () => {
      const item: ContentItem = {
        id: 'test-id',
        source: 'test-source',
        raw: new Uint8Array(),
        meta: {
          filteredText: '这是应当保留的短文本。',
          cleanedText: 'This cleaned fallback is deliberately long enough to be selected by mistake.',
          textContent: 'This raw fallback is also deliberately long enough to be selected by mistake.',
        },
        hints: {}
      };

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ filteredText: '这是应当保留的短文本。', removedRatio: 0 });
    });

    it('treats an empty filteredText as the canonical value', () => {
      const item: ContentItem = {
        id: 'test-id',
        source: 'test-source',
        raw: new Uint8Array(),
        meta: { filteredText: '', cleanedText: 'Fallback text must not be selected.' },
        hints: {}
      };

      expect(strategy.canApply(item)).toBe(false);
    });
  });
});
