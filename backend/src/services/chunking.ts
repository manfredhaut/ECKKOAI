export function chunkText(text: string, size = 1000): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += size) {
    chunks.push(normalized.slice(start, start + size));
  }
  return chunks;
}
