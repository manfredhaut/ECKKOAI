/**
 * P2-3, 22/09/2026 — CANCELAR uma aprovação pendente.
 *
 * Extraído de `routes/videos.ts` para `services/` de propósito: uma
 * decisão dentro do corpo de uma rota Fastify não é exercitável sem subir
 * a aplicação inteira — mesma lição já registrada em `withDeliveredSeconds`
 * (routes/videos.ts) e em `lookSelection.ts`/`captionSelection.ts`. Aqui a
 * função é testada por EXECUÇÃO real, contra o Postgres real, sem precisar
 * simular a camada HTTP.
 *
 * Só existe para os dois estados que esperam um clique humano
 * (`awaiting_approval`/`awaiting_approval_video`) — exclusivos do caminho
 * da fal. NENHUMA chamada ao fornecedor: cancelar é decisão nossa sobre um
 * trabalho que já foi entregue e pago (a imagem ou o vídeo mudo) — não há
 * nada a pedir nem a abortar do lado de fora.
 *
 * P5 — A PLATAFORMA NÃO PAGA PELO APRENDIZADO DO CLIENTE: esta função
 * NUNCA estorna crédito. Ao chegar aqui, pelo menos uma etapa paga já
 * rodou (a imagem, na 1ª aprovação; a imagem + a animação, na 2ª) — não
 * existe um "cancelar antes de qualquer gasto" nestes dois status, porque
 * os dois só são alcançados DEPOIS de `compor`/`animar` já terem sido
 * cobrados. Quem precisar de ajuda para acertar o vídeo antes de gerar é
 * direcionado ao suporte (texto na tela), não reembolsado.
 *
 * O UPDATE condicional é a ÚNICA fonte de verdade sobre "isto mudou agora":
 * tenant, id e status entram todos na MESMA cláusula WHERE, e um segundo
 * clique (ou dois cliques simultâneos) encontra `rowCount = 0` — a linha já
 * não está mais em nenhum dos dois status.
 */
import { pool } from "../../db/pool.js";
import type { Video } from "../../types.js";

export const STATUS_CANCELAVEIS = ["awaiting_approval", "awaiting_approval_video"] as const;

export type CancelamentoResultado =
  | { ok: true; video: Video }
  | { ok: false; motivo: "not_found" }
  | { ok: false; motivo: "not_pending"; statusAtual: string };

export async function tentarCancelarVideo(tenantId: string, videoId: string): Promise<CancelamentoResultado> {
  const { rows, rowCount } = await pool.query<Video>(
    `UPDATE videos SET status = 'cancelled'
       WHERE id = $1 AND tenant_id = $2 AND status = ANY($3)
       RETURNING *`,
    [videoId, tenantId, STATUS_CANCELAVEIS],
  );
  if (rowCount) return { ok: true, video: rows[0] };

  // Não dá para saber SE o UPDATE mudou algo sem uma segunda consulta —
  // mas ela só serve para escolher o MOTIVO certo (not_found vs
  // not_pending); não há dinheiro em jogo nesta decisão (P5: esta função
  // nunca estorna), então não há ambiguidade financeira a resolver aqui.
  // Filtrada por `tenant_id`, igual ao UPDATE: um id de OUTRO tenant não
  // pode ser distinguido de um id inexistente, de propósito.
  const { rows: existente } = await pool.query<{ status: string }>(
    "SELECT status FROM videos WHERE id = $1 AND tenant_id = $2",
    [videoId, tenantId],
  );
  if (!existente[0]) return { ok: false, motivo: "not_found" };
  return { ok: false, motivo: "not_pending", statusAtual: existente[0].status };
}
