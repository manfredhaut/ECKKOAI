/**
 * A ROTA RECEPTORA de webhook da HeyGen — B7, BLOCO HEYGEN-SIMPLES-1
 * (02/09/2026).
 *
 * Ver o comentário de topo de `routes/heygenWebhook.ts` para o desenho
 * completo. Esta guarda mede duas coisas de naturezas diferentes:
 *
 * 1. `assinaturaValida` — EXECUÇÃO real (função pura, sem I/O): a
 *    validação HMAC-SHA256 aceita a assinatura certa e recusa qualquer
 *    coisa diferente (secret errado, corpo alterado, assinatura curta).
 *    É a peça de SEGURANÇA da rota — sem ela validando de verdade,
 *    qualquer um que descubra a URL pode forjar "vídeo pronto".
 * 2. O resto — FORMA (leitura de arquivo, custo zero): a rota recusa sem
 *    secret configurado, exige os headers certos, faz dedup atômico
 *    (INSERT ... ON CONFLICT DO NOTHING), e — o ponto mais fácil de
 *    quebrar por engano — NÃO finaliza o vídeo diretamente. A finalização
 *    continua sendo só `pollJob` (routes/videos.ts, teto de parede já
 *    existente: MAX_POLL_ATTEMPTS=90 × POLL_INTERVAL_MS=5000 ≈ 7,5 min).
 *    Um handler que passasse a chamar `pollVideoJob`/gravar `status =
 *    'ready'` diretamente duplicaria a validação de artefato, a
 *    persistência local e a lógica de estorno que `pollJob` já tem —
 *    provavelmente ERRADO na primeira versão, e sem a guarda deste
 *    arquivo, silenciosamente.
 *
 * Custo do item 2: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { assinaturaValida } from "../routes/heygenWebhook.js";

const ROTA_WEBHOOK = "backend/src/routes/heygenWebhook.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "webhook HeyGen: assinaturaValida recusa qualquer coisa diferente do HMAC certo",
    name: "assinaturaValida deixa de comparar em tempo constante",
    kind: "esperto",
    // ESPERTO: a comparação continua correta em VALOR — só o MÉTODO muda de
    // `timingSafeEqual` (tempo constante) para `===` (sai assim que o
    // primeiro byte diferente aparece). O resultado observável correto/
    // incorreto é o MESMO; o que muda é uma característica de TEMPORIZAÇÃO
    // que este vetor não mede diretamente — o `expect` aqui é sobre o
    // texto do código, não sobre o comportamento, porque um ataque de
    // temporização não é algo que se prove com um `assert` de resultado.
    file: ROTA_WEBHOOK,
    find: "  return timingSafeEqual(bufEsperada, bufRecebida);",
    replace: "  return bufEsperada.toString() === bufRecebida.toString();",
    expect: "não usa mais timingSafeEqual",
  },
  {
    guard: "webhook HeyGen: sem HEYGEN_WEBHOOK_SECRET configurado, a rota recusa toda entrega",
    name: "a rota deixa de recusar sem secret configurado",
    kind: "esperto",
    // ESPERTO: o resto do handler continua igual — só a recusa antecipada
    // some. Sem secret, `assinaturaValida` receberia uma string vazia
    // como terceiro argumento, e o HMAC de uma string vazia É um valor
    // determinístico — um atacante que soubesse disso poderia calcular a
    // assinatura "certa" para um secret vazio e forjar entregas.
    file: ROTA_WEBHOOK,
    find:
      '    if (!config.heygenWebhookSecret) {\n' +
      '      return reply.code(400).send({ error: "heygen_webhook_not_configured" });\n' +
      "    }\n\n",
    replace: "",
    expect: "não recusa mais entregas sem HEYGEN_WEBHOOK_SECRET",
  },
  {
    guard: "webhook HeyGen: o dedup é ATÔMICO (ON CONFLICT DO NOTHING), não leitura-seguida-de-decisão",
    name: "o dedup passa a ser um SELECT seguido de INSERT",
    kind: "esperto",
    // ESPERTO: para uma entrega ISOLADA (não-duplicada) nada muda — o
    // INSERT continua funcionando normalmente. O efeito aparece só numa
    // REENTREGA (exatamente o caso que o retry com backoff do fornecedor
    // produz): sem `ON CONFLICT`, o segundo INSERT para o MESMO event_id
    // viola a unique constraint da chave primária e LANÇA — o handler não
    // trata esse erro, e uma reentrega legítima (que deveria devolver 200
    // `duplicate: true`) viraria um 500 sem razão de negócio nenhuma.
    file: ROTA_WEBHOOK,
    find: "ON CONFLICT (event_id) DO NOTHING",
    replace: "",
    expect: "dedup atômico",
  },
];

export interface HeygenWebhookCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkHeygenWebhookPolicy(repoRoot: string): HeygenWebhookCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. assinaturaValida — EXECUÇÃO real.
  // ---------------------------------------------------------------------------
  const corpo = Buffer.from(JSON.stringify({ event_type: "avatar_video.success", event_data: { callback_id: "v1" } }));
  const secretCerto = "segredo-de-teste-1";

  // HMAC-SHA256 hex do corpo com o secret certo — calculado FORA da função
  // sob teste, com Node puro, para não testar a função contra ela mesma.
  const assinaturaCerta = createHmac("sha256", secretCerto).update(corpo).digest("hex");

  if (!assinaturaValida(corpo, assinaturaCerta, secretCerto)) {
    failures.push("webhook-heygen: assinaturaValida recusou uma assinatura CORRETA — nenhuma entrega legítima passaria.");
  }
  if (assinaturaValida(corpo, assinaturaCerta, "outro-secret")) {
    failures.push("webhook-heygen: assinaturaValida aceitou uma assinatura calculada com OUTRO secret.");
  }
  const corpoAlterado = Buffer.from(JSON.stringify({ event_type: "avatar_video.success", event_data: { callback_id: "v2" } }));
  if (assinaturaValida(corpoAlterado, assinaturaCerta, secretCerto)) {
    failures.push(
      "webhook-heygen: assinaturaValida aceitou um corpo DIFERENTE do que a assinatura foi calculada sobre " +
        "— um atacante poderia reusar uma assinatura válida de OUTRO evento com um corpo forjado.",
    );
  }
  if (assinaturaValida(corpo, "curta-demais", secretCerto)) {
    failures.push("webhook-heygen: assinaturaValida aceitou uma assinatura de tamanho diferente do HMAC real.");
  }
  if (failures.length === 0) {
    notes.push(
      "  webhook-heygen: assinaturaValida aceita a assinatura certa e recusa secret errado, corpo alterado " +
        "e assinatura de tamanho diferente — execução real, timingSafeEqual",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. O resto — FORMA.
  // ---------------------------------------------------------------------------
  try {
    const rota = lerDaRaiz(repoRoot, ROTA_WEBHOOK);

    if (!rota.includes("if (!config.heygenWebhookSecret) {")) {
      failures.push(`webhook-heygen: a rota não recusa mais entregas sem HEYGEN_WEBHOOK_SECRET em ${ROTA_WEBHOOK}.`);
    }
    // Item 1 é sobre RESULTADO (aceita/recusa); este é sobre MÉTODO — um
    // ataque de temporização não muda se a comparação aceitou ou recusou,
    // muda quanto tempo ela levou para decidir. Isso não se prova com um
    // `assert` de resultado, só lendo que o código usa a primitiva certa.
    if (!rota.includes("return timingSafeEqual(bufEsperada, bufRecebida);")) {
      failures.push(
        `webhook-heygen: assinaturaValida não usa mais timingSafeEqual em ${ROTA_WEBHOOK} — uma comparação ` +
          "por igualdade comum (`===`) vaza, pela temporização da resposta, quantos caracteres do início " +
          "bateram, e é exatamente essa fresta que a comparação em tempo constante existe para fechar.",
      );
    }
    if (!rota.includes('req.headers["heygen-signature"]') || !rota.includes('req.headers["heygen-event-id"]')) {
      failures.push(`webhook-heygen: a rota não lê mais os headers Heygen-Signature/Heygen-Event-Id em ${ROTA_WEBHOOK}.`);
    }
    if (!rota.includes("ON CONFLICT (event_id) DO NOTHING")) {
      failures.push(`webhook-heygen: o dedup atômico (ON CONFLICT DO NOTHING) não está mais presente em ${ROTA_WEBHOOK}.`);
    }
    // A checagem mais importante: NENHUMA chamada a pollVideoJob, nenhum
    // UPDATE de status='ready' — a rota só REGISTRA. Se um dia isso mudar
    // (a integração completa, hoje fora de escopo), esta checagem precisa
    // mudar JUNTO, de propósito — ela existe para que essa mudança seja
    // uma decisão, não um acidente de quem só queria "deixar mais rápido".
    if (rota.includes("pollVideoJob(") || /status\s*=\s*'ready'/.test(rota)) {
      failures.push(
        `webhook-heygen: a rota passou a chamar pollVideoJob ou gravar status='ready' diretamente em ` +
          `${ROTA_WEBHOOK} — isso duplicaria a validação de artefato/persistência/estorno que pollJob ` +
          "(routes/videos.ts) já tem, provavelmente incompleta na primeira versão. Se esta mudança é " +
          "intencional (a integração completa do webhook), atualize esta guarda junto, de propósito.",
      );
    }
    if (failures.length === 0 || failures.every((f) => f.startsWith("webhook-heygen: assinaturaValida"))) {
      notes.push(
        "  webhook-heygen: a rota recusa sem secret configurado, exige os headers certos, deduplica " +
          "atomicamente por event_id, e só REGISTRA o evento — a finalização do vídeo continua vindo do " +
          "polling (pollJob, teto de parede de 7,5 min)",
      );
    }
  } catch {
    failures.push(`webhook-heygen: não consegui ler ${ROTA_WEBHOOK}.`);
  }

  return { failures, notes };
}
