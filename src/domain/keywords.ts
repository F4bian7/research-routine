// Topic keywords: comma-separated. Words inside one keyword must all match,
// quoted text is an exact phrase. "EEG seizure, accelerated MRI" becomes
// (EEG AND seizure) OR (accelerated AND MRI).
export function parseKeywords(text: string): string[] {
  return text
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export function keywordQuery(keywords: string[]): string {
  const groups = keywords.map((k) => {
    const parts = k.match(/"[^"]+"|\S+/g) ?? [];
    return parts.length > 1 ? `(${parts.join(' AND ')})` : (parts[0] ?? '');
  });
  return groups.filter(Boolean).join(' OR ');
}
