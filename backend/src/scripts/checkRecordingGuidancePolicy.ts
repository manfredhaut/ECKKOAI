/**
 * Invariantes da ORIENTAÇÃO DE DURAÇÃO durante a gravação de referência.
 *
 * O defeito congelado aqui tem custo medido. O contador antigo dizia
 * "Gravando 0:15 de 2:00 — para sozinho em 105s": vigiava o TETO e deixava a
 * META invisível. Aos 15 segundos ele parece perfeitamente saudável, com 105
 * segundos de folga, e nada avisa que a amostra está curta demais para clonar
 * uma voz.
 *
 * Foi assim que o clone do avatar de demonstração acabou treinado com **15,37
 * segundos** de amostra (medido com ffprobe no wav de referência) — metade do
 * piso que a própria tela recomenda. O sintoma só apareceu no vídeo pronto,
 * como "a voz não parece a pessoa", quando consertar já custava uma regravação
 * e uma geração paga.
 *
 * A regra que este arquivo cobra: **um limite superior vigiado não substitui
 * uma meta inferior visível**, e as duas precisam aparecer durante a gravação,
 * não só antes dela.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface RecordingGuidanceResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "gravação: a meta aparece durante a captura",
    name: "o indicador some da tela, mas o import fica",
    kind: "esperto",
    // Mutante de ancoragem (checklist nº 10 do CLAUDE.md): remove o USO e
    // preserva a MENÇÃO. Volta ao estado em que a pessoa grava sem saber
    // quanto falta.
    file: "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx",
    find: "{recorder.isRecording && <RecordingProgress elapsedSeconds={recorder.elapsedSeconds} />}",
    replace: "{recorder.isRecording && <span />}",
    expect: "não mostra o progresso da gravação durante a captura",
  },
  {
    guard: "gravação: a meta mínima é maior que zero",
    name: "a meta mínima colapsa para zero",
    kind: "esperto",
    // A barra continua lá, as três faixas continuam no código, o texto
    // continua igual — e toda gravação nasce "boa", inclusive uma de 2
    // segundos. É a mutação que reintroduz o defeito sem tocar na superfície.
    file: "frontend/src/uploadLimits.ts",
    find: "export const RECORDING_MINIMUM_SECONDS = 30;",
    replace: "export const RECORDING_MINIMUM_SECONDS = 0;",
    expect: "meta mínima de gravação",
  },
  {
    guard: "gravação: as três faixas são distinguidas",
    name: "toda duração passa a ser considerada boa",
    kind: "obvio",
    file: "frontend/src/uploadLimits.ts",
    find: `  if (elapsedSeconds < RECORDING_MINIMUM_SECONDS) return "short";`,
    replace: "",
    expect: "não distingue as três faixas de duração",
  },
];

const LIMITES = "frontend/src/uploadLimits.ts";
const INDICADOR = "frontend/src/pages/CreateVideo/RecordingProgress.tsx";
const PASSO = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";
const LOCALE = "frontend/src/locales/pt-BR.json";

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

export async function checkRecordingGuidancePolicy(repoRoot: string): Promise<RecordingGuidanceResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const ler = async (rel: string): Promise<string | null> => {
    try {
      return semComentarios(await readFile(path.join(repoRoot, rel), "utf-8"));
    } catch {
      failures.push(`gravação: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      return null;
    }
  };

  const limites = await ler(LIMITES);
  const indicador = await ler(INDICADOR);
  const passo = await ler(PASSO);
  const locale = await ler(LOCALE);
  if (!limites || !indicador || !passo || !locale) return { failures, notes };

  // 1. As metas existem, são positivas e estão em ordem.
  const ler_n = (nome: string): number | null => {
    const m = limites.match(new RegExp(`${nome}\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const minimo = ler_n("RECORDING_MINIMUM_SECONDS");
  const recomendado = ler_n("RECORDING_RECOMMENDED_SECONDS");

  if (minimo == null || recomendado == null) {
    failures.push(
      `gravação: ${LIMITES} não declara mais as metas de duração (RECORDING_MINIMUM_SECONDS / ` +
        "RECORDING_RECOMMENDED_SECONDS). Sem meta, o contador volta a vigiar só o teto — e foi assim que " +
        "uma voz acabou clonada a partir de 15 s de amostra.",
    );
  } else {
    if (minimo <= 0) {
      failures.push(
        `gravação: a meta mínima de gravação é ${minimo}s. Com zero, toda gravação nasce "boa", inclusive ` +
          "uma de dois segundos — o indicador continua na tela e para de significar qualquer coisa.",
      );
    }
    if (recomendado <= minimo) {
      failures.push(
        `gravação: a meta recomendada (${recomendado}s) não é maior que a mínima (${minimo}s). As duas ` +
          "faixas colapsam numa só, e a mensagem do meio — 'já dá, mas melhora se continuar' — deixa de " +
          "existir. É ela que evita empurrar todo mundo para o piso.",
      );
    }
  }

  // 2. As três faixas são de fato distinguidas.
  //
  // Ancorado em `return "faixa"`, e NÃO na palavra solta: os três nomes também
  // aparecem na união de tipos `RecordingQuality`, que continua intacta quando
  // alguém apaga o desvio. A primeira versão desta checagem procurava a
  // palavra, e o arnês a flagrou INERTE — removi o `return "short"` e o gate
  // seguiu verde porque o tipo ainda mencionava "short". Sexta ocorrência da
  // mesma armadilha neste projeto (ver checklist nº 10 do CLAUDE.md).
  const faixas = ["short", "workable", "good"].filter((f) =>
    new RegExp(`return\\s+"${f}"`).test(limites),
  );
  if (faixas.length < 3) {
    failures.push(
      `gravação: ${LIMITES} não distingue as três faixas de duração (encontrei ${JSON.stringify(faixas)}). ` +
        "Um indicador binário empurra todo mundo para o mínimo; a faixa do meio é o que deixa a pessoa " +
        "decidir com informação em vez de adivinhar.",
    );
  }

  // 3. O indicador é USADO no passo de configuração — ancorado no JSX, nunca
  //    no import (checklist nº 10: import não é uso).
  //
  // E ancorado no ramo `isRecording` especificamente, não em "aparece em algum
  // lugar do arquivo": o componente é renderizado em DOIS pontos — durante a
  // captura e depois dela, enquanto a gravação não foi enviada. A primeira
  // versão procurava `<RecordingProgress` no arquivo inteiro, e o arnês a
  // flagrou INERTE: removido o uso durante a captura, o segundo uso satisfazia
  // a busca sozinho. O que importa aqui é justamente o de DURANTE — depois já
  // é tarde para ajustar a gravação em curso.
  if (!/recorder\.isRecording && <RecordingProgress\b/.test(passo)) {
    failures.push(
      `gravação: ${PASSO} não mostra o progresso da gravação durante a captura. A orientação volta a ` +
        "existir só no parágrafo acima, que aparece ANTES de gravar e some da atenção no instante em que " +
        "a pessoa começa a falar.",
    );
  }

  // 4. E o indicador diz coisas DIFERENTES por faixa.
  const mensagens = ["recordingShort", "recordingWorkable", "recordingGood"].filter((k) =>
    new RegExp(`avatarSetup\\.${k}`).test(indicador),
  );
  if (mensagens.length < 3) {
    failures.push(
      `gravação: ${INDICADOR} não usa as três mensagens por faixa (encontrei ${JSON.stringify(mensagens)}). ` +
        "Uma mensagem só para todas as durações é o contador antigo com outra roupa.",
    );
  }

  // 5. Cada mensagem precisa citar uma DURAÇÃO. Um texto genérico ("gravando…")
  //    satisfaria a checagem acima sem informar nada.
  for (const chave of ["recordingShort", "recordingWorkable", "recordingGood"]) {
    const m = locale.match(new RegExp(`"${chave}"\\s*:\\s*"([^"]*)"`));
    if (!m) {
      failures.push(`gravação: falta a tradução pt-BR de ${chave}.`);
      continue;
    }
    if (!/\{\{/.test(m[1])) {
      failures.push(
        `gravação: a mensagem ${chave} não interpola nenhum número — vira um texto fixo que não diz onde ` +
          `a gravação está. Texto atual: ${JSON.stringify(m[1])}`,
      );
    }
  }

  notes.push(
    `gravação: metas de duração declaradas (mínimo ${minimo}s, recomendado ${recomendado}s, teto na variável ` +
      "de ambiente), 3 faixas distintas, indicador usado em JSX no passo de captura e 3 mensagens com número",
  );
  return { failures, notes };
}
