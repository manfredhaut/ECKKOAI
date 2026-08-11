/**
 * GAP 1 — `expressiveness` nunca sai `null`.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 *
 * O passo Cena tinha três chips (low/medium/high) e NENHUM vinha
 * pré-selecionado — o estado inicial do assistente nascia com
 * `expressiveness: null`. Quem não clicasse em nenhum nível mandava o vídeo
 * sem o campo no corpo: `avatarProvider.ts:632` só inclui `expressiveness`
 * quando há valor, e a doc do fornecedor documenta, com todas as letras,
 * "Avatar expressiveness level. Photo avatars only. Defaults to 'low' when
 * omitted." — o vídeo saía apático, cobrado por inteiro, sem que a tela
 * tivesse dito nada.
 *
 * A escolha foi PRÉ-SELECIONAR "medium" no estado inicial, e não bloquear o
 * avanço do passo até uma escolha explícita: bloquear adiciona fricção a um
 * fluxo que hoje deixa passar, e pré-selecionar garante que o campo nunca
 * mais é omitido sem exigir clique nenhum — quem quer outro nível troca
 * livremente antes de gerar.
 * ---------------------------------------------------------------------------
 * O QUE ESTA GUARDA MEDE, E O QUE ELA NÃO MEDE
 *
 * Duas pernas, porque o defeito tem duas metades:
 *
 *  (i)  FONTE — o estado inicial de `CreateVideoPage.tsx` nunca volta a ser
 *       `null`. Por LEITURA, e não por chamada de função: um valor inicial de
 *       `useState` em React não se exercita rodando o componente aqui — é a
 *       mesma técnica (e a mesma justificativa) do item 4 de
 *       `checkCaptionPolicy`.
 *  (ii) COMPORTAMENTO — com o valor que a tela agora produz por padrão
 *       ("medium") e o motor efetivo `avatar_iv` (o caminho REAL de produção
 *       hoje, com a flag `explicit_avatar_engine` desligada — ver Parte 1 do
 *       reconhecimento de 11/08), o campo chega ao OBJETO enviado ao
 *       fornecedor. Ancorado no valor do payload, nunca em nome de campo ou
 *       comentário — a regra "USO, nunca MENÇÃO" que já rendeu sete guardas
 *       inertes neste projeto.
 *
 * O contraponto (motor diferente de `avatar_iv` continua omitindo o campo) é
 * exercitado para provar que a mudança de default NÃO tocou a condição do
 * motor — só o valor de entrada mudou, a regra continua a mesma.
 *
 * NÃO VERIFICADO, e a guarda não finge o contrário: que "medium" produza um
 * vídeo mais expressivo que "low" na prática. Isso só um vídeo pago prova, e
 * nenhum foi gerado nesta passada.
 * ---------------------------------------------------------------------------
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { EXPRESSIVENESS_LEVELS, isExpressiveness } from "../services/providers/videoScene.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "expressiveness: o passo Cena nasce com um nível escolhido, nunca null",
    name: "o passo Cena volta a nascer com expressiveness null",
    kind: "esperto",
    // Desfaz exatamente o Gap 1: nenhum chip continua mudando de cor ao ser
    // clicado, nenhum texto muda — só o valor com que o assistente NASCE.
    // Quem não tocar em nada volta a mandar o vídeo sem o campo.
    file: "frontend/src/pages/CreateVideo/CreateVideoPage.tsx",
    find: '    expressiveness: "medium",',
    replace: "    expressiveness: null,",
    expect: "o passo Cena nasce sem um nível escolhido",
  },
  {
    guard: "expressiveness: reclicar o chip não desfaz a escolha",
    name: "o chip volta a alternar para null quando reclicado",
    kind: "esperto",
    // O Gap 1 pela OUTRA porta. Nenhum chip some, nenhum texto muda, o estado
    // inicial continua "medium" — e a guarda do estado inicial continua verde,
    // porque ela lê outro arquivo. Só quem reclicar o nível que já estava
    // marcado manda o vídeo sem o campo.
    file: "frontend/src/pages/CreateVideo/steps/SceneStep.tsx",
    find: "              onClick={() => onExpressivenessChange(nivel)}",
    replace:
      "              onClick={() => onExpressivenessChange(expressiveness === nivel ? null : nivel)}",
    expect: "reclicar o chip já selecionado devolve a expressividade a null",
  },
];

export interface ExpressivenessDefaultCheckResult {
  failures: string[];
  notes: string[];
}

export function checkExpressivenessDefaultPolicy(repoRoot: string): ExpressivenessDefaultCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. FONTE — o estado inicial nunca nasce null.
  // ---------------------------------------------------------------------------
  const createVideoPage = readFileSync(
    path.join(repoRoot, "frontend/src/pages/CreateVideo/CreateVideoPage.tsx"),
    "utf8",
  );
  if (!/expressiveness:\s*"medium",/.test(createVideoPage)) {
    failures.push(
      "expressiveness: o passo Cena nasce sem um nível escolhido — o estado inicial do assistente " +
        "(`CreateVideoPage.tsx`) não fixa `expressiveness` em \"medium\". Sem chip pré-selecionado, " +
        "quem não clicar em nenhum nível manda o vídeo com `expressiveness` ausente, e o fornecedor " +
        "aplica \"low\" em silêncio (doc: \"Defaults to 'low' when omitted\").",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. COMPORTAMENTO — o default da tela chega ao payload quando o motor
  //    efetivo é avatar_iv (caminho real de produção: flag de motor desligada
  //    força avatar_iv em avatarProvider.ts:631, independente da conta).
  // ---------------------------------------------------------------------------
  const format = resolveVideoFormat("youtube");
  const BASE = {
    providerAvatarId: "avatar-de-teste",
    format,
    supportedEngines: null,
    engineChoice: null,
  } as const;

  const comDefaultDaTela = buildHeygenVideoPayload(
    { ...BASE, engineEnabled: false, scene: { expressiveness: "medium" } },
    "asset-de-audio",
    null,
  );
  if (comDefaultDaTela.body.expressiveness !== "medium") {
    failures.push(
      "expressiveness: com o default da tela (\"medium\") e motor avatar_iv, o corpo enviado ao " +
        `fornecedor saiu com expressiveness ${JSON.stringify(comDefaultDaTela.body.expressiveness)} ` +
        'em vez de "medium".',
    );
  }

  // ---------------------------------------------------------------------------
  // 3. CONTRAPONTO — 2.4 do pedido: motor que não é avatar_iv continua
  //    omitindo o campo. A mudança de default não pode ter afrouxado esta
  //    regra, que é do fornecedor ("Avatar IV only"), não nossa.
  // ---------------------------------------------------------------------------
  const motorDiferente = buildHeygenVideoPayload(
    { ...BASE, engineEnabled: true, engineChoice: "avatar_iii", scene: { expressiveness: "medium" } },
    "asset-de-audio",
    null,
  );
  if ("expressiveness" in motorDiferente.body) {
    failures.push(
      "expressiveness: motor avatar_iii recebeu o campo `expressiveness` mesmo o fornecedor " +
        'documentando-o como "Avatar IV only" — a mudança de default do Gap 1 não pode ter afrouxado ' +
        "esta regra.",
    );
  }

  // ---------------------------------------------------------------------------
  // 4. GAP 1b — INTERAÇÃO. O chip não desfaz a própria escolha.
  //
  //    O Gap 1 fechou o estado INICIAL; esta perna fecha o estado DEPOIS do
  //    clique. O handler alternava para `null` ao reclicar o nível já marcado, e
  //    a consequência é idêntica à do defeito original: o campo some do corpo
  //    (`avatarProvider.ts:632` só o inclui quando há valor) e o fornecedor
  //    aplica "low" em silêncio, no vídeo já cobrado.
  //
  //    MEDIDO em 11/08, e é a razão desta perna existir: com o defeito VIVO no
  //    repositório, as pernas 1 a 3 desta mesma guarda devolveram
  //    `failures = 0`. Elas leem `CreateVideoPage.tsx` e chamam o construtor de
  //    payload com "medium" escrito aqui dentro — nenhuma delas abre
  //    `SceneStep.tsx`, que é onde o defeito mora. Guarda que não olha o arquivo
  //    não cobre o arquivo, por mais que o nome dela sugira o contrário.
  //
  //    Lido como TEXTO e RECORTADO no grupo de chips. Texto porque o gate roda
  //    em Node, sem DOM e sem React, e importar o `.tsx` traria a árvore de
  //    componentes junto — mesma razão da guarda dos cinco controles. RECORTADO
  //    porque `null` é legítimo em outras DOZE linhas deste arquivo (14
  //    ocorrências, MEDIDO): o chip "sem fundo" faz `onBackgroundChange(null)`
  //    de propósito, e o seletor de traje faz `e.target.value || null` — o
  //    próprio recorte deixa de fora, de quebra, o comentário que explica esta
  //    correção, que também diz `null`. Procurar no arquivo inteiro acusaria
  //    aqueles `null` para sempre e a guarda nasceria inerte — a lição do
  //    homônimo a vinte linhas de distância que já cegou `checkSpendControl`.
  // ---------------------------------------------------------------------------
  const sceneStepRel = "frontend/src/pages/CreateVideo/steps/SceneStep.tsx";
  const sceneStep = readFileSync(path.join(repoRoot, sceneStepRel), "utf8");

  // As DUAS âncoras do recorte são intrínsecas ao próprio laço dos chips: ele
  // começa em `EXPRESSIVENESS.map(` e termina no `))}` que o fecha.
  //
  // A âncora de fim já foi `</Field>`, e isso estava ERRADO — MEDIDO em 11/08,
  // trocando o `<Field>` do bloco por um `<div>`: o recorte vazou até o
  // `</Field>` do bloco SEGUINTE, engoliu o seletor de traje e a guarda reprovou
  // dizendo que o chip produzia `null`, quando o `null` era o
  // `e.target.value || null` do traje, que é legítimo. Reprovação com o dedo
  // apontado para o arquivo errado, por uma troca de wrapper que não muda
  // comportamento nenhum. E o simétrico é pior: bastaria o bloco vizinho não ter
  // `null` para o vazamento passar VERDE enquanto media a coisa errada.
  //
  // Wrapper é layout; o laço é o que está sendo medido. Por isso a âncora é o
  // laço. Trocar `<Field>` por `<div>` passa a ser o que sempre foi — mudança
  // sem efeito — e mexer no laço continua estourando.
  const inicioChips = sceneStep.indexOf("EXPRESSIVENESS.map(");
  const fimChips = inicioChips >= 0 ? sceneStep.indexOf("))}", inicioChips) : -1;
  const grupoDeChips =
    inicioChips >= 0 && fimChips > inicioChips ? sceneStep.slice(inicioChips, fimChips) : "";

  // Toda saída sem recorte é REPROVAÇÃO NOMEADA, nunca um passe vazio: uma
  // guarda que não achou o que medir e devolve verde é exatamente a guarda
  // inerte que este projeto já pagou para aprender a reconhecer.
  if (inicioChips < 0) {
    failures.push(
      `expressiveness: não achei o grupo de chips (\`EXPRESSIVENESS.map\`) em ${sceneStepRel}. É onde o ` +
        "nível de expressividade é escolhido; sem ele esta guarda não olhou nada. Se os chips mudaram de " +
        "nome ou de arquivo, esta guarda tem de mudar junto — ela não pode continuar verde por não " +
        "encontrar o que deveria vigiar.",
    );
  } else if (fimChips < 0) {
    failures.push(
      `expressiveness: achei \`EXPRESSIVENESS.map\` em ${sceneStepRel} mas não o \`))}\` que fecha o laço. ` +
        "A âncora de fim do recorte sumiu, e sem ela a guarda não delimita o que está medindo — em vez de " +
        "adivinhar um pedaço do arquivo, ela reprova.",
    );
  } else {
    // Rede contra VAZAMENTO. Se o recorte passou a conter controle de outro
    // campo, ele deixou de ser o grupo de chips — e o veredito seguinte, verde
    // ou vermelho, seria sobre outra coisa. Nomeado, e não silencioso.
    const invasores = ["onBackgroundChange", "onAvatarLookChange", "PublishStep", "onMotionPromptChange"];
    const vazou = invasores.filter((c) => grupoDeChips.includes(c));
    if (vazou.length > 0) {
      failures.push(
        `expressiveness: o recorte do grupo de chips vazou em ${sceneStepRel} — ele engoliu ${vazou.join(
          ", ",
        )}, que são controles de OUTROS campos. As âncoras (\`EXPRESSIVENESS.map(\` … \`))}\`) não estão ` +
          "mais delimitando o laço dos chips, e qualquer veredito daqui em diante seria sobre o pedaço " +
          "errado do arquivo.",
      );
    }
  }

  if (grupoDeChips) {
    if (/\bnull\b/.test(grupoDeChips)) {
      failures.push(
        "expressiveness: reclicar o chip já selecionado devolve a expressividade a null — o grupo de " +
          `chips de ${sceneStepRel} produz \`null\` em algum caminho de clique. O campo some do corpo ` +
          'enviado, o fornecedor aplica "low" ("Defaults to \'low\' when omitted") e o vídeo sai apático, ' +
          "cobrado por inteiro, sem que a tela tenha dito nada. É o defeito do Gap 1 pela porta da " +
          "interação, e nenhuma outra perna desta guarda o enxerga.",
      );
    }
    if (!/onExpressivenessChange\(nivel\)/.test(grupoDeChips)) {
      failures.push(
        `expressiveness: o clique no chip deixou de propagar o nível clicado em ${sceneStepRel}. O ` +
          "handler tem de fixar `nivel` e nada além dele: qualquer expressão condicional ali é onde o " +
          "`null` volta a caber.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 5. USO — os níveis que a TELA oferece são os que o fornecedor recebe.
  //
  //    A perna 4 é sobre a forma do handler; esta é sobre o efeito. A lista sai
  //    do arquivo da tela (não de uma cópia escrita aqui, que envelheceria em
  //    silêncio) e cada nível é levado até o corpo REAL por
  //    `buildHeygenVideoPayload`. Um nível novo na tela que o domínio não
  //    conheça, ou que não chegue ao corpo, reprova aqui — que é a diferença
  //    entre a tela ter três botões e o fornecedor receber três valores.
  // ---------------------------------------------------------------------------
  const listaDaTela = /const EXPRESSIVENESS = \[([^\]]*)\]/.exec(sceneStep);
  if (!listaDaTela) {
    failures.push(
      `expressiveness: não achei a lista \`EXPRESSIVENESS\` em ${sceneStepRel} — sem ela não dá para ` +
        "confrontar o que a tela oferece com o que o fornecedor recebe.",
    );
  } else {
    const niveisDaTela = listaDaTela[1]
      .split(",")
      .map((n) => n.trim().replace(/^["']|["']$/g, ""))
      .filter((n) => n.length > 0);

    if (niveisDaTela.length !== EXPRESSIVENESS_LEVELS.length) {
      failures.push(
        `expressiveness: a tela oferece ${niveisDaTela.length} níveis e o domínio declara ` +
          `${EXPRESSIVENESS_LEVELS.length} (${EXPRESSIVENESS_LEVELS.join(", ")}). As duas listas têm de ` +
          "andar juntas, senão a tela oferece um nível que o servidor descarta em silêncio.",
      );
    }

    for (const nivel of niveisDaTela) {
      if (!isExpressiveness(nivel)) {
        failures.push(
          `expressiveness: a tela oferece o nível ${JSON.stringify(nivel)}, que \`normalizeScene\` não ` +
            "reconhece — o servidor o transforma em `null` e o campo some do corpo enviado.",
        );
        continue;
      }
      const enviado = buildHeygenVideoPayload(
        { ...BASE, engineEnabled: false, scene: { expressiveness: nivel } },
        "asset-de-audio",
        null,
      );
      if (enviado.body.expressiveness !== nivel) {
        failures.push(
          `expressiveness: o nível ${JSON.stringify(nivel)}, que a tela oferece, chegou ao corpo enviado ` +
            `ao fornecedor como ${JSON.stringify(enviado.body.expressiveness)}.`,
        );
      }
    }
  }

  // A consequência de um `null`, medida e não suposta — é o que dá sentido às
  // duas guardas da família. Fica como NOTA, e não como reprovação: quem congela
  // a condição do motor é a perna 3, e repetir a asserção aqui só criaria dois
  // lugares para consertar o dia em que ela mudar.
  const comNull = buildHeygenVideoPayload(
    { ...BASE, engineEnabled: false, scene: { expressiveness: null } },
    "asset-de-audio",
    null,
  );
  notes.push(
    `expressiveness: com valor null o campo ${
      "expressiveness" in comNull.body ? "AINDA SAI" : "não sai"
    } no corpo enviado — é por isso que nenhum caminho de tela pode produzir null.`,
  );

  notes.push(
    'expressiveness: estado inicial confirmado como "medium" (nunca null); payload com motor avatar_iv ' +
      "leva o valor da tela; motor avatar_iii continua sem o campo, como antes; e o chip não desfaz a " +
      "escolha ao ser reclicado.",
  );
  return { failures, notes };
}
