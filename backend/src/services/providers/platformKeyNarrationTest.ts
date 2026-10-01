/**
 * ABAS-26, 30/09/2026 — teste REAL de permissão de Text-to-Speech da
 * credencial ElevenLabs.
 *
 * DIFERENTE de platformKeyProbe.ts (somente-leitura por construção,
 * cobrado pelo `npm run check`): este módulo FAZ UMA CHAMADA DE GERAÇÃO
 * de propósito — síntese de 1 caractere, custo de frações de centavo.
 *
 * Por quê: "Validar" (platformKeyProbe.ts) confirma só leitura de vozes
 * (`/v1/voices`), que é um escopo DIFERENTE de "Text to Speech" na
 * ElevenLabs — uma chave com Vozes(Ler) mas sem TTS passaria em
 * "Validar" e só falharia na hora real de narrar (achado real de 30/09,
 * handoff de 28/09 já alertava pra isso). Levantamento feito em 30/09:
 * não existe endpoint de leitura de permissões para uma chave comum
 * (só para "service accounts" Enterprise, que exige um
 * service_account_user_id que não temos) — por isso a única forma
 * confirmada de checar o escopo é tentar sintetizar de verdade.
 *
 * Por isso este módulo é um botão SEPARADO de "Validar" no painel
 * ("Testar narração"), nunca automático — mesma regra de qualquer teste
 * real/pago deste projeto: só a partir de um clique explícito do
 * operador, com aviso de custo antes do clique (ver frontend).
 */
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { vendorSignal } from "./vendorTimeout.js";
import { logEvent } from "../log/safeLog.js";
import { buildSynthesisBody, ELEVENLABS_TTS_MODEL } from "./voiceProvider.js";

export interface NarrationTestResult {
  ok: boolean;
  detail: string;
}

export async function testElevenLabsNarration(apiKey: string): Promise<NarrationTestResult> {
  // Passo 1 — GET /v1/voices: leitura pura, não gasta nada. Só serve para
  // achar um voice_id para testar a síntese; não é em si o teste.
  let voicesRes: Response;
  try {
    voicesRes = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("platformKeyNarrationTest.listVoices", err);
    return { ok: false, detail: `Não foi possível alcançar a ElevenLabs: ${describeNetworkError(err)}` };
  }
  if (!voicesRes.ok) {
    return { ok: false, detail: `A chave foi recusada ao listar vozes (status ${voicesRes.status}).` };
  }
  const voicesData = (await voicesRes.json()) as { voices?: { voice_id?: string }[] };
  const voiceId = voicesData.voices?.[0]?.voice_id;
  if (!voiceId) {
    return { ok: false, detail: "Nenhuma voz disponível nesta conta para testar a síntese." };
  }

  // Passo 2 — a ÚNICA chamada desta função que gera de verdade e custa
  // (frações de centavo, 1 caractere). Corpo montado pela mesma função
  // pura que o caminho de produção usa (buildSynthesisBody), para o
  // teste refletir o que a aplicação de fato envia.
  const body = buildSynthesisBody("a", ELEVENLABS_TTS_MODEL);
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("platformKeyNarrationTest.synthesize", err);
    return { ok: false, detail: `Não foi possível alcançar a ElevenLabs: ${describeNetworkError(err)}` };
  }

  if (res.ok) {
    logEvent("info", "platform_key_narration_tested", { vendor: "elevenlabs", ok: true });
    return { ok: true, detail: "Permissão de Text to Speech confirmada — a síntese de teste funcionou." };
  }

  const bodyText = await res.text();
  logEvent("error", "platform_key_narration_tested", {
    vendor: "elevenlabs",
    ok: false,
    status: res.status,
    body: bodyText.slice(0, 500),
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, detail: "A chave não tem permissão de Text to Speech (recusada ao tentar sintetizar)." };
  }
  return { ok: false, detail: `O fornecedor recusou a síntese com status ${res.status}.` };
}
