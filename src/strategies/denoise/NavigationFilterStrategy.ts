import { JSDOM } from 'jsdom';
import { ContentItem, StrategyExecution } from '../../types';
import { Strategy, StrategyConfig, StrategyType } from '../base/Strategy';

const NAV_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '.nav',
  '.navigation',
  '.menu',
  '.sidebar',
  '.sidebar-nav'
];

export class NavigationFilterStrategy implements Strategy {
  readonly id = 'navigation-filter';
  readonly name = 'Navigation Filter Strategy';
  readonly type = StrategyType.DENOISE;
  readonly version = '1.0.0';
  readonly config: StrategyConfig;

  constructor(config: StrategyConfig = { enabled: true, priority: 90, params: {} }) {
    this.config = config;
  }

  canApply(item: ContentItem): boolean {
    return !!(item.meta?.textContent);
  }

  async execute(item: ContentItem): Promise<StrategyExecution> {
    const startedAt = Date.now();
    let navRemoved = 0;
    let textLength = 0;

    try {
      const decoder = new TextDecoder();
      const html = decoder.decode(item.raw);
      const dom = new JSDOM(html);
      const document = dom.window.document;

      NAV_SELECTORS.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        navRemoved += elements.length;
        elements.forEach(el => el.remove());
      });

      // Serialize cleaned HTML back to item.raw for chaining with next denoise strategy
      const serializedHtml = dom.serialize();
      item.raw = new TextEncoder().encode(serializedHtml);

      const bodyText = document.body?.textContent;
      const docText = document.textContent;
      const cleanedText = (bodyText ?? docText ?? '').trim();
      textLength = cleanedText.length;

      return {
        id: crypto.randomUUID(),
        strategyId: this.id,
        startedAt,
        completedAt: Date.now(),
        success: true,
        output: { navRemoved, textLength }
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