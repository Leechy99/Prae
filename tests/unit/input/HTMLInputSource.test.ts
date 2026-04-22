import { HTMLInputSource } from '../../../src/input/HTMLInputSource';
import { ContentItem } from '../../../src/types';

describe('HTMLInputSource', () => {
  let htmlSource: HTMLInputSource;

  beforeEach(() => {
    htmlSource = new HTMLInputSource();
  });

  describe('detect', () => {
    it('returns 0.95 confidence for HTML DOCTYPE', () => {
      const raw = new TextEncoder().encode('<!DOCTYPE html><html><head></head><body></body></html>');
      const hint = htmlSource.detect(raw);
      expect(hint.confidence).toBe(0.95);
      expect(hint.mimeType).toBe('text/html');
    });

    it('returns 0.8 confidence for HTML tags without DOCTYPE', () => {
      const raw = new TextEncoder().encode('<html><head><title>Test</title></head><body></body></html>');
      const hint = htmlSource.detect(raw);
      expect(hint.confidence).toBe(0.8);
    });

    it('returns 0.3 confidence for non-HTML content', () => {
      const raw = new TextEncoder().encode('This is just plain text content.');
      const hint = htmlSource.detect(raw);
      expect(hint.confidence).toBe(0.3);
    });

    it('returns 0.95 confidence for DOCTYPE with html tag', () => {
      const raw = new TextEncoder().encode('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0//EN">');
      const hint = htmlSource.detect(raw);
      expect(hint.confidence).toBe(0.95);
    });
  });

  describe('parse', () => {
    it('extracts title and textContent from HTML', () => {
      const html = '<!DOCTYPE html><html><head><title>Test Page</title></head><body><p>Hello World</p></body></html>';
      const raw = new TextEncoder().encode(html);
      const item = htmlSource.parse(raw);

      expect(item.id).toBeDefined();
      expect(item.source).toBe('HTMLInputSource');
      expect(item.meta.title).toBe('Test Page');
      expect(item.meta.textContent).toBe('Hello World');
    });

    it('handles HTML without title', () => {
      const html = '<html><body><p>Just content</p></body></html>';
      const raw = new TextEncoder().encode(html);
      const item = htmlSource.parse(raw);

      expect(item.meta.title).toBe('');
      expect(item.meta.textContent).toBe('Just content');
    });

    it('handles empty body', () => {
      const html = '<!DOCTYPE html><html><head><title>Empty</title></head><body></body></html>';
      const raw = new TextEncoder().encode(html);
      const item = htmlSource.parse(raw);

      expect(item.meta.title).toBe('Empty');
      expect(item.meta.textContent).toBe('');
    });

    it('sets correct hints on parsed content', () => {
      const html = '<!DOCTYPE html><html><head><title>Test</title></head><body>Content</body></html>';
      const raw = new TextEncoder().encode(html);
      const item = htmlSource.parse(raw);

      expect(item.hints.mimeType).toBe('text/html');
      expect(item.hints.encoding).toBe('utf-8');
      expect(item.hints.possibleTypes).toContain('text/html');
    });
  });

  describe('validate', () => {
    it('returns true for valid ContentItem with title', () => {
      const raw = new TextEncoder().encode('<html><body>Test</body></html>');
      const item = htmlSource.parse(raw);
      expect(htmlSource.validate(item)).toBe(true);
    });

    it('returns true for ContentItem with textContent', () => {
      const item: ContentItem = {
        id: '123',
        source: 'test',
        raw: new Uint8Array(),
        meta: { textContent: 'some text' },
        hints: { confidence: 0.5 },
      };
      expect(htmlSource.validate(item)).toBe(true);
    });

    it('returns false when meta is missing', () => {
      const item: ContentItem = {
        id: '123',
        source: 'test',
        raw: new Uint8Array(),
        meta: {},
        hints: { confidence: 0.5 },
      };
      expect(htmlSource.validate(item)).toBe(false);
    });

    it('returns false when neither title nor textContent exists', () => {
      const item: ContentItem = {
        id: '123',
        source: 'test',
        raw: new Uint8Array(),
        meta: { someOtherField: 'value' },
        hints: { confidence: 0.5 },
      };
      expect(htmlSource.validate(item)).toBe(false);
    });
  });
});