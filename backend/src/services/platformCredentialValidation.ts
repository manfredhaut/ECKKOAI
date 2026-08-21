/**
 * Valida uma chave da plataforma e registra o resultado.
 *
 * Existe como camada própria por uma razão estrutural, não estética: a rota
 * precisa do RESULTADO, nunca do valor. Se a rota resolvesse a chave e
 * chamasse o probe, ela teria a chave em claro numa variável local — e a
 * distância entre isso e um `return { apiKey }` num dia apressado é uma linha.
 * Aqui o valor nasce e morre dentro desta função, e `npm run check` reprova o
 * build se um arquivo de rota mencionar `resolvePlatformKey` ou `decrypt(`.
 */
import { PLATFORM_CREDENTIALS, type PlatformCredentialId } from "./platformCredentials.js";
import { recordValidationResult, resolvePlatformKey } from "./platformCredentialStore.js";
import { probePlatformKey, type ProbeResult } from "./providers/platformKeyProbe.js";

export interface ValidationOutcome extends ProbeResult {
  validatedAt: string;
}

export async function validatePlatformCredential(
  id: PlatformCredentialId,
): Promise<ValidationOutcome | { notConfigured: true } | { noProbe: true }> {
  // Checado ANTES de resolver a chave: `null` é uma propriedade do REGISTRO
  // (não existe forma de validação para este id), não algo que dependa do
  // valor gravado — não há razão para decifrar nada antes de saber isso.
  const validation = PLATFORM_CREDENTIALS[id].validation;
  if (validation === null) return { noProbe: true };

  const resolved = await resolvePlatformKey(id);
  if (!resolved) return { notConfigured: true };

  const result = await probePlatformKey(validation, resolved.value);

  // Só há linha para atualizar quando a chave veio do painel. Uma chave do
  // .env não tem onde guardar o carimbo — e inventar uma linha para ela faria
  // a origem exibida na tela mudar sozinha depois de uma validação.
  if (resolved.source === "panel") {
    await recordValidationResult(id, result.ok, result.detail);
  }

  return { ...result, validatedAt: new Date().toISOString() };
}
