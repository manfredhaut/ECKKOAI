/**
 * Rótulos amigáveis de proporção de vídeo — compartilhado entre a janela de
 * Detalhes da Biblioteca (P2-7) e o resumo "Confira antes de gerar" (F16),
 * para as duas nunca divergirem sobre o que "9:16" significa em português.
 */
export const ASPECT_RATIO_LABELS: Record<string, string> = {
  "16:9": "Horizontal (16:9)",
  "9:16": "Vertical (9:16)",
  "1:1": "Quadrado (1:1)",
  "4:5": "Retrato (4:5)",
};

export function aspectRatioLabel(aspectRatio: string | null | undefined): string | null {
  if (!aspectRatio) return null;
  return ASPECT_RATIO_LABELS[aspectRatio] ?? aspectRatio;
}
