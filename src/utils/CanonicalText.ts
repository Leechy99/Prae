export function normalizeCanonicalTextValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return typeof value === 'string' ? value : String(value);
}

export function getCanonicalText(metadata: Record<string, unknown>): string {
  return normalizeCanonicalTextValue(metadata.filteredText)
    ?? normalizeCanonicalTextValue(metadata.cleanedText)
    ?? normalizeCanonicalTextValue(metadata.textContent)
    ?? '';
}
