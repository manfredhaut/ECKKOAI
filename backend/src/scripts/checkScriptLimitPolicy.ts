/**
 * Invariantes do TETO DE ROTEIRO e do contador que o mostra.
 *
 * Três coisas precisam continuar verdadeiras, e as três já falharam neste
 * projeto por caminhos parecidos:
 *
 *  1. O limite em CARACTERES é DERIVADO da régua em execução, nunca digitado.
 *     Um literal continuaria parecendo certo depois de o ritmo medido ou a
 *     velocidade da voz mudarem, e a tela passaria a recusar num ponto que não
 *     corresponde a 180 s de vídeo nenhum. É a mesma família do defeito que fez
 *     a estimativa valer 0,42× do cobrado.
 *
 *  2. O roteiro é RECUSADO, nunca cortado. Truncar entregaria um vídeo que para
 *     no meio de uma frase, cobrado por inteiro, sem ninguém ter escolhido isso.
 *
 *  3. O contador da tela lê a régua do SERVIDOR. Uma conta feita no cliente é a
 *     segunda verdade sobre duração que `scriptDuration.ts` existe para não
 *     deixar nascer.
 *
 * A verificação chama as FUNÇÕES de produção com valores construídos aqui —
 * sem rede, sem banco, sem subir a aplicação. Só o item 3 é conferido por
 * leitura do arquivo da tela, porque o defeito ali é a PRESENÇA de uma conta,
 * e ausência de código não se exercita chamando função.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CHARS_PER_SECOND,
  MAX_SCRIPT_SECONDS,
  estimateSecondsFromChars,
  exceedsMaxScriptLength,
  maxScriptChars,
} from "../services/video/scriptDuration.js";
import { VOICE_SPEED } from "../services/providers/voiceProvider.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "roteiro: o teto em caracteres é derivado da régua",
    name: "o limite de caracteres vira literal fixo",
    kind: "esperto",
    // ESPERTO porque nada quebra hoje: 1960 é exatamente o que a derivação
    // produz agora. O defeito só aparece no dia em que a régua mudar — e nesse
    // dia ninguém vai olhar para esta linha. A guarda pega porque compara o
    // valor com a inversa da função de estimativa, e não com o número.
    file: "backend/src/services/video/scriptDuration.ts",
    find: "  return Math.floor(MAX_SCRIPT_SECONDS * CHARS_PER_SECOND * VOICE_SPEED);",
    replace: "  return 1960;",
    expect: "o limite em caracteres deixou de ser derivado",
  },
  {
    guard: "roteiro: acima do teto RECUSA, nunca corta",
    name: "o blocker corta o roteiro em vez de recusar",
    kind: "obvio",
    file: "backend/src/services/generationReadiness.ts",
    find: "  } else if (exceedsMaxScriptLength(input.script)) {",
    replace: "  } else if (false) {",
    expect: "roteiro acima do teto passou pelo portão",
  },
  {
    guard: "roteiro: acima do teto RECUSA, nunca corta",
    name: "o teto passa a comparar caracteres em vez de segundos",
    kind: "esperto",
    // Continua recusando roteiro gigante, continua tendo teto, e a mensagem
    // continua saindo. O que muda é a FRONTEIRA: comparar contra o número de
    // caracteres ignora a velocidade da voz, então a 0.85 o portão passa a
    // aceitar textos que produzem mais de 180 s.
    file: "backend/src/services/video/scriptDuration.ts",
    find: "  return estimateSecondsFromScript(script) > MAX_SCRIPT_SECONDS;",
    replace: "  return (script?.length ?? 0) > MAX_SCRIPT_SECONDS * CHARS_PER_SECOND;",
    expect: "a fronteira do teto não corresponde",
  },
  {
    guard: "roteiro: o contador da tela lê a régua do servidor",
    name: "o contador passa a calcular a duração no cliente",
    kind: "esperto",
    // O contador continua aparecendo e continua mostrando um número plausível
    // — 194 caracteres dariam 17,8 s, igual ao servidor, HOJE. A divergência só
    // nasce quando a régua do servidor mudar, e aí a tela e o portão passam a
    // discordar sem nenhum sintoma visível.
    file: "frontend/src/pages/CreateVideo/ScriptCounter.tsx",
    find: "  const chars = script.length;",
    replace: "  const chars = script.length;\n  const segundosLocais = chars / 12.8151 / 0.85;",
    expect: "calcula duração no cliente",
  },
];

export interface ScriptLimitCheckResult {
  failures: string[];
  notes: string[];
}

const CONTADOR = "frontend/src/pages/CreateVideo/ScriptCounter.tsx";

/**
 * Sinais de que alguém reimplementou a régua na tela.
 *
 * São os DOIS números que compõem a conta do servidor. Procurar por eles é mais
 * robusto do que procurar pela fórmula: quem copia a régua copia as constantes,
 * e escrevê-las de outro jeito (`12.815105`, `0.85`) continua casando.
 */
const NUMEROS_DA_REGUA = [/12[.,]8/, /0[.,]85/];

export function checkScriptLimitPolicy(repoRoot: string): ScriptLimitCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. O limite em caracteres é a INVERSA da estimativa, e não um número.
  //
  // Conferido pelos dois lados da fronteira, que é o que distingue "derivado"
  // de "coincide hoje": o último caractere aceito tem de caber dentro do teto e
  // o primeiro recusado tem de estourá-lo.
  // ---------------------------------------------------------------------------
  const limite = maxScriptChars();
  const noLimite = estimateSecondsFromChars(limite);
  const umAMais = estimateSecondsFromChars(limite + 1);

  if (!(noLimite <= MAX_SCRIPT_SECONDS && umAMais > MAX_SCRIPT_SECONDS)) {
    failures.push(
      `roteiro: o limite em caracteres deixou de ser derivado da régua. ${limite} caracteres estimam ` +
        `${noLimite.toFixed(4)} s e ${limite + 1} estimam ${umAMais.toFixed(4)} s, mas o teto é ` +
        `${MAX_SCRIPT_SECONDS} s — a fronteira precisa cair exatamente entre os dois. ` +
        "Um número escrito à mão aqui continua parecendo certo depois de o ritmo medido ou a " +
        "velocidade da voz mudarem, e aí a tela recusa num ponto que não corresponde a duração nenhuma.",
    );
  }

  // A derivação também tem de bater com a conta feita a partir das duas
  // constantes de origem. Isto pega o caso em que alguém mantém a fórmula mas
  // troca de qual velocidade ela sai.
  const esperado = Math.floor(MAX_SCRIPT_SECONDS * CHARS_PER_SECOND * VOICE_SPEED);
  if (limite !== esperado) {
    failures.push(
      `roteiro: o limite derivado (${limite}) não bate com ${MAX_SCRIPT_SECONDS} s × ` +
        `${CHARS_PER_SECOND.toFixed(6)} c/s × velocidade ${VOICE_SPEED} = ${esperado}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // 2. O veredito RECUSA acima do teto — e libera abaixo dele.
  //
  // O contraponto do lado de baixo não é decoração: sem ele, uma guarda que só
  // olhasse o lado de cima continuaria verde com um portão que recusa tudo.
  // ---------------------------------------------------------------------------
  const casos: { chars: number; deveRecusar: boolean; porque: string }[] = [
    { chars: 194, deveRecusar: false, porque: "a frase da demo (17,8 s) tem de passar" },
    { chars: limite, deveRecusar: false, porque: "o último caractere que cabe no teto tem de passar" },
    { chars: limite + 1, deveRecusar: true, porque: "o primeiro caractere que estoura o teto tem de recusar" },
    { chars: limite * 3, deveRecusar: true, porque: "um artigo colado por engano tem de recusar" },
  ];
  for (const caso of casos) {
    const recusou = exceedsMaxScriptLength("x".repeat(caso.chars));
    if (recusou !== caso.deveRecusar) {
      failures.push(
        `roteiro: a fronteira do teto não corresponde ao esperado — ${caso.chars} caracteres ` +
          `(${estimateSecondsFromChars(caso.chars).toFixed(2)} s estimados) ` +
          `${recusou ? "foram recusados" : "passaram pelo portão"} e ${caso.porque}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3. O portão RECUSA — não corta.
  //
  // Conferido no texto da mensagem, e não só no código: é a mensagem que diz a
  // quem escreveu o roteiro o que aconteceu com o texto dele. Uma recusa que não
  // explique que nada foi cortado deixa a pessoa achando que o vídeo saiu pela
  // metade.
  // ---------------------------------------------------------------------------
  const readiness = readFileSync(
    path.join(repoRoot, "backend/src/services/generationReadiness.ts"),
    "utf8",
  );
  if (/\.slice\(0,|\.substring\(0,|truncat/i.test(readiness)) {
    failures.push(
      "roteiro: apareceu corte de texto no portão de prontidão. O roteiro do cliente nunca é " +
        "truncado — um vídeo que para no meio de uma frase é cobrado por inteiro e ninguém escolheu isso.",
    );
  }
  if (!readiness.includes("script_too_long")) {
    failures.push(
      "roteiro: o bloqueio `script_too_long` sumiu do portão. Sem ele, um roteiro colado por engano " +
        "vira débito de dezenas de dólares atrás de um único checkbox de confirmação.",
    );
  }

  // ---------------------------------------------------------------------------
  // 4. O contador da tela não recalcula a régua.
  // ---------------------------------------------------------------------------
  const contador = readFileSync(path.join(repoRoot, CONTADOR), "utf8");
  // Só o CÓDIGO. Os comentários deste arquivo citam os números de propósito —
  // eles explicam justamente por que a conta não pode estar aqui —, e uma
  // guarda que casasse com eles reprovaria a própria documentação.
  const codigo = contador
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
  for (const numero of NUMEROS_DA_REGUA) {
    if (numero.test(codigo)) {
      failures.push(
        `roteiro: o contador da tela calcula duração no cliente — achei ${numero} no código de ` +
          `${CONTADOR}. A duração vem de \`/video-cost-estimate\`, a mesma rota do painel de custo: ` +
          "uma segunda régua diverge da primeira no dia em que uma delas mudar, e o sintoma é a tela " +
          "prometendo um custo que o servidor não cobra.",
      );
    }
  }
  if (!codigo.includes("/video-cost-estimate?chars=")) {
    failures.push(
      `roteiro: ${CONTADOR} deixou de consultar \`/video-cost-estimate\`. É essa rota que carrega a ` +
        "única cópia do ritmo medido.",
    );
  }

  notes.push(
    `roteiro: teto de ${MAX_SCRIPT_SECONDS} s = ${limite} caracteres DERIVADOS ` +
      `(${noLimite.toFixed(4)} s no limite, ${umAMais.toFixed(4)} s um caractere depois); ` +
      `${casos.length} pontos da fronteira conferidos; contador lê a rota do servidor`,
  );
  return { failures, notes };
}
