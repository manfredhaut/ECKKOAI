/**
 * P2-1, VERSÃO FINAL — a ficha de identidade, a equivalência com o avatar
 * ao vivo, e a decisão de voz.
 *
 *  G-1  capturarIdentidade grava CRU — sem conversão.
 *  G-2  lerIdentidade: ausente/versão desconhecida/forma corrompida → null.
 *  G-3  resolverIdentidade: EQUIVALÊNCIA — para qualquer combinação de
 *       valores (incl. todos NULL, 0, string do driver, mistura), resolver
 *       da ficha é IDÊNTICO a voiceTuningDoAvatar com os mesmos valores.
 *  G-4  decidirVoz: tabela-verdade completa.
 *  G-5  as 5 rotas usam a ficha (identidade.voiceId/.voiceTuning/.photoUrls),
 *       nunca avatar.voice_id/photo_urls direto.
 *  G-6  precisaChecarVozAntesDeNarrar NUNCA exclui pela existência de áudio
 *       — CORREÇÃO, 22/09/2026 (item 1). Excluir faria `decidirVoz` receber
 *       `vozExiste: null` com a voz já apagada, e cair no ramo "confia"
 *       (sintetizar) em vez de reaproveitar o áudio pronto.
 *  G-7  o DELETE de foto nunca apaga um caminho ainda referenciado por
 *       alguma ficha.
 *
 * Custo: ZERO — G-1 a G-6 são puras, sem banco/rede. G-7 é leitura de forma.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import {
  capturarIdentidade,
  lerIdentidade,
  resolverIdentidade,
  decidirVoz,
  precisaChecarVozAntesDeNarrar,
  type DecidirVozInput,
  type DecisaoDeVoz,
} from "../services/video/frozenIdentity.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import type { Avatar } from "../types.js";

const MODULO = "backend/src/services/video/frozenIdentity.ts";
const ROTA = "backend/src/routes/videos.ts";
const ROTA_AVATARS = "backend/src/routes/avatars.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "capturarIdentidade grava CRU — sem conversão",
    name: "(i) capturarIdentidade converte com Number()",
    kind: "esperto",
    file: MODULO,
    find: "      stability: avatar.voice_stability,",
    replace: "      stability: Number(avatar.voice_stability),",
    // A mensagem exata do G-1 abaixo — antes divergia ("gravou um valor
    // convertido" vs. "converteu o valor cru"), o que fazia o mutante
    // reprovar pela razão CERTA mas ser classificado como AMBÍGUO por causa
    // de um `expect` que não citava a frase real.
    expect: "capturarIdentidade: converteu o valor cru",
  },
  {
    guard: "capturarIdentidade grava CRU — sem conversão",
    name: "(ii) capturarIdentidade introduz default com ??",
    kind: "esperto",
    // `?? false` só diverge do valor cru quando o valor é `null`/`undefined`
    // — testado com um avatar cujo `voice_speaker_boost` é `null` (G-1
    // abaixo). Testar só com `false` (o caso comum) tornaria esta mutação
    // INERTE por construção: `false ?? false` é `false` de qualquer jeito.
    file: MODULO,
    find: "      speaker_boost: avatar.voice_speaker_boost,",
    replace: "      speaker_boost: avatar.voice_speaker_boost ?? false,",
    expect: "capturarIdentidade: gravou um valor com default embutido",
  },
  {
    guard: "resolverIdentidade monta o voiceTuning SÓ por voiceTuningDoAvatar",
    name: "(iii) resolverIdentidade converte por conta própria na leitura",
    kind: "esperto",
    // `Number(x)` sozinho seria INERTE aqui — `voiceTuningDoAvatar` já
    // aplica `Number()` internamente, e `Number(Number(x)) === Number(x)`
    // para qualquer entrada (idempotente). `|| 0.5` é o que torna a
    // conversão própria OBSERVÁVEL: diverge exatamente no caso "0 explícito"
    // de G-3 (0 é falsy, e `0 || 0.5` vira 0.5).
    file: MODULO,
    find: "      voice_stability: ficha.voice_tuning.stability,",
    replace: "      voice_stability: Number(ficha.voice_tuning.stability) || 0.5,",
    // O texto real é `resolverIdentidade [<caso>]: divergiu de
    // voiceTuningDoAvatar — esperado {...}, recebi {...}.` (G-3, um por
    // caso do loop de equivalência) — sem o nome do caso entre colchetes,
    // que muda a cada execução, o substring comum e estável é este.
    expect: "divergiu de voiceTuningDoAvatar",
  },
  {
    guard: "resolverIdentidade usa a ficha quando ela é válida",
    name: "(iv) resolverIdentidade sempre devolve ao_vivo",
    kind: "obvio",
    // `const ficha = null;` quebraria o `tsc` (o resto da função lê
    // `ficha.voice_id`/`ficha.voice_tuning` no ramo `else`, e o tipo
    // colapsaria para `null`) — mesmo gotcha já documentado neste projeto
    // ("mutante que não compila vira AMBÍGUO, não reprovação real").
    // `String(1) !== "sentinela"` é sempre VERDADEIRO em tempo de EXECUÇÃO
    // (força o ramo `if` — "sem ficha" — a rodar sempre, mesmo com ficha
    // válida) sem estreitar o TIPO de `ficha` para `null` como um `true`
    // literal faria.
    file: MODULO,
    find: "  if (!ficha) {",
    replace: "  if (!ficha || String(1) !== \"sentinela\") {",
    expect: "resolverIdentidade [",
  },
  {
    guard: "decidirVoz só reaproveita quando a voz FOI apagada (vozExiste===false)",
    name: "(v) decidirVoz reaproveita mesmo com a voz existindo",
    kind: "esperto",
    file: MODULO,
    find: "  if (input.vozExiste !== false) return \"sintetizar\";",
    replace: "  if (input.vozExiste === true) return \"reaproveitar\";",
    expect: "decidirVoz",
  },
  {
    guard: "o estorno só acontece DEPOIS do UPDATE condicional mudar a linha",
    name: "(vi) estorna antes/sem checar se o UPDATE mudou a linha",
    kind: "esperto",
    // Estática, por FORMA (leitura de arquivo, G-8 abaixo) — a função vive
    // dentro do closure de `videoRoutes()`, não é chamável isolada por um
    // teste de execução sem subir o Fastify inteiro. Mesma técnica já usada
    // por outras guardas deste projeto para lógica presa a uma rota.
    file: ROTA,
    find: "    let estornado = false;\n    if ((rowCount ?? 0) > 0) {",
    replace: "    let estornado = false;\n    if (true) {",
    expect: "frozen_voice_unavailable: routes/videos.ts não confere mais",
  },
  {
    guard: "DELETE de foto nunca apaga um caminho ainda referenciado por alguma ficha",
    name: "(vii) apaga a foto mesmo com ficha referenciando",
    kind: "esperto",
    // Estática, por FORMA (G-9 abaixo) — mesmo motivo do (vi): rota Fastify,
    // não isolável para execução direta.
    file: ROTA_AVATARS,
    find: "      if (aindaReferenciada.length > 0) {\n        return atualizado.rows[0];\n      }",
    replace: "      if (false) {\n        return atualizado.rows[0];\n      }",
    expect: "identity_snapshot: DELETE /avatars/:id/photos/:index não confere mais",
  },
  {
    guard: "as 5 rotas de refazer usam a ficha, nunca avatar.voice_id/photo_urls direto",
    name: "(viii) uma rota volta a ler avatar.voice_id/voiceTuningDoAvatar(avatar) direto",
    kind: "obvio",
    // Âncora ÚNICA: `/resume-blocks` é a única das 5 chamadas cujo par
    // `voiceId`/`voiceTuning` é imediatamente antecedido por
    // `apiKeyElevenLabs: voiceCredential.apiKey,` — as outras 4 usam
    // `apiKeyElevenLabs,` (variável já desestruturada), então este trecho é
    // exclusivo desta rota, apesar da indentação (12 espaços) coincidir com
    // a de /redo-video.
    file: ROTA,
    find:
      "            apiKeyElevenLabs: voiceCredential.apiKey,\n" +
      "            voiceId: identidade.voiceId,\n" +
      "            voiceTuning: identidade.voiceTuning,",
    replace:
      "            apiKeyElevenLabs: voiceCredential.apiKey,\n" +
      "            voiceId: avatar.voice_id ?? \"\",\n" +
      "            voiceTuning: voiceTuningDoAvatar(avatar),",
    expect: "voz",
  },
  {
    guard: "precisaChecarVozAntesDeNarrar nunca é usada com exclusão por áudio existente",
    name: "(ix) reintroduz a exclusão por áudio existente (CORREÇÃO, 22/09/2026)",
    kind: "esperto",
    // ESPERTO: em quase todo caso comum (voz não trocou) o resultado é
    // idêntico — só o caso EXATO da correção (voz trocou, está apagada, E
    // já existe áudio) muda: sem o mutante, `decidirVoz` recebe
    // `vozExiste: false` e devolve "reaproveitar"; com o mutante, a
    // checagem é pulada, `vozExiste` fica `null`, e `decidirVoz` devolve
    // "sintetizar" — tentando narrar de novo com uma voz que não existe.
    file: ROTA,
    find: "    if (precisaChecar) {",
    replace: "    if (precisaChecar && !audioExistente) {",
    expect: "frozen_voice",
  },
];

export interface FrozenIdentityCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf8").replace(/\r\n/g, "\n");
}

const AVATAR_BASE = { voice_id: "voice-atual", photo_urls: ["x.jpg"] };

interface Caso {
  nome: string;
  stability: unknown;
  similarity_boost: unknown;
  style: unknown;
  speaker_boost: unknown;
}
const CASOS: Caso[] = [
  { nome: "todos NULL", stability: null, similarity_boost: null, style: null, speaker_boost: null },
  { nome: "0 explícito", stability: 0, similarity_boost: 0, style: 0, speaker_boost: false },
  { nome: "0.5 numérico", stability: 0.5, similarity_boost: 0.75, style: 0.3, speaker_boost: true },
  { nome: '"0.50" string (driver)', stability: "0.50", similarity_boost: "0.75", style: "0.30", speaker_boost: true },
  { nome: "speaker_boost NULL", stability: 0.4, similarity_boost: 0.6, style: 0.1, speaker_boost: null },
  { nome: "mistura", stability: null, similarity_boost: 0.9, style: null, speaker_boost: false },
];

export async function checkFrozenIdentityPolicy(repoRoot: string): Promise<FrozenIdentityCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1/G-2: captura crua + validação da ficha -------------------------
  const avatarDeProva = {
    ...AVATAR_BASE,
    voice_stability: "0.31",
    voice_similarity_boost: 0.62,
    voice_style: 0.17,
    voice_speaker_boost: false,
    audio_treatment_enabled: true,
    audio_treatment_target_lufs: -16,
  } as unknown as Parameters<typeof capturarIdentidade>[0];
  const ficha = capturarIdentidade(avatarDeProva);
  if (ficha.voice_tuning.stability !== "0.31") {
    failures.push(`capturarIdentidade: converteu o valor cru — esperado "0.31", recebi ${JSON.stringify(ficha.voice_tuning.stability)}.`);
  }
  // Mutante (ii): "?? false" só diverge do valor cru quando ele é
  // null/undefined — testar só com `false` (o caso comum) seria INERTE por
  // construção (`false ?? false` é `false` de qualquer jeito).
  const avatarComSpeakerBoostNull = { ...avatarDeProva, voice_speaker_boost: null } as unknown as Parameters<
    typeof capturarIdentidade
  >[0];
  const fichaComNull = capturarIdentidade(avatarComSpeakerBoostNull);
  if (fichaComNull.voice_tuning.speaker_boost !== null) {
    failures.push(
      `capturarIdentidade: gravou um valor com default embutido em vez do NULL cru do avatar — recebi ` +
        `${JSON.stringify(fichaComNull.voice_tuning.speaker_boost)}.`,
    );
  }
  for (const [nome, valor] of [
    ["ausente", null],
    ["versão desconhecida", { ...ficha, v: 2 }],
    ["forma corrompida (sem voice_tuning)", { v: 1, photo_urls: [], captured_at: "x" }],
  ] as const) {
    if (lerIdentidade(valor) !== null) {
      failures.push(`lerIdentidade [${nome}]: deveria devolver null e não devolveu.`);
    }
  }
  if (lerIdentidade(ficha) === null) {
    failures.push("lerIdentidade: uma ficha válida foi rejeitada.");
  }

  // --- G-3: EQUIVALÊNCIA, para cada caso -----------------------------------
  for (const caso of CASOS) {
    const video = {
      identity_snapshot: {
        v: 1,
        photo_urls: ["a.jpg", "b.jpg"],
        voice_id: "voice-congelada",
        voice_tuning: { stability: caso.stability, similarity_boost: caso.similarity_boost, style: caso.style, speaker_boost: caso.speaker_boost },
        audio_treatment: { enabled: true, target_lufs: -16 },
        captured_at: "2026-09-22T00:00:00.000Z",
      },
    };
    const resolvido = resolverIdentidade(video, avatarDeProva as unknown as Parameters<typeof resolverIdentidade>[1]);
    const esperado = voiceTuningDoAvatar({
      voice_stability: caso.stability,
      voice_similarity_boost: caso.similarity_boost,
      voice_style: caso.style,
      voice_speaker_boost: caso.speaker_boost,
    } as Pick<Avatar, "voice_stability" | "voice_similarity_boost" | "voice_style" | "voice_speaker_boost">);
    if (JSON.stringify(resolvido.voiceTuning) !== JSON.stringify(esperado)) {
      failures.push(`resolverIdentidade [${caso.nome}]: divergiu de voiceTuningDoAvatar — esperado ${JSON.stringify(esperado)}, recebi ${JSON.stringify(resolvido.voiceTuning)}.`);
    }
  }
  const semFicha = resolverIdentidade(
    { identity_snapshot: null },
    avatarDeProva as unknown as Parameters<typeof resolverIdentidade>[1],
  );
  if (semFicha.origem !== "ao_vivo" || JSON.stringify(semFicha.voiceTuning) !== JSON.stringify(voiceTuningDoAvatar(avatarDeProva as never))) {
    failures.push("resolverIdentidade: sem ficha não caiu no avatar ao vivo, idêntico.");
  }

  // --- G-4: tabela-verdade de decidirVoz ------------------------------------
  const TABELA: { entrada: DecidirVozInput; esperado: DecisaoDeVoz }[] = [
    { entrada: { origem: "ao_vivo", voiceIdCongelada: null, voiceIdAtual: "v1", vozExiste: null, temAudioReutilizavel: false, rotaJaReaproveita: false }, esperado: "sintetizar" },
    { entrada: { origem: "congelada", voiceIdCongelada: "v1", voiceIdAtual: "v1", vozExiste: null, temAudioReutilizavel: false, rotaJaReaproveita: false }, esperado: "sintetizar" },
    { entrada: { origem: "congelada", voiceIdCongelada: "v0", voiceIdAtual: "v1", vozExiste: true, temAudioReutilizavel: false, rotaJaReaproveita: false }, esperado: "sintetizar" },
    { entrada: { origem: "congelada", voiceIdCongelada: "v0", voiceIdAtual: "v1", vozExiste: true, temAudioReutilizavel: true, rotaJaReaproveita: false }, esperado: "sintetizar" },
    { entrada: { origem: "congelada", voiceIdCongelada: "v0", voiceIdAtual: "v1", vozExiste: false, temAudioReutilizavel: true, rotaJaReaproveita: false }, esperado: "reaproveitar" },
    { entrada: { origem: "congelada", voiceIdCongelada: "v0", voiceIdAtual: "v1", vozExiste: false, temAudioReutilizavel: false, rotaJaReaproveita: false }, esperado: "bloquear_e_estornar" },
    { entrada: { origem: "congelada", voiceIdCongelada: "v0", voiceIdAtual: "v1", vozExiste: false, temAudioReutilizavel: false, rotaJaReaproveita: true }, esperado: "reaproveitar" },
    { entrada: { origem: "ao_vivo", voiceIdCongelada: null, voiceIdAtual: "v1", vozExiste: null, temAudioReutilizavel: true, rotaJaReaproveita: true }, esperado: "reaproveitar" },
  ];
  for (const { entrada, esperado } of TABELA) {
    const decisao = decidirVoz(entrada);
    if (decisao !== esperado) {
      failures.push(`decidirVoz(${JSON.stringify(entrada)}): esperado "${esperado}", recebi "${decisao}".`);
    }
  }

  // --- G-5: as 5 rotas usam a ficha, por FORMA ------------------------------
  const rota = lerDaRaiz(repoRoot, ROTA);
  const usosDaFicha = (rota.match(/voiceId: identidade\.voiceId,/g) ?? []).length;
  if (usosDaFicha !== 5) {
    failures.push(`identidade: as rotas de refazer não usam identidade.voiceId (achei ${usosDaFicha} de 5).`);
  }

  // --- G-6: precisaChecarVozAntesDeNarrar nunca exclui por áudio existente -
  // CORREÇÃO, item 1: a função (pura, sem parâmetro de áudio) já garante
  // isso por CONSTRUÇÃO — testada aqui com o caso EXATO que motivou a
  // correção (voz trocou; sem esta chamada saber de áudio, ela teria de
  // devolver `true` de qualquer forma).
  const precisa = precisaChecarVozAntesDeNarrar({
    origem: "congelada",
    voiceIdCongelada: "v0",
    voiceIdAtual: "v1",
    rotaJaReaproveita: false,
  });
  if (!precisa) {
    failures.push("precisaChecarVozAntesDeNarrar: deveria pedir checagem quando a voz mudou (independente de haver áudio existente).");
  }
  // E, por FORMA: a rota não pode ter reintroduzido uma exclusão por áudio
  // ao redor da chamada — ausência de código, mesma técnica de outras
  // guardas deste projeto para lógica que vive dentro de um closure de rota.
  if (!rota.includes("if (precisaChecar) {")) {
    failures.push(
      "frozen_voice: routes/videos.ts não tem mais `if (precisaChecar) {` isolado — alguma condição extra " +
        "(provavelmente ligada a áudio existente) foi adicionada, reabrindo o bug corrigido no item 1.",
    );
  }

  // --- G-7: leitura de forma — DELETE de foto respeita a ficha -------------
  const avatarsRoute = lerDaRaiz(repoRoot, ROTA_AVATARS);
  if (!avatarsRoute.includes("identity_snapshot -> 'photo_urls' @> to_jsonb(")) {
    failures.push("identity_snapshot: DELETE /avatars/:id/photos/:index não confere mais se alguma ficha referencia o caminho antes de apagar o arquivo.");
  }
  // A CONSULTA sozinha não basta — precisa also do PORTÃO que a usa (mutante
  // (vii) só toca esta linha, nunca a consulta acima).
  if (!avatarsRoute.includes("if (aindaReferenciada.length > 0) {")) {
    failures.push(
      "identity_snapshot: DELETE /avatars/:id/photos/:index não confere mais se alguma ficha referencia o " +
        "caminho antes de apagar o arquivo — a consulta existe, mas o portão que a usa sumiu.",
    );
  }

  // --- G-8: o estorno só roda DEPOIS do UPDATE condicional mudar a linha ---
  // (vi) — mesma técnica de forma: `resolverNarracaoOuBloquear` vive no
  // closure de `videoRoutes()`, não isolável para execução direta.
  if (!rota.includes("if ((rowCount ?? 0) > 0) {")) {
    failures.push(
      "frozen_voice_unavailable: routes/videos.ts não confere mais se o UPDATE condicional mudou a linha " +
        "antes de estornar — um clique duplo (ou uma corrida já noutro estado) poderia estornar sem o UPDATE " +
        "ter mudado nada.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    identidade: capturarIdentidade grava cru, lerIdentidade recusa formato desconhecido, " +
        `${CASOS.length} casos de equivalência (todos NULL, 0, numérico, string do driver, speaker_boost ` +
        `NULL, mistura) são IDÊNTICOS a voiceTuningDoAvatar, ${TABELA.length} linhas da tabela-verdade de ` +
        "decidirVoz batem, as 5 rotas usam só a ficha, precisaChecarVozAntesDeNarrar nunca exclui por " +
        "áudio existente, e o DELETE de foto respeita a ficha",
    );
  }

  return { failures, notes };
}
