import { JSDOM } from 'jsdom';
import { v4 as uuidv4 } from 'uuid';
import { InputSource } from './InputSource';
import { ContentItem, ContentHint } from '../types';

export class HTMLInputSource implements InputSource {
  public name = 'HTMLInputSource';
  public version = '1.0.0';
  public supportedTypes = ['text/html', 'application/html'];

  parse(raw: Uint8Array): ContentItem {
    const decoder = new TextDecoder('utf-8');
    const htmlString = decoder.decode(raw);

    const dom = new JSDOM(htmlString);
    const document = dom.window.document;

    const title = document.title || '';
    const body = document.body;
    const textContent = body ? body.textContent?.trim() || '' : '';

    const hints: ContentHint = {
      mimeType: 'text/html',
      encoding: 'utf-8',
      estimatedSize: raw.byteLength,
      possibleTypes: this.supportedTypes,
      confidence: this.detect(raw).confidence,
    };

    return {
      id: uuidv4(),
      source: this.name,
      raw,
      meta: {
        title,
        textContent,
        document: htmlString,
      },
      hints,
    };
  }

  detect(partial: Uint8Array): ContentHint {
    const decoder = new TextDecoder('utf-8');
    const sample = decoder.decode(partial.slice(0, 1024));
    const lowerSample = sample.toLowerCase();

    let confidence = 0.3;

    if (lowerSample.includes('<!doctype html') || lowerSample.includes('<!DOCTYPE html')) {
      confidence = 0.95;
    } else if (lowerSample.includes('<html') || lowerSample.includes('<head') || lowerSample.includes('<body')) {
      confidence = 0.8;
    } else if (lowerSample.includes('<!doctype') || lowerSample.includes('<!DOCTYPE')) {
      confidence = 0.7;
    }

    return {
      mimeType: 'text/html',
      encoding: 'utf-8',
      possibleTypes: this.supportedTypes,
      confidence,
    };
  }

  validate(item: ContentItem): boolean {
    if (!item.meta || typeof item.meta !== 'object') {
      return false;
    }

    const meta = item.meta as Record<string, unknown>;
    const hasTitle = typeof meta.title === 'string';
    const hasTextContent = typeof meta.textContent === 'string';

    return hasTitle || hasTextContent;
  }
}