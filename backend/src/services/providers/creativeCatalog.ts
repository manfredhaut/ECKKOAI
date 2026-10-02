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
 * Escopo original: só o modo "imagem" (etapa 3 do plano, "motor de
 * jobs, só imagem"). ABAS-22 (30/09/2026) ampliou para broll/propaganda
 * (vídeo, Seedance 2.5 image-to-video) — sobreposição ainda não tem
 * modelo próprio (hoje só upload manual).
 */

export type CreativeModo = "imagem" | "propaganda" | "broll" | "sobreposicao" | "narracao" | "musica";

export interface CreativeModelDef {
  id: string;
  /** Nome do modelo, mostrado na tela — nunca cita o agregador. */
  label: string;
  modos: readonly CreativeModo[];
  /**
   * PAINEL-MODELO-1, 01/10/2026 — escolha CURADA, não calculada: sem
   * /estimate real (ver nota no topo do arquivo), "melhor custo-benefício"
   * não pode ser medido ainda. Até lá, default é uma decisão explícita e
   * auditável aqui, nunca implícita pela ordem do array. Exatamente um
   * modelo por modo deve ter default=true — ausência de marca não conta
   * como default por omissão.
   */
  default?: boolean;
}

export const CREATIVE_MODELS: readonly CreativeModelDef[] = [
  // ABAS-29, 30/09/2026 -- ids CORRIGIDOS contra a documentação oficial
  // (docs.higgsfield.ai/docs/models/soul-2 e .../marketing-studio-image):
  // os antigos ("soul-2", "marketing-studio-image") nunca bateram com o
  // endpoint_id real do fornecedor -- eram só o nome do levantamento
  // inicial, nunca confirmados (ver nota no topo deste arquivo).
  { id: "higgsfield-ai/soul/v2/standard", label: "Soul 2", modos: ["imagem"], default: true },
  { id: "marketing-studio/image", label: "Marketing Studio Image", modos: ["imagem"] },
  // ABAS-22, 30/09/2026 — broll e propaganda (vídeo). `id` confirmado
  // contra a documentação oficial da Higgsfield em 30/09/2026
  // (docs.higgsfield.ai/docs/models/seedance-2-5): o endpoint é POR
  // FLUXO, não um slug único — este id é o de image-to-video, o fluxo
  // que serve os dois modos aqui (a partir de imagem de referência/
  // quadro-mestre). Confirmado só contra a doc PÚBLICA — conferir de
  // novo contra a API autenticada (/estimate) antes do primeiro envio real.
  {
    id: "bytedance/seedance-2.5/image-to-video",
    label: "Seedance 2.5",
    modos: ["broll", "propaganda"],
    default: true,
  },
  // ABAS-10, 30/09/2026 — narração e música, ambas pelo fornecedor já
  // integrado ao projeto (voiceProvider.ts). O rótulo NUNCA cita o
  // fornecedor — mesma regra da Higgsfield: nome do agregador só na tela de
  // credencial do admin, nunca em texto de tenant.
  { id: "voz-narracao", label: "Narração", modos: ["narracao"], default: true },
  { id: "musica-jingle", label: "Música / jingle", modos: ["musica"], default: true },
];

export function creativeModelById(id: string): CreativeModelDef | null {
  return CREATIVE_MODELS.find((m) => m.id === id) ?? null;
}
