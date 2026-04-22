import { InputSource } from './InputSource';
import { ContentHint } from '../types';

export class InputRegistry {
  private sources: Map<string, InputSource> = new Map();

  register(source: InputSource): void {
    this.sources.set(source.name, source);
  }

  unregister(name: string): void {
    this.sources.delete(name);
  }

  get(name: string): InputSource | undefined {
    return this.sources.get(name);
  }

  list(): InputSource[] {
    return Array.from(this.sources.values());
  }

  detectMimeType(partial: Uint8Array): ContentHint {
    let bestHint: ContentHint = {
      possibleTypes: [],
      confidence: 0,
    };

    for (const source of this.sources.values()) {
      const hint = source.detect(partial);
      if (hint.confidence && hint.confidence > (bestHint.confidence || 0)) {
        bestHint = hint;
      }
    }

    return bestHint;
  }
}