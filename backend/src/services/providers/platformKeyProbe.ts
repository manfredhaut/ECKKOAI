/**
 * Validação de chave da plataforma: UMA chamada, sempre de LEITURA.
 *
 * Este módulo é somente-leitura por construção, e `npm run check` cobra isso:
 * ele só pode citar endpoints da allowlist abaixo, e nenhum endpoint de
 * geração. É por isso que ele fica fora de `avatarProvider.ts` /
 * `voiceProvider.ts` — aqueles são cobrados por outra invariante ("todo
 * caminho que gasta cota consulta isFixtureMode()"), correta lá e errada aqui:
 *
 * uma leitura de saldo não gasta cota, e simulá-la seria pior que não tê-la.
 * O número na tela existe justamente para decidir se dá para gerar; um número
 * de mentira levaria à decisão contrária da que os dados sustentam. Por isso a
 * validação chama o fornecedor de verdade mesmo com PROVIDER_MODE=fixture — e
 * por isso ela só roda a partir de um clique, nunca ao montar a tela.
 */
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import type { PlatformValidationKind } from "../platformCredentials.js";

/**
 * Todo endpoint que este módulo pode alcançar. Verificada por `npm run check`:
 * um `fetch` para fora desta lista reprova o build. A lista é o contrato —
 * cada uma destas URLs lê estado, nenhuma cria trabalho no fornecedor.
 */
export const PROBE_ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  anthropic: "https://api.anthropic.com/v1/models",
  heygen: "https://api.heygen.com/v2/user/remaining_quota",
  elevenlabs: "https://api.elevenlabs.io/v1/voices",
} as const;

export interface ProbeResult {
  ok: boolean;
  /** Frase curta para a tela: erro sanitizado, ou o saldo lido. */
  detail: string | null;
  /** Saldo/cota, quando o fornecedor devolve. Só o HeyGen devolve hoje. */
  balance: string | null;
}

export async function probePlatformKey(kind: PlatformValidationKind, apiKey: string): Promise<ProbeResult> {
  switch (kind) {
    case "gemini_list_models":
      return probeGemini(apiKey);
    case "anthropic_list_models":
      return probeAnthropic(apiKey);
    case "heygen_quota":
      return probeHeygen(apiKey);
    case "elevenlabs_voices":
      return probeElevenLabs(apiKey);
  }
}

/**
 * Nunca devolve o corpo do fornecedor ao cliente: ele carrega nome de modelo,
 * tier e valor de cota, e num caso conhecido do projeto vazou tudo isso para
 * um visitante anônimo. O status basta para agir; o corpo vai para o log.
 */
function failure(vendor: string, status: number, body: string): ProbeResult {
  console.error(`[platformKeyProbe] ${vendor} recusou a chave (${status}): ${body.slice(0, 500)}`);
  if (status === 401 || status === 403) {
    return { ok: false, detail: "A chave foi recusada pelo fornecedor (inválida, revogada ou sem permissão).", balance: null };
  }
  if (status === 429) {
    return { ok: false, detail: "O fornecedor respondeu com limite de requisições atingido.", balance: null };
  }
  return { ok: false, detail: `O fornecedor respondeu com erro ${status}.`, balance: null };
}

function unreachable(vendor: string, err: unknown): ProbeResult {
  logProviderNetworkError(`platformKeyProbe.${vendor}`, err);
  return { ok: false, detail: `Não foi possível alcançar o fornecedor: ${describeNetworkError(err)}`, balance: null };
}

// ---------------------------------------------------------------------------

async function probeGemini(apiKey: string): Promise<ProbeResult> {
  // ListModels responde 200/400 conforme a chave, e NÃO consome a cota de
  // generateContent — que no free tier são ~20 requisições por dia,
  // compartilhadas com o copiloto. Validar não pode custar uma pergunta de
  // cliente.
  let res: Response;
  try {
    res = await fetch(`${PROBE_ENDPOINTS.gemini}?key=${encodeURIComponent(apiKey)}`);
  } catch (err) {
    return unreachable("gemini", err);
  }
  if (!res.ok) return failure("Gemini", res.status, await res.text());

  const data = (await res.json()) as { models?: { name?: string }[] };
  const count = data.models?.length ?? 0;
  return { ok: true, detail: `Chave aceita — ${count} modelos disponíveis no projeto.`, balance: null };
}

async function probeAnthropic(apiKey: string): Promise<ProbeResult> {
  let res: Response;
  try {
    res = await fetch(PROBE_ENDPOINTS.anthropic, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
  } catch (err) {
    return unreachable("anthropic", err);
  }
  if (!res.ok) return failure("Anthropic", res.status, await res.text());

  const data = (await res.json()) as { data?: { id?: string }[] };
  const count = data.data?.length ?? 0;
  return { ok: true, detail: `Chave aceita — ${count} modelos disponíveis na conta.`, balance: null };
}

async function probeHeygen(apiKey: string): Promise<ProbeResult> {
  let res: Response;
  try {
    res = await fetch(PROBE_ENDPOINTS.heygen, { headers: { "x-api-key": apiKey } });
  } catch (err) {
    return unreachable("heygen", err);
  }
  if (!res.ok) return failure("HeyGen", res.status, await res.text());

  const data = (await res.json()) as { data?: { remaining_quota?: number } };
  const quota = data.data?.remaining_quota;
  if (typeof quota !== "number") {
    // A chave foi aceita; só a leitura do número falhou. Dizer as duas coisas
    // separadamente evita que uma mudança de formato do fornecedor pareça
    // chave inválida.
    return { ok: true, detail: "Chave aceita, mas o saldo não veio no formato esperado.", balance: null };
  }
  // A UNIDADE não é declarada em lugar nenhum da resposta do HeyGen. O que se
  // sabe por medição: um vídeo de 33,7s consumiu 99 unidades de 189. Chamar
  // isso de "créditos" na tela seria inventar precisão que o fornecedor não dá.
  const balance = `${quota} unidades de cota restantes`;
  return { ok: true, detail: balance, balance };
}

async function probeElevenLabs(apiKey: string): Promise<ProbeResult> {
  // /v1/voices, e não /v1/user/subscription: o segundo lê cota mas exige a
  // permissão `user_read`, e uma chave sem ela seria reportada como inválida
  // — falso negativo. Ver a nota em platformCredentials.ts.
  let res: Response;
  try {
    res = await fetch(PROBE_ENDPOINTS.elevenlabs, { headers: { "xi-api-key": apiKey } });
  } catch (err) {
    return unreachable("elevenlabs", err);
  }
  if (!res.ok) return failure("ElevenLabs", res.status, await res.text());

  const data = (await res.json()) as { voices?: unknown[] };
  const count = data.voices?.length ?? 0;
  return { ok: true, detail: `Chave aceita — ${count} vozes acessíveis.`, balance: null };
}
