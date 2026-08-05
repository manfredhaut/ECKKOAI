/**
 * Espelho do catálogo de plataformas do backend
 * (`backend/src/services/providers/videoFormat.ts`).
 *
 * Mesmo padrão de `providerVendors.ts`/`vendorCatalog.ts`: a fonte única é o
 * backend, e `npm run check` reprova o build se os dois divergirem. Duas listas
 * que discordam produziriam uma tela oferecendo um destino que o servidor
 * recusa — ou pior, aceitando e gerando noutra proporção.
 */

export interface PublishPlatformOption {
  id: string;
  aspectRatio: string;
  /** Como a proporção se parece na tela: proporções do próprio quadrinho. */
  preview: { width: number; height: number };
}

export const PUBLISH_PLATFORMS: PublishPlatformOption[] = [
  { id: "youtube", aspectRatio: "16:9", preview: { width: 64, height: 36 } },
  { id: "reels_tiktok", aspectRatio: "9:16", preview: { width: 27, height: 48 } },
  { id: "linkedin", aspectRatio: "1:1", preview: { width: 44, height: 44 } },
];

export const DEFAULT_PUBLISH_PLATFORM = "youtube";
