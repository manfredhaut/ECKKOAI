/**
 * O SLOT DE VOZ ROTATIVO — exclusão, reclonagem e o teto real (R6, 24/08).
 *
 * ┌─ O estado que este bloco veio consertar, MEDIDO em 24/08 ────────────────┐
 * │ 9 de 10 slots ocupados. Das 9 vozes próprias, UMA é apontada por avatar; │
 * │ as outras 8 são resíduo de teste. CINCO delas têm o mesmo nome ("TESTE   │
 * │ REAL 15:40 01/08"), então o painel do fornecedor não permite escolher o  │
 * │ que apagar — só o `voice_id` identifica.                                 │
 * │                                                                          │
 * │ E já existe um AVATAR ÓRFÃO: "Mário" aponta para `wAd9MJ2I…`, que não    │
 * │ está mais no inventário. A geração dele falha fechada e de graça, mas    │
 * │ falha — e nada no produto dizia isso.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  apagar exige o `voice_id` DIGITADO de volta, não um booleano. Um
 *       `confirm: true` é satisfeito por clique errado e por qualquer cliente
 *       automatizado; repetir o id exige ter lido QUAL voz é.
 *  G-2  apagar voz EM USO é recusado — é assim que o avatar órfão deixa de
 *       nascer. E a recusa vem ANTES do DELETE: no IVC não há desfazer.
 *  G-3  a reclonagem REAPONTA o avatar, e o UPDATE vem depois do clone. Se o
 *       reapontamento falhar, o avatar segue na voz antiga (que ainda existe)
 *       — ruim, mas íntegro.
 *  G-4  `remove_background_noise` vai SEMPRE explícito ao fornecedor, nos dois
 *       valores. Omitir deixa o default dele decidir o timbre.
 *  G-5  voz `premade` NÃO consome slot, em nenhum ponto — por execução.
 *  G-6  o teto vem do FORNECEDOR quando ele responde, com o ambiente vencendo
 *       e o default como retaguarda; ausência NUNCA vira "sem limite".
 *
 * ┌─ G-5 e G-6 por EXECUÇÃO; G-1 a G-4 por FORMA ────────────────────────────┐
 * │ As duas primeiras são funções puras e importáveis, então chamá-las é a   │
 * │ prova. As outras quatro são propriedades de handler do Fastify e de      │
 * │ corpo de FormData — exercitá-las exigiria subir a aplicação e um         │
 * │ Postgres. Leem o arquivo real, com falha nomeada quando a âncora some.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import {
  DEFAULT_VOICE_SLOT_LIMIT,
  countOwnedVoices,
  effectiveVoiceSlotLimit,
} from "../services/voice/voiceSample.js";

const ROTA = "backend/src/routes/voice.ts";
const PROVIDER = "backend/src/services/providers/voiceProvider.ts";
const POLITICA = "backend/src/services/voice/voiceSample.ts";
const MIGRATION = "backend/src/db/migrations/064_voice_clone_samples.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "apagar voz exige o id digitado de volta",
    name: "a confirmação da exclusão vira um booleano",
    kind: "esperto",
    // ESPERTO: continua HAVENDO confirmação, e uma guarda que só perguntasse
    // "existe confirmação?" seguiria verde. O que muda é o que ela prova:
    // `confirm_voice_id !== voiceId` exige ter lido qual voz é; `!== undefined`
    // é satisfeito por qualquer corpo não vazio — inclusive o de um clique no
    // botão errado, numa lista com cinco vozes de nome idêntico.
    file: ROTA,
    find: "      if (req.body?.confirm_voice_id !== voiceId) {",
    replace: "      if (req.body?.confirm_voice_id === undefined) {",
    expect: "rotação de voz: a exclusão não compara a confirmação com o voice_id",
  },
  {
    guard: "apagar voz EM USO é recusado antes do DELETE",
    name: "a exclusão deixa de conferir se algum avatar aponta para a voz",
    kind: "obvio",
    file: ROTA,
    find: "      if (apontam.length > 0) {",
    replace: "      if (apontam.length > 999) {",
    expect: "rotação de voz: a exclusão não recusa voz em uso",
  },
  {
    guard: "a reclonagem reaponta o avatar para a voz nova",
    name: "a reclonagem clona e não reaponta",
    kind: "esperto",
    // ESPERTO: a rota continua devolvendo 201 com o `voice_id` novo, e a tela
    // mostra sucesso. O avatar é que continua apontando para a voz ANTIGA — e
    // se ela for apagada em seguida (que é o ponto do slot rotativo), o
    // avatar vira órfão exatamente no fluxo criado para evitar isso.
    file: ROTA,
    find:
      "      const { rows: updated } = await pool.query<Avatar>(\n" +
      '        "UPDATE avatars SET voice_id = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *",\n' +
      "        [avatar.id, req.tenantId, voiceId],\n" +
      "      );",
    replace:
      "      const { rows: updated } = await pool.query<Avatar>(\n" +
      '        "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",\n' +
      "        [avatar.id, req.tenantId],\n" +
      "      );",
    expect: "rotação de voz: a reclonagem não reaponta o avatar",
  },
  {
    guard: "remove_background_noise vai sempre explícito ao fornecedor",
    name: "a limpeza de ruído volta a ser omitida quando é false",
    kind: "esperto",
    // ESPERTO: parece uma economia inofensiva — "não mandar o que é false". O
    // efeito é entregar a decisão ao default do fornecedor, que pode mudar do
    // lado dele e mudaria o TIMBRE de toda clonagem nova sem uma linha de
    // diferença aqui. Mesma doutrina de DEFAULTS_NUNCA_HERDADOS no pipeline.
    file: PROVIDER,
    find: '    form.set("remove_background_noise", input.removeBackgroundNoise ? "true" : "false");',
    replace:
      '    if (input.removeBackgroundNoise) form.set("remove_background_noise", "true");',
    expect: "rotação de voz: remove_background_noise não é enviado sempre",
  },
  {
    guard: "o teto de slots vem do fornecedor, e ausência não vira sem-limite",
    name: "a leitura ausente do teto passa a valer como teto",
    kind: "esperto",
    // ESPERTO: `?? DEFAULT` parece equivalente, e é — até a leitura devolver
    // 0 ou um negativo. `0 ?? 10` é 0, e um teto zero recusa TODA clonagem;
    // um negativo faz `used >= limit` ser sempre verdade. A conferência de
    // finitude e positividade é o que separa "não sei" de "sei que é zero".
    file: POLITICA,
    find:
      "  if (typeof lido === \"number\" && Number.isFinite(lido) && lido > 0) {\n" +
      "    return { limit: Math.floor(lido), source: \"vendor\" };\n" +
      "  }",
    replace:
      "  if (typeof lido === \"number\") {\n" +
      "    return { limit: Math.floor(lido), source: \"vendor\" };\n" +
      "  }",
    expect: "rotação de voz: teto lido inválido não caiu no default",
  },
];

export interface VoiceRotationCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

function recorte(texto: string, de: string, ate: string): string | null {
  const i = texto.indexOf(de);
  if (i < 0) return null;
  const f = texto.indexOf(ate, i);
  return f < 0 ? texto.slice(i) : texto.slice(i, f);
}

export async function checkVoiceRotationPolicy(): Promise<VoiceRotationCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const rota = lerDaRaiz(ROTA);

  // -------------------------------------------------------------------------
  // G-1 e G-2 — a exclusão
  // -------------------------------------------------------------------------
  const exclusao = recorte(rota, '"/voice/voices/:voiceId"', '"/avatars/:id/voice-reclone"');
  if (!exclusao) {
    failures.push(
      `rotação de voz: não foi possível recortar o handler de exclusão em ${ROTA} pelas âncoras ` +
        '`"/voice/voices/:voiceId"` e `"/avatars/:id/voice-reclone"`. A guarda não pode opinar sobre um ' +
        "trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const posConfirmacao = exclusao.indexOf("confirm_voice_id !== voiceId");
    const posEmUso = exclusao.indexOf("apontam.length > 0");
    const posDelete = exclusao.indexOf("await deleteVoice(");

    if (posConfirmacao < 0) {
      failures.push(
        "rotação de voz: a exclusão não compara a confirmação com o voice_id — um booleano de " +
          "confirmação é satisfeito por um clique errado, e a conta tem CINCO vozes com o mesmo nome " +
          "(medido em 24/08). Repetir o id é o que exige ter lido qual voz está sendo apagada.",
      );
    }
    if (posEmUso < 0) {
      failures.push(
        "rotação de voz: a exclusão não recusa voz em uso — apagar uma voz que um avatar aponta cria o " +
          "avatar órfão, e ele não é hipotético: existe um hoje (\"Mário\" → `wAd9MJ2I…`, ausente do " +
          "inventário). A geração desse avatar falha fechada, mas falha.",
      );
    }
    if (posDelete < 0) {
      failures.push("rotação de voz: não achei a chamada a `deleteVoice(` dentro do handler de exclusão.");
    } else if (posConfirmacao >= 0 && posEmUso >= 0 && (posConfirmacao > posDelete || posEmUso > posDelete)) {
      failures.push(
        "rotação de voz: uma das recusas da exclusão acontece DEPOIS do DELETE — e depois não há " +
          "desfazer: no IVC o fornecedor não guarda a amostra, então a volta só existe se nós tivermos " +
          "guardado. A ordem é a propriedade, não a existência da recusa.",
      );
    } else if (failures.length === 0) {
      notes.push(
        "    rotação de voz: apagar exige o voice_id digitado de volta e recusa voz em uso, as duas ANTES do DELETE",
      );
    }
  }

  // -------------------------------------------------------------------------
  // G-3 — a reclonagem reaponta, e depois do clone
  // -------------------------------------------------------------------------
  const reclonagem = recorte(rota, '"/avatars/:id/voice-reclone"', "\n}\n");
  if (!reclonagem) {
    failures.push(
      `rotação de voz: não foi possível recortar o handler de reclonagem em ${ROTA} pela âncora ` +
        '`"/avatars/:id/voice-reclone"`.',
    );
  } else {
    const posClone = reclonagem.indexOf("await cloneVoice({");
    const posUpdate = reclonagem.indexOf("UPDATE avatars SET voice_id");
    if (posUpdate < 0) {
      failures.push(
        "rotação de voz: a reclonagem não reaponta o avatar — ela clonaria uma voz nova, devolveria 201, " +
          "e o avatar continuaria na voz ANTIGA. Apagar a antiga em seguida (que é o ponto do slot " +
          "rotativo) o deixaria órfão exatamente no fluxo criado para evitar isso.",
      );
    } else if (posClone < 0) {
      failures.push("rotação de voz: não achei `await cloneVoice({` dentro do handler de reclonagem.");
    } else if (posUpdate < posClone) {
      failures.push(
        "rotação de voz: a reclonagem reaponta ANTES de ter a voz nova — o avatar passaria a apontar " +
          "para um id que ainda não existe se a clonagem falhasse depois.",
      );
    } else {
      notes.push("    rotação de voz: a reclonagem clona e só então reaponta o avatar");
    }
  }

  // -------------------------------------------------------------------------
  // G-4 — o campo vai sempre
  // -------------------------------------------------------------------------
  const provider = lerDaRaiz(PROVIDER);
  if (!provider.includes('form.set("remove_background_noise", input.removeBackgroundNoise ? "true" : "false")')) {
    failures.push(
      "rotação de voz: remove_background_noise não é enviado sempre — omiti-lo quando é `false` entrega " +
        "a decisão ao default do fornecedor, e um default que mude do lado dele mudaria o TIMBRE de toda " +
        "clonagem nova sem uma linha de diferença deste lado.",
    );
  } else {
    notes.push("    rotação de voz: remove_background_noise vai explícito nos dois valores");
  }

  // -------------------------------------------------------------------------
  // G-5 — premade não consome slot, por EXECUÇÃO
  // -------------------------------------------------------------------------
  const inventario = [
    { category: "cloned" },
    { category: "premade" },
    { category: "premade" },
    { category: "professional" },
  ];
  const owned = countOwnedVoices(inventario);
  if (owned !== 2) {
    failures.push(
      `rotação de voz: countOwnedVoices devolveu ${owned} para 1 cloned + 2 premade + 1 professional, ` +
        "esperado 2. Contar a biblioteca `premade` do fornecedor foi o defeito de 04/08 — 25 contra 4 — e " +
        "ele recusou uma clonagem legítima com \"25 de 10 vozes em uso\".",
    );
  } else {
    notes.push("    rotação de voz: voz `premade` não consome slot (1 cloned + 1 professional = 2 de 4)");
  }

  // -------------------------------------------------------------------------
  // G-6 — a precedência do teto, por EXECUÇÃO
  // -------------------------------------------------------------------------
  const semEnv = {} as NodeJS.ProcessEnv;
  const doVendor = effectiveVoiceSlotLimit(30, semEnv);
  const semLeitura = effectiveVoiceSlotLimit(null, semEnv);
  const leituraInvalida = effectiveVoiceSlotLimit(0, semEnv);
  const comEnv = effectiveVoiceSlotLimit(30, { ELEVENLABS_VOICE_SLOTS: "3" } as NodeJS.ProcessEnv);

  if (doVendor.limit !== 30 || doVendor.source !== "vendor") {
    failures.push(
      `rotação de voz: o teto lido do fornecedor não venceu o default — ${JSON.stringify(doVendor)}, ` +
        'esperado {limit:30,source:"vendor"}. O teto foi palpite por meses; agora o fornecedor responde ' +
        "(200, `voice_limit`), e ignorá-lo devolveria o produto ao palpite.",
    );
  }
  if (semLeitura.limit !== DEFAULT_VOICE_SLOT_LIMIT || semLeitura.source !== "default") {
    failures.push(
      `rotação de voz: leitura ausente não caiu no default — ${JSON.stringify(semLeitura)}. "Não consegui ` +
        'perguntar" jamais pode virar "sem limite": o recurso protegido é irreversível.',
    );
  }
  if (leituraInvalida.limit !== DEFAULT_VOICE_SLOT_LIMIT) {
    failures.push(
      `rotação de voz: teto lido inválido não caiu no default — \`effectiveVoiceSlotLimit(0)\` devolveu ` +
        `${JSON.stringify(leituraInvalida)}. Um teto zero recusa TODA clonagem, e um negativo faria ` +
        "`used >= limit` ser sempre verdade.",
    );
  }
  if (comEnv.limit !== 3 || comEnv.source !== "env") {
    failures.push(
      `rotação de voz: o teto do AMBIENTE não venceu a leitura do fornecedor — ${JSON.stringify(comEnv)}, ` +
        'esperado {limit:3,source:"env"}. Um operador que fixou um teto MENOR que o do plano está se ' +
        "protegendo de propósito, e deixar a leitura sobrepor isso desfaria o freio dele sem aviso.",
    );
  }
  if (failures.length === 0) {
    notes.push(
      "    rotação de voz: teto por precedência — ambiente (3) vence fornecedor (30) vence default " +
        `(${DEFAULT_VOICE_SLOT_LIMIT}); leitura ausente ou inválida cai no default`,
    );
  }

  // -------------------------------------------------------------------------
  // A migration guarda a amostra, e a exclusão NÃO a apaga junto
  // -------------------------------------------------------------------------
  let migration = "";
  try {
    migration = lerDaRaiz(MIGRATION);
  } catch {
    migration = "";
  }
  if (!migration.includes("voice_clone_samples") || !migration.includes("normalized_url")) {
    failures.push(
      `rotação de voz: ${MIGRATION} não cria \`voice_clone_samples\` com \`normalized_url\` — sem a ` +
        "amostra guardada, apagar uma voz é perda definitiva: o ElevenLabs não devolve o áudio no IVC " +
        "(só no PVC, que exige plano Creator, e a conta é `starter`).",
    );
  } else {
    notes.push("    rotação de voz: a migration 064 guarda o áudio de origem de cada clonagem");
  }

  if (exclusao && /DELETE FROM voice_clone_samples/.test(exclusao)) {
    failures.push(
      "rotação de voz: a exclusão apaga a amostra em cascata — isso transforma a limpeza de um slot " +
        "numa perda definitiva do áudio, e é exatamente o que a tabela existe para impedir. A linha da " +
        "amostra é o que permite reclonar a voz depois.",
    );
  }

  return { failures, notes };
}
