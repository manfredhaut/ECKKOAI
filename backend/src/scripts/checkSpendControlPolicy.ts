/**
 * Invariantes do CONTROLE DE GASTO e da CENA que chega ao fornecedor.
 *
 * As três andam juntas porque protegem o mesmo momento — o instante entre o
 * clique e a cobrança — por ângulos diferentes:
 *
 *  1. O teto diário não pode ser contornável. Ele existe porque o teto de
 *     sessão vive na memória do processo e um `restart` devolve o orçamento
 *     inteiro; se o diário também puder ser zerado ou lido como "sem limite",
 *     não sobra freio nenhum.
 *  2. O portão de roteiro longo não pode perder a MARGEM. A régua de ritmo vem
 *     de um ponto medido e o outro ponto conhecido diverge 8%; sem a margem, um
 *     vídeo estimado em 58 s passa sem aviso e volta com 63 s cobrados.
 *  3. O que o usuário escolheu tem de CHEGAR ao payload. Este é o defeito que
 *     já aconteceu neste produto: cenário e traje eram coletados, gravados e
 *     descartados no call site, e nada no sistema reclamava.
 */
import type { Mutant } from "./mutants.js";
import {
  DEFAULT_DAILY_PAID_GENERATION_LIMIT,
  DailyGenerationLimitError,
  dailyPaidGenerationLimit,
  DAILY_PAID_GENERATION_LIMIT_ENV,
} from "../services/billing/dailyGenerationLimit.js";
import { CONFIRM_ABOVE_SECONDS, requiresLongVideoConfirmation } from "../services/video/scriptDuration.js";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";

export interface SpendControlCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "gasto: o teto diário não é contornável",
    name: "o teto diário vira ilimitado quando a variável não está no ambiente",
    kind: "esperto",
    file: "backend/src/services/billing/dailyGenerationLimit.ts",
    // A função continua existindo, continua lendo a variável e continua
    // devolvendo número. Só o caso "ninguém configurou" passa a significar
    // "pode tudo" — que é exatamente o estado da máquina do operador hoje, e o
    // único em que o teto precisa funcionar sem ninguém ter feito nada.
    find: "  if (bruto === undefined || bruto.trim() === \"\") return DEFAULT_DAILY_PAID_GENERATION_LIMIT;",
    replace: "  if (bruto === undefined || bruto.trim() === \"\") return Number.POSITIVE_INFINITY;",
    expect: "teto diário sem variável de ambiente devolveu",
  },
  {
    guard: "gasto: o portão de roteiro longo mantém a margem",
    name: "o portão perde a margem e volta a comparar a estimativa crua",
    kind: "esperto",
    file: "backend/src/services/video/scriptDuration.ts",
    // O portão continua existindo, o teto continua declarado e a função
    // continua sendo chamada pelas duas rotas. Só a margem some — e ela só é
    // observável na faixa estreita logo abaixo do teto, que é justamente onde
    // um roteiro de 58 s vira um vídeo de 63 s cobrados.
    find: "  return estimatedSeconds * CONFIRM_MARGIN > CONFIRM_ABOVE_SECONDS;",
    replace: "  return estimatedSeconds > CONFIRM_ABOVE_SECONDS;",
    expect: "sem margem",
  },
  {
    guard: "gasto: a cena escolhida chega ao payload",
    name: "o fundo escolhido some do payload",
    kind: "esperto",
    file: "backend/src/services/providers/avatarProvider.ts",
    // O campo continua sendo aceito pela rota, continua sendo gravado no banco
    // e continua aparecendo na tela do vídeo pronto. Só não sai no corpo — que
    // é exatamente a forma do defeito anterior: tudo parecia funcionar, e o
    // vídeo voltava sem o fundo, sem erro nenhum em lugar nenhum.
    find: "    body.background = { type: \"color\", value: scene.background.value };",
    replace: "    void scene.background.value;",
    expect: "o fundo escolhido não chegou ao payload",
  },
  {
    guard: "gasto: os cinco controles chegam do formulário ao payload",
    name: "o formulário deixa de propagar a interpretação",
    kind: "esperto",
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    // O campo continua na tela, continua no estado do wizard, continua sendo
    // digitado e contado. Só não entra no corpo — e o vídeo volta sem a
    // interpretação pedida, sem erro em lugar nenhum. É o defeito de cenário e
    // traje reencenado uma camada acima.
    find: "    motion_prompt: wizard.motionPrompt.trim() || null,",
    replace: "",
    expect: "a interpretação não chega ao payload pelo formulário",
  },
];

export async function checkSpendControlPolicy(repoRoot: string): Promise<SpendControlCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  checkTetoDiario(failures, notes);
  checkMargemDoPortao(failures, notes);
  checkCenaChegaAoPayload(failures, notes);
  await checkCincoControles(repoRoot, failures, notes);

  return { failures, notes };
}

// --------------------------------------------------------------------- 1 ---

/**
 * O teto diário existe, é finito, e o default vale quando ninguém configurou.
 *
 * O caso que importa é o do ambiente PELADO: a máquina do operador não tem a
 * variável definida, e é aí que um teto "opcional" deixaria de existir sem que
 * ninguém percebesse — não há erro, não há aviso, só não há freio.
 */
function checkTetoDiario(failures: string[], notes: string[]): void {
  const original = process.env[DAILY_PAID_GENERATION_LIMIT_ENV];

  try {
    delete process.env[DAILY_PAID_GENERATION_LIMIT_ENV];
    const semVariavel = dailyPaidGenerationLimit();
    if (!Number.isFinite(semVariavel)) {
      failures.push(
        `gasto: teto diário sem variável de ambiente devolveu ${semVariavel} — ou seja, nenhum limite. ` +
          "O ambiente sem a variável é o estado normal da máquina do operador, e é exatamente onde o " +
          "freio precisa valer sem ninguém ter feito nada. O teto de sessão não cobre isto: ele vive na " +
          "memória do processo e um `restart` devolve o orçamento inteiro.",
      );
    } else if (semVariavel !== DEFAULT_DAILY_PAID_GENERATION_LIMIT) {
      failures.push(
        `gasto: teto diário sem variável devolveu ${semVariavel}, e o default declarado é ` +
          `${DEFAULT_DAILY_PAID_GENERATION_LIMIT}. Os dois têm de ser o mesmo número, senão o valor que ` +
          "protege a conta não é o que está escrito no código.",
      );
    }

    // Lixo na variável não pode virar "sem limite" nem NaN: `NaN >= max` é
    // falso, e um teto que responde falso a tudo é um teto desligado.
    process.env[DAILY_PAID_GENERATION_LIMIT_ENV] = "muitos";
    const lixo = dailyPaidGenerationLimit();
    if (!Number.isFinite(lixo) || lixo !== DEFAULT_DAILY_PAID_GENERATION_LIMIT) {
      failures.push(
        `gasto: teto diário com valor inválido ("muitos") devolveu ${lixo}. Um erro de digitação na ` +
          "variável não pode desligar o freio — tem de cair no default declarado.",
      );
    }

    process.env[DAILY_PAID_GENERATION_LIMIT_ENV] = "0";
    if (dailyPaidGenerationLimit() !== 0) {
      failures.push("gasto: teto diário 0 (nenhuma geração paga) não foi respeitado — zero é um teto legítimo.");
    }

    // A mensagem tem de dizer que NADA foi cobrado e como subir o teto. Uma
    // recusa nossa que parece recusa do fornecedor manda procurar defeito no
    // lugar errado — já custou meia hora neste projeto.
    const erro = new DailyGenerationLimitError(5, 5);
    if (!erro.message.includes("nada foi cobrado") || !erro.message.includes(DAILY_PAID_GENERATION_LIMIT_ENV)) {
      failures.push(
        "gasto: a mensagem do teto diário não diz que nada foi cobrado, ou não diz qual variável subir. " +
          `Recebida: "${erro.message}"`,
      );
    }
  } finally {
    if (original === undefined) delete process.env[DAILY_PAID_GENERATION_LIMIT_ENV];
    else process.env[DAILY_PAID_GENERATION_LIMIT_ENV] = original;
  }

  notes.push(
    `gasto: teto diário finito sem variável (${DEFAULT_DAILY_PAID_GENERATION_LIMIT}), imune a lixo na ` +
      "variável, aceita 0, e a recusa diz que nada foi cobrado",
  );
}

// --------------------------------------------------------------------- 2 ---

/**
 * A margem de 10% sobre a estimativa, exercitada na faixa onde ela existe.
 *
 * O ponto do teste é o intervalo entre `teto/1,10` e `teto`: ali a estimativa
 * crua passa e a estimativa com margem confirma. Uma guarda que só olhasse
 * valores muito acima ou muito abaixo do teto passaria com a margem removida.
 */
function checkMargemDoPortao(failures: string[], notes: string[]): void {
  const teto = CONFIRM_ABOVE_SECONDS;
  // Dentro da faixa protegida SÓ pela margem: 57 s crus passam, 57 × 1,10 =
  // 62,7 s não passam.
  const naFaixa = teto - 3;
  if (!requiresLongVideoConfirmation(naFaixa)) {
    failures.push(
      `gasto: ${naFaixa} s estimados não pediram confirmação, e o teto é ${teto} s. Sem margem, a ` +
        "estimativa crua passa: o ritmo de 12,8151 c/s vem de UM ponto medido e o outro ponto conhecido " +
        "diverge 8%, então um roteiro estimado nesta faixa volta acima do teto sem ninguém ter sido avisado.",
    );
  }

  // Bem abaixo do teto a margem não pode inventar confirmação: um portão que
  // dispara sempre é um portão que as pessoas aprendem a marcar sem ler.
  const bemAbaixo = Math.floor(teto / 2);
  if (requiresLongVideoConfirmation(bemAbaixo)) {
    failures.push(
      `gasto: ${bemAbaixo} s estimados pediram confirmação, com teto de ${teto} s. A margem cobre a ` +
        "dispersão da régua, não transforma todo vídeo em decisão.",
    );
  }

  if (!requiresLongVideoConfirmation(teto + 1)) {
    failures.push(`gasto: ${teto + 1} s estimados — acima do teto declarado — não pediram confirmação.`);
  }

  notes.push(
    `gasto: o portão confirma a ${naFaixa} s (dentro da faixa que só a margem cobre) e não confirma a ` +
      `${bemAbaixo} s, com teto declarado de ${teto} s`,
  );
}

// --------------------------------------------------------------------- 3 ---

/**
 * O que o usuário escolheu na cena aparece no corpo que sai para o fornecedor.
 *
 * Exercita o montador REAL, não uma cópia: é a mesma função que a rota chama, e
 * foi a ausência de qualquer verificação sobre ela que deixou cenário e traje
 * serem coletados por semanas sem nunca chegar a lugar nenhum.
 */
function checkCenaChegaAoPayload(failures: string[], notes: string[]): void {
  const base = {
    providerAvatarId: "look-de-teste",
    format: { platform: "youtube", aspectRatio: "16:9", resolution: "720p" },
    supportedEngines: ["avatar_iv", "avatar_iii"],
    engineEnabled: true,
  } as Parameters<typeof buildHeygenVideoPayload>[0];

  const cor = buildHeygenVideoPayload(
    { ...base, scene: { background: { type: "color", value: "#1B2A4A" } } },
    "audio-1",
  );
  const fundoCor = cor.body.background as { type?: string; value?: string } | undefined;
  if (fundoCor?.type !== "color" || fundoCor.value !== "#1B2A4A") {
    failures.push(
      "gasto: o fundo escolhido não chegou ao payload. O usuário escolheu uma cor no passo Cena e o " +
        "corpo que sai para o fornecedor não a carrega — que é a forma exata do defeito anterior: a " +
        "escolha era coletada, gravada e descartada no call site, sem erro nenhum em lugar nenhum.",
    );
  }

  const imagem = buildHeygenVideoPayload(
    { ...base, scene: { background: { type: "image", uploadUrl: "/uploads/t/fundo.png" } } },
    "audio-2",
    "asset-do-fornecedor",
  );
  const fundoImagem = imagem.body.background as { type?: string; asset_id?: string } | undefined;
  if (fundoImagem?.type !== "image" || fundoImagem.asset_id !== "asset-do-fornecedor") {
    failures.push(
      "gasto: o fundo por imagem não chegou ao payload como asset do fornecedor. A nossa URL " +
        "(`/uploads/…`) é servida por um host que a HeyGen não alcança, então o asset é o único jeito.",
    );
  }

  const interpretacao = buildHeygenVideoPayload(
    { ...base, scene: { motionPrompt: "gesto calmo com as mãos", expressiveness: "medium" } },
    "audio-3",
  );
  if (interpretacao.body.motion_prompt !== "gesto calmo com as mãos") {
    failures.push("gasto: a interpretação escrita pelo usuário não chegou ao payload (`motion_prompt`).");
  }
  if (interpretacao.body.expressiveness !== "medium") {
    failures.push("gasto: a expressividade escolhida não chegou ao payload (`expressiveness`).");
  }

  // O contraponto: campo vazio não pode virar campo. `motion_prompt: ""` é uma
  // instrução de movimento vazia, e nenhuma geração nossa jamais enviou o campo
  // para sabermos como o fornecedor lê a diferença.
  const vazia = buildHeygenVideoPayload(
    { ...base, scene: { motionPrompt: "   ", expressiveness: null, background: null } },
    "audio-4",
  );
  for (const campo of ["motion_prompt", "expressiveness", "background"]) {
    if (campo in vazia.body) {
      failures.push(
        `gasto: cena vazia produziu o campo "${campo}" no payload. Campo vazio não é campo: mandar ` +
          "string em branco é dar uma instrução vazia ao fornecedor, e não deixar de instruir.",
      );
    }
  }

  // Fundo por VÍDEO não existe no contrato do fornecedor. Se algum dia alguém
  // "ligar" isso inventando um tipo, o payload passa a carregar um campo que a
  // API não conhece — e a recusa chega como 4xx genérico depois do débito.
  const invalido = buildHeygenVideoPayload(
    { ...base, scene: { background: { type: "color", value: "vermelho" } } },
    "audio-5",
  );
  if ("background" in invalido.body) {
    failures.push(
      "gasto: uma cor malformada (\"vermelho\") virou campo `background` no payload. O fornecedor " +
        "recusaria com 4xx genérico DEPOIS do débito — o débito acontece antes da chamada.",
    );
  }

  notes.push(
    "gasto: cena chega ao payload nos três controles (cor, imagem como asset, interpretação), cena vazia " +
      "não produz campo nenhum, e cor malformada vira ausência",
  );
}

// --------------------------------------------------------------------- 4 ---

/**
 * OS CINCO CONTROLES, do formulário ao payload.
 *
 * As três checagens acima exercitam o montador com objetos escritos à mão. Esta
 * exercita o caminho que o USUÁRIO percorre: o corpo que a tela monta a partir
 * do estado do wizard, e daí para o payload que sai ao fornecedor.
 *
 * O defeito que ela congela não é hipotético — é o que aconteceu: a tela
 * coletava cenário e traje, o corpo da requisição os carregava, o banco os
 * gravava, e o call site não os passava adiante. Cada camada parecia certa
 * isoladamente, e nenhuma verificação olhava a corrente inteira.
 *
 * A montagem do corpo vive em `GenerateStep.tsx` e é lida como TEXTO: o gate
 * roda em Node, sem DOM e sem React, e importar um `.tsx` traria a árvore de
 * componentes junto. Ler o arquivo é o que a guarda de fluxo do passo 1 já faz
 * pelo mesmo motivo.
 */
async function checkCincoControles(repoRoot: string, failures: string[], notes: string[]): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const rel = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";
  const fonte = await readFile(path.join(repoRoot, rel), "utf8").catch(() => "");

  if (!fonte) {
    failures.push(`gasto: ${rel} não foi encontrado — a guarda dos cinco controles não olhou nada.`);
    return;
  }

  // O que o formulário TEM de propagar. O nome do campo do corpo ao lado do
  // nome do estado do wizard: os dois têm de aparecer na mesma montagem, senão
  // o campo existe no corpo com valor de outro lugar.
  const controles: { campo: string; origem: string; oQueE: string }[] = [
    { campo: "script", origem: "wizard.script", oQueE: "o texto narrado" },
    { campo: "background", origem: "wizard.background", oQueE: "o cenário" },
    { campo: "motion_prompt", origem: "wizard.motionPrompt", oQueE: "a interpretação" },
    { campo: "expressiveness", origem: "wizard.expressiveness", oQueE: "a expressividade" },
    { campo: "avatar_look_id", origem: "wizard.avatarLookId", oQueE: "o traje" },
  ];

  for (const c of controles) {
    if (!fonte.includes(`${c.campo}:`) || !fonte.includes(c.origem)) {
      failures.push(
        `gasto: ${c.oQueE} não chega ao payload pelo formulário — ${rel} monta o corpo de POST /videos sem ` +
          `\`${c.campo}\` vindo de \`${c.origem}\`. É a forma exata do defeito anterior: a tela coleta, o ` +
          "banco grava, e o controle não chega ao fornecedor sem que nada reclame.",
      );
    }
  }

  // Campo vazio não pode virar string vazia no corpo. A tela é o primeiro lugar
  // onde isso pode ser estragado, e o servidor normalizar depois não desculpa —
  // o log de prova passaria a mostrar um `motion_prompt` que não existe.
  if (!/motion_prompt:\s*wizard\.motionPrompt\.trim\(\)\s*\|\|\s*null/.test(fonte)) {
    failures.push(
      `gasto: ${rel} deixou de transformar interpretação em branco em \`null\`. Uma instrução de ` +
        "movimento vazia não é a mesma coisa que não instruir, e nenhuma geração nossa enviou o campo " +
        "para sabermos como o fornecedor lê a diferença.",
    );
  }

  notes.push(`gasto: os 5 controles do formulário chegam ao corpo de POST /videos (${rel})`);
}
