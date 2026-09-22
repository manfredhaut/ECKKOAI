/**
 * P2-8, "Ajustar este vídeo" — a família de versões.
 *
 * `root_video_id` é denormalizado (aponta sempre para a PRIMEIRA versão da
 * família, nunca recalculado depois de gravado) para que listar "todas as
 * versões" seja um `WHERE id = raiz OR root_video_id = raiz` simples, sem
 * CTE recursiva em toda consulta.
 */
import type { PoolClient } from "pg";

export interface VersaoDeAjuste {
  parentId: string;
  rootId: string;
  versionNumber: number;
}

/**
 * Resolve a próxima versão de uma família, sob LOCK.
 *
 * NUMERAÇÃO SEGURA — precisa rodar dentro da MESMA transação do INSERT que
 * vai usar o resultado: o `SELECT ... FOR UPDATE` na RAIZ só protege
 * enquanto a transação que o adquiriu segue aberta. Chamar isto fora de uma
 * transação, ou commitar antes do INSERT, reabre a janela de corrida que
 * ele existe para fechar — duas gerações concorrentes na mesma família
 * calculariam o MESMO `MAX(version_number) + 1`. O índice único
 * `videos_family_version_unique_idx` (migration 085) é a segunda trava,
 * independente do lock, do mesmo jeito que `credit_ledger_one_refund_per_video`
 * (migration 035) é a segunda trava do estorno.
 *
 * `null` quando o vídeo original não existe OU pertence a OUTRO tenant — as
 * duas situações são indistinguíveis de propósito (não revelar a um tenant
 * que um id de outro existe). Quem chama devolve 404 nos dois casos, sem
 * cobrar nada.
 */
export async function resolverVersaoDeAjuste(
  client: Pick<PoolClient, "query">,
  tenantId: string,
  adjustFromVideoId: string,
): Promise<VersaoDeAjuste | null> {
  const { rows } = await client.query<{ id: string; root_video_id: string | null }>(
    "SELECT id, root_video_id FROM videos WHERE id = $1 AND tenant_id = $2",
    [adjustFromVideoId, tenantId],
  );
  const pai = rows[0];
  if (!pai) return null;
  const rootId = pai.root_video_id ?? pai.id;
  // Lock na RAIZ da família inteira — serializa o cálculo do próximo
  // version_number entre quaisquer duas gerações concorrentes desta MESMA
  // família, independente de qual versão cada uma ajusta (a raiz, ou uma
  // versão intermediária).
  await client.query("SELECT id FROM videos WHERE id = $1 FOR UPDATE", [rootId]);
  const { rows: maxRows } = await client.query<{ max: string }>(
    "SELECT COALESCE(MAX(version_number), 1) AS max FROM videos WHERE id = $1 OR root_video_id = $1",
    [rootId],
  );
  return { parentId: pai.id, rootId, versionNumber: Number(maxRows[0].max) + 1 };
}
