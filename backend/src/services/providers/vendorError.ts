// Traduz falha de fornecedor de IA em mensagem que pode ser mostrada a um
// cliente — e, em muitos casos, a um visitante anônimo na landing.
//
// O que existia antes devolvia err.message cru. Na prática isso significava
// que qualquer pessoa podia arrancar do copiloto público a resposta de erro
// do Google inteira: nome do modelo, tier da conta, valor exato da cota e
// links internos. Nada disso é da conta de quem está do outro lado, e é um
// mapa gratuito para quem quiser sondar a plataforma.
//
// A regra: o cliente recebe uma frase em pt-BR que diz o que aconteceu e o
// que fazer; o detalhe do fornecedor vai para o log do servidor, onde a
// equipe o encontra. Nunca os dois no mesmo lugar.

import { scrubSecretsFromText } from "./vendorResponseLog.js";
import { logEvent } from "../log/safeLog.js";
import { RoteiroInvalidoError } from "../video/falPipeline.js";

export type VendorKind = "script" | "voice" | "avatar";

export type VendorFailure =
  | "rate_limited" // 429 — cota ou excesso de requisições
  | "unavailable" // 5xx, timeout, rede
  | "auth" // 401/403 — chave inválida, revogada, sem permissão
  | "too_large" // 400/413 — o fornecedor recusou por TAMANHO do arquivo, não por infra
  // BUG 2, 29/08/2026 — o ROTEIRO (ou os blocos que ele exige) não cabe no
  // tier: `conferirRoteiro`/`conferirRoteiroENormal` (falPipeline.ts)
  // recusaram ANTES de qualquer chamada paga. Nunca fala com fornecedor
  // nenhum — é validação NOSSA, sobre o texto que a pessoa escreveu.
  | "script_invalid"
  | "unknown";

const VENDOR_LABEL: Record<VendorKind, string> = {
  script: "de geração de roteiro",
  voice: "de voz",
  avatar: "de vídeo",
};

/**
 * Classifica pelo texto do erro. Os adaptadores em providers/ formatam suas
 * exceções como "<Vendor> API error (<status>): <corpo>", então o status está
 * disponível sem precisar propagar o objeto Response por toda a pilha.
 *
 * `too_large` vem ANTES do balde genérico de propósito — medido em 26/08: um
 * vídeo de referência de 26,9 MB foi encaminhado inteiro ao ElevenLabs (que
 * aceita só 11 MB), o fornecedor recusou com 400 `upload_file_size_exceeded`,
 * e por não bater em nenhuma das três regras acima isso caía em "unknown" —
 * que devolve 502, o MESMO código de uma falha real de infraestrutura do
 * fornecedor. Um 502 aqui manda procurar problema no fornecedor quando o
 * problema é o arquivo que a pessoa enviou.
 *
 * `script_invalid` vem ANTES de tudo, por `instanceof`, não por regex —
 * MEDIDO em 28-29/08 (INCIDENTE-502-1): um roteiro de 196 caracteres em
 * tier "normal" bateu na imagem STALE (código de 27/08, sem o fracionamento)
 * e disparou `conferirRoteiro()`, que recusa ANTES de qualquer chamada paga.
 * `classifyVendorFailure` não tinha regra nenhuma para essa frase — caía no
 * `"unknown"` do fim, e `vendorErrorStatus` devolvia 502: uma recusa de
 * VALIDAÇÃO NOSSA saindo idêntica, para o navegador, a uma queda real de
 * infraestrutura. `RoteiroInvalidoError` é lançada só pelas duas funções que
 * decidem "este roteiro não cabe no tier" (`conferirRoteiro`,
 * `conferirRoteiroENormal`) — nunca por nada que já tenha falado com a fal.
 * Checar a CLASSE, e não o texto da mensagem, sobrevive à próxima vez que
 * alguém reescrever a frase.
 */
export function classifyVendorFailure(err: unknown): VendorFailure {
  if (err instanceof RoteiroInvalidoError) return "script_invalid";

  const raw = err instanceof Error ? err.message : String(err);

  if (/\(429\)|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(raw)) return "rate_limited";
  if (/upload_file_size_exceeded|file.{0,15}too large|too large.{0,15}file|payload too large|\(413\)|maximum of \d+\s*[MK]B/i.test(raw)) {
    return "too_large";
  }
  if (/\((5\d\d)\)|unavailable|overloaded|high demand|timeout|timed out|ECONNRESET|ENOTFOUND|fetch failed|Could not reach/i.test(raw)) {
    return "unavailable";
  }
  if (/\((401|403)\)|unauthorized|invalid.?api.?key|API key not valid|missing_permissions|permission/i.test(raw)) {
    return "auth";
  }
  return "unknown";
}

/**
 * Mensagem para o usuário final, em pt-BR. Fala de "serviço", nunca do nome
 * do fornecedor: para o cliente, HeyGen e ElevenLabs são detalhe de
 * implementação nosso, e citá-los só transfere a ele um problema que não é
 * dele.
 */
export function vendorErrorMessage(
  kind: VendorKind,
  failure: VendorFailure,
  opts?: { maxBytes?: number; scriptDetail?: string },
): string {
  const what = VENDOR_LABEL[kind];
  switch (failure) {
    case "rate_limited":
      return `O serviço ${what} atingiu o limite de uso no momento. Tente novamente em alguns minutos.`;
    case "unavailable":
      return `O serviço ${what} está temporariamente indisponível. Tente novamente em alguns minutos.`;
    case "auth":
      return `O serviço ${what} não está configurado corretamente. Fale com o suporte.`;
    case "script_invalid":
      // A mensagem de `RoteiroInvalidoError` já é NOSSA, em pt-BR, sem nome
      // de fornecedor nem segredo — escrita para ser lida por quem tem de
      // agir (`conferirRoteiro`/`fracionarRoteiro`, falPipeline.ts). Repetir
      // um texto genérico aqui jogaria fora a única informação que diz QUAL
      // roteiro mudar e PARA QUÊ — o oposto de "tente novamente".
      return opts?.scriptDetail
        ? `O roteiro precisa mudar antes de gerar de novo: ${opts.scriptDetail}`
        : "O roteiro não cabe no que este nível suporta. Ajuste o roteiro (encurte-o ou divida-o) e gere de novo.";
    case "too_large":
      // `opts.maxBytes` é o teto que O CHAMADOR conhece (ex.: `VOICE_SAMPLE_MAX_BYTES`
      // em routes/voice.ts) — o próprio fornecedor pode aceitar menos ou mais
      // do que isso, e por isso o número aqui é O NOSSO, nunca extraído do
      // texto do fornecedor (que muda de frase entre versões da API dele).
      return opts?.maxBytes
        ? `O arquivo enviado é grande demais para o serviço ${what} — máximo de ${Math.floor(opts.maxBytes / (1024 * 1024))} MB. Reduza o tamanho e tente novamente.`
        : `O arquivo enviado é grande demais para o serviço ${what}. Reduza o tamanho e tente novamente.`;
    default:
      return `Não foi possível concluir a operação no serviço ${what}. Tente novamente em alguns minutos.`;
  }
}

/**
 * Ponto único de tradução: registra o detalhe cru no log do servidor e
 * devolve só o que pode ser exibido. `context` identifica o call site no log.
 */
export function toClientVendorError(
  kind: VendorKind,
  context: string,
  err: unknown,
  opts?: { maxBytes?: number },
): { failure: VendorFailure; message: string } {
  const failure = classifyVendorFailure(err);
  logEvent("error", "vendor_error", { context,
      kind,
      failure,
      // Detalhe do fornecedor fica AQUI, no servidor, e só aqui — passado pela
      // MESMA varredura de segredos que o LOG-1 aplica a corpo não-JSON.
      //
      // Não é zelo preventivo: `fetchJson` monta a exceção como
      // "<Vendor> API error (<status>): <corpo bruto>", então o corpo INTEIRO
      // do fornecedor viaja dentro de `err.message` e chegava aqui em claro.
      // O `vendor_response` mascarava aquele mesmo corpo alguns milissegundos
      // antes, e este evento o publicava de volta legível — o defeito exato
      // que o LOG-1 corrigiu, num evento que ninguém tinha olhado. Medido em
      // 2026-08-01: um 400 com `api_key` no corpo saiu inteiro por aqui.
      //
      // Um segredo mascarado num evento e legível no seguinte não está
      // mascarado.
      detail: scrubSecretsFromText(err instanceof Error ? err.message : String(err)),
    });
  // `scriptDetail` só para "script_invalid": a mensagem de `RoteiroInvalidoError`
  // é NOSSA (nunca corpo de fornecedor), então não precisa da varredura de
  // segredos acima — mas passa pela mesma, por uniformidade e porque
  // `scrubSecretsFromText` é inócua sobre texto que não tem segredo nenhum.
  return {
    failure,
    message: vendorErrorMessage(kind, failure, {
      ...opts,
      scriptDetail: failure === "script_invalid" ? scrubSecretsFromText(err instanceof Error ? err.message : String(err)) : undefined,
    }),
  };
}

/**
 * Código HTTP coerente com a natureza da falha.
 *
 * `too_large` → 422: é uma entrada inválida do CLIENTE (arquivo grande
 * demais), não uma falha do fornecedor — 502 (Bad Gateway) afirmaria o
 * contrário. `script_invalid` → 422, mesmo raciocínio: BUG 2, 29/08 —
 * o roteiro (ou os blocos que ele exige) é que está fora do que o tier
 * suporta, nunca o fornecedor. `rate_limited` → 429. Todo o resto (infra
 * real do fornecedor, ou causa não classificada) continua 502.
 */
export function vendorErrorStatus(failure: VendorFailure): number {
  if (failure === "rate_limited") return 429;
  if (failure === "too_large" || failure === "script_invalid") return 422;
  return 502;
}
