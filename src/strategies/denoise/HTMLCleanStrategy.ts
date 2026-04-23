import { JSDOM } from 'jsdom';
import { ContentItem, StrategyExecution } from '../../types';
import { Strategy, StrategyConfig, StrategyType } from '../base/Strategy';

const AD_CLASS_PATTERNS = [
  'ad-', 'ads-', 'advert', 'sponsor', 'promo', 'banner',
  'popup', 'modal-overlay', 'cookie', 'newsletter', 'subscribe'
];

const AD_ID_PATTERNS = [
  'ad-', 'ads-', 'advert', 'sponsor', 'promo', 'banner',
  'popup', 'modal-overlay', 'cookie', 'newsletter', 'subscribe'
];

function matchesAdPattern(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some(pattern => lower.includes(pattern));
}

export class HTMLCleanStrategy implements Strategy {
  readonly id = 'html-clean';
  readonly name = 'HTML Clean Strategy';
  readonly type = StrategyType.DENOISE;
  readonly version = '1.0.0';
  readonly config: StrategyConfig;

  constructor(config: StrategyConfig = { enabled: true, priority: 100, params: {} }) {
    this.config = config;
  }

  canApply(item: ContentItem): boolean {
    return !!(item.meta?.textContent);
  }

  async execute(item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();
    let removedTags = 0;
    let cleanedText = '';

    try {
      const decoder = new TextDecoder();
      const html = decoder.decode(item.raw);
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const tagsToRemove = ['script', 'style', 'noscript', 'iframe', 'object', 'embed'];
      tagsToRemove.forEach(tag => {
        const elements = document.querySelectorAll(tag);
        removedTags += elements.length;
        elements.forEach(el => el.remove());
      });

      const structuralTags = ['nav', 'header', 'footer', 'aside'];
      structuralTags.forEach(tag => {
        const elements = document.querySelectorAll(tag);
        removedTags += elements.length;
        elements.forEach(el => el.remove());
      });

      document.querySelectorAll('*').forEach(el => {
        const className = el.className || '';
        const id = el.id || '';

        if (matchesAdPattern(className, AD_CLASS_PATTERNS) ||
            matchesAdPattern(id, AD_ID_PATTERNS)) {
          removedTags++;
          el.remove();
        }
      });

      const roleAttrs = ['navigation', 'banner', 'contentinfo', 'complementary'];
      document.querySelectorAll('[role]').forEach(el => {
        const role = el.getAttribute('role') || '';
        if (roleAttrs.includes(role)) {
          removedTags++;
          el.remove();
        }
      });

      // Serialize cleaned HTML back to item.raw for chaining with next denoise strategy
      const serializedHtml = dom.serialize();
      item.raw = new TextEncoder().encode(serializedHtml);

      const bodyText = document.body?.textContent;
      const docText = document.textContent;
      cleanedText = (bodyText ?? docText ?? '').trim();

      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: true,
        output: { cleanedText, removedTags }
      };
    } catch (error) {
      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}