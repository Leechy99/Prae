import type { ContentItem } from '../../types';
import { getCanonicalText as getCanonicalTextFromMetadata } from '../../utils/CanonicalText';

export function getCanonicalText(item: ContentItem): string {
  return getCanonicalTextFromMetadata(item.meta);
}
