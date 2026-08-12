/**
 * CARD DE AVATAR SEM VOZ OU SEM TREINO NÃO PODE SER SELECIONADO.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 *
 * O passo 1 listava TODOS os avatares do tenant como cards clicáveis. Três
 * deles — "âncora", "teste 12" e "teste" — não têm `voice_id` nem
 * `provider_avatar_id` (MEDIDO no banco em 12/08), e não geram nada. O card
 * já ANUNCIAVA o problema: as duas `status-pill` escrevem "avatar pendente" e
 * "voz pendente". Só que anunciava e deixava clicar — o erro aparecia depois,
 * e o débito de crédito acontece ANTES de `generateVideo`.
 *
 * A condição é OR na DESQUALIFICAÇÃO, não AND: faltar UM dos dois já impede
 * gerar. Sem `voice_id` a geração falha fechada em `avatarProvider.ts` (é a
 * voz clonada que dirige a animação); sem `provider_avatar_id` não há avatar
 * para o fornecedor animar. Com AND, um card meio-pronto — um dos dois campos
 * presente — continuaria selecionável, e esse é o caso que passa despercebido
 * justamente porque o card parece meio certo.
 *
 * Nenhum texto novo entrou na tela: o motivo já estava nas `status-pill`. O
 * que faltava era a trava.
 * ---------------------------------------------------------------------------
 * COMO ESTA GUARDA MEDE — LÓGICA AVALIADA, NÃO TEXTO CASADO
 *
 * A parte que importa: ela não confere se o arquivo CONTÉM `&&`. Ela extrai a
 * expressão do predicado e a EXECUTA contra as quatro combinações de
 * (voz, treino). Uma guarda que casasse o texto continuaria verde com os
 * operandos trocados, com a comparação invertida, ou com `||` no lugar de
 * `&&` — e `||` é exatamente o mutante que devolve o card meio-pronto.
 *
 * A âncora é INTRÍNSECA ao que se mede (`const selecionavel =` … `;` e os dois
 * handlers do card), nunca o wrapper de layout — a lição registrada no Gap 1b,
 * onde `</Field>` como fim fazia o recorte vazar para o bloco seguinte.
 *
 * As DUAS metades são obrigatórias:
 *
 *  · card incompleto (qualquer um dos três casos com falta) → NÃO selecionável;
 *  · card completo → selecionável. Sem este contraponto, um predicado que
 *    recusasse tudo passaria na primeira metade — e recusar todos os cards
 *    apaga o passo 1 inteiro.
 *
 * E uma terceira: os DOIS handlers têm de estar travados. Travar só o
 * `onClick` deixa o teclado selecionando o que o mouse já não seleciona, e o
 * card continua com `role="button"`/`tabIndex={0}` anunciando-se clicável.
 * ---------------------------------------------------------------------------
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de um arquivo e quatro
 * avaliações de uma expressão booleana.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";

const ARQUIVO_DA_TELA = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "card de avatar: sem voz ou sem treino não é selecionável",
    name: "a desqualificação passa a exigir os DOIS faltando (OR vira AND)",
    kind: "esperto",
    // O MUTANTE CRÍTICO, e ele é esperto porque quase tudo continua certo: a
    // trava existe, os dois handlers continuam gated, o cursor continua
    // mudando, e os três cards MEDIDOS no banco (que não têm nem voz nem
    // treino) continuam barrados — a guarda ingênua fica verde. O que volta a
    // passar é o card MEIO-PRONTO: um `voice_id` sem treino, ou um treino sem
    // voz. Esse caso gera débito e falha depois.
    file: ARQUIVO_DA_TELA,
    find: "              const selecionavel = Boolean(a.voice_id) && Boolean(a.provider_avatar_id);",
    replace: "              const selecionavel = Boolean(a.voice_id) || Boolean(a.provider_avatar_id);",
    expect: "um card incompleto voltou a ser selecionável",
  },
  {
    guard: "card de avatar: sem voz ou sem treino não é selecionável",
    name: "a trava do teclado é removida e só o mouse fica barrado",
    kind: "esperto",
    // O `onClick` continua travado, o cursor continua `not-allowed`, o card
    // continua opaco — a tela INTEIRA continua dizendo que não dá para clicar.
    // E dá: Enter ou espaço com o card focado seleciona. É o caminho que
    // ninguém testa à mão.
    file: ARQUIVO_DA_TELA,
    find:
      "                onKeyDown={\n" +
      "                  selecionavel\n" +
      "                    ? (e) => {\n" +
      "                        if (e.key === \"Enter\" || e.key === \" \") onSelectAvatar(a.id);\n" +
      "                      }\n" +
      "                    : undefined\n" +
      "                }",
    replace:
      "                onKeyDown={(e) => {\n" +
      "                  if (e.key === \"Enter\" || e.key === \" \") onSelectAvatar(a.id);\n" +
      "                }}",
    expect: "o handler de teclado do card não está travado",
  },
];

export interface AvatarCardSelectableResult {
  failures: string[];
  notes: string[];
}

/** As quatro combinações de (voz, treino) e o veredito exigido para cada uma. */
const CASOS: ReadonlyArray<{
  rotulo: string;
  avatar: { voice_id: string | null; provider_avatar_id: string | null };
  selecionavelEsperado: boolean;
}> = [
  {
    rotulo: "completo (voz + treino)",
    avatar: { voice_id: "voz-1", provider_avatar_id: "provider-1" },
    selecionavelEsperado: true,
  },
  {
    rotulo: "meio-pronto: voz sem treino",
    avatar: { voice_id: "voz-1", provider_avatar_id: null },
    selecionavelEsperado: false,
  },
  {
    rotulo: "meio-pronto: treino sem voz",
    avatar: { voice_id: null, provider_avatar_id: "provider-1" },
    selecionavelEsperado: false,
  },
  {
    // Os três cards MEDIDOS no banco em 12/08: "âncora", "teste 12", "teste".
    rotulo: "vazio: nem voz nem treino",
    avatar: { voice_id: null, provider_avatar_id: null },
    selecionavelEsperado: false,
  },
];

export function checkAvatarCardSelectablePolicy(repoRoot: string): AvatarCardSelectableResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const fonte = readFileSync(path.join(repoRoot, ARQUIVO_DA_TELA), "utf8");

  // ---------------------------------------------------------------------------
  // 1. O PREDICADO EXISTE, e é extraído por âncora intrínseca.
  // ---------------------------------------------------------------------------
  const casado = /const selecionavel\s*=\s*([^;]+);/.exec(fonte);
  if (!casado) {
    failures.push(
      "card de avatar: não há `const selecionavel = …;` no laço dos cards de " +
        `${ARQUIVO_DA_TELA}. Sem esse predicado não existe trava: todo avatar do tenant volta a ser ` +
        "clicável, incluindo os que não têm voz nem treino — e o débito de crédito acontece ANTES de " +
        "`generateVideo`, então o erro chega depois de cobrar.",
    );
    return { failures, notes };
  }

  const expressao = casado[1].trim();

  // ---------------------------------------------------------------------------
  // 2. A LÓGICA, AVALIADA. Esta é a perna que o mutante OR→AND reprova.
  //
  //    A expressão é executada, não lida: `||` no lugar de `&&`, operandos
  //    trocados ou comparação invertida mudam o RESULTADO, e é o resultado que
  //    esta perna confere.
  // ---------------------------------------------------------------------------
  let avaliar: (a: { voice_id: string | null; provider_avatar_id: string | null }) => unknown;
  try {
    // eslint-disable-next-line no-new-func
    avaliar = new Function("a", `return (${expressao});`) as typeof avaliar;
  } catch (err) {
    failures.push(
      `card de avatar: o predicado \`${expressao}\` não é uma expressão avaliável (${String(err)}). ` +
        "Esta guarda EXECUTA o predicado em vez de casar o texto, porque texto casado continua verde " +
        "com os operandos trocados.",
    );
    return { failures, notes };
  }

  for (const caso of CASOS) {
    let obtido: unknown;
    try {
      obtido = avaliar(caso.avatar);
    } catch (err) {
      failures.push(
        `card de avatar: avaliar o predicado no caso "${caso.rotulo}" levantou ${String(err)}. ` +
          "O predicado tem de depender só do avatar da iteração.",
      );
      continue;
    }

    if (Boolean(obtido) === caso.selecionavelEsperado) continue;

    if (caso.selecionavelEsperado) {
      failures.push(
        `card de avatar: o predicado barrou o card ${caso.rotulo} — nenhum avatar pronto ficaria ` +
          `selecionável. Predicado: \`${expressao}\`. Um portão que recusa o caso normal não protege ` +
          "crédito nenhum: apaga o passo 1.",
      );
    } else {
      failures.push(
        `card de avatar: um card incompleto voltou a ser selecionável — caso ${caso.rotulo}, com o ` +
          `predicado \`${expressao}\`. A desqualificação é OR (faltar UM dos dois já impede gerar): ` +
          "sem `voice_id` a geração falha fechada em `avatarProvider.ts`, e sem `provider_avatar_id` " +
          "não há avatar para o fornecedor animar. Trocado por AND, o card meio-pronto passa — e ele é " +
          "o que engana, porque parece meio certo.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3. OS DOIS HANDLERS TRAVADOS, mais os atributos que anunciam o card como
  //    clicável. Travar só o mouse deixa o teclado selecionando.
  // ---------------------------------------------------------------------------
  const exigidos: ReadonlyArray<{ trecho: RegExp; oQue: string; porque: string }> = [
    {
      trecho: /onClick=\{selecionavel \?/,
      oQue: "o `onClick` do card",
      porque: "sem isso o clique do mouse seleciona um avatar que não gera nada",
    },
    {
      trecho: /onKeyDown=\{\s*selecionavel/,
      oQue: "o `onKeyDown` do card",
      porque:
        "sem isso Enter ou espaço com o card focado seleciona o que o mouse já não seleciona — e é o " +
        "caminho que ninguém testa à mão",
    },
    {
      trecho: /role=\{selecionavel \?/,
      oQue: "o `role` do card",
      porque: 'com `role="button"` fixo o card continua se anunciando clicável a leitor de tela',
    },
    {
      trecho: /tabIndex=\{selecionavel \?/,
      oQue: "o `tabIndex` do card",
      porque: "com `tabIndex={0}` fixo o card continua recebendo foco por Tab, convidando ao Enter",
    },
    {
      trecho: /cursor: selecionavel \?/,
      oQue: "o `cursor` do card",
      porque: "sem isso o ponteiro continua dizendo que dá para clicar",
    },
  ];

  for (const { trecho, oQue, porque } of exigidos) {
    if (!trecho.test(fonte)) {
      failures.push(
        `card de avatar: ${oQue} não está travado por \`selecionavel\` em ${ARQUIVO_DA_TELA} — ` +
          `${porque}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4. REDE ANTI-VAZAMENTO. O predicado tem de olhar os DOIS campos pelo nome:
  //    se um deles desaparecer da expressão, a avaliação acima poderia
  //    continuar coerente por acidente (uma constante, por exemplo).
  // ---------------------------------------------------------------------------
  for (const campo of ["voice_id", "provider_avatar_id"] as const) {
    if (!expressao.includes(campo)) {
      failures.push(
        `card de avatar: o predicado \`${expressao}\` não menciona \`${campo}\`. Os dois campos ` +
          "decidem, e um predicado que ignora um deles passa a decidir por outro motivo — ou por " +
          "nenhum.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      `  card de avatar: predicado \`${expressao}\` AVALIADO nas 4 combinações — completo seleciona, ` +
        "os dois meio-prontos e o vazio não",
    );
    notes.push(
      "  card de avatar: onClick, onKeyDown, role, tabIndex e cursor travados; motivo já visível nas " +
        "`status-pill` existentes, sem texto novo",
    );
  }

  return { failures, notes };
}
