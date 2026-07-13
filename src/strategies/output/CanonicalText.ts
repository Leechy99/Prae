import type { ContentItem } from '../../types';

export function getCanonicalText(item: ContentItem): string {
  const value = item.meta?.filteredText
    ?? item.meta?.cleanedText
    ?? item.meta?.textContent
    ?? '';

  return typeof value === 'string' ? value : String(value);
}
