import type { ContentItem, ProcessingResult } from '../types';

export interface RetryPolicy {
  canRetry(result: ProcessingResult, nextAttempt: number): boolean;
  prepareAttempt(original: ContentItem, nextAttempt: number): ContentItem;
}
