/**
 * OS QUATRO AJUSTES DE SÍNTESE VÊM DO AVATAR — migration 067, 25/08.
 *
 * ┌─ O gap que esta guarda existe para não repetir ──────────────────────────┐
 * │ `voiceId: avatar.voice_id` (routes/videos.ts) está no CLAUDE.md desde    │
 * │ 11/08 como GAP SEM GUARDA: trocá-lo por um id fixo passa o gate inteiro, │
 * │ porque as guardas de voz olham a TELA e a PRÉVIA, nunca o valor que      │
 * │ entra em `synthesizeSpeech`. Os quatro ajustes nascem com o mesmo risco  │
 * │ e um agravante: se virarem constante no provider, a tela continua        │
 * │ oferecendo quatro controles, o fornecedor continua respondendo 200, e o  │
 * │ sintoma é "ajustei e não mudou" — indistinguível de o fornecedor ter     │
 * │ ignorado o campo, que é o risco JÁ ACEITO nesta rodada. Dois silêncios   │
 * │ com a mesma cara, e nenhum jeito de saber qual é qual.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  `voiceTuningDoAvatar` LÊ os quatro campos do avatar — por EXECUÇÃO,
 *       com valores que não são os defaults da migration. Constante fixa no
 *       lugar da leitura reprova aqui.
 *  G-2  os três `numeric` passam por `Number()`. O `pg` devolve `numeric` como
 *       STRING, e `"0.5"` no JSON é aceito, ignorado e silencioso.
 *  G-3  os CINCO call sites de produto passam `voiceTuning:
 *       voiceTuningDoAvatar(avatar)` — nenhum monta o objeto à mão. Por FORMA:
 *       são handlers do Fastify, e exercitá-los exigiria subir a aplicação.
 *  G-4  a PRÉVIA da clonagem usa os mesmos ajustes do vídeo. Se divergissem, o
 *       operador aprovaria um som e receberia outro — o defeito que a prévia
 *       existe para fechar.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";

const POLITICA = "backend/src/services/voice/voiceTuning.ts";
const ROTA_VIDEOS = "backend/src/routes/videos.ts";
const ROTA_VOZ = "backend/src/routes/voice.ts";
const MIGRATION = "backend/src/db/migrations/067_avatar_voice_settings.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "voz: os ajustes de síntese vêm do avatar",
    name: "a estabilidade vira constante no lugar da leitura",
    kind: "esperto",
    // ESPERTO: o corpo continua levando `stability`, o fornecedor continua
    // respondendo 200, e o valor continua sendo um número plausível — o mesmo
    // 0.5 que a migration usa de default. O que morre é a ligação com a tela:
    // todo avatar passa a soar igual, e quem ajustou não tem como saber se foi
    // o produto que ignorou ou o fornecedor.
    file: POLITICA,
    find: "    stability: Number(avatar.voice_stability),",
    replace: "    stability: 0.5,",
    expect: "a estabilidade deixou de vir do avatar",
  },
  {
    guard: "voz: os ajustes de síntese vêm do avatar",
    name: "o numeric chega como string ao fornecedor",
    kind: "esperto",
    // ESPERTO e do tipo mais surdo que existe aqui: `pg` devolve `numeric`
    // como STRING, então sem `Number()` o corpo sai com `"0.75"` em vez de
    // 0.75. O objeto `voice_settings` NÃO é fechado do lado do fornecedor —
    // ele aceita, ignora, responde 200, e o ajuste simplesmente não acontece.
    file: POLITICA,
    find: "    similarityBoost: Number(avatar.voice_similarity_boost),",
    replace: "    similarityBoost: avatar.voice_similarity_boost as unknown as number,",
    expect: "chegou como string",
  },
  {
    guard: "voz: os ajustes de síntese vêm do avatar",
    name: "a prévia da clonagem sintetiza sem os ajustes",
    kind: "esperto",
    // ESPERTO: a prévia continua saindo, audível e com a voz certa. Só que com
    // OUTROS ajustes que o vídeo — e é exatamente o defeito que a prévia
    // existe para fechar: aprovar um som e receber outro.
    file: ROTA_VOZ,
    find: "          voiceTuningDoAvatar(avatar),\n        );",
    replace: "        );",
    expect: "a prévia não usa os ajustes do avatar",
  },
];

export interface VoiceTuningCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkVoiceTuningPolicy(): Promise<VoiceTuningCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // G-1 e G-2 — por EXECUÇÃO, com a função pura.
  //
  // Os valores do avatar de prova são DIFERENTES dos defaults da migration
  // (0.5 / 0.75 / 0.0 / true) de propósito: com os defaults, uma constante fixa
  // no lugar da leitura passaria despercebida — os dois números seriam iguais.
  //
  // E os três `numeric` entram como STRING, que é como o `pg` os devolve. É a
  // única forma de provar o `Number()`.
  // ---------------------------------------------------------------------------
  const avatarDeProva = {
    voice_stability: "0.31" as unknown as number,
    voice_similarity_boost: "0.62" as unknown as number,
    voice_style: "0.17" as unknown as number,
    voice_speaker_boost: false,
  };
  const tuning = voiceTuningDoAvatar(avatarDeProva);

  if (tuning.stability !== 0.31) {
    failures.push(
      `voz: a estabilidade deixou de vir do avatar — esperado 0.31, recebi ${JSON.stringify(
        tuning.stability,
      )}. Uma constante no lugar da leitura faz todo avatar soar igual, com a tela oferecendo quatro ` +
        "controles que não mudam nada.",
    );
  }
  if (tuning.similarityBoost !== 0.62) {
    failures.push(
      `voz: a semelhança deixou de vir do avatar — esperado 0.62, recebi ${JSON.stringify(
        tuning.similarityBoost,
      )}.`,
    );
  }
  if (tuning.style !== 0.17) {
    failures.push(
      `voz: o estilo deixou de vir do avatar — esperado 0.17, recebi ${JSON.stringify(tuning.style)}.`,
    );
  }
  if (tuning.speakerBoost !== false) {
    failures.push(
      `voz: o reforço de voz deixou de vir do avatar — esperado false, recebi ${JSON.stringify(
        tuning.speakerBoost,
      )}. Este é booleano e não passa por Number(): um default embutido aqui ligaria o reforço em ` +
        "avatares que o desligaram.",
    );
  }
  // G-2 explícito: TIPO, não só valor. `"0.31" === 0.31` é falso em JS, mas
  // `JSON.stringify` de uma string ainda produz algo plausível no corpo — e o
  // fornecedor aceita e ignora. Conferir o typeof é o que pega a string que
  // por acaso tem o valor certo.
  for (const [campo, valor] of [
    ["stability", tuning.stability],
    ["similarity_boost", tuning.similarityBoost],
    ["style", tuning.style],
  ] as const) {
    if (typeof valor !== "number" || Number.isNaN(valor)) {
      failures.push(
        `voz: \`${campo}\` chegou como ${typeof valor} (${JSON.stringify(valor)}) em vez de número. O ` +
          "driver `pg` devolve `numeric` como STRING, e o objeto `voice_settings` não é fechado do lado " +
          "do fornecedor: ele aceita, ignora, responde 200, e o ajuste não acontece.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-3 — os call sites de produto, por FORMA.
  //
  // CINCO: um do caminho HeyGen e quatro do fal (criação, refazer imagem,
  // refazer vídeo e aprovação do vídeo mudo). Todos passam por
  // `narrarSincronizar`/`generateVideoHeygen`, que ressintetizam.
  // ---------------------------------------------------------------------------
  const videos = lerDaRaiz(ROTA_VIDEOS);
  const chamadas = (videos.match(/voiceTuning: voiceTuningDoAvatar\(avatar\)/g) ?? []).length;
  if (chamadas !== 5) {
    failures.push(
      `voz: os ajustes do avatar não chegam aos cinco call sites de geração (achei ${chamadas} de 5 em ` +
        "routes/videos.ts). Um call site sem `voiceTuning` sintetiza com o default do fornecedor, e o " +
        "vídeo sai com outra voz que a prévia — sem erro, sem log e sem diferença de duração.",
    );
  }
  // E nenhum deles monta o objeto à mão. Um literal aqui passaria pela contagem
  // acima se ela fosse `>= 1`, e é o jeito mais natural de "consertar" um
  // call site esquecido.
  if (/voiceTuning:\s*\{/.test(videos)) {
    failures.push(
      "voz: um call site monta `voiceTuning` à mão, com objeto literal. Os quatro campos têm de sair de " +
        "`voiceTuningDoAvatar(avatar)` — é ela que aplica o `Number()` nos três `numeric`, e um literal " +
        "escrito ao lado dela não aplica.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-4 — a prévia usa os MESMOS ajustes.
  // ---------------------------------------------------------------------------
  const voz = lerDaRaiz(ROTA_VOZ);
  if (!voz.includes("voiceTuningDoAvatar(avatar)")) {
    failures.push(
      "voz: a prévia pós-clonagem sintetiza sem os ajustes do avatar. Ela é o único ponto do produto em " +
        "que se ouve a voz sem pagar um vídeo — se ela usa outros valores, o operador aprova um som e " +
        "recebe outro, que é o defeito que a prévia existe para fechar.",
    );
  }

  // ---------------------------------------------------------------------------
  // A MIGRATION declara os quatro, e os defaults são os MEDIDOS.
  // ---------------------------------------------------------------------------
  const migration = lerDaRaiz(MIGRATION);
  const colunas = [
    ["voice_stability", "0.5"],
    ["voice_similarity_boost", "0.75"],
    ["voice_style", "0.0"],
    ["voice_speaker_boost", "true"],
  ] as const;
  for (const [coluna, valor] of colunas) {
    if (!new RegExp(`${coluna}\\s+\\w+(\\s+NOT NULL)?\\s+DEFAULT ${valor.replace(".", "\\.")}`).test(migration)) {
      failures.push(
        `voz: a migration 067 não declara \`${coluna}\` com DEFAULT ${valor}. Os defaults são os valores ` +
          "MEDIDOS em 25/08 (GET /v1/voices/0hQuq0q2…/settings, HTTP 200) — é o que torna a migration " +
          "inaudível: o fornecedor já aplica esses mesmos números hoje.",
      );
    }
  }

  notes.push(
    `voz: os quatro ajustes saem de \`avatars.voice_*\` com Number() nos três numeric, chegam aos ` +
      `${chamadas} call sites de geração e à prévia da clonagem, e a migration 067 declara os defaults ` +
      "medidos em 25/08",
  );

  return { failures, notes };
}
