import { HTMLCleanStrategy } from '../../../src/strategies/denoise/HTMLCleanStrategy';
import { NavigationFilterStrategy } from '../../../src/strategies/denoise/NavigationFilterStrategy';
import { ContentItem } from '../../../src/types';
import { TextEncoder } from 'util';

describe('Denoise Strategies', () => {
  const createContentItem = (html: string): ContentItem => ({
    id: 'test-item',
    source: 'test-source',
    raw: new TextEncoder().encode(html),
    meta: { textContent: html },
    hints: {},
  });

  describe('HTMLCleanStrategy', () => {
    let strategy: HTMLCleanStrategy;

    beforeEach(() => {
      strategy = new HTMLCleanStrategy();
    });

    it('should remove script tags', async () => {
      const html = '<html><body><script>console.log("test")</script><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('cleanedText');
      expect(result.output).toHaveProperty('removedTags');
      const { cleanedText, removedTags } = result.output as { cleanedText: string; removedTags: number };
      expect(cleanedText).not.toContain('console.log');
      expect(cleanedText).toContain('Content');
      expect(removedTags).toBeGreaterThan(0);
    });

    it('should remove style tags', async () => {
      const html = '<html><head><style>.test { color: red; }</style></head><body><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { cleanedText } = result.output as { cleanedText: string };
      expect(cleanedText).not.toContain('.test');
      expect(cleanedText).toContain('Content');
    });

    it('should remove noscript tags', async () => {
      const html = '<html><body><noscript>Please enable JS</noscript><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { cleanedText } = result.output as { cleanedText: string };
      expect(cleanedText).not.toContain('Please enable JS');
      expect(cleanedText).toContain('Content');
    });

    it('should remove iframe tags', async () => {
      const html = '<html><body><iframe src="https://example.com"></iframe><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { cleanedText, removedTags } = result.output as { cleanedText: string; removedTags: number };
      expect(cleanedText).not.toContain('example.com');
      expect(cleanedText).toContain('Content');
      expect(removedTags).toBeGreaterThan(0);
    });

    it('should remove nav elements', async () => {
      const html = '<html><body><nav><a href="/">Home</a></nav><p>Main content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { cleanedText } = result.output as { cleanedText: string };
      expect(cleanedText).not.toContain('Home');
      expect(cleanedText).toContain('Main content');
    });

    it('should remove ad-related classes', async () => {
      const html = '<html><body><div class="ad-container">Ad content</div><p>Real content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { cleanedText } = result.output as { cleanedText: string };
      expect(cleanedText).not.toContain('Ad content');
      expect(cleanedText).toContain('Real content');
    });

    it('should return canApply false when no textContent in meta', () => {
      const item: ContentItem = {
        id: 'test',
        source: 'test',
        raw: new Uint8Array(),
        meta: {},
        hints: {},
      };

      expect(strategy.canApply(item)).toBe(false);
    });

    it('should return canApply true when textContent exists', () => {
      const item = createContentItem('<p>Content</p>');

      expect(strategy.canApply(item)).toBe(true);
    });
  });

  describe('NavigationFilterStrategy', () => {
    let strategy: NavigationFilterStrategy;

    beforeEach(() => {
      strategy = new NavigationFilterStrategy();
    });

    it('should remove nav elements', async () => {
      const html = '<html><body><nav><a href="/">Home</a></nav><p>Main content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('navRemoved');
      expect(result.output).toHaveProperty('textLength');
      const { navRemoved, textLength } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
      expect(textLength).toBeGreaterThan(0);
    });

    it('should remove header elements', async () => {
      const html = '<html><body><header><h1>Site Title</h1></header><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { navRemoved } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
    });

    it('should remove footer elements', async () => {
      const html = '<html><body><p>Content</p><footer>Footer text</footer></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { navRemoved } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
    });

    it('should remove aside elements', async () => {
      const html = '<html><body><aside>Sidebar</aside><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { navRemoved } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
    });

    it('should remove elements with role="navigation"', async () => {
      const html = '<html><body><div role="navigation"><a href="/">Home</a></div><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { navRemoved } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
    });

    it('should remove .nav class elements', async () => {
      const html = '<html><body><div class="nav"><a href="/">Home</a></div><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { navRemoved } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
    });

    it('should remove .sidebar class elements', async () => {
      const html = '<html><body><div class="sidebar">Sidebar content</div><p>Content</p></body></html>';
      const item = createContentItem(html);

      const result = await strategy.execute(item);

      expect(result.success).toBe(true);
      const { navRemoved } = result.output as { navRemoved: number; textLength: number };
      expect(navRemoved).toBeGreaterThan(0);
    });

    it('should return canApply false when no textContent in meta', () => {
      const item: ContentItem = {
        id: 'test',
        source: 'test',
        raw: new Uint8Array(),
        meta: {},
        hints: {},
      };

      expect(strategy.canApply(item)).toBe(false);
    });

    it('should return canApply true when textContent exists', () => {
      const item = createContentItem('<p>Content</p>');

      expect(strategy.canApply(item)).toBe(true);
    });
  });
});