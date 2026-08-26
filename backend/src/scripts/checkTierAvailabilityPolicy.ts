/**
 * O CARTÃO "SIMPLES" NÃO PODE SER OFERECIDO A QUEM ELE NÃO SERVE PRA NADA —
 * e, desde a Fase C (multi-vendor de avatar, 22/08), o INVERSO também vale:
 * "Normal"/"Premium" não podem ser oferecidos a quem não tem fal.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHOU, ORIGINALMENTE (22/08, antes da Fase C)
 *
 * `videoTierParaPipeline` (`falPipeline.ts`) só conhecia dois motores —
 * `"normal"` e `"premium"` — e todo valor que não fosse `"premium"` caía em
 * `"normal"`. Isso era intencional NAQUELE momento: o vendor (heygen/fal) era
 * decidido pela credencial do TENANT, não pelo `tier_video`, e "simples" só
 * existiria de fato num tenant vendor=heygen. Um tenant fal-only (como
 * `dev-c77a5b8a`) que escolhia "Simples" na tela recebia um vídeo IDÊNTICO ao
 * "Normal" — mesmo motor, mesmo custo — sem nenhum aviso de que a escolha não
 * fez diferença. MEDIDO em 22/08: `tier_video='simples'` gravado, `animar`
 * submetido a `wan/v2.6/image-to-video/flash` (o motor do Normal).
 *
 * ---------------------------------------------------------------------------
 * A FASE C MUDOU O QUE SE MEDE AQUI (22/08, mesmo dia, sessão seguinte)
 *
 * `vendorRequiredByTier` (`falPipeline.ts`) passou a decidir o VENDOR pelo
 * tier, não só o motor: "simples" exige heygen; "normal"/"premium" exigem
 * fal. `routes/videos.ts` passou a RECUSAR (400 `tier_vendor_unavailable`)
 * uma geração cujo tier exige um vendor que o tenant não tem — e isso abriu o
 * MESMO problema no sentido contrário: um tenant HEYGEN-ONLY, com o wizard
 * nascendo em `tierVideo: "normal"` por padrão (`CreateVideoPage.tsx`), bateria
 * nessa recusa ao clicar em "Gerar" sem nunca ter tocado no seletor de nível.
 *
 * `SceneStep.tsx` (movido de `GenerateStep.tsx` em 25/08) passa a consultar `GET /credentials` (que desde a Fase A
 * devolve uma linha POR VENDOR de avatar, não mais uma só) e desabilita CADA
 * cartão cujo vendor exigido a conta não tem — "Simples" sem heygen, ou
 * "Normal"/"Premium" sem fal —, com uma legenda que NUNCA nomeia o fornecedor.
 * Um `useEffect` novo também troca o tier selecionado automaticamente quando
 * ele deixa de estar disponível (nunca silencioso: o botão destacado na tela
 * muda junto).
 * ---------------------------------------------------------------------------
 * COMO ESTA GUARDA MEDE
 *
 * G-1a e G-1b medem por LÓGICA AVALIADA, mesmo padrão de
 * `checkAvatarCardSelectablePolicy.ts`: extraem `const podeEscolherSimples =
 * …;` / `const podeEscolherFal = …;` por âncora intrínseca e EXECUTAM a
 * expressão contra arrays de credenciais possíveis — não casam texto, porque
 * um mutante que trocasse `===` por `!==` (o pior caso: habilita um nível pra
 * quem não serve e desabilita pra quem serve) deixaria qualquer guarda por
 * texto verde.
 *
 * G-2 mede por LÓGICA AVALIADA o ternário `indisponivel` — também extraído e
 * executado contra os 3 valores de tier × as 4 combinações de
 * podeEscolherSimples/podeEscolherFal.
 *
 * G-3 e G-4 medem FORMA — `disabled={indisponivel}` no botão e a condição da
 * legenda são JSX estrutural, não uma expressão isolável para avaliar
 * sozinha (dependem do array `TIER_OPTIONS.map` e do JSX ao redor). A âncora
 * é o recorte do laço dos cartões, INTRÍNSECA ao que se mede
 * (`TIER_OPTIONS.map((opt) => {` … o fim do `</fieldset>` que fecha o laço),
 * nunca um wrapper de layout genérico.
 * ---------------------------------------------------------------------------
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de um arquivo e
 * avaliação de expressões booleanas.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";

const ARQUIVO_DA_TELA = "frontend/src/pages/CreateVideo/steps/SceneStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "o cartão Simples só fica disponível pra quem tem heygen",
    name: "podeEscolherSimples deixa de exigir vendor 'heygen' (=== vira !==)",
    kind: "esperto",
    // O PIOR CASO possível deste bloco: com a inversão, um tenant fal-only
    // (o caso real, MEDIDO) passa a ver "Simples" DISPONÍVEL de novo — a
    // lacuna original — e um tenant heygen-de-verdade veria o cartão
    // DESABILITADO. Nada no JSX muda: só o valor que `podeEscolherSimples`
    // calcula.
    file: ARQUIVO_DA_TELA,
    find:
      '  const podeEscolherSimples = tiersDisponiveis?.simples === true;',
    replace:
      '  const podeEscolherSimples = tiersDisponiveis?.simples !== true;',
    expect: "tier: o predicado de disponibilidade do Simples deu o veredito errado",
  },
  {
    guard: "os cartões Normal e Premium só ficam disponíveis pra quem tem fal",
    name: "podeEscolherFal deixa de exigir vendor 'fal' (=== vira !==)",
    kind: "esperto",
    // O PIOR CASO simétrico: um tenant heygen-only passa a ver
    // "Normal"/"Premium" DISPONÍVEIS — o wizard nasce em "normal" por
    // padrão, então esse tenant bateria direto na recusa
    // `tier_vendor_unavailable` do servidor ao clicar em "Gerar" — e um
    // tenant fal-de-verdade veria os dois cartões DESABILITADOS.
    file: ARQUIVO_DA_TELA,
    find:
      '  const podeEscolherFal = tiersDisponiveis?.normal === true || tiersDisponiveis?.premium === true;',
    replace:
      '  const podeEscolherFal = tiersDisponiveis?.normal !== true && tiersDisponiveis?.premium !== true;',
    expect: "tier: o predicado de disponibilidade do Normal/Premium deu o veredito errado",
  },
  {
    guard: "o ternário indisponivel escolhe o predicado certo por tier (simples vs normal/premium)",
    name: "o ternário de indisponivel troca simples por normal/premium (=== vira !==)",
    kind: "esperto",
    // ESPERTO: os dois predicados (`podeEscolherSimples`,
    // `podeEscolherFal`) continuam corretos isoladamente — G-1a/G-1b não
    // pegam isto. O que quebra é QUAL dos dois cada cartão consulta: com a
    // inversão, o cartão "Simples" passa a obedecer `podeEscolherFal` e
    // "Normal"/"Premium" passam a obedecer `podeEscolherSimples` — um
    // tenant só-heygen veria "Simples" desabilitado (o inverso do que
    // deveria) e "Normal"/"Premium" habilitados (a lacuna original, na
    // direção nova).
    file: ARQUIVO_DA_TELA,
    find: '            const indisponivel = opt.value === "simples" ? !podeEscolherSimples : !podeEscolherFal;',
    replace: '            const indisponivel = opt.value !== "simples" ? !podeEscolherSimples : !podeEscolherFal;',
    expect: "tier: o ternário de indisponibilidade por tier deu o veredito errado",
  },
  {
    guard: "o cartão indisponível fica desabilitado",
    name: "o disabled some do botão do cartão",
    kind: "obvio",
    file: ARQUIVO_DA_TELA,
    find: "                disabled={indisponivel}\n",
    replace: "",
    expect: "um cartão continua clicável mesmo indisponível",
  },
  {
    guard: "a legenda de indisponibilidade aparece quando QUALQUER nível está desabilitado",
    name: "o bloco da legenda de indisponibilidade é removido",
    kind: "esperto",
    // ESPERTO: os cartões CONTINUAM desabilitados corretamente (G-3 não
    // pega isto — o `disabled` está intacto), só que sem explicação
    // nenhuma na tela. Quem vê um cartão cinza sem legenda não sabe se é
    // bug, carregamento ou decisão de produto.
    file: ARQUIVO_DA_TELA,
    find:
      "        {gruposIndisponiveisCount > 0 && (\n" +
      "          <p className=\"text-muted\" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>\n" +
      "            {t(\n" +
      "              gruposIndisponiveisCount > 1\n" +
      "                ? \"createVideo.generate.tierAllUnavailable\"\n" +
      "                : \"createVideo.generate.tierUnavailable\",\n" +
      "            )}\n" +
      "          </p>\n" +
      "        )}\n",
    replace: "",
    expect: "a legenda de indisponibilidade não aparece",
  },
  {
    guard: "a legenda considera os DOIS sentidos (Simples sem heygen, ou Normal/Premium sem fal)",
    name: "a contagem de grupos bloqueados volta a olhar só podeEscolherSimples",
    kind: "esperto",
    // ESPERTO: a legenda continua aparecendo — para o caso Simples-sem-
    // heygen, que já existia antes da Fase C. O que ela deixa de cobrir é
    // o caso NOVO: um tenant heygen-only com Normal/Premium desabilitados
    // vê os cartões cinzas SEM NENHUMA explicação, porque a contagem nem
    // olha `podeEscolherFal`.
    file: ARQUIVO_DA_TELA,
    find: "  const gruposIndisponiveisCount = [!podeEscolherSimples, !podeEscolherFal].filter(Boolean).length;",
    replace: "  const gruposIndisponiveisCount = [!podeEscolherSimples].filter(Boolean).length;",
    expect: "tier: a contagem de grupos bloqueados deu o veredito errado",
  },
  {
    guard: "A2 — a legenda distingue UM grupo bloqueado de DOIS, em vez de um OR sem contagem",
    name: "a legenda volta a juntar os dois grupos num OR sem contagem",
    kind: "esperto",
    // ESPERTO: a legenda continua aparecendo quando algo está bloqueado
    // (G-4/G-5 não pegam isto), e a contagem `gruposIndisponiveisCount`
    // continua correta — só a ESCOLHA da mensagem que regride: com os DOIS
    // grupos bloqueados (heygen E fal, ou seja, os 3 níveis inteiros
    // indisponíveis), a tela volta a dizer "Um dos níveis..." — o defeito
    // A2 do BACKLOG, MEDIDO em 25/08 por leitura direta do código, com o
    // texto errado sobrevivendo à mudança de arquivo (GenerateStep.tsx →
    // SceneStep.tsx) que moveu os cartões de nível no mesmo commit.
    file: ARQUIVO_DA_TELA,
    find:
      "            {t(\n" +
      "              gruposIndisponiveisCount > 1\n" +
      "                ? \"createVideo.generate.tierAllUnavailable\"\n" +
      "                : \"createVideo.generate.tierUnavailable\",\n" +
      "            )}",
    replace: '            {t("createVideo.generate.tierUnavailable")}',
    expect: "tier: a legenda de indisponibilidade não aparece com as duas mensagens",
  },
];

export interface TierAvailabilityResult {
  failures: string[];
  notes: string[];
}

/** As combinações de credenciais de avatar que a conta pode ter. */
/**
 * Os casos, em termos da FONTE NOVA — W4, 24/08.
 *
 * ┌─ Por que estes casos mudaram de forma ───────────────────────────────────┐
 * │ Até o W4 a tela DECIDIA a disponibilidade a partir das linhas de         │
 * │ `/credentials`, e esta guarda avaliava aquele predicado com credenciais  │
 * │ sintéticas. A decisão saiu da tela: ela agora PERGUNTA a                 │
 * │ `/videos/tier-availability`, que responde pela mesma cadeia que a        │
 * │ criação usa para recusar.                                                │
 * │                                                                          │
 * │ A propriedade que esta guarda mede continua sendo a mesma — "a tela não  │
 * │ oferece como clicável um nível que o servidor recusa" — mas a entrada    │
 * │ que a produz mudou, e por isso os casos são de disponibilidade e não de  │
 * │ credencial. Quem exercita a cadeia do SERVIDOR contra os casos de        │
 * │ credencial é `checkPlatformInheritancePolicy` (G-6), que também prova o  │
 * │ tenant ZERADO vendo os três níveis — o defeito que este bloco veio       │
 * │ consertar.                                                               │
 * │                                                                          │
 * │ `null` (ainda carregando) continua sendo o primeiro caso, e continua     │
 * │ dando FALSE nos dois: habilitar por otimismo antes da resposta é o que   │
 * │ produz o clique que o servidor recusa.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CASOS_CREDENCIAIS: ReadonlyArray<{
  rotulo: string;
  tiersDisponiveis: Record<string, boolean> | null;
  simplesEsperado: boolean;
  falEsperado: boolean;
}> = [
  { rotulo: "ainda carregando (resposta não chegou)", tiersDisponiveis: null, simplesEsperado: false, falEsperado: false },
  { rotulo: "nenhum nível disponível", tiersDisponiveis: {}, simplesEsperado: false, falEsperado: false },
  {
    rotulo: "só o Simples (conta com heygen e sem fal)",
    tiersDisponiveis: { simples: true, normal: false, premium: false },
    simplesEsperado: true,
    falEsperado: false,
  },
  {
    rotulo: "só Normal/Premium (o caso MEDIDO, dev-c77a5b8a antes da herança)",
    tiersDisponiveis: { simples: false, normal: true, premium: true },
    simplesEsperado: false,
    falEsperado: true,
  },
  {
    rotulo: "TENANT ZERADO com herança: os três disponíveis",
    tiersDisponiveis: { simples: true, normal: true, premium: true },
    simplesEsperado: true,
    falEsperado: true,
  },
  {
    rotulo: "só o Premium (normal indisponível, premium sim)",
    tiersDisponiveis: { simples: false, normal: false, premium: true },
    simplesEsperado: false,
    falEsperado: true,
  },
];

/** Os 3 tiers × as 4 combinações de disponibilidade, para o ternário `indisponivel`. */
const CASOS_INDISPONIVEL: ReadonlyArray<{
  rotulo: string;
  optValue: string;
  podeEscolherSimples: boolean;
  podeEscolherFal: boolean;
  indisponivelEsperado: boolean;
}> = [
  { rotulo: "simples, com heygen (disponível)", optValue: "simples", podeEscolherSimples: true, podeEscolherFal: false, indisponivelEsperado: false },
  { rotulo: "simples, sem heygen (indisponível)", optValue: "simples", podeEscolherSimples: false, podeEscolherFal: true, indisponivelEsperado: true },
  { rotulo: "normal, sem fal (indisponível)", optValue: "normal", podeEscolherSimples: true, podeEscolherFal: false, indisponivelEsperado: true },
  { rotulo: "premium, com fal (disponível)", optValue: "premium", podeEscolherSimples: false, podeEscolherFal: true, indisponivelEsperado: false },
];

/**
 * As 4 combinações de podeEscolherSimples/podeEscolherFal, para
 * `gruposIndisponiveisCount` — A2, Fase A item 1 (25/08).
 *
 * `trecho.includes("gruposIndisponiveisCount")` sozinho NÃO pega um mutante
 * que tire só um dos dois lados da soma: o NOME da variável continua
 * aparecendo no JSX de qualquer jeito, porque quem mudou foi a expressão que
 * a calcula, não onde ela é usada. Por isso esta é AVALIADA, como
 * `podeEscolherSimples`/`podeEscolherFal` acima — mesmo padrão de G-1a/G-1b.
 */
const CASOS_GRUPOS: ReadonlyArray<{
  rotulo: string;
  podeEscolherSimples: boolean;
  podeEscolherFal: boolean;
  esperado: number;
}> = [
  { rotulo: "os dois grupos disponíveis", podeEscolherSimples: true, podeEscolherFal: true, esperado: 0 },
  {
    rotulo: "só Simples disponível (Normal/Premium bloqueados)",
    podeEscolherSimples: true,
    podeEscolherFal: false,
    esperado: 1,
  },
  {
    rotulo: "só Normal/Premium disponível (Simples bloqueado)",
    podeEscolherSimples: false,
    podeEscolherFal: true,
    esperado: 1,
  },
  {
    rotulo: "os dois grupos bloqueados — os 3 níveis inteiros indisponíveis",
    podeEscolherSimples: false,
    podeEscolherFal: false,
    esperado: 2,
  },
];

function lerFonte(repoRoot: string): string {
  return readFileSync(path.join(repoRoot, ARQUIVO_DA_TELA), "utf8").replace(/\r\n/g, "\n");
}

function avaliarPredicadoDeCredenciais(
  failures: string[],
  notes: string[],
  fonte: string,
  nomeConst: string,
  rotuloGuarda: string,
  esperadoPorCaso: (caso: (typeof CASOS_CREDENCIAIS)[number]) => boolean,
): void {
  const casado = new RegExp(`const ${nomeConst}\\s*=\\s*([^;]+);`).exec(fonte);
  if (!casado) {
    failures.push(
      `tier: não há \`const ${nomeConst} = …;\` em ${ARQUIVO_DA_TELA}. Sem esse predicado não existe trava.`,
    );
    return;
  }
  const expressao = casado[1].trim();
  let avaliar: (tiersDisponiveis: Record<string, boolean> | null) => unknown;
  try {
    // eslint-disable-next-line no-new-func
    avaliar = new Function("tiersDisponiveis", `return (${expressao});`) as typeof avaliar;
  } catch (err) {
    failures.push(
      `${rotuloGuarda}: o predicado \`${expressao}\` não é uma expressão avaliável (${String(err)}). Esta ` +
        "guarda EXECUTA o predicado em vez de casar o texto, porque texto casado continua verde com a " +
        "comparação invertida.",
    );
    return;
  }

  let algumaFalha = false;
  for (const caso of CASOS_CREDENCIAIS) {
    let obtido: unknown;
    try {
      obtido = avaliar(caso.tiersDisponiveis);
    } catch (err) {
      failures.push(`${rotuloGuarda}: avaliar o caso "${caso.rotulo}" levantou ${String(err)}.`);
      algumaFalha = true;
      continue;
    }
    const esperado = esperadoPorCaso(caso);
    if (Boolean(obtido) === esperado) continue;
    algumaFalha = true;
    failures.push(
      `${rotuloGuarda} deu o veredito errado para ${caso.rotulo} — esperado ${esperado}, obtido ` +
        `${Boolean(obtido)}. Predicado: \`${expressao}\`.`,
    );
  }
  if (!algumaFalha) {
    notes.push(`    ${rotuloGuarda} — avaliado nas 5 combinações de credenciais possíveis`);
  }
}

export function checkTierAvailabilityPolicy(repoRoot: string): TierAvailabilityResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const fonte = lerFonte(repoRoot);

  // -------------------------------------------------------------------------
  // G-1a e G-1b — os dois predicados, AVALIADOS contra combinações de credenciais
  // -------------------------------------------------------------------------
  avaliarPredicadoDeCredenciais(
    failures,
    notes,
    fonte,
    "podeEscolherSimples",
    "tier: o predicado de disponibilidade do Simples",
    (c) => c.simplesEsperado,
  );
  avaliarPredicadoDeCredenciais(
    failures,
    notes,
    fonte,
    "podeEscolherFal",
    "tier: o predicado de disponibilidade do Normal/Premium",
    (c) => c.falEsperado,
  );

  // -------------------------------------------------------------------------
  // G-2 — o ternário `indisponivel`, AVALIADO
  // -------------------------------------------------------------------------
  const casadoIndisponivel = /const indisponivel = ([^;]+);/.exec(fonte);
  if (!casadoIndisponivel) {
    failures.push(
      `tier: não há \`const indisponivel = …;\` em ${ARQUIVO_DA_TELA}. Sem esse predicado, nenhum cartão ` +
        "sabe se deve ficar desabilitado.",
    );
  } else {
    const expressao = casadoIndisponivel[1].trim();
    let avaliar: (opt: { value: string }, podeEscolherSimples: boolean, podeEscolherFal: boolean) => unknown;
    try {
      // eslint-disable-next-line no-new-func
      avaliar = new Function(
        "opt",
        "podeEscolherSimples",
        "podeEscolherFal",
        `return (${expressao});`,
      ) as typeof avaliar;
    } catch (err) {
      failures.push(
        `tier: o predicado \`${expressao}\` não é uma expressão avaliável (${String(err)}).`,
      );
      avaliar = undefined as never;
    }
    if (avaliar) {
      let algumaFalha = false;
      for (const caso of CASOS_INDISPONIVEL) {
        let obtido: unknown;
        try {
          obtido = avaliar({ value: caso.optValue }, caso.podeEscolherSimples, caso.podeEscolherFal);
        } catch (err) {
          failures.push(`tier: avaliar o caso "${caso.rotulo}" levantou ${String(err)}.`);
          algumaFalha = true;
          continue;
        }
        if (Boolean(obtido) === caso.indisponivelEsperado) continue;
        algumaFalha = true;
        failures.push(
          `tier: o ternário de indisponibilidade por tier deu o veredito errado para ${caso.rotulo} — ` +
            `esperado indisponivel=${caso.indisponivelEsperado}, obtido=${Boolean(obtido)}. Predicado: ` +
            `\`${expressao}\`.`,
        );
      }
      if (!algumaFalha) {
        notes.push(
          "    tier: o ternário indisponivel escolhe podeEscolherSimples para \"simples\" e " +
            "podeEscolherFal para \"normal\"/\"premium\" — avaliado nos 4 casos que distinguem os dois",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // G-2b — gruposIndisponiveisCount, AVALIADO — A2, Fase A item 1 (25/08).
  // -------------------------------------------------------------------------
  const casadoGrupos = /const gruposIndisponiveisCount = ([^;]+);/.exec(fonte);
  if (!casadoGrupos) {
    failures.push(
      `tier: não há \`const gruposIndisponiveisCount = …;\` em ${ARQUIVO_DA_TELA}. Sem essa contagem, a ` +
        "legenda não sabe distinguir UM grupo bloqueado de DOIS — o defeito A2 do BACKLOG (a mensagem " +
        'dizia sempre "Um dos níveis..." mesmo com os 3 níveis inteiros indisponíveis).',
    );
  } else {
    const expressaoGrupos = casadoGrupos[1].trim();
    let avaliarGrupos: (podeEscolherSimples: boolean, podeEscolherFal: boolean) => unknown;
    try {
      // eslint-disable-next-line no-new-func
      avaliarGrupos = new Function(
        "podeEscolherSimples",
        "podeEscolherFal",
        `return (${expressaoGrupos});`,
      ) as typeof avaliarGrupos;
    } catch (err) {
      failures.push(
        `tier: o predicado \`${expressaoGrupos}\` (gruposIndisponiveisCount) não é uma expressão ` +
          `avaliável (${String(err)}).`,
      );
      avaliarGrupos = undefined as never;
    }
    if (avaliarGrupos) {
      let algumaFalha = false;
      for (const caso of CASOS_GRUPOS) {
        let obtido: unknown;
        try {
          obtido = avaliarGrupos(caso.podeEscolherSimples, caso.podeEscolherFal);
        } catch (err) {
          failures.push(
            `tier: avaliar gruposIndisponiveisCount no caso "${caso.rotulo}" levantou ${String(err)}.`,
          );
          algumaFalha = true;
          continue;
        }
        if (Number(obtido) === caso.esperado) continue;
        algumaFalha = true;
        failures.push(
          `tier: a contagem de grupos bloqueados deu o veredito errado para ${caso.rotulo} — esperado ` +
            `${caso.esperado}, obtido ${JSON.stringify(obtido)}. Predicado: \`${expressaoGrupos}\`. Sem a ` +
            'contagem certa, a legenda A2 mostra a mensagem errada — "um nível" quando são todos, ou o ' +
            "contrário.",
        );
      }
      if (!algumaFalha) {
        notes.push(
          "    tier: gruposIndisponiveisCount soma os dois lados certo — avaliado nas 4 combinações (A2)",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // G-3 e G-4 — o laço dos cartões, recortado por âncora intrínseca
  // -------------------------------------------------------------------------
  const inicioLaco = fonte.indexOf("{TIER_OPTIONS.map((opt) => {");
  const fimLaco = fonte.indexOf("</fieldset>", inicioLaco);
  if (inicioLaco < 0 || fimLaco < 0) {
    failures.push(
      "tier: não foi possível recortar o laço dos cartões em " +
        `${ARQUIVO_DA_TELA} pelas âncoras \`{TIER_OPTIONS.map((opt) => {\` e \`</fieldset>\`. A guarda ` +
        "não pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
    return { failures, notes };
  }
  const trecho = fonte.slice(inicioLaco, fimLaco);

  if (!trecho.includes("disabled={indisponivel}")) {
    failures.push(
      "tier: um cartão continua clicável mesmo indisponível — `disabled={indisponivel}` não está mais no " +
        "botão do cartão. Sem a trava, um tenant sem o vendor exigido volta a poder escolher um nível que " +
        "vai bater na recusa do servidor (ou, antes da Fase C, gerar um vídeo idêntico a outro nível sem saber).",
    );
  } else {
    notes.push("    tier: o botão de cada cartão leva `disabled={indisponivel}`");
  }

  if (
    !trecho.includes('"createVideo.generate.tierUnavailable"') ||
    !trecho.includes('"createVideo.generate.tierAllUnavailable"')
  ) {
    failures.push(
      "tier: a legenda de indisponibilidade não aparece com as duas mensagens — " +
        '`"createVideo.generate.tierUnavailable"` e `"createVideo.generate.tierAllUnavailable"` não ' +
        "estão as duas no recorte do laço dos cartões. Os cartões podem continuar desabilitados (isso é " +
        "outra guarda), mas sem a mensagem certa quem vê um cartão cinza não sabe se falta um nível ou " +
        "todos.",
    );
  } else {
    notes.push(
      "    tier: a legenda de indisponibilidade aparece quando algum nível está desabilitado, com a " +
        "mensagem certa para um grupo bloqueado ou para os dois (A2)",
    );
  }

  if (!trecho.includes("gruposIndisponiveisCount")) {
    failures.push(
      "tier: a legenda deixou de contar quantos grupos estão bloqueados — `gruposIndisponiveisCount` " +
        "não está mais no recorte do laço dos cartões. Sem a contagem, a tela não sabe distinguir UM " +
        "grupo bloqueado (ex.: só Simples) de DOIS (heygen e fal juntos, ou seja, os 3 níveis inteiros) " +
        "— o defeito A2 do BACKLOG.",
    );
  } else {
    notes.push("    tier: a legenda conta os grupos bloqueados (gruposIndisponiveisCount) — A2 fechado");
  }

  return { failures, notes };
}
