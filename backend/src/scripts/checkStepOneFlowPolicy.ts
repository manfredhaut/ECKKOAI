/**
 * Invariantes do FLUXO do passo 1 — a ordem em que a coluna é lida.
 *
 * O defeito congelado aqui foi medido no ensaio E2E: o botão `Avançar` era
 * renderizado LOGO ABAIXO de "Novo avatar", **antes** da grade de avatares e
 * do bloco de voz. Quem lê de cima para baixo — que é como se lê — encontrava
 * o caminho de saída antes de encontrar o conteúdo, e o bloco de voz ficava
 * abaixo da dobra. O resultado é uma funcionalidade que existe, está pronta, e
 * o caminho natural nunca alcança.
 *
 * Ordem correta, e é ela que este arquivo protege:
 *
 *     texto → "+ Configurar novo avatar" → grade → bloco de voz → Avançar
 *
 * Verificação por POSIÇÃO no arquivo, e não por presença: os quatro elementos
 * continuavam todos lá no estado defeituoso. O que estava errado era só a
 * ordem, e nenhuma contagem de ocorrências pega isso.
 */
import type { Mutant } from "./mutants.js";

export interface StepOneFlowCheckResult {
  failures: string[];
  notes: string[];
}

const STEP = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";
const RECORDER = "frontend/src/pages/CreateVideo/VoiceSampleRecorder.tsx";
const NOTICE = "frontend/src/pages/CreateVideo/AvatarReadinessNotice.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "passo 1: ordem da coluna",
    name: "o Avançar volta para antes da grade",
    kind: "obvio",
    file: STEP,
    // MOVE, não remove — e a diferença importa. A primeira versão apagava a
    // linha, o que zerava a posição do elemento e fazia a guarda cair no ramo
    // "não encontrei um dos elementos": ela reprovava, mas por outra razão, e o
    // arnês classificou como AMBÍGUO com toda a razão. O defeito real deste
    // bloco nunca foi a AUSÊNCIA do botão; foi ele estar no lugar errado.
    find: `        <div className="card-title">{t("createVideo.avatarSetup.yourAvatars")}</div>`,
    replace: `        {nextButton && <div style={{ marginBottom: 20 }}>{nextButton}</div>}\n        <div className="card-title">{t("createVideo.avatarSetup.yourAvatars")}</div>`,
    expect: "o botão de avançar não vem DEPOIS",
  },
  {
    guard: "passo 1: caminho rápido não regride",
    name: "passo obrigatório de voz no caminho de avatar pronto",
    kind: "esperto",
    // A grade continua antes do Avançar, o bloco de voz continua no lugar, e
    // a ordem inspecionada não muda em nada. O que muda é o avanço passar a
    // depender de uma confirmação de voz — o avatar pronto ganha um passo que
    // ele não tinha, e é justamente o que este bloco não pode custar.
    file: STEP,
    find: `        {nextButton && <div style={{ marginTop: 20 }}>{nextButton}</div>}`,
    replace: `        {nextButton && selectedAvatar?.voice_id && <div style={{ marginTop: 20 }}>{nextButton}</div>}`,
    expect: "o avanço passou a depender da voz",
  },
  {
    guard: "passo 1: pendências avisam",
    name: "o aviso some do JSX",
    kind: "obvio",
    // Ancorado no USO em JSX, e não no import: apagar a renderização deixando
    // o `import` é a forma exata de guarda inerte que já custou cinco
    // ocorrências neste projeto.
    file: STEP,
    find: `        {selectedAvatar && <AvatarReadinessNotice avatarId={selectedAvatar.id} />}`,
    replace: "",
    expect: "não avisa mais as pendências do avatar",
  },
  {
    guard: "passo 1: pendências vêm do servidor",
    name: "o frontend recalcula a prontidão por conta própria",
    kind: "esperto",
    // O aviso continua aparecendo, com a mesma superfície, e a lista até
    // parece certa para o caso comum. Mas passa a ser uma SEGUNDA implementação
    // da regra — que foi exatamente o defeito que o predicado único fechou no
    // 5D, quando o botão conhecia três condições e a rota recusava por sete.
    file: NOTICE,
    find: `  const doAvatar = (blockers ?? []).filter((b) => b.code.startsWith("avatar_"));`,
    replace: `  const doAvatar = (blockers ?? []).filter((b) => b.code.startsWith("avatar_") && !b.message.includes("treinado"));`,
    expect: "decide por conta própria",
  },
  {
    guard: "passo 1: bloco de voz recolhido quando já existe voz",
    name: "o bloco passa a abrir sempre",
    kind: "obvio",
    file: RECORDER,
    find: `  const [expanded, setExpanded] = useState(!avatar.voice_id);`,
    replace: `  const [expanded, setExpanded] = useState(true);`,
    expect: "não nasce recolhido",
  },
  {
    guard: "passo 1: bloco de voz recolhido quando já existe voz",
    name: "recolhe sempre, inclusive quando a voz falta",
    kind: "esperto",
    // O inverso do anterior, e é o contraponto que impede o conserto preguiçoso:
    // recolher sempre também "protege" a voz existente — e esconde o único
    // passo que falta num avatar sem voz, que é o oposto da intenção.
    file: RECORDER,
    find: `  const [expanded, setExpanded] = useState(!avatar.voice_id);`,
    replace: `  const [expanded, setExpanded] = useState(false);`,
    expect: "não abre quando a voz FALTA",
  },
  {
    guard: "passo 1: escopo da voz declarado",
    name: "a frase de escopo some da tela",
    kind: "obvio",
    file: RECORDER,
    find: `      <p className="voice-sample__scope">{t("createVideo.voiceSample.scope")}</p>`,
    replace: "",
    expect: "não declara que a voz pertence ao AVATAR",
  },
];

/** Índice da primeira ocorrência, ou -1. Comentários já removidos pelo chamador. */
function posicao(code: string, agulha: RegExp): number {
  const m = agulha.exec(code);
  return m ? m.index : -1;
}

export async function checkStepOneFlowPolicy(repoRoot: string): Promise<StepOneFlowCheckResult> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const failures: string[] = [];
  const notes: string[] = [];

  async function ler(rel: string): Promise<string | null> {
    try {
      const src = await readFile(path.join(repoRoot, rel), "utf-8");
      // Sem comentários: este projeto já teve guarda reprovando o próprio
      // texto que a explicava, cinco vezes. Os comentários deste bloco citam
      // "nextButton" e "Avançar" por extenso.
      return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    } catch {
      failures.push(`passo 1: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      return null;
    }
  }

  const step = await ler(STEP);
  if (step === null) return { failures, notes };

  // --- 1. ORDEM: grade e voz ANTES do avançar -----------------------------
  const iGrade = posicao(step, /avatars\.map\(/);
  const iVoz = posicao(step, /<VoiceSampleRecorder/);
  const iAviso = posicao(step, /<AvatarReadinessNotice/);
  const iAvancar = posicao(step, /\{nextButton\s*&&/);

  if (iGrade < 0 || iVoz < 0 || iAvancar < 0) {
    failures.push(
      `passo 1: não encontrei um dos elementos da coluna em ${STEP} ` +
        `(grade=${iGrade}, voz=${iVoz}, avançar=${iAvancar}). A verificação de ordem ficaria cega.`,
    );
  } else {
    if (!(iAvancar > iGrade)) {
      failures.push(
        "passo 1: o botão de avançar não vem DEPOIS da grade de avatares. Quem lê de cima para " +
          "baixo encontra a saída antes do conteúdo, e a grade fica abaixo da dobra.",
      );
    }
    if (!(iAvancar > iVoz)) {
      failures.push(
        "passo 1: o botão de avançar não vem DEPOIS do bloco de voz. Foi assim que a captura de " +
          "voz ficou pronta e inalcançável pelo caminho natural: o Avançar aparecia antes dela.",
      );
    }
  }

  // --- 2. CAMINHO RÁPIDO: avançar não depende de voz ----------------------
  //
  // A asserção é sobre o que NÃO existe, e por isso é escrita sobre o trecho
  // exato do avanço: um avatar com foto e voz prontas tem de poder ser
  // selecionado e seguir sem passo extra e sem confirmação.
  const trechoAvancar = iAvancar >= 0 ? step.slice(iAvancar, iAvancar + 200) : "";
  if (/voice_id|voiceId|confirm/i.test(trechoAvancar)) {
    failures.push(
      "passo 1: o avanço passou a depender da voz — há referência a voz ou confirmação na condição " +
        `do botão. Trecho: "${trechoAvancar.slice(0, 120).replace(/\s+/g, " ")}". ` +
        "Avatar pronto tem de ser selecionar-e-seguir; qualquer passo extra aqui é regressão do " +
        "caminho que já funcionava.",
    );
  }

  // --- 3. PENDÊNCIAS: avisa, e o aviso está no JSX ------------------------
  if (iAviso < 0) {
    failures.push(
      `passo 1: não avisa mais as pendências do avatar — <AvatarReadinessNotice não é renderizado ` +
        `em ${STEP}. Sem ele, um avatar incompleto atravessa cinco passos e só é recusado no 6.`,
    );
  }

  // --- 4. As pendências vêm do SERVIDOR ------------------------------------
  const notice = await ler(NOTICE);
  if (notice !== null) {
    // Tolera a quebra de linha do encadeamento (`api\n  .post<…>(…)`), que é
    // como o Prettier formata a chamada. A primeira versão desta asserção
    // exigia tudo numa linha e acusou o uso LEGÍTIMO na primeira execução —
    // guarda que acusa uso legítimo é abandonada, e este projeto já pagou
    // esse preço três vezes.
    if (!/api\s*\.\s*post\s*<[^>]*>\s*\(\s*["'`]\/videos\/readiness["'`]/.test(notice)) {
      failures.push(
        `passo 1: ${NOTICE} não consulta mais POST /videos/readiness. A lista de pendências tem de ` +
          "ser a do servidor; uma segunda implementação no cliente diverge da rota e a divergência " +
          "só aparece quando o cliente já disse que estava tudo bem.",
      );
    }
    // Decidir por campo de avatar aqui é recalcular. O componente só pode
    // FILTRAR por código e EXIBIR `message` — nunca inspecionar o avatar nem
    // interpretar o texto que o servidor mandou.
    const recalculo = /provider_avatar_id|photo_urls|provider_status|voice_id|message\.includes|message\.match/;
    if (recalculo.test(notice)) {
      failures.push(
        `passo 1: ${NOTICE} decide por conta própria — inspeciona campo de avatar ou interpreta a ` +
          "mensagem do servidor em vez de só exibi-la. É a família de defeito que o predicado único " +
          "fechou: duas listas da mesma regra, divergindo em silêncio.",
      );
    }
  }

  // --- 5. Bloco de voz: recolhido com voz, aberto sem voz ------------------
  const recorder = await ler(RECORDER);
  if (recorder !== null) {
    // DUAS proposições distintas, com mensagens distintas — e foi o arnês que
    // cobrou isso: uma mensagem só para as duas fazia os mutantes opostos
    // ("abre sempre" e "recolhe sempre") produzirem a MESMA saída, e o arnês
    // não conseguia atribuir a reprovação ao defeito certo. Ambos reprovavam,
    // e nenhum dos dois provava nada em particular.
    // ANCORADO na declaração do `expanded`, e não no nome `useState` solto:
    // este arquivo tem vários `useState(false)` (recording, sending,
    // replaceOffered), e casá-los fazia o ramo de "recolhe sempre" vencer
    // SEMPRE — inclusive quando o defeito era o oposto. O arnês pegou:
    // `useState(true)` reprovava, mas com a mensagem errada. É a mesma família
    // de defeito de casar a menção em vez do uso, agora dentro da própria
    // guarda que existe para impedi-la.
    const decl = /const\s*\[\s*expanded\s*,\s*setExpanded\s*\]\s*=\s*useState\(([^)]*)\)/.exec(recorder);
    // NORMALIZADO antes de comparar: espaço interno some, vírgula final some,
    // quebra de linha some. Sem isto, `useState(\n  ! avatar.voice_id,\n)` —
    // que é o mesmo código, só reformatado — reprovava. Medido: a guarda
    // acusou uso legítimo na primeira vez que a formatação mudou.
    //
    // LIMITE CONHECIDO, e é honesto declará-lo aqui: isto é casamento de
    // TEXTO, não de árvore sintática. Normalização cobre a reformatação comum
    // (espaço, quebra, vírgula final); NÃO cobre reescrita equivalente —
    // extrair para uma constante, inverter com `avatar.voice_id ? false : true`,
    // trocar por um `useMemo`. Nesses casos a guarda acusa código correto, e o
    // conserto é ler a mensagem e ajustar o padrão, não ignorá-la.
    const inicial = decl ? decl[1].replace(/\s+/g, "").replace(/,$/, "") : null;

    if (inicial === null) {
      failures.push(
        `passo 1: não encontrei a declaração de \`expanded\` em ${RECORDER} — a verificação do ` +
          "estado inicial do bloco de voz ficaria cega.",
      );
    }
    const derivaDaVoz = inicial === "!avatar.voice_id";
    const abreSempre = inicial === "true";
    const recolheSempre = inicial === "false";

    if (inicial !== null && !derivaDaVoz && recolheSempre) {
      failures.push(
        `passo 1: o bloco de voz não abre quando a voz FALTA — o estado inicial em ${RECORDER} é ` +
          "`useState(false)`, recolhido para todo avatar. Recolher sempre também 'protege' a voz " +
          "existente, e é por isso que parece um conserto: esconde o único passo que falta num " +
          "avatar sem voz nenhuma.",
      );
    } else if (inicial !== null && !derivaDaVoz) {
      failures.push(
        `passo 1: o bloco de voz não nasce recolhido quando já existe voz — o estado inicial deixou ` +
          `de derivar de \`!avatar.voice_id\` em ${RECORDER}${abreSempre ? " (está `useState(true)`)" : ""}. ` +
          "Aberto sempre, o botão de gravar fica no caminho de quem só queria escolher um avatar e " +
          "seguir, e uma amostra gravada por engano substitui a voz de forma irrecuperável.",
      );
    }
    if (!/className="voice-sample__scope"/.test(recorder)) {
      failures.push(
        `passo 1: o bloco de voz não declara que a voz pertence ao AVATAR e não a este vídeo. ` +
          "Dentro do fluxo de criar vídeo, a leitura natural é que a escolha vale só para o vídeo " +
          "atual — e trocá-la muda todos os vídeos futuros daquele avatar.",
      );
    }
  }

  notes.push(
    "passo 1: ordem conferida por POSIÇÃO — grade e bloco de voz antes do avançar, que fecha a coluna",
  );
  notes.push(
    "passo 1: avatar pronto avança sem passo extra; pendências avisam com os blockers do servidor, sem recalcular",
  );
  notes.push(
    "passo 1: bloco de voz recolhido quando há voz e aberto quando falta, com o escopo declarado",
  );

  return { failures, notes };
}
