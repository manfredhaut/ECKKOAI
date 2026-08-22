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
  TARGET_DURATION_OPTIONS,
  estimateSecondsFromChars,
  exceedsActiveScriptLimit,
  exceedsMaxScriptLength,
  isTargetDurationSeconds,
  maxScriptChars,
  maxScriptCharsFor,
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
    name: "o portão para de recusar roteiro acima do teto",
    kind: "obvio",
    // Muta a FUNÇÃO, e não a condição no portão. `} else if (false) {` também
    // desliga a recusa, mas deixa o import sem uso e reprova por não compilar —
    // o arnês devolveu AMBÍGUO nessa forma, porque o gate ficava vermelho sem
    // nunca chegar a imprimir a mensagem da guarda. É o mesmo defeito de
    // anotação de tipo já medido em `VOICE_SPEED`, por outro caminho.
    file: "backend/src/services/video/scriptDuration.ts",
    find: "  return estimateSecondsFromScript(script) > MAX_SCRIPT_SECONDS;",
    replace: "  return false;",
    expect: "passaram pelo portão",
  },
  {
    guard: "roteiro: acima do teto RECUSA, nunca corta",
    name: "o portão passa a cortar o roteiro em vez de recusar",
    kind: "obvio",
    // O corte de verdade: o texto é truncado no limite e a geração segue. Nada
    // reclama, o vídeo sai, e ele para no meio de uma frase — cobrado por
    // inteiro.
    file: "backend/src/services/generationReadiness.ts",
    find: "    const estimado = estimateSecondsFromScript(input.script);",
    replace:
      "    input.script = input.script.slice(0, maxScriptChars());\n    const estimado = estimateSecondsFromScript(input.script);",
    expect: "apareceu corte de texto no portão",
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
  {
    guard: "roteiro: a duração-alvo decide a recusa quando presente, o teto global quando ausente",
    name: "exceedsActiveScriptLimit ignora a duração-alvo e recusa só pelo teto global",
    kind: "esperto",
    // ESPERTO: sem duração-alvo escolhida ("mais"), o comportamento é
    // IDÊNTICO — os dois braços colapsam no mesmo `exceedsMaxScriptLength`.
    // O defeito só aparece na faixa entre o alvo escolhido e os 180 s
    // globais: um roteiro de 20 s com alvo de 15 s passaria a ser aceito.
    file: "backend/src/services/video/scriptDuration.ts",
    find:
      "  return targetDurationSeconds != null\n" +
      "    ? exceedsTargetScriptLength(script, targetDurationSeconds)\n" +
      "    : exceedsMaxScriptLength(script);",
    replace: "  return exceedsMaxScriptLength(script);",
    expect: "tem de ser recusado, mesmo estando bem abaixo do teto global de 180 s",
  },
  {
    guard: "roteiro: o teto de caracteres da duração-alvo é derivado da MESMA régua (CHARS_PER_SECOND × VOICE_SPEED)",
    name: "maxScriptCharsFor esquece a velocidade da voz",
    kind: "esperto",
    // ESPERTO: continua sendo uma conta derivada, só que de UM fator em vez
    // de dois — sem VOICE_SPEED (0.85), o teto sai maior do que a voz em uso
    // realmente permite, e o roteiro aceito estoura o alvo na síntese real.
    file: "backend/src/services/video/scriptDuration.ts",
    find: "  return Math.floor(targetSeconds * CHARS_PER_SECOND * VOICE_SPEED);",
    replace: "  return Math.floor(targetSeconds * CHARS_PER_SECOND);",
    expect: "Um fator esquecido aqui deixa passar roteiro que estoura o alvo escolhido na síntese real",
  },
  {
    guard: "roteiro: o formulário propaga a duração-alvo escolhida até o corpo de POST /videos",
    name: "o formulário deixa de propagar a duração-alvo",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "    target_duration_seconds: wizard.targetDurationSeconds,\n" +
      "  };\n" +
      "}",
    replace: "  };\n}",
    expect: "a duração-alvo não chega ao payload pelo formulário",
  },
  {
    guard: "roteiro: o passo Roteiro oferece o seletor de duração-alvo (15/30/45/60)",
    name: "o seletor de duração-alvo some do passo Roteiro",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/ScriptStep.tsx",
    find:
      "          {TARGET_DURATION_OPTIONS.map((seconds) => (\n" +
      "            <button\n" +
      "              key={seconds}\n" +
      '              type="button"\n' +
      '              className={`chip${ehChip && targetDurationSeconds === seconds ? " selected" : ""}`}\n' +
      "              aria-pressed={ehChip && targetDurationSeconds === seconds}\n" +
      "              onClick={() => {\n" +
      "                setMaisClicado(false);\n" +
      "                onTargetDurationChange(seconds);\n" +
      "              }}\n" +
      "            >\n" +
      '              {t("createVideo.script.durationTarget.seconds", { seconds })}\n' +
      "            </button>\n" +
      "          ))}",
    replace: "",
    expect: "sem ele a pessoa não tem mais como escolher 15/30/45/60 s antes de escrever",
  },
  {
    guard: "roteiro: o contador manda a duração-alvo escolhida para /video-cost-estimate",
    name: "o contador para de mandar a duração-alvo ao servidor",
    kind: "esperto",
    // ESPERTO: sem alvo escolhido (o estado inicial, "mais") o comportamento
    // é idêntico — `alvo` já seria "" nesse caso. O defeito só aparece depois
    // de escolher 15/30/45/60: o servidor nunca soube, e o contador mostraria
    // o teto GLOBAL (180 s) rotulado como se fosse o do alvo escolhido.
    file: "frontend/src/pages/CreateVideo/ScriptCounter.tsx",
    find: '      const alvo = targetDurationSeconds != null ? `&targetSeconds=${targetDurationSeconds}` : "";',
    replace: '      const alvo = "";',
    expect: "deixou de mandar a duração-alvo escolhida para `/video-cost-estimate`",
  },
  {
    guard: "roteiro: 'Mais' aceita qualquer duração customizada, não só os 4 chips",
    name: "isTargetDurationSeconds volta a aceitar só os 4 chips",
    kind: "esperto",
    // ESPERTO: os 4 chips continuam funcionando exatamente igual — 15/30/
    // 45/60 pertencem às duas listas. O defeito só aparece quando alguém
    // digita um número em "Mais" que não é um dos 4: o servidor passaria a
    // tratar o alvo digitado como se não tivesse sido escolhido, caindo em
    // silêncio no teto global (180 s) sem avisar ninguém.
    file: "backend/src/services/video/scriptDuration.ts",
    find:
      "  return (\n" +
      '    typeof value === "number" &&\n' +
      "    Number.isInteger(value) &&\n" +
      "    value > 0 &&\n" +
      "    value <= MAX_SCRIPT_SECONDS\n" +
      "  );",
    replace: '  return typeof value === "number" && (TARGET_DURATION_OPTIONS as readonly number[]).includes(value);',
    expect: "isTargetDurationSeconds(20) devolveu false, esperado true",
  },
  {
    guard: "roteiro: o campo customizado de 'Mais' existe no passo Roteiro",
    name: "o campo numérico de 'Mais' some da tela",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/ScriptStep.tsx",
    find:
      "        {mostrarCampoCustom && (\n" +
      '          <div style={{ marginTop: 8, maxWidth: 220 }}>\n' +
      "            <input\n" +
      '              type="number"',
    replace: "        {false && (\n          <div style={{ marginTop: 8, maxWidth: 220 }}>\n            <input\n              type=\"number\"",
    expect: "o campo numérico de \"Mais\" sumiu de",
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

  // E — o único que pega o literal — a derivação é conferida no CÓDIGO.
  //
  // As duas verificações acima são tautologias contra este defeito, e isso foi
  // MEDIDO: com `return 1960;` no lugar da fórmula, as duas continuam passando,
  // porque 1960 é exatamente o que a derivação produz hoje. O arnês devolveu
  // INERTE, que é a pior categoria — a guarda ocupava o lugar da verificação
  // sem fazê-la.
  //
  // "Derivado" é propriedade do CÓDIGO, não do valor: nenhum valor consegue
  // distinguir um número certo por construção de um número certo por
  // coincidência. Por isso aqui se lê o corpo da função.
  const regua = readFileSync(path.join(repoRoot, "backend/src/services/video/scriptDuration.ts"), "utf8");
  const corpo = /export function maxScriptChars\(\): number \{([\s\S]*?)\n\}/.exec(regua)?.[1] ?? "";
  const derivada = /MAX_SCRIPT_SECONDS\s*\*\s*CHARS_PER_SECOND\s*\*\s*VOICE_SPEED/.test(corpo);
  const temLiteral = /return\s+\d/.test(corpo);
  if (!derivada || temLiteral) {
    failures.push(
      "roteiro: o limite em caracteres deixou de ser derivado — `maxScriptChars()` não multiplica " +
        `MAX_SCRIPT_SECONDS por CHARS_PER_SECOND e VOICE_SPEED${temLiteral ? ", e devolve um número escrito à mão" : ""}. ` +
        "Um literal aqui continua parecendo certo depois de a régua mudar (hoje as duas dão 1960), e " +
        "aí a tela passa a recusar num ponto que não corresponde a duração nenhuma. " +
        `Corpo lido: ${JSON.stringify(corpo.trim())}`,
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

  // ---------------------------------------------------------------------------
  // 5. exceedsActiveScriptLimit: a duração-alvo (15/30/45/60 s) decide a
  // recusa quando presente; o teto global decide na ausência dela. Por
  // EXECUÇÃO real da função de produção — pura, sem banco.
  // ---------------------------------------------------------------------------
  for (const alvo of TARGET_DURATION_OPTIONS) {
    const limiteDoAlvo = maxScriptCharsFor(alvo);
    const dentro = "x".repeat(limiteDoAlvo);
    const fora = "x".repeat(limiteDoAlvo + 1);
    if (exceedsActiveScriptLimit(dentro, alvo) !== false) {
      failures.push(
        `roteiro: exceedsActiveScriptLimit recusou ${limiteDoAlvo} caracteres com alvo de ${alvo} s, mas ` +
          `esse é exatamente o limite do alvo — o último caractere que cabe tem de passar.`,
      );
    }
    if (exceedsActiveScriptLimit(fora, alvo) !== true) {
      failures.push(
        `roteiro: exceedsActiveScriptLimit deixou de recusar ${limiteDoAlvo + 1} caracteres com alvo de ` +
          `${alvo} s — o primeiro caractere que estoura o alvo tem de ser recusado, mesmo estando bem ` +
          `abaixo do teto global de ${MAX_SCRIPT_SECONDS} s.`,
      );
    }
  }
  // Sem alvo ("mais"), o veredito tem de continuar sendo só o teto global —
  // o mesmo contraponto do item 2, agora atravessando a função nova.
  const semAlvoDentro = "x".repeat(maxScriptChars());
  const semAlvoFora = "x".repeat(maxScriptChars() + 1);
  if (exceedsActiveScriptLimit(semAlvoDentro, null) !== false || exceedsActiveScriptLimit(semAlvoFora, null) !== true) {
    failures.push(
      "roteiro: exceedsActiveScriptLimit sem duração-alvo não bate mais com o teto global — a ausência " +
        "de escolha ('mais') tem de continuar valendo exatamente o mesmo que valia antes deste bloco.",
    );
  }

  // ---------------------------------------------------------------------------
  // 6. maxScriptCharsFor é a MESMA régua de maxScriptChars — CHARS_PER_SECOND
  // × VOICE_SPEED —, só que com a duração-alvo no lugar de MAX_SCRIPT_SECONDS.
  // ---------------------------------------------------------------------------
  for (const alvo of TARGET_DURATION_OPTIONS) {
    const limiteDoAlvo = maxScriptCharsFor(alvo);
    const esperadoDoAlvo = Math.floor(alvo * CHARS_PER_SECOND * VOICE_SPEED);
    if (limiteDoAlvo !== esperadoDoAlvo) {
      failures.push(
        `roteiro: maxScriptCharsFor(${alvo}) devolveu ${limiteDoAlvo}, esperado ${esperadoDoAlvo} ` +
          `(${alvo} × ${CHARS_PER_SECOND.toFixed(6)} c/s × velocidade ${VOICE_SPEED}). Um fator esquecido ` +
          "aqui deixa passar roteiro que estoura o alvo escolhido na síntese real.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 7. A duração-alvo atravessa a TELA: o seletor existe, o formulário
  // propaga a escolha, e o contador avisa o servidor dela. Só por LEITURA —
  // são componentes React, a mesma razão do item 4 acima.
  // ---------------------------------------------------------------------------
  const SCRIPT_STEP = "frontend/src/pages/CreateVideo/steps/ScriptStep.tsx";
  const scriptStepSrc = readFileSync(path.join(repoRoot, SCRIPT_STEP), "utf8");
  if (!scriptStepSrc.includes("TARGET_DURATION_OPTIONS.map(")) {
    failures.push(
      `roteiro: o seletor de duração-alvo sumiu de ${SCRIPT_STEP} — sem ele a pessoa não tem mais como ` +
        "escolher 15/30/45/60 s antes de escrever, e o teto que aparece sob o campo nunca teria de onde vir.",
    );
  }
  if (!scriptStepSrc.includes("mostrarCampoCustom") || !/mostrarCampoCustom.*&&[\s\S]{0,80}<input/.test(scriptStepSrc)) {
    failures.push(
      `roteiro: o campo numérico de "Mais" sumiu de ${SCRIPT_STEP} — a pessoa clicaria em "Mais" e não ` +
        "teria como digitar uma duração exata, sem nenhum aviso de que a escolha não teve efeito.",
    );
  }

  // ---------------------------------------------------------------------------
  // 8. isTargetDurationSeconds aceita duração CUSTOMIZADA, não só os 4 chips —
  // por EXECUÇÃO real da função de produção.
  // ---------------------------------------------------------------------------
  const casosDeAlvo: { valor: unknown; esperado: boolean; porque: string }[] = [
    { valor: 20, esperado: true, porque: "customizado dentro do teto, fora dos 4 chips" },
    { valor: 1, esperado: true, porque: "o menor inteiro positivo válido" },
    { valor: MAX_SCRIPT_SECONDS, esperado: true, porque: "no próprio teto de dinheiro" },
    { valor: MAX_SCRIPT_SECONDS + 1, esperado: false, porque: "1 acima do teto de dinheiro" },
    { valor: 0, esperado: false, porque: "zero não é uma duração" },
    { valor: -5, esperado: false, porque: "negativo não é uma duração" },
    { valor: 20.5, esperado: false, porque: "fracionário — a régua conta caracteres inteiros" },
    { valor: Infinity, esperado: false, porque: "não-finito" },
    { valor: "20", esperado: false, porque: "string, não number — corpo de requisição adulterado" },
  ];
  for (const caso of casosDeAlvo) {
    const got = isTargetDurationSeconds(caso.valor);
    if (got !== caso.esperado) {
      failures.push(
        `roteiro: isTargetDurationSeconds(${JSON.stringify(caso.valor)}) devolveu ${got}, esperado ` +
          `${caso.esperado} (${caso.porque}).`,
      );
    }
  }

  const GENERATE_STEP = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";
  const generateStepSrc = readFileSync(path.join(repoRoot, GENERATE_STEP), "utf8");
  // Recorte da FUNÇÃO, não do arquivo inteiro — mesma razão do
  // `checkSpendControlPolicy.ts`: um homônimo alhures no arquivo (por exemplo
  // na consulta de prontidão, que também manda `target_duration_seconds`)
  // faria a presença no arquivo mentir sobre a presença no CORPO enviado.
  const inicioCorpo = generateStepSrc.indexOf("export function corpoDaGeracao");
  const corpoDaGeracaoSrc =
    inicioCorpo >= 0 ? generateStepSrc.slice(inicioCorpo, generateStepSrc.indexOf("\n}", inicioCorpo)) : "";
  if (
    !corpoDaGeracaoSrc.includes("target_duration_seconds:") ||
    !corpoDaGeracaoSrc.includes("wizard.targetDurationSeconds")
  ) {
    failures.push(
      `roteiro: a duração-alvo não chega ao payload pelo formulário — ${GENERATE_STEP} monta o corpo de ` +
        "`POST /videos` sem `target_duration_seconds` vindo de `wizard.targetDurationSeconds`. O servidor " +
        "recusaria pelo teto global, e a pessoa nunca saberia que a escolha dela não valeu nada.",
    );
  }

  if (!contador.includes("targetSeconds=${targetDurationSeconds}")) {
    failures.push(
      `roteiro: ${CONTADOR} deixou de mandar a duração-alvo escolhida para \`/video-cost-estimate\` — o ` +
        "contador mostraria o teto GLOBAL (180 s) como se fosse o do alvo escolhido, e o servidor recusaria " +
        "num ponto que a tela nunca avisou.",
    );
  }

  notes.push(
    `roteiro: teto de ${MAX_SCRIPT_SECONDS} s = ${limite} caracteres DERIVADOS ` +
      `(${noLimite.toFixed(4)} s no limite, ${umAMais.toFixed(4)} s um caractere depois); ` +
      `${casos.length} pontos da fronteira conferidos; contador lê a rota do servidor`,
  );
  return { failures, notes };
}
