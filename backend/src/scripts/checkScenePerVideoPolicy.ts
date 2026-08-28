/**
 * CENÁRIO E TRAJE VIRAM CAMPO POR VÍDEO — Cenário em 27/08, Traje em 28/08,
 * o MESMO mecanismo replicado à risca. Renomeado de
 * `checkScenarioPerVideoPolicy.ts` (só cobria Cenário) nesta rodada.
 *
 * ┌─ Por que os dois num arquivo só, agora ───────────────────────────────────┐
 * │ Os dois campos passaram a compartilhar o MESMO efeito de leitura          │
 * │ (`AvatarSetupStep.tsx`, um `useEffect` só) e a MESMA função de migração   │
 * │ (`handleSceneDefaultsSeed`, `CreateVideoPage.tsx`, um `Set` só). Não há    │
 * │ mais como testar um sem tocar o código do outro — dividir em dois          │
 * │ arquivos faria duas guardas mirarem literalmente a MESMA linha de código,  │
 * │ e uma reescrita futura do efeito quebraria as duas por um motivo só.      │
 * │                                                                            │
 * │ Traje entrou nesta rodada depois de uma CORREÇÃO DE RUMO do operador: uma  │
 * │ rodada anterior tinha decidido manter "Traje Padrão" no Passo 1 como       │
 * │ identidade fixa do avatar (ao contrário de Cenário, já removido) —         │
 * │ decisão revogada explicitamente nesta sessão, para que os dois campos      │
 * │ sigam exatamente o mesmo modelo.                                          │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  Nenhuma chave morta da UI antiga de Cenário-avatar-padrão OU
 *       Traje-avatar-padrão (`avatarSetup.scenarioTitle/scenarioPromptHelp/
 *       scenarioHelpPrompt/outfitDefaultTitle/outfitTitle/outfitPromptHelp/
 *       outfitHelpPrompt`) é referenciada em `AvatarSetupStep.tsx` — só
 *       sobreviveriam se algo reintroduzisse a UI antiga sem querer.
 *  G-2  O efeito que relê o avatar selecionado ENTREGA os QUATRO dados
 *       (`onSceneDefaultsSeed?.(id, scenario, scenario_prompt, outfit,
 *       outfit_prompt)`) — sem isto (inteiro ou só a metade do Traje), o
 *       valor salvo no avatar não chega ao pai, e a migração não tem de
 *       onde partir. Dois mutantes: a chamada inteira sumindo (quebra os
 *       dois campos) e só os dois argumentos de Traje virando `null` (quebra
 *       só Traje, Cenário continua migrando normalmente — a forma mais
 *       traiçoeira, porque metade da migração continua funcionando).
 *  G-3  `CreateVideoPage.tsx` CONECTA o callback ao componente
 *       (`onSceneDefaultsSeed={handleSceneDefaultsSeed}`) — G-2 sem isto é
 *       uma função que grita sem ninguém ouvindo.
 *  G-4  `handleSceneDefaultsSeed` de fato ESCREVE os quatro campos no wizard
 *       — sem isto, o callback existe, é chamado, e não migra nada. Mesmo
 *       par de mutantes de G-2: a escrita inteira sumindo, e só as duas
 *       linhas de Traje somem (Cenário continua migrando).
 *  G-5  A migração acontece SÓ UMA VEZ por avatar (o guard
 *       `seededSceneDefaultsAvatarIds.current.has(avatarId)` com `return`
 *       antecipado) — sem isto, qualquer re-render que refaça a leitura do
 *       avatar sobrescreveria uma edição já feita na Cena, violando "nunca
 *       descartado". Vale para os dois campos, porque é a MESMA proteção.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const PASSO1 = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";
const WIZARD_PAGE = "frontend/src/pages/CreateVideo/CreateVideoPage.tsx";

const CHAVES_MORTAS = [
  "avatarSetup.scenarioTitle",
  "avatarSetup.scenarioPromptHelp",
  "avatarSetup.scenarioHelpPrompt",
  "avatarSetup.outfitDefaultTitle",
  "avatarSetup.outfitTitle",
  "avatarSetup.outfitPromptHelp",
  "avatarSetup.outfitHelpPrompt",
] as const;

// Âncora ESTÁVEL para os dois mutantes de G-1: o botão "Concluir
// configuração" — não a UI removida em si, que não existe mais para ancorar
// nada. Aparece exatamente 1x no arquivo (a única chamada de
// `handleFinishSetup`).
const ANCORA_BOTAO_CONCLUIR =
  "              <button\n" + '                className="btn btn-primary"\n' + "                onClick={handleFinishSetup}\n";

export const MUTANTS: Mutant[] = [
  {
    guard: "passo 1: nenhum vestígio da UI antiga de Cenário/Traje-padrão-do-avatar sobrevive",
    name: "uma chave do Cenário-avatar-padrão removido volta a ser referenciada",
    kind: "obvio",
    // OBVIO, de propósito: simula o erro mais provável — alguém insere de
    // volta um pedaço da UI antiga achando que está restaurando algo, sem
    // saber que o campo agora vive na Cena, por vídeo.
    file: PASSO1,
    find: ANCORA_BOTAO_CONCLUIR,
    replace:
      '              <div className="text-muted">{t("createVideo.avatarSetup.scenarioTitle")}</div>\n' +
      ANCORA_BOTAO_CONCLUIR,
    expect: "scene-per-video: `avatarSetup.scenarioTitle` voltou a ser referenciada",
  },
  {
    guard: "passo 1: nenhum vestígio da UI antiga de Cenário/Traje-padrão-do-avatar sobrevive",
    name: "uma chave do Traje-avatar-padrão removido volta a ser referenciada",
    kind: "obvio",
    file: PASSO1,
    find: ANCORA_BOTAO_CONCLUIR,
    replace:
      '              <div className="text-muted">{t("createVideo.avatarSetup.outfitDefaultTitle")}</div>\n' +
      ANCORA_BOTAO_CONCLUIR,
    expect: "scene-per-video: `avatarSetup.outfitDefaultTitle` voltou a ser referenciada",
  },
  {
    guard: "passo 1: o efeito de avatar entrega cenário E traje para a migração (onSceneDefaultsSeed)",
    name: "onSceneDefaultsSeed inteiro some do efeito que relê o avatar",
    kind: "esperto",
    // ESPERTO: nenhum outro efeito quebra — voz, LUFS, fotos, tudo continua
    // sincronizando. Só a entrega ao pai para de acontecer, e a migração
    // trava silenciosamente: nenhum vídeo novo herda mais cenário nem traje
    // salvos no avatar, sem erro nenhum na tela.
    file: PASSO1,
    find:
      "    onSceneDefaultsSeed?.(\n" +
      "      selectedAvatar.id,\n" +
      "      selectedAvatar.scenario,\n" +
      "      selectedAvatar.scenario_prompt,\n" +
      "      selectedAvatar.outfit,\n" +
      "      selectedAvatar.outfit_prompt,\n" +
      "    );\n",
    replace: "",
    expect: "scene-per-video: o efeito de avatar não entrega mais cenário/traje salvos (onSceneDefaultsSeed)",
  },
  {
    guard: "passo 1: o efeito de avatar entrega o TRAJE salvo (não só Cenário) para a migração",
    name: "só os dois argumentos de Traje viram null na chamada a onSceneDefaultsSeed",
    kind: "esperto",
    // ESPERTO E TRAIÇOEIRO: a chamada continua acontecendo, Cenário continua
    // migrando perfeitamente (a pessoa nem desconfia de nada), e só o Traje
    // some — sempre `null`, como se o avatar nunca tivesse um salvo. É a
    // metade do defeito que o mutante anterior (chamada inteira) não cobre.
    file: PASSO1,
    find: "      selectedAvatar.outfit,\n      selectedAvatar.outfit_prompt,\n    );\n",
    replace: "      null,\n      null,\n    );\n",
    // TRANSCRIÇÃO da mensagem real do G-2 (a checagem exige o BLOCO INTEIRO
    // exato, então trocar os dois argumentos de Traje por `null` já a
    // derruba — não há checagem separada para "argumento virou null
    // literal" vs "chamada sumiu", e não precisa haver: as duas formas do
    // defeito produzem a MESMA falha de verdade, "a chamada com os quatro
    // campos não está mais lá".
    expect: "o efeito de avatar não entrega mais cenário/traje salvos (onSceneDefaultsSeed)",
  },
  {
    guard: "wizard: onSceneDefaultsSeed está conectado ao AvatarSetupStep",
    name: "a prop onSceneDefaultsSeed some da montagem do Passo 1",
    kind: "esperto",
    // ESPERTO: `AvatarSetupStep` continua recebendo as outras props
    // normalmente. O callback de migração é declarado, mas nunca passado
    // para dentro: G-2 dispara para ninguém, e a migração não acontece mesmo
    // com tudo mais certo.
    file: WIZARD_PAGE,
    find: "          onSceneDefaultsSeed={handleSceneDefaultsSeed}\n",
    replace: "",
    expect: "scene-per-video: onSceneDefaultsSeed não está mais conectado ao AvatarSetupStep",
  },
  {
    guard: "wizard: handleSceneDefaultsSeed escreve os QUATRO campos (cenário e traje) no wizard",
    name: "handleSceneDefaultsSeed inteiro para de escrever no wizard",
    kind: "esperto",
    // ESPERTO: a função continua existindo, continua sendo chamada (G-2/G-3
    // intactos), continua com a proteção de semear uma vez só — só o
    // `setWizard` para de tocar em qualquer um dos quatro campos. É a forma
    // mais silenciosa do defeito: tudo dispara, nada muda.
    file: WIZARD_PAGE,
    find:
      "      setWizard((w) => ({\n" +
      "        ...w,\n" +
      "        scenario: scenario || null,\n" +
      "        scenarioPrompt: scenarioPrompt || null,\n" +
      "        outfit: outfit || null,\n" +
      "        outfitPrompt: outfitPrompt || null,\n" +
      "      }));\n",
    replace: "      setWizard((w) => w);\n",
    // TRANSCRIÇÃO — o checker do G-4 testa os 4 campos como substrings soltas
    // (não um bloco único), então este mutante e o par de baixo ("só Traje
    // some") disparam a MESMA mensagem — é a checagem correta: os quatro
    // campos precisam sobreviver, e a mensagem não distingue "sumiram todos"
    // de "sumiram alguns", porque os dois são o mesmo defeito em grau
    // diferente.
    expect: "não escreve mais um ou mais dos quatro campos",
  },
  {
    guard: "wizard: handleSceneDefaultsSeed escreve o TRAJE (não só Cenário) no wizard",
    name: "só as duas linhas de Traje somem do setWizard",
    kind: "esperto",
    // ESPERTO E TRAIÇOEIRO, espelhando o par de G-2: Cenário continua sendo
    // escrito no wizard normalmente — só `outfit`/`outfitPrompt` somem do
    // objeto. Migração de Cenário 100% funcional escondendo que Traje nunca
    // migra.
    file: WIZARD_PAGE,
    find: "        outfit: outfit || null,\n        outfitPrompt: outfitPrompt || null,\n      }));\n",
    replace: "      }));\n",
    // Mesma mensagem do mutante irmão acima — ver o comentário dele.
    expect: "não escreve mais um ou mais dos quatro campos",
  },
  {
    guard: "wizard: a migração de cenário/traje acontece só uma vez por avatar, nunca descartando edição já feita",
    name: "handleSceneDefaultsSeed perde a proteção de semear uma vez só",
    kind: "esperto",
    // ESPERTO: a migração continua funcionando na PRIMEIRA seleção de cada
    // avatar — só passa a repetir a cada nova leitura do mesmo avatar (por
    // exemplo, ao voltar ao Passo 1 e selecionar de novo o mesmo avatar já
    // visitado), sobrescrevendo silenciosamente uma edição que a pessoa já
    // tinha feito nos campos de Cenário/Traje da Cena.
    file: WIZARD_PAGE,
    find:
      "      if (seededSceneDefaultsAvatarIds.current.has(avatarId)) return;\n" +
      "      seededSceneDefaultsAvatarIds.current.add(avatarId);\n",
    replace: "",
    expect: "scene-per-video: a proteção de semear uma vez só sumiu de frontend/src/pages/CreateVideo/CreateVideoPage.tsx",
  },
];

export interface ScenePerVideoCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkScenePerVideoPolicy(repoRoot: string): ScenePerVideoCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const passo1 = lerDaRaiz(repoRoot, PASSO1);
  const wizardPage = lerDaRaiz(repoRoot, WIZARD_PAGE);

  // ---------------------------------------------------------------------------
  // G-1 — nenhum vestígio funcional da UI antiga em AvatarSetupStep.tsx.
  // ---------------------------------------------------------------------------
  for (const chave of CHAVES_MORTAS) {
    if (passo1.includes(chave)) {
      failures.push(
        `scene-per-video: \`${chave}\` voltou a ser referenciada em ${PASSO1} — essa chave era da UI de ` +
          "Cenário/Traje PADRÃO DO AVATAR, removida do Passo 1 (Cenário em 27/08, Traje em 28/08). " +
          "Referenciá-la de novo aqui é sinal de UI antiga reintroduzida por engano.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2 — o efeito de avatar entrega cenário E traje salvos (onSceneDefaultsSeed).
  // ---------------------------------------------------------------------------
  if (
    !passo1.includes(
      "onSceneDefaultsSeed?.(\n" +
        "      selectedAvatar.id,\n" +
        "      selectedAvatar.scenario,\n" +
        "      selectedAvatar.scenario_prompt,\n" +
        "      selectedAvatar.outfit,\n" +
        "      selectedAvatar.outfit_prompt,\n" +
        "    );",
    )
  ) {
    failures.push(
      `scene-per-video: o efeito de avatar não entrega mais cenário/traje salvos (onSceneDefaultsSeed) em ` +
        `${PASSO1} — sem essa chamada com os quatro campos, a migração do padrão do avatar para o campo ` +
        "por vídeo nunca tem de onde partir (inteira, ou só a metade do Traje), mesmo com o resto da " +
        "cadeia intacto.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-3 — CreateVideoPage conecta a prop ao componente.
  // ---------------------------------------------------------------------------
  if (!wizardPage.includes("onSceneDefaultsSeed={handleSceneDefaultsSeed}")) {
    failures.push(
      `scene-per-video: onSceneDefaultsSeed não está mais conectado ao AvatarSetupStep em ${WIZARD_PAGE} ` +
        "— o callback existe e a leitura do avatar chama ele, mas ninguém o recebe do outro lado.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-4 — handleSceneDefaultsSeed escreve os 4 campos no wizard.
  // ---------------------------------------------------------------------------
  if (
    !wizardPage.includes("scenario: scenario || null,") ||
    !wizardPage.includes("scenarioPrompt: scenarioPrompt || null,") ||
    !wizardPage.includes("outfit: outfit || null,") ||
    !wizardPage.includes("outfitPrompt: outfitPrompt || null,")
  ) {
    failures.push(
      `scene-per-video: handleSceneDefaultsSeed não escreve mais um ou mais dos quatro campos (scenario/` +
        `scenarioPrompt/outfit/outfitPrompt) no wizard em ${WIZARD_PAGE} — a função pode continuar sendo ` +
        "chamada sem nunca migrar o valor de verdade, inteira ou só pela metade (Cenário migrando, " +
        "Traje não, ou o contrário).",
    );
  }

  // ---------------------------------------------------------------------------
  // G-5 — a migração acontece só uma vez por avatar (não descarta edição).
  // ---------------------------------------------------------------------------
  if (!wizardPage.includes("if (seededSceneDefaultsAvatarIds.current.has(avatarId)) return;")) {
    failures.push(
      `scene-per-video: a proteção de semear uma vez só sumiu de ${WIZARD_PAGE} — sem ela, reabrir o ` +
        "Passo 1 e reselecionar um avatar já visitado nesta visita sobrescreveria silenciosamente uma " +
        "edição de Cenário/Traje já feita na Cena, violando a regra de nunca descartar.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    scene-per-video: Cenário e Traje do Passo 1 não deixam vestígio funcional, e o valor salvo no " +
        "avatar migra para os campos por vídeo (Cena) uma vez só por avatar, sem descartar edição — os " +
        "dois campos, pela mesma função e pelo mesmo Set",
    );
  }

  return { failures, notes };
}
