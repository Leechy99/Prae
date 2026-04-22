import { ContentHint, ContentItem } from '../types';

export interface InputSource {
  name: string;
  version: string;
  supportedTypes: string[];
  parse(raw: Uint8Array): ContentItem;
  detect(partial: Uint8Array): ContentHint;
  validate(item: ContentItem): boolean;
}