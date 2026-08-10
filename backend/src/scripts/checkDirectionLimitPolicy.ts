/**
 * Três invariantes que sobraram do bloco TRADUCAO-1, e que têm em comum o fato
 * de protegerem contra o silêncio:
 *
 *  1. O teto da INTERPRETAÇÃO recusa no servidor, e não corta. Ele existia só
 *     como `maxLength` de um `<textarea>` — sugestão ao navegador, que qualquer
 *     cliente ignora.
 *  2. O aviso de que a LEGENDA é irreversível está na tela, nos dois idiomas.
 *     Sem ele, quem escolhe descobre que a escolha não se desfaz quando já
 *     pagou para descobrir.
 *  3. O corpo enviado ao ElevenLabs leva `voice_settings`. Sem ele a fala volta
 *     ao ritmo guardado no painel do fornecedor — global, editável fora do
 *     produto, sem rastro — e o sintoma é uma duração diferente sem nenhuma
 *     mudança no nosso código.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  MOTION_PROMPT_MAX_CHARS,
  exceedsMotionPromptLimit,
  normalizeScene,
} from "../services/providers/videoScene.js";
import { buildSynthesisBody, VOICE_SPEED, ELEVENLABS_TTS_MODEL } from "../services/providers/voiceProvider.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "interpretação: acima do teto RECUSA, nunca corta",
    name: "o teto da interpretação passa a cortar em vez de recusar",
    kind: "obvio",
    // O texto some sem aviso e a geração segue. O avatar recebe meia direção —
    // que não é uma direção menor, é outra direção — e o vídeo sai cobrado.
    file: "backend/src/services/providers/videoScene.ts",
    find: "  return (motionPrompt?.trim().length ?? 0) > MOTION_PROMPT_MAX_CHARS;",
    replace: "  return false;",
    // A frase COMO ELA SAI. O campo dizia "passou" e a guarda escreve
    // "passaram" — o arnês casa literal, e uma reprovação que não se consegue
    // atribuir à guarda não prova nada. Mesmo tropeço já corrigido no bloco
    // anterior, no `expect` da seleção de URL legendada.
    expect: "passaram pelo portão",
  },
  {
    guard: "interpretação: acima do teto RECUSA, nunca corta",
    name: "a normalização da cena passa a truncar a interpretação",
    kind: "esperto",
    // Continua havendo teto, continua havendo recusa acima dele — só que nada
    // chega acima dele, porque o texto é cortado antes de ser medido. A guarda
    // pega porque mede a cena NORMALIZADA contra o texto original.
    file: "backend/src/services/providers/videoScene.ts",
    find: "  const motion = input.motionPrompt?.trim();",
    replace: "  const motion = input.motionPrompt?.trim().slice(0, MOTION_PROMPT_MAX_CHARS);",
    expect: "a normalização cortou a interpretação",
  },
  {
    guard: "legenda: a tela diz que a escolha não se desfaz sem pagar de novo",
    name: "o aviso de legenda irreversível some da tela",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find: '              {t("createVideo.generate.captionsIrreversible")}',
    replace: "",
    expect: "o aviso de que a legenda é irreversível",
  },
  {
    guard: "voz: o corpo leva a velocidade medida",
    name: "o corpo do ElevenLabs sai sem voice_settings",
    kind: "esperto",
    // O áudio continua saindo, a voz continua sendo a certa, o custo é o mesmo.
    // O que muda é o RITMO: sem o campo, vale o que estiver guardado no painel
    // do fornecedor, que ninguém deste lado controla nem registra. E a régua de
    // custo continua dividindo por 0.85, então a estimativa passa a errar.
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "  if (supportsSpeed(modelId)) {\n    body.voice_settings = { speed: VOICE_SPEED };\n  }",
    replace: "",
    expect: "o corpo da síntese saiu sem `voice_settings`",
  },
];

export interface DirectionLimitCheckResult {
  failures: string[];
  notes: string[];
}

const PASSO_GERAR = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

export function checkDirectionLimitPolicy(repoRoot: string): DirectionLimitCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. A fronteira do teto, pelos dois lados.
  // ---------------------------------------------------------------------------
  const casos: { chars: number; recusa: boolean; porque: string }[] = [
    { chars: 0, recusa: false, porque: "sem interpretação é o caso normal deste produto" },
    { chars: 120, recusa: false, porque: "uma direção comum tem de passar" },
    { chars: MOTION_PROMPT_MAX_CHARS, recusa: false, porque: "o último caractere que cabe tem de passar" },
    { chars: MOTION_PROMPT_MAX_CHARS + 1, recusa: true, porque: "o primeiro que estoura tem de recusar" },
  ];
  for (const caso of casos) {
    const recusou = exceedsMotionPromptLimit("x".repeat(caso.chars));
    if (recusou !== caso.recusa) {
      failures.push(
        `interpretação: ${caso.chars} caracteres ${recusou ? "foram recusados" : "passaram pelo portão"} ` +
          `e ${caso.porque}. O teto é ${MOTION_PROMPT_MAX_CHARS}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. A normalização NÃO corta.
  //
  // Medida contra o texto original: se a cena normalizada for mais curta que o
  // que entrou (fora o `trim`), alguém pôs um corte no caminho — e um corte
  // aqui apaga o defeito do item 1 sem apagar a guarda dele, porque nada
  // chegaria acima do teto para ser recusado.
  // ---------------------------------------------------------------------------
  const longo = "m".repeat(MOTION_PROMPT_MAX_CHARS + 50);
  const cena = normalizeScene({ background: null, motionPrompt: longo, expressiveness: null });
  if ((cena.motionPrompt?.length ?? 0) !== longo.length) {
    failures.push(
      `interpretação: a normalização cortou a interpretação — entraram ${longo.length} caracteres e ` +
        `saíram ${cena.motionPrompt?.length ?? 0}. Ela normaliza (trim) e nada mais; quem recusa é o ` +
        "portão de prontidão, e cortar aqui faria a recusa nunca acontecer.",
    );
  }
  // E o `trim` continua acontecendo — sem ele, espaço no fim contaria para o teto.
  const comEspacos = normalizeScene({ background: null, motionPrompt: "  direção  ", expressiveness: null });
  if (comEspacos.motionPrompt !== "direção") {
    failures.push(
      `interpretação: a normalização deixou de aparar espaços — recebi ${JSON.stringify(comEspacos.motionPrompt)}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. O aviso de legenda irreversível, na tela e nos dois idiomas.
  // ---------------------------------------------------------------------------
  const passoGerar = readFileSync(path.join(repoRoot, PASSO_GERAR), "utf8");
  // A CHAMADA a `t(...)`, e não a menção da chave: o arquivo comenta a decisão
  // logo acima, e uma busca pelo nome da chave casaria o comentário. É a
  // armadilha que já produziu sete guardas inertes neste diretório.
  if (!/\{t\("createVideo\.generate\.captionsIrreversible"\)\}/.test(passoGerar)) {
    failures.push(
      "legenda: o aviso de que a legenda é irreversível saiu da tela. A base é medida — um vídeo gerado " +
        "sem `caption` volta sem `subtitle_url` e sem `captioned_video_url` —, então trocar de ideia " +
        "significa pagar por outro vídeo. Quem escolhe precisa saber disso ANTES, não depois.",
    );
  }
  for (const idioma of ["pt-BR", "en"]) {
    const textos = JSON.parse(
      readFileSync(path.join(repoRoot, `frontend/src/locales/${idioma}.json`), "utf8"),
    ) as { createVideo?: { generate?: Record<string, string> } };
    if (!textos.createVideo?.generate?.captionsIrreversible) {
      failures.push(`legenda: falta \`createVideo.generate.captionsIrreversible\` em ${idioma}.json.`);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. O corpo da síntese leva a velocidade MEDIDA.
  //
  // Exercitado pela função de produção, com os dois casos que importam: o
  // modelo em uso (que aceita `speed`) e um que não aceita.
  // ---------------------------------------------------------------------------
  const corpo = buildSynthesisBody("texto de prova") as {
    model_id?: string;
    voice_settings?: { speed?: number };
  };
  if (corpo.voice_settings?.speed !== VOICE_SPEED) {
    failures.push(
      `voz: o corpo da síntese saiu sem \`voice_settings\` com a velocidade medida — recebi ` +
        `${JSON.stringify(corpo.voice_settings)}, esperado { speed: ${VOICE_SPEED} }. Sem o campo, vale ` +
        "o que estiver guardado no painel do fornecedor: global, editável fora do produto e sem rastro. " +
        "A régua de custo continuaria dividindo pela velocidade que ninguém está mais usando.",
    );
  }
  if (corpo.model_id !== ELEVENLABS_TTS_MODEL) {
    failures.push(
      `voz: o corpo saiu com model_id ${JSON.stringify(corpo.model_id)}, esperado ` +
        `${JSON.stringify(ELEVENLABS_TTS_MODEL)}.`,
    );
  }
  // Contraponto: modelo que NÃO suporta `speed` não recebe o campo. Sem isto,
  // uma guarda que só exigisse presença empurraria o campo para todo modelo — e
  // o fornecedor aceita em silêncio o que não suporta, que é o pior caso
  // conhecido deste projeto.
  const semSpeed = buildSynthesisBody("texto", "eleven_v3") as { voice_settings?: unknown };
  if (semSpeed.voice_settings !== undefined) {
    failures.push(
      "voz: `voice_settings` foi enviado a um modelo que não tem o campo. O fornecedor aceita e ignora " +
        "em silêncio — o mesmo pior caso de `expressiveness` com `avatar_iii` —, e o sintoma seria uma " +
        "fala mais rápida que ninguém saberia explicar.",
    );
  }

  notes.push(
    `interpretação: teto de ${MOTION_PROMPT_MAX_CHARS} caracteres com ${casos.length} pontos da fronteira ` +
      "conferidos e normalização provada sem corte; aviso de legenda irreversível na tela e nos 2 idiomas; " +
      `corpo da síntese com model_id e speed ${VOICE_SPEED}, e sem speed no modelo que não o aceita`,
  );
  return { failures, notes };
}
