/**
 * Busca e classifica a resposta do carimbo de frescor do frontend
 * (`GET /__image-stamp`).
 *
 * Extraído de `checkImageFreshnessPolicy.ts` para um arquivo próprio, sem
 * MUTANTS, porque um mutante que mira o mesmo arquivo que o declara conta
 * DUAS ocorrências para `checkMutantRegistryPolicy` — uma dentro do próprio
 * `find: \`...\`` do mutante, outra no código real — e reprova por
 * ambiguidade antes de qualquer coisa rodar. Nenhuma outra guarda deste
 * repositório automira; este arquivo existe só para que
 * `checkImageFreshnessPolicy.ts` não precise ser a primeira.
 */

/** Onde o frontend responde, de dentro da rede do compose. */
export const FRONTEND_STAMP_URL = "http://frontend:5173/__image-stamp";

export type StampFetchResult =
  | { kind: "off" }
  | { kind: "http-error"; status: number }
  | { kind: "ok"; text: string };

/**
 * Classifica a resposta em três casos que precisam de tratamento DIFERENTE:
 *
 *  - "off": a conexão nem aconteceu (timeout, recusada, DNS). O frontend
 *    pode estar fora do ar por um motivo legítimo (gate rodado como
 *    verificação de código, sem o compose de pé). NOTA, não falha.
 *  - "http-error": o serviço respondeu, mas não com 2xx. Com nginx servindo
 *    arquivo estático, isto é tipicamente `dist/__image-stamp` ausente — o
 *    passo que grava o carimbo caiu do build. O serviço está vivo, então
 *    isto NÃO é "fora do ar": é o próprio defeito que a guarda existe para
 *    pegar, com uma cara nova.
 *  - "ok": comparação normal contra o repositório.
 */
export async function fetchStamp(): Promise<StampFetchResult> {
  let response: Response;
  try {
    response = await fetch(FRONTEND_STAMP_URL, { signal: AbortSignal.timeout(4000) });
  } catch {
    return { kind: "off" };
  }
  if (!response.ok) return { kind: "http-error", status: response.status };
  return { kind: "ok", text: (await response.text()).trim() };
}
