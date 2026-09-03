/**
 * B5, BLOCO HEYGEN-SIMPLES-1 (02/09/2026) — clonagem de voz NATIVA da
 * HeyGen.
 *
 * `POST /v3/voices/clone`/`GET /v3/voices/{id}`/`DELETE /v3/voices/{id}`
 * (schema lido por doc pública, developers.heygen.com/reference/clone-a-voice
 * e /reference/delete-a-voice — WebFetch, 02/09/2026; NÃO reconfirmado por
 * chamada real, essas rotas estão nas proibidas de toda rodada de leitura
 * deste bloco).
 *
 * RENOMEADO de `checkHeygenSpeechPolicy.ts` em SIMPLES-3 (G2, 03/09/2026):
 * as seções sobre `POST /v3/voices/speech` (TTS nativo, B2) foram removidas
 * junto da função real — media a duração de um áudio que nunca era o mesmo
 * enviado ao vídeo (a arquitetura confirmada é ElevenLabs SEMPRE
 * sintetizando a fala; ver `HeygenPayloadExtras` em avatarProvider.ts). O
 * arquivo agora testa só a metade que sobrevive: o CAMINHO de clonagem em
 * si, não a geração de fala.
 *
 * Quatro coisas medidas aqui:
 *
 * 1. `cloneVoiceHeygen` monta `audio:{type:"asset_id",asset_id}` e
 *    `voice_name` sempre; `language`/`remove_background_noise` só quando
 *    fornecidos; recusa uma resposta sem `voice_clone_id`.
 * 2. `readHeygenVoiceCloneStatus` mapeia os quatro nomes conhecidos
 *    ("pending"/"processing"/"complete"/"failed", com "completed" também
 *    aceito — as duas fontes lidas discordam na grafia) e trata qualquer
 *    outro valor como "processing", NUNCA como pronto — declarar pronto por
 *    engano deixaria a voz escolhível antes de existir no fornecedor.
 * 3. `deleteVoiceHeygen` chama o DELETE e trata 404 (voz já apagada) como
 *    sucesso — o efeito desejado já vale.
 * 4. `countHeygenVoiceSlots` devolve o TAMANHO da listagem real (nunca uma
 *    constante local) e recusa uma resposta cuja `data` não seja um array.
 */
import type { Mutant } from "./mutants.js";
import {
  cloneVoiceHeygen,
  readHeygenVoiceCloneStatus,
  deleteVoiceHeygen,
  countHeygenVoiceSlots,
  AvatarProviderError,
} from "../services/providers/avatarProvider.js";

export interface HeygenVoiceCloneCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkHeygenVoiceClonePolicy(): Promise<HeygenVoiceCloneCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. cloneVoiceHeygen — corpo enviado e parsing da resposta.
  // ---------------------------------------------------------------------------
  const fetchOriginal3 = globalThis.fetch;
  const modoOriginal3 = process.env.PROVIDER_MODE;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpoDeClone: any = null;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async (_entrada: unknown, init?: unknown) => {
      const initObj = init as { body?: string } | undefined;
      corpoDeClone = initObj?.body ? JSON.parse(initObj.body) : null;
      return new Response(JSON.stringify({ data: { voice_clone_id: "clone-1" } }), { status: 200 });
    }) as typeof fetch;

    const resultado = await cloneVoiceHeygen("chave-heygen", "asset-audio-1", "Minha Voz");
    if (
      corpoDeClone?.audio?.type !== "asset_id" ||
      corpoDeClone?.audio?.asset_id !== "asset-audio-1" ||
      corpoDeClone?.voice_name !== "Minha Voz"
    ) {
      failures.push(
        `heygen-voice-clone: cloneVoiceHeygen não montou audio/voice_name corretos — veio ${JSON.stringify(corpoDeClone)}.`,
      );
    }
    if ("language" in (corpoDeClone ?? {}) || "remove_background_noise" in (corpoDeClone ?? {})) {
      failures.push(
        "heygen-voice-clone: sem opts, cloneVoiceHeygen mandou language/remove_background_noise mesmo assim.",
      );
    }
    if (resultado.voiceCloneId !== "clone-1") {
      failures.push(`heygen-voice-clone: voiceCloneId não veio da resposta — veio ${JSON.stringify(resultado)}.`);
    }

    corpoDeClone = null;
    await cloneVoiceHeygen("chave-heygen", "asset-audio-1", "Minha Voz", {
      language: "pt",
      removeBackgroundNoise: false,
    });
    if (corpoDeClone?.language !== "pt" || corpoDeClone?.remove_background_noise !== false) {
      failures.push(
        `heygen-voice-clone: com opts fornecido, language/remove_background_noise não chegaram ao corpo — ` +
          `veio ${JSON.stringify(corpoDeClone)}.`,
      );
    }

    globalThis.fetch = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as typeof fetch;
    let recusouSemId = false;
    try {
      await cloneVoiceHeygen("chave-heygen", "asset-audio-1", "Minha Voz");
    } catch (err) {
      recusouSemId = err instanceof AvatarProviderError;
    }
    if (!recusouSemId) {
      failures.push(
        "heygen-voice-clone: uma resposta de clonagem sem `voice_clone_id` NÃO foi recusada — sem ele não há " +
          "como consultar o status nem usar a voz depois, e o dinheiro já foi cobrado.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal3;
    if (modoOriginal3 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal3;
  }

  // ---------------------------------------------------------------------------
  // 2. readHeygenVoiceCloneStatus — mapeamento de status, nunca declara
  //    pronto por engano.
  // ---------------------------------------------------------------------------
  const fetchOriginal4 = globalThis.fetch;
  const modoOriginal4 = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    const casos: [string, string][] = [
      ["pending", "pending"],
      ["processing", "processing"],
      ["complete", "complete"],
      ["completed", "complete"],
      ["failed", "failed"],
      ["algo-nunca-visto", "processing"],
    ];
    for (const [bruto, esperado] of casos) {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ data: { status: bruto } }), { status: 200 })) as typeof fetch;
      const status = await readHeygenVoiceCloneStatus("chave-heygen", "clone-1");
      if (status !== esperado) {
        failures.push(
          `heygen-voice-clone: readHeygenVoiceCloneStatus("${bruto}") devolveu "${status}", esperado "${esperado}" — ` +
            (esperado === "processing" && bruto !== "processing"
              ? "um valor desconhecido do fornecedor precisa cair em processing, nunca em pronto por engano."
              : ""),
        );
      }
    }
  } finally {
    globalThis.fetch = fetchOriginal4;
    if (modoOriginal4 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal4;
  }

  // ---------------------------------------------------------------------------
  // 3. deleteVoiceHeygen — chama o DELETE certo; 404 vira sucesso.
  // ---------------------------------------------------------------------------
  const fetchOriginal5 = globalThis.fetch;
  const modoOriginal5 = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metodoUsado: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let urlUsada: any = null;
    globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
      urlUsada = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
      metodoUsado = (init as { method?: string } | undefined)?.method ?? null;
      return new Response(JSON.stringify({ data: { voice_id: "voz-1" } }), { status: 200 });
    }) as typeof fetch;
    await deleteVoiceHeygen("chave-heygen", "voz-1");
    if (metodoUsado !== "DELETE" || !urlUsada?.includes("/v3/voices/voz-1")) {
      failures.push(
        `heygen-voice-clone: deleteVoiceHeygen não chamou DELETE /v3/voices/{id} — método ${metodoUsado}, url ${urlUsada}.`,
      );
    }

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 })) as typeof fetch;
    let lancouEm404 = false;
    try {
      await deleteVoiceHeygen("chave-heygen", "voz-ja-apagada");
    } catch {
      lancouEm404 = true;
    }
    if (lancouEm404) {
      failures.push(
        "heygen-voice-clone: deleteVoiceHeygen lançou num 404 — a voz já não existe, que é o efeito desejado; " +
          "recusar uma segunda tentativa de apagar a mesma voz não tem razão de negócio nenhuma.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal5;
    if (modoOriginal5 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal5;
  }

  // ---------------------------------------------------------------------------
  // 4. countHeygenVoiceSlots — a contagem é o TAMANHO da listagem real,
  //    nunca uma constante local.
  // ---------------------------------------------------------------------------
  const fetchOriginal6 = globalThis.fetch;
  const modoOriginal6 = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ voice_id: "v1" }, { voice_id: "v2" }, { voice_id: "v3" }] }),
        { status: 200 },
      )) as typeof fetch;
    const contagem = await countHeygenVoiceSlots("chave-heygen");
    if (contagem !== 3) {
      failures.push(`heygen-voice-clone: countHeygenVoiceSlots devolveu ${contagem}, esperado 3 (o tamanho da lista).`);
    }

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { not: "an array" } }), { status: 200 })) as typeof fetch;
    let recusouFormaErrada = false;
    try {
      await countHeygenVoiceSlots("chave-heygen");
    } catch (err) {
      recusouFormaErrada = err instanceof AvatarProviderError;
    }
    if (!recusouFormaErrada) {
      failures.push(
        "heygen-voice-clone: countHeygenVoiceSlots não recusou uma resposta cuja `data` não é um array — a " +
          "contagem de slots existe para ser confiável, não para propagar o que o fornecedor mandar.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal6;
    if (modoOriginal6 === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal6;
  }

  if (failures.length === 0) {
    notes.push(
      "  heygen-voice-clone: cloneVoiceHeygen monta audio:{type:asset_id}/voice_name e recusa resposta sem " +
        "voice_clone_id; readHeygenVoiceCloneStatus mapeia pending/processing/complete/completed/failed " +
        "e nunca declara pronto por engano; deleteVoiceHeygen trata 404 como sucesso; " +
        "countHeygenVoiceSlots devolve o tamanho real da listagem",
    );
  }

  return { failures, notes };
}

export const MUTANTS: Mutant[] = [
  {
    guard: "heygen-voice-clone: cloneVoiceHeygen recusa resposta sem voice_clone_id",
    name: "a checagem de forma da resposta de /v3/voices/clone desaparece",
    kind: "esperto",
    // ESPERTO: `voiceCloneId` continua sendo lido — só a recusa em caso de
    // ausência é removida. Uma resposta sem `voice_clone_id` (ou vazia)
    // devolveria `{ voiceCloneId: undefined }`, e a clonagem — já paga —
    // ficaria sem como ser consultada ou usada depois.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      '  if (typeof voiceCloneId !== "string" || !voiceCloneId) {\n' +
      '    throw new AvatarProviderError(unexpectedShapeMessage("heygen.cloneVoice", "data.voice_clone_id", json));\n' +
      "  }",
    replace: "  void voiceCloneId;",
    expect: "NÃO foi recusada",
  },
  {
    guard: "heygen-voice-clone: readHeygenVoiceCloneStatus nunca declara pronto por engano",
    name: "um status desconhecido do fornecedor passa a virar complete",
    kind: "esperto",
    // ESPERTO: os três `if` explícitos continuam corretos — só o FALLBACK
    // muda de "processing" (seguro) para "complete" (perigoso). Qualquer
    // nome de status que a doc não previu passaria a liberar a voz para
    // escolha antes de ela existir de verdade no fornecedor.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '  if (bruto.startsWith("complet")) return "complete";\n  return "processing";',
    replace: '  if (bruto.startsWith("complet")) return "complete";\n  return "complete";',
    expect: 'devolveu "complete", esperado "processing"',
  },
  {
    guard: "heygen-voice-clone: deleteVoiceHeygen trata 404 como sucesso",
    name: "deleteVoiceHeygen volta a lançar em 404",
    kind: "esperto",
    // ESPERTO: o `fetchJson` da resposta 200 continua correto — só o desvio
    // do 404 desaparece, e `fetchJson` (que espera `res.ok`) lançaria para
    // uma voz que já não existe. "Apagar de novo uma voz já apagada" viraria
    // erro, sem razão de negócio nenhuma.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (res.status === 404) {\n" +
      "    // Já não existe — o log ainda registra a resposta bruta, para diagnóstico.\n" +
      '    await fetchJson(res, "HeyGen", "heygen.deleteVoice").catch(() => null);\n' +
      "    return;\n" +
      "  }",
    replace: "  void res.status;",
    expect: "lançou num 404",
  },
  {
    guard: "heygen-voice-clone: countHeygenVoiceSlots recusa uma resposta cuja data não é array",
    name: "countHeygenVoiceSlots deixa de validar a forma da listagem",
    kind: "esperto",
    // ESPERTO: `lista.length` no `return` continua ali — só a validação
    // prévia some. Contra um objeto (não array), `.length` de um objeto
    // JS é sempre `undefined`, e a contagem de slots — que existe
    // exatamente para não ser um chute — devolveria `NaN`/`undefined` sem
    // avisar ninguém.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  if (!Array.isArray(lista)) {\n" +
      '    throw new AvatarProviderError(unexpectedShapeMessage("heygen.countVoiceSlots", "data (array)", json));\n' +
      "  }\n  return lista.length;",
    replace: "  return (lista as unknown[]).length;",
    expect: "não recusou uma resposta cuja",
  },
];
