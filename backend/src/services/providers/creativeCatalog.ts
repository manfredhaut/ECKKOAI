/**
 * ABAS-5, 29/09/2026 — catálogo de modelos da aba "5. Gerar Vídeos & Imagens".
 *
 * NÃO VERIFICADO CONTRA A API REAL. Os nomes de modelo abaixo vêm do
 * levantamento do documento e das telas do produto (ver o esqueleto da
 * aba 5), nunca de uma chamada real ao fornecedor — a conta foi aberta em
 * 29/09/2026 e ainda não foi lida nenhuma vez nesta base de código. Antes
 * de qualquer chamada real (bloco seguinte, orquestrador), confirmar cada
 * `id` contra o catálogo de modelos real do fornecedor e substituir este
 * arquivo. `id`/`label` são internos ao backend e ao painel admin — nunca
 * aparecem em texto de tela do tenant, que só mostra o nome do modelo.
 *
 * Escopo desta rodada: só o modo "imagem" (etapa 3 do plano, "motor de
 * jobs, só imagem"). B-roll, propaganda e sobreposição entram depois.
 */

export type CreativeModo = "imagem" | "propaganda" | "broll" | "sobreposicao";

export interface CreativeModelDef {
  id: string;
  /** Nome do modelo, mostrado na tela — nunca cita o agregador. */
  label: string;
  modos: readonly CreativeModo[];
}

export const CREATIVE_MODELS: readonly CreativeModelDef[] = [
  { id: "soul-2", label: "Soul 2", modos: ["imagem"] },
  { id: "marketing-studio-image", label: "Marketing Studio Image", modos: ["imagem"] },
];

export function creativeModelById(id: string): CreativeModelDef | null {
  return CREATIVE_MODELS.find((m) => m.id === id) ?? null;
}
