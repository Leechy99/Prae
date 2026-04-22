import { JSONSchemaStrategy } from '../../../src/strategies/output/JSONSchemaStrategy';
import { MarkdownStrategy } from '../../../src/strategies/output/MarkdownStrategy';
import { ContentItem } from '../../../src/types';
import { TextEncoder } from 'util';

describe('Output Strategies', () => {
  const createContentItem = (meta: Record<string, unknown>): ContentItem => ({
    id: 'test-item',
    source: 'test-source',
    raw: new TextEncoder().encode('test content'),
    meta,
    hints: {},
  });

  describe('JSONSchemaStrategy', () => {
    let strategy: JSONSchemaStrategy;

    beforeEach(() => {
      strategy = new JSONSchemaStrategy();
    });

    it('should return canApply false when no text content', () => {
      const item: ContentItem = {
        id: 'test',
        source: 'test',
        raw: new Uint8Array(),
        meta: {},
        hints: {},
      };

      expect(strategy.canApply(item)).toBe(false);
    });

    it('should return canApply true when cleanedText exists', () => {
      const item = createContentItem({ cleanedText: 'Some text content' });

      expect(strategy.canApply(item)).toBe(true);
    });

    it('should return canApply true when textContent exists', () => {
      const item = createContentItem({ textContent: 'Some text content' });

      expect(strategy.canApply(item)).toBe(true);
    });

    it('should output JSON schema with required fields', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
        title: 'Test Title',
        url: 'https://example.com',
        confidence: 0.9,
        strategiesApplied: ['html-clean', 'nav-filter'],
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('version');
      expect(result.output).toHaveProperty('content');
      expect(result.output).toHaveProperty('metadata');
      const output = result.output as {
        version: string;
        content: { text: string; title?: string; url?: string };
        metadata: { source: string; processedAt: string; confidence: number; strategiesApplied: string[] };
      };
      expect(output.version).toBe('1.0.0');
      expect(output.content.text).toBe('Test content');
      expect(output.content.title).toBe('Test Title');
      expect(output.content.url).toBe('https://example.com');
      expect(output.metadata.source).toBe('test-source');
      expect(output.metadata.confidence).toBe(0.9);
      expect(output.metadata.strategiesApplied).toEqual(['html-clean', 'nav-filter']);
    });

    it('should output JSON schema without optional fields when not provided', async () => {
      const item = createContentItem({
        textContent: 'Simple content',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as {
        content: { text: string; title?: string; url?: string };
      };
      expect(output.content.text).toBe('Simple content');
      expect(output.content.title).toBeUndefined();
      expect(output.content.url).toBeUndefined();
    });

    it('should use default confidence when not provided', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { metadata: { confidence: number } };
      expect(output.metadata.confidence).toBe(0.8);
    });

    it('should use default strategiesApplied when not provided', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { metadata: { strategiesApplied: string[] } };
      expect(output.metadata.strategiesApplied).toEqual([]);
    });

    it('should include processedAt timestamp in ISO format', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
      });

      const before = new Date().toISOString();
      const result = await strategy.execute(item);
      const after = new Date().toISOString();

      expect(result.success).toBe(true);
      const output = result.output as { metadata: { processedAt: string } };
      expect(output.metadata.processedAt).toBeDefined();
      expect(output.metadata.processedAt >= before).toBe(true);
      expect(output.metadata.processedAt <= after).toBe(true);
    });

    it('should handle error gracefully', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
      });

      const result = await strategy.execute(item);

      // JSONSchemaStrategy should not throw for valid input
      expect(result.success).toBe(true);
    });
  });

  describe('MarkdownStrategy', () => {
    let strategy: MarkdownStrategy;

    beforeEach(() => {
      strategy = new MarkdownStrategy();
    });

    it('should return canApply false when no text content', () => {
      const item: ContentItem = {
        id: 'test',
        source: 'test',
        raw: new Uint8Array(),
        meta: {},
        hints: {},
      };

      expect(strategy.canApply(item)).toBe(false);
    });

    it('should return canApply true when cleanedText exists', () => {
      const item = createContentItem({ cleanedText: 'Some text content' });

      expect(strategy.canApply(item)).toBe(true);
    });

    it('should return canApply true when textContent exists', () => {
      const item = createContentItem({ textContent: 'Some text content' });

      expect(strategy.canApply(item)).toBe(true);
    });

    it('should format markdown with title as heading', async () => {
      const item = createContentItem({
        cleanedText: 'First paragraph.\n\nSecond paragraph.',
        title: 'Test Title',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('markdown');
      expect(result.output).toHaveProperty('metadata');
      const output = result.output as {
        markdown: string;
        metadata: { source: string; processedAt: string; confidence: number };
      };
      expect(output.markdown).toContain('# Test Title');
      expect(output.markdown).toContain('First paragraph.');
      expect(output.markdown).toContain('Second paragraph.');
    });

    it('should format markdown without title when not provided', async () => {
      const item = createContentItem({
        cleanedText: 'First paragraph.\n\nSecond paragraph.',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { markdown: string };
      expect(output.markdown).not.toContain('#');
      expect(output.markdown).toContain('First paragraph.');
      expect(output.markdown).toContain('Second paragraph.');
    });

    it('should join paragraphs with double newlines', async () => {
      const item = createContentItem({
        cleanedText: 'Para one\nPara two\n\n\n\nPara three',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { markdown: string };
      expect(output.markdown).toContain('\n\n');
    });

    it('should include metadata with source and confidence', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
        confidence: 0.85,
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as {
        metadata: { source: string; processedAt: string; confidence: number };
      };
      expect(output.metadata.source).toBe('test-source');
      expect(output.metadata.confidence).toBe(0.85);
    });

    it('should use default confidence when not provided', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { metadata: { confidence: number } };
      expect(output.metadata.confidence).toBe(0.8);
    });

    it('should filter out empty paragraphs', async () => {
      const item = createContentItem({
        cleanedText: 'Valid paragraph\n\n\n\n   \n\nAnother valid',
      });

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const output = result.output as { markdown: string };
      expect(output.markdown).not.toContain('\n\n\n');
    });

    it('should handle error gracefully', async () => {
      const item = createContentItem({
        cleanedText: 'Test content',
      });

      const result = await strategy.execute(item);

      // MarkdownStrategy should not throw for valid input
      expect(result.success).toBe(true);
    });
  });
});