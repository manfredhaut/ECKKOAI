/**
 * O QUE A TELA DIZ ANTES DE O DINHEIRO SAIR.
 *
 * Três vetores, um tema: cada um fecha um lugar em que a tela ficava calada
 * exatamente no instante em que falar importava.
 *
 * 1. **O resumo dos seis campos, acima do botão Gerar.** Dois vídeos pagos
 *    saíram com campos vazios sem que desse para perceber antes de clicar — o
 *    corpo era válido, o fornecedor respondeu 200, e a ausência só apareceu no
 *    vídeo pronto. O passo Cena mostra cada controle na hora de preencher, mas
 *    ninguém volta três telas para conferir.
 *
 * 2. **O traje em preparo trava o Avançar do passo 1.** Ele já foi COBRADO
 *    (60 un, US$ 1,00 medidos) e ainda não está no seletor da Cena; passar
 *    adiante leva a gerar sem ele. São dois prejuízos no mesmo clique.
 *
 * 3. **O arquivo já salvo aparece pelo NOME.** Navegador nenhum repovoa um
 *    `<input type="file">` na remontagem, e o armazenamento renomeia para
 *    `<uuid>.<ext>` (medido em `uploads/`), então o nome original não sobrevive
 *    em lugar nenhum a não ser guardado à parte. O campo dizia "nenhum ficheiro
 *    selecionado" com a imagem salva e em uso.
 *
 * COMO ELA OLHA: lendo os arquivos como TEXTO. O gate roda em Node, sem DOM e
 * sem React, e importar um `.tsx` traria a árvore de componentes junto — mesma
 * razão da guarda de fluxo do passo 1 e da dos cinco controles.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface PreflightSummaryCheckResult {
  failures: string[];
  notes: string[];
}

const RESUMO = "frontend/src/pages/CreateVideo/GenerationSummary.tsx";
const GERAR = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";
const WIZARD = "frontend/src/pages/CreateVideo/CreateVideoPage.tsx";
const PASSO1 = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

/**
 * Os SEIS campos, e de onde cada um sai no corpo de `POST /videos`.
 *
 * Declarados aqui em pares para que a guarda não aceite um resumo que mostre
 * seis linhas tiradas de outro lugar: o valor do resumo está em ele ser lido do
 * MESMO objeto que vai ao servidor. Um resumo que lê o formulário mostraria o
 * que a pessoa escolheu, e o defeito é justamente escolha que não chega.
 */
const CAMPOS: { chave: string; corpo: string; oQueE: string }[] = [
  { chave: "avatar", corpo: "corpo.avatar_id", oQueE: "o avatar" },
  // Fase A, item 3 (25/08): `corpo.avatar_look_id` era o campo do dropdown
  // "Traje", removido em 25/08 — desde então este campo é SEMPRE null, e a
  // linha do resumo mentia "Traje: nenhum" mesmo com o Traje Padrão do
  // Passo 1 (outfit/outfit_prompt) sendo enviado de verdade.
  { chave: "outfit", corpo: "corpo.outfit_prompt", oQueE: "o traje" },
  { chave: "background", corpo: "corpo.background", oQueE: "o fundo" },
  { chave: "motionPrompt", corpo: "corpo.motion_prompt", oQueE: "a interpretação" },
  { chave: "expressiveness", corpo: "corpo.expressiveness", oQueE: "a expressividade" },
  { chave: "format", corpo: "corpo.publish_platform", oQueE: "o formato" },
];

export const MUTANTS: Mutant[] = [
  {
    guard: "gerar: o resumo mostra os seis campos antes de gastar",
    name: "um dos seis campos some do resumo",
    kind: "esperto",
    // O resumo continua existindo, continua bonito, continua mostrando cinco
    // linhas — e a que sai é justamente a que ninguém confere de cabeça. É a
    // forma que a ausência silenciosa toma quando alguém "limpa" a lista.
    file: "frontend/src/pages/CreateVideo/GenerationSummary.tsx",
    find: '    { campo: "format", value: plataforma ? plataforma.aspectRatio : null },',
    replace: "",
    expect: "gerar: o resumo não mostra o formato",
  },
  {
    guard: "gerar: o resumo mostra os seis campos antes de gastar",
    name: "o resumo sai da tela de gerar",
    kind: "obvio",
    // O componente continua no repositório, com os seis campos e as traduções
    // todas — e deixa de ser renderizado. A guarda que só olhasse o arquivo do
    // resumo passaria verde com a tela vazia.
    //
    // ÂNCORA ESTENDIDA — T3 (22/08/2026): `<GenerationSummary wizard={wizard}
    // />` sozinho, mesmo com a indentação de 10 espaços, casava DUAS vezes por
    // SUBSTRING — o diálogo de confirmação do tier Simples reaproveita o
    // mesmo componente, só com 16 espaços de indentação, e uma string mais
    // curta casa dentro de uma mais longa independente de onde a linha
    // começa. O comentário que antecede esta ocorrência (a ORIGINAL, fora do
    // diálogo) é único; o do diálogo fala de "reaproveitado, não duplicado" —
    // textos diferentes de propósito.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "é derivado do MESMO objeto que vai no POST. */}\n          <GenerationSummary wizard={wizard} />",
    replace: "é derivado do MESMO objeto que vai no POST. */}",
    expect: "gerar: o resumo do que vai ser enviado não é mostrado",
  },
  {
    guard: "gerar: o resumo mostra os seis campos antes de gastar",
    name: "o resumo passa a ler o formulário em vez do corpo enviado",
    kind: "esperto",
    // A diferença não aparece na tela na maioria das vezes — os dois coincidem
    // quando tudo funciona. Ela aparece exatamente no caso que o resumo existe
    // para pegar: campo escolhido que não chega ao corpo. Aí o formulário diz
    // que está lá e o servidor recebe vazio, e o resumo confirma a mentira.
    file: "frontend/src/pages/CreateVideo/GenerationSummary.tsx",
    find: '  const corpo = corpoDaGeracao(wizard, "pt-BR");',
    replace:
      "  const corpo = {\n" +
      "    avatar_id: wizard.avatarId,\n" +
      "    avatar_look_id: wizard.avatarLookId,\n" +
      "    background: wizard.background,\n" +
      "    motion_prompt: wizard.motionPrompt,\n" +
      "    expressiveness: wizard.expressiveness,\n" +
      "    publish_platform: wizard.publishPlatform,\n" +
      "  };",
    expect: "gerar: o resumo deixou de ser derivado do corpo",
  },
  {
    guard: "gerar: a linha Traje do resumo lê o campo que realmente chega ao corpo (outfit/outfit_prompt), não o dropdown removido em 25/08 (avatar_look_id)",
    name: "a linha Traje do resumo volta a ler avatar_look_id",
    kind: "esperto",
    // ESPERTO: o resumo continua existindo, continua com seis linhas, e a
    // linha "Traje" continua parecendo válida — só que lê um campo que o
    // dropdown removido em 25/08 nunca mais preenche. Resultado: "Traje:
    // nenhum" sempre, mesmo quando o Traje Padrão do Passo 1 está sendo
    // enviado de verdade — o mesmo rótulo cosmético que este conserto fechou.
    file: "frontend/src/pages/CreateVideo/GenerationSummary.tsx",
    find: '    { campo: "outfit", value: corpo.outfit_prompt || corpo.outfit || null },',
    replace: '    { campo: "outfit", value: corpo.avatar_look_id ? (nomes.look ?? corpo.avatar_look_id) : null },',
    expect: "gerar: o resumo deixou de ser derivado do corpo em o traje",
  },
  {
    guard: "passo 1: traje em preparo trava o Avançar",
    name: "o Avançar volta a liberar com traje em preparo",
    kind: "esperto",
    // Nada quebra e nada fica vermelho: o passo 1 continua avisando que há
    // traje em preparo, o botão só volta a deixar passar. O prejuízo aparece
    // duas telas depois, num vídeo pago gerado sem o traje que acabou de ser
    // comprado.
    file: "frontend/src/pages/CreateVideo/CreateVideoPage.tsx",
    find: "    (step === 0 && wizard.avatarId !== null && !outfitPreparing) ||",
    replace: "    (step === 0 && wizard.avatarId !== null) ||",
    expect: "passo 1: o Avançar não trava com traje em preparo",
  },
  {
    guard: "passo 1: traje em preparo trava o Avançar",
    name: "a trava passa a valer também para o traje que falhou",
    kind: "esperto",
    // O outro lado, e o pior dos dois: `failed` é terminal, então travar por
    // ele prende a pessoa no passo 1 sem saída nenhuma — e a única forma de
    // sair seria criar outro traje, gastando mais US$ 1,00.
    file: "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx",
    // A linha foi renomeada em `e483929` (o payload passou a ser desembrulhado
    // uma vez só, em `lookPendentes`), e o find apodreceu junto — 0 ocorrências.
    find: '  const outfitPreparing = lookPendentes.some((p) => p.status === "processing");',
    replace: "  const outfitPreparing = lookPendentes.length > 0;",
    expect: "passo 1: a trava do Avançar deixou de distinguir preparo de falha",
  },
  {
    guard: "passo 1: o arquivo já salvo aparece pelo nome",
    name: "o nome do arquivo salvo volta a sumir da tela",
    kind: "esperto",
    // A frase "Imagem salva." continua ali, então a tela não fica muda — ela
    // fica ambígua, que foi o estado original: o campo de arquivo diz "nenhum
    // ficheiro selecionado" e a linha ao lado diz que há imagem salva, sem
    // dizer qual.
    file: "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx",
    find:
      "                  {defaults.scenarioName\n" +
      '                    ? t("createVideo.avatarSetup.imageSavedNamed", { name: defaults.scenarioName })\n' +
      '                    : t("createVideo.avatarSetup.imageSaved")}',
    replace: '                  {t("createVideo.avatarSetup.imageSaved")}',
    expect: "passo 1: o cenário já salvo não aparece pelo nome",
  },
];

async function ler(repoRoot: string, rel: string, failures: string[]): Promise<string> {
  const fonte = await readFile(path.join(repoRoot, rel), "utf8").catch(() => "");
  if (!fonte) failures.push(`pré-voo: ${rel} não foi encontrado — verificador cego é pior que reprovar.`);
  return fonte;
}

export async function checkPreflightSummaryPolicy(
  repoRoot: string,
): Promise<PreflightSummaryCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --------------------------------------------------------------- 1 -------
  const resumo = await ler(repoRoot, RESUMO, failures);
  const gerar = await ler(repoRoot, GERAR, failures);

  if (resumo) {
    for (const c of CAMPOS) {
      // `campo:` e não `key:` — ver o comentário no próprio `GenerationSummary`:
      // a guarda de feature flags conta todo `key: "..."` do frontend como
      // referência a flag, e seis linhas dessas acusavam seis flags fantasma.
      if (!resumo.includes(`campo: "${c.chave}"`)) {
        failures.push(
          `gerar: o resumo não mostra ${c.oQueE} — falta a linha \`campo: "${c.chave}"\` em ${RESUMO}. ` +
            "Os seis campos existem porque dois vídeos pagos saíram com campo vazio sem que desse para " +
            "perceber antes de clicar; uma lista com cinco linhas não chama atenção nenhuma.",
        );
      }
      if (!resumo.includes(c.corpo)) {
        failures.push(
          `gerar: o resumo deixou de ser derivado do corpo em ${c.oQueE} — \`${c.corpo}\` sumiu de ` +
            `${RESUMO}. O resumo tem de ler o MESMO objeto que vai no POST; lendo o formulário, ele ` +
            "mostraria o que a pessoa escolheu, e o defeito é justamente escolha que não chega.",
        );
      }
    }

    // A ATRIBUIÇÃO, e não a menção. Procurar `corpoDaGeracao(wizard)` solto no
    // arquivo dava verde com a chamada removida: o cabeçalho do próprio módulo
    // cita a expressão para explicar por que ela existe, e a guarda lia o
    // comentário como se fosse o código. É a armadilha já registrada duas vezes
    // neste diretório — guarda tropeçando no texto escrito para descrevê-la — e
    // aqui ela custou um mutante inerte.
    //
    // A âncora casa a ATRIBUIÇÃO e o PRIMEIRO argumento, e ignora o resto da
    // lista. `corpoDaGeracao` ganhou um segundo parâmetro (o locale da
    // interface) no bloco TRADUCAO-1, e uma âncora presa ao fechamento do
    // parêntese reprovou por mudança de assinatura — não pelo defeito. Guarda
    // que reprova por refatoração ensina a ignorar guarda.
    if (!/const corpo = corpoDaGeracao\(\s*wizard\s*[,)]/.test(resumo)) {
      failures.push(
        `gerar: o resumo deixou de ser derivado do corpo — \`const corpo = corpoDaGeracao(wizard, …)\` não ` +
          `está em ${RESUMO}. Montar o resumo a partir do wizard mostraria o que a pessoa escolheu; o ` +
          "defeito que ele existe para pegar é escolha que não chega ao corpo, e aí os dois discordam.",
      );
    }
    // Ausência ESCRITA, não omitida: a linha aparece dizendo "nenhum". Uma lista
    // que encolhe não chama atenção; uma linha que diz "Traje: nenhum" chama.
    if (!resumo.includes("summaryNone")) {
      failures.push(
        `gerar: o resumo deixou de escrever a ausência — \`summaryNone\` não aparece em ${RESUMO}. ` +
          "Campo vazio tem de virar a palavra \"nenhum\" numa linha visível, e não uma linha a menos.",
      );
    }
  }

  if (gerar) {
    // ÂNCORA ESPECÍFICA — T3 (22/08/2026): `<GenerationSummary wizard=
    // {wizard} />` sozinho passou a ocorrer DUAS vezes (o diálogo de
    // confirmação do tier Simples reaproveita o mesmo componente). Um
    // `includes` genérico nunca detectaria a ORIGINAL sumindo — a do
    // diálogo bastaria para o texto continuar "presente". A âncora inclui
    // o comentário que só existe junto da ocorrência de FORA do diálogo.
    const ANCORA_RESUMO_PRINCIPAL =
      "é derivado do MESMO objeto que vai no POST. */}\n          <GenerationSummary wizard={wizard} />";
    if (!gerar.includes(ANCORA_RESUMO_PRINCIPAL)) {
      failures.push(
        `gerar: o resumo do que vai ser enviado não é mostrado — \`<GenerationSummary>\` não é ` +
          `renderizado em ${GERAR}, antes do botão principal. O componente pode continuar perfeito no ` +
          "repositório e a tela continuar calada, que é o estado em que os dois vídeos saíram.",
      );
    } else {
      // ANTES do botão, e é o ponto todo: um resumo abaixo do botão informa o
      // preço depois da compra. `handleGenerateClick`, não `handleGenerate` —
      // T3: o botão principal passou a abrir o diálogo de confirmação antes
      // de chamar `handleGenerate`.
      const iResumo = gerar.indexOf(ANCORA_RESUMO_PRINCIPAL);
      const iBotao = gerar.indexOf("onClick={handleGenerateClick}");
      if (iBotao >= 0 && iResumo > iBotao) {
        failures.push(
          "gerar: o resumo aparece DEPOIS do botão de gerar. Conferir o que vai ser enviado só serve " +
            "antes de enviar; abaixo do botão ele vira recibo.",
        );
      }
    }
  }

  // --------------------------------------------------------------- 2 -------
  const wizard = await ler(repoRoot, WIZARD, failures);
  const passo1 = await ler(repoRoot, PASSO1, failures);

  if (wizard) {
    if (!/step === 0 &&[^)]*!outfitPreparing/.test(wizard)) {
      failures.push(
        "passo 1: o Avançar não trava com traje em preparo — a condição do passo 0 em " +
          `${WIZARD} não olha \`outfitPreparing\`. O traje já foi cobrado (60 un, US$ 1,00 medidos) e ` +
          "ainda não está no seletor da Cena: avançar agora leva direto a gerar um vídeo sem ele, e " +
          "são dois prejuízos no mesmo clique — o traje que não chegou e a geração a refazer.",
      );
    }
    if (!wizard.includes("blocked.outfitPreparing")) {
      failures.push(
        "passo 1: o botão trava por traje em preparo e não diz por quê. Um botão que apaga por causa " +
          "de algo acontecendo em outro bloco da mesma tela é indistinguível de tela quebrada.",
      );
    }
  }

  if (passo1) {
    // A condição precisa filtrar por `processing` NESTA linha. Procurar a
    // expressão solta no arquivo não serve: ela também aparece na lista de
    // pendências logo abaixo, e a guarda passaria verde com a trava cega.
    if (!/const outfitPreparing =[^\n]*p\.status === "processing"/.test(passo1)) {
      failures.push(
        "passo 1: a trava do Avançar deixou de distinguir preparo de falha — a condição em " +
          `${PASSO1} não filtra \`status === "processing"\`. \`failed\` é terminal: travar por ele ` +
          "prende a pessoa no passo 1 sem saída, e a única forma de sair seria criar outro traje, " +
          "gastando mais US$ 1,00.",
      );
    }
    if (!passo1.includes("onOutfitPreparingChange")) {
      failures.push(
        `passo 1: o estado do traje deixou de subir para quem monta o Avançar — ` +
          `\`onOutfitPreparingChange\` sumiu de ${PASSO1}.`,
      );
    }

    // ------------------------------------------------------------- 3 -------
    //
    // POR CONTAGEM, não por presença — corrigido no BLOCO B5c, MEDIDO pelo
    // próprio arnês: `defaults.scenarioName` passou a ter DUAS instâncias
    // legítimas do mesmo padrão (o bloco de "criar avatar novo", que já
    // existia, e o bloco novo de "avatar existente"). Um `.test()` sem `g`
    // pergunta só "existe em algum lugar?", e a passada `--affected` desta
    // rodada pegou o resultado: um mutante que apaga a instância ANTIGA
    // continuava achando a NOVA e o gate passava verde com o defeito
    // aplicado — guarda INERTE. Contar exige as `minimoOcorrencias`
    // conhecidas; cair abaixo é a única forma de reprovar de verdade.
    //
    // ⚠️ UI-PARIDADE-TRAJE (25/08): a entrada `["lookImageName", "a imagem
    // do traje", 1]` SAIU deste laço. Ela media o nome do arquivo salvo
    // dentro do bloco "Adicionar traje" (LOOK do fornecedor), removido nesta
    // rodada — `lookImageName` não existe mais em `AvatarSetupStep.tsx`. Não
    // é substituída por nada: o traje que sobra na tela ("Traje padrão"/
    // "Traje deste vídeo") mostra "Imagem salva." GENÉRICO por decisão já
    // registrada no próprio arquivo (`AssetDefaults` não tem `outfitName`,
    // e adicioná-lo por simetria cosmética sem consumidor no backend não foi
    // autorizado) — não há nome nenhum para esta guarda contar.
    for (const [origem, oQueE, minimoOcorrencias] of [
      ["defaults.scenarioName", "o cenário", 2],
    ] as const) {
      const usa = new RegExp(
        `${origem.replace(".", "\\.")}\\s*\\?\\s*t\\("createVideo\\.avatarSetup\\.imageSavedNamed"`,
        "g",
      );
      const ocorrencias = (passo1.match(usa) ?? []).length;
      if (ocorrencias < minimoOcorrencias) {
        failures.push(
          `passo 1: ${oQueE} já salvo não aparece pelo nome — \`${origem}\` alimenta ` +
            `\`imageSavedNamed\` em ${ocorrencias} lugar(es) de ${PASSO1}, esperado ao menos ` +
            `${minimoOcorrencias}. O campo de arquivo volta vazio a cada remontagem (o navegador não ` +
            "repõe arquivo escolhido, por segurança) e o armazenamento renomeia para `<uuid>.<ext>`, " +
            "então sem o nome guardado à parte a tela diz \"nenhum ficheiro\" sobre uma imagem que está " +
            "salva e em uso.",
        );
      }
    }
    if (!passo1.includes("scenarioName: file.name")) {
      failures.push(
        `passo 1: o nome do arquivo deixou de ser guardado no upload — \`scenarioName: file.name\` ` +
          `sumiu de ${PASSO1}. É a única cópia do nome original que sobrevive.`,
      );
    }
  }

  // --------------------------------------------------------------- i18n ----
  //
  // Chave sem tradução vira o próprio nome da chave na tela — e num resumo de
  // conferência isso é pior que não ter resumo: seis linhas de `createVideo.
  // generate.summary.avatar` não são conferíveis por ninguém.
  const CHAVES: { caminho: string[]; nome: string }[] = [
    ...CAMPOS.map((c) => ({ caminho: ["createVideo", "generate", "summary", c.chave], nome: c.chave })),
    { caminho: ["createVideo", "generate", "summaryTitle"], nome: "summaryTitle" },
    { caminho: ["createVideo", "generate", "summaryNone"], nome: "summaryNone" },
    { caminho: ["createVideo", "blocked", "outfitPreparing"], nome: "blocked.outfitPreparing" },
    { caminho: ["createVideo", "avatarSetup", "imageSavedNamed"], nome: "imageSavedNamed" },
  ];
  for (const idioma of ["pt-BR", "en"]) {
    const arquivo = `frontend/src/locales/${idioma}.json`;
    const texto = await ler(repoRoot, arquivo, failures);
    if (!texto) continue;
    let dict: unknown;
    try {
      dict = JSON.parse(texto);
    } catch (err) {
      failures.push(`pré-voo: ${arquivo} não é JSON válido (${err instanceof Error ? err.message : err}).`);
      continue;
    }
    for (const c of CHAVES) {
      let no: unknown = dict;
      for (const seg of c.caminho) {
        no = typeof no === "object" && no !== null ? (no as Record<string, unknown>)[seg] : undefined;
      }
      if (typeof no !== "string" || no.length === 0) {
        failures.push(
          `pré-voo: \`${c.caminho.join(".")}\` não existe em ${idioma}.json. A tela mostraria o nome da ` +
            "chave no lugar do texto.",
        );
      }
    }
  }

  if (failures.length === 0) {
    notes.push(
      `  gerar: os ${CAMPOS.length} campos do resumo são derivados do corpo de POST /videos e aparecem ` +
        "acima do botão, com a ausência escrita como \"nenhum\"",
    );
    notes.push(
      "  passo 1: traje em preparo trava o Avançar e diz por quê; traje falho não trava; o arquivo já " +
        "salvo aparece pelo nome nos dois campos",
    );
  }

  return { failures, notes };
}
