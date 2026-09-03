/**
 * A ROTA RECEPTORA de webhook da HeyGen — B7, BLOCO HEYGEN-SIMPLES-1
 * (02/09/2026). `callback_url`/`callback_id` passaram a ser ENVIADOS de
 * verdade em `POST /v3/videos` desde SIMPLES-3 (F1, 03/09/2026) — ver
 * `HeygenPayloadExtras`/`generateVideoHeygen` em avatarProvider.ts. A
 * HeyGen PODE chamar esta rota de verdade a partir de agora.
 *
 * ┌─ O que esta rota é, e o que ela NÃO é ────────────────────────────────────┐
 * │ NÃO substitui o polling. `pollJob` (routes/videos.ts) continua sendo o    │
 * │ único mecanismo que de fato FINALIZA um vídeo — ele já tem um teto de     │
 * │ parede explícito (`MAX_POLL_ATTEMPTS = 90` × `POLL_INTERVAL_MS = 5000` =  │
 * │ 450s ≈ 7,5 min), que já cumpre a parte "retaguarda com teto" pedida pelo  │
 * │ B7. Esta rota, por decisão explícita do operador (SIMPLES-1) mantida em   │
 * │ SIMPLES-3, só RECEBE, VALIDA e REGISTRA — nunca finaliza um vídeo.        │
 * │                                                                            │
 * │ H3 (SIMPLES-3, 03/09/2026) — CONCLUSÃO REGISTRADA: como esta rota não     │
 * │ finaliza nada (não chama `pollJob`, não escreve `status`), reconfirmar o  │
 * │ evento via `GET /v3/videos/{id}` autenticado ANTES de persistir DEIXOU DE │
 * │ SER NECESSÁRIO. A reconfirmação existe para proteger uma decisão de       │
 * │ negócio contra um evento forjado/malformado — aqui a única "decisão" é    │
 * │ um INSERT de auditoria (`heygen_webhook_events`), já protegido pela       │
 * │ validação HMAC do corpo inteiro (linha por linha, não campo a campo:      │
 * │ forjar `callback_id` sem o secret do tenant já falha na assinatura antes  │
 * │ de qualquer leitura de campo). Se um dia esta rota passar a FINALIZAR     │
 * │ (chamar `pollJob` ou escrever `status`), a pergunta reabre — decidir      │
 * │ nesse momento, contra o que a finalização de fato precisa confirmar.      │
 * │ Integração que faria o webhook acelerar a finalização (sem duplicar a     │
 * │ lógica de validação de artefato/persistência/estorno que `pollJob` já     │
 * │ tem) segue trabalho futuro, fora do escopo desta rodada.                  │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * VALIDAÇÃO DA ASSINATURA — schema lido por doc pública
 * (developers.heygen.com/docs/webhooks, WebFetch 02/09/2026; NÃO
 * reconfirmado por entrega real — nenhum webhook endpoint foi registrado na
 * conta HeyGen ainda, decisão explícita do operador): cada entrega traz três
 * headers — `Heygen-Signature` (HMAC-SHA256 hex do CORPO BRUTO, com o secret
 * do endpoint), `Heygen-Timestamp` e `Heygen-Event-Id` (dedup — um evento
 * pode ser reentregue, retry com backoff exponencial por até 24h). Mesmo
 * padrão de `stripeWebhookRoutes` (raw body parser própria desta rota,
 * comparação em tempo constante).
 *
 * DEDUP — migration 078 (`heygen_webhook_events`): um `INSERT ... ON
 * CONFLICT DO NOTHING` na chave `event_id` decide, atomicamente, se este
 * evento já foi processado. Sem isso, um retry do fornecedor processaria o
 * mesmo evento duas vezes.
 *
 * `callback_id` É O NOSSO `videos.id` — convenção deste projeto, não do
 * fornecedor. `avatarProvider.ts:generateVideoHeygen` envia
 * `callback_id: input.videoId` (F1); esta rota faz
 * `SELECT id FROM videos WHERE id = $1` sobre o MESMO valor (H2, provado por
 * execução em `checkHeygenCallbackWiringPolicy.ts`, não só por leitura dos
 * dois arquivos lado a lado).
 */
import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { logEvent } from "../services/log/safeLog.js";

/**
 * Compara duas strings em tempo constante — a MESMA razão que
 * `stripe.webhooks.constructEvent` já faz por dentro para o Stripe: um
 * `===` vaza, por temporização, quantos caracteres do início bateram, e é
 * exatamente essa fresta que uma comparação ingênua de assinatura abre.
 *
 * `secret: string | null` — nunca exige narrowing de quem chama. Sem
 * secret (tenant que nunca configurou `HEYGEN_WEBHOOK_SECRET`), a função
 * recusa por construção, em vez de depender de um `if` externo que, se um
 * dia mudar, poderia deixar de proteger este caminho.
 */
export function assinaturaValida(corpoBruto: Buffer, assinaturaRecebida: string, secret: string | null): boolean {
  if (!secret) return false;
  const esperada = createHmac("sha256", secret).update(corpoBruto).digest("hex");
  const bufEsperada = Buffer.from(esperada, "utf8");
  const bufRecebida = Buffer.from(assinaturaRecebida, "utf8");
  if (bufEsperada.length !== bufRecebida.length) return false;
  return timingSafeEqual(bufEsperada, bufRecebida);
}

export async function heygenWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Corpo BRUTO, não o JSON já parseado — mesma razão de stripeWebhookRoutes:
  // a assinatura é sobre os BYTES exatos que a HeyGen enviou, e o parser
  // padrão do Fastify já teria transformado o stream antes de um handler
  // rodar. Só afeta rotas registradas dentro deste plugin (app.ts registra
  // isto como seu próprio plugin, fora do protectedApp).
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/heygen", async (req, reply) => {
    if (!config.heygenWebhookSecret) {
      return reply.code(400).send({ error: "heygen_webhook_not_configured" });
    }

    const assinatura = req.headers["heygen-signature"];
    const eventId = req.headers["heygen-event-id"];
    if (typeof assinatura !== "string" || typeof eventId !== "string" || !eventId) {
      return reply.code(400).send({ error: "missing_headers", message: "Faltam Heygen-Signature ou Heygen-Event-Id." });
    }

    const corpoBruto = req.body as Buffer;
    if (!assinaturaValida(corpoBruto, assinatura, config.heygenWebhookSecret)) {
      logEvent("error", "heygen_webhook_invalid_signature", { eventId });
      return reply.code(400).send({ error: "invalid_signature" });
    }

    let payload: { event_type?: string; event_data?: { callback_id?: string; url?: string } };
    try {
      payload = JSON.parse(corpoBruto.toString("utf8"));
    } catch {
      return reply.code(400).send({ error: "invalid_json" });
    }

    // DEDUP — atômico: se a chave já existe, este evento já foi processado
    // (um retry legítimo do fornecedor, ou uma reentrega duplicada), e não
    // há nada a fazer além de confirmar recebimento. `rowCount === 0` é o
    // sinal de conflito — não uma leitura seguida de decisão, que teria uma
    // corrida entre duas entregas quase simultâneas.
    const callbackId = payload.event_data?.callback_id ?? null;
    // `callback_id` É o nosso `videos.id` — ver o comentário de topo. Uma
    // entrega cujo callback_id não bate com nenhum vídeo é registrada assim
    // mesmo (video_id fica NULL): é informação de auditoria, não erro.
    const video = callbackId
      ? (await pool.query<{ id: string }>("SELECT id FROM videos WHERE id = $1", [callbackId])).rows[0]
      : undefined;

    const inserted = await pool.query(
      `INSERT INTO heygen_webhook_events (event_id, event_type, video_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, payload.event_type ?? "unknown", video?.id ?? null],
    );
    if (inserted.rowCount === 0) {
      logEvent("info", "heygen_webhook_duplicate", { eventId, eventType: payload.event_type ?? "unknown" });
      return reply.code(200).send({ received: true, duplicate: true });
    }

    logEvent("info", "heygen_webhook_received", {
      eventId,
      eventType: payload.event_type ?? "unknown",
      callbackId,
      matchedVideoId: video?.id ?? null,
      // A finalização em si continua sendo `pollJob` (routes/videos.ts) —
      // ver o comentário de topo deste arquivo. Este evento é registrado
      // para auditoria/futuro; nenhuma ação sobre o vídeo acontece aqui.
      consequence: "registrado; a finalização do vídeo continua vindo do polling (retaguarda com teto de 7,5 min)",
    });

    return reply.code(200).send({ received: true });
  });
}
