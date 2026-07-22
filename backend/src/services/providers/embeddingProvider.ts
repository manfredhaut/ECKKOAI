// Stub for a text-embedding provider.
// TODO: wire up a real embedding provider (e.g. OpenAI, Voyage AI) once
// credentials are connected in Settings. The 1536 dimension matches the
// document_chunks.embedding column and would need a migration to change if a
// real provider uses a different size.

const EMBEDDING_DIMENSION = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  return Array.from({ length: EMBEDDING_DIMENSION }, () => Math.random() * 2 - 1);
}
