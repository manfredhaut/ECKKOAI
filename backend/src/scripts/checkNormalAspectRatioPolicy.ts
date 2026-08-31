/**
 * 4:5 (Feed do Instagram) some do tier Normal — V25, 31/08/2026.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 *
 * MEDIDO por leitura do schema oficial da fal (WebFetch, V24): o enum de
 * `aspect_ratio` de `wan/v2.6/reference-to-video/flash` — o motor de animação
 * do tier Normal — é EXATAMENTE `["16:9","9:16","1:1","4:3","3:4"]`. **4:5 não
 * está nele.** `fal-ai/nano-banana-2/edit` (o `compor`, primeira etapa paga)
 * TEM 4:5 no próprio enum — então, sem este bloqueio, um vídeo Normal com
 * "Feed do Instagram (4:5)" pagaria a composição (~US$ 0,08) e só então
 * levaria a recusa do fornecedor na animação, a etapa mais cara.
 *
 * O mesmo raciocínio de Fundo/Look (SceneStep.tsx, BLOCO A): um controle que
 * o servidor vai rejeitar depois de cobrar é pior que um controle ausente.
 *
 * Escopo: SÓ o tier Normal. O HeyGen (tier Simples) documenta 4:5 no próprio
 * enum (`HEYGEN_ASPECT_RATIOS`, videoFormat.ts) — nunca tocado aqui. O
 * Premium (Seedance 2.5) não foi medido nesta rodada, e por isso também não é
 * tocado — bloquear sem medir seria inventar uma recusa.
 * ---------------------------------------------------------------------------
 *
 * O QUE ESTA GUARDA MEDE, E O QUE ELA NÃO MEDE
 *
 * Por LEITURA de três arquivos — o defeito é um controle que deveria estar
 * desabilitado e não está, e ausência de gate não se exercita chamando
 * função:
 *
 *  (i)   PublishStep.tsx desabilita o chip `instagram_feed` quando
 *        `tierVideo === "normal"`, com o aviso `instagramFeedTierNotice`.
 *  (ii)  SceneStep.tsx troca a seleção para `reels_tiktok` (9:16, o único
 *        formato com medição real neste vendor) se alguém troca para Normal
 *        com 4:5 já escolhido — sem isto, o CHIP fica bloqueado mas o VALOR
 *        já escolhido sobreviveria no `wizard` e chegaria a `POST /videos`
 *        do mesmo jeito.
 *  (iii) A chave i18n `instagramFeedTierNotice` existe nos dois idiomas.
 *
 * NÃO VERIFICADO, e a guarda não finge o contrário: que o fornecedor de fato
 * recuse 4:5 hoje (é o schema documentado, nunca uma chamada real); e que
 * 16:9/9:16/1:1/4:3/3:4 continuem saindo sem alteração — isso é conferido por
 * LEITURA no relatório desta rodada (o array `PUBLISH_PLATFORMS` e o `if` do
 * chip não tocam nenhum outro `option.id`), não por uma segunda guarda.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";

const PUBLISH_STEP = "frontend/src/pages/CreateVideo/steps/PublishStep.tsx";
const SCENE_STEP = "frontend/src/pages/CreateVideo/steps/SceneStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "4:5 (Feed do Instagram) fica desabilitado no tier Normal",
    name: "o chip de 4:5 volta a ficar clicável em qualquer tier",
    kind: "obvio",
    file: PUBLISH_STEP,
    find: 'const bloqueadoPeloTier = option.id === "instagram_feed" && feed45BloqueadoNoNormal;',
    replace: "const bloqueadoPeloTier = false;",
    expect: "4:5: o chip não fica desabilitado no tier Normal",
  },
  {
    guard: "4:5 (Feed do Instagram) fica desabilitado no tier Normal",
    name: "feed45BloqueadoNoNormal deixa de olhar o tier",
    kind: "esperto",
    // ESPERTO: `bloqueadoPeloTier` continua existindo e sendo usado nos
    // mesmos dois lugares (disabled + aviso) — só o valor de origem para de
    // depender do tier, e o chip fica sempre liberado (ou sempre bloqueado,
    // dependendo do default) independente da escolha real.
    file: PUBLISH_STEP,
    find: 'const feed45BloqueadoNoNormal = tierVideo === "normal";',
    replace: "const feed45BloqueadoNoNormal = false;",
    expect: "4:5: o chip não fica desabilitado no tier Normal",
  },
  {
    guard: "4:5 escolhido antes de trocar para Normal não sobrevive à troca",
    name: "a seleção de 4:5 sobrevive à troca para o tier Normal",
    kind: "obvio",
    file: SCENE_STEP,
    find:
      '  useEffect(() => {\n' +
      '    if (tierVideo === "normal" && publishPlatform === "instagram_feed") {\n' +
      '      onPublishPlatformChange("reels_tiktok");\n' +
      "    }\n" +
      "  }, [tierVideo, publishPlatform, onPublishPlatformChange]);\n",
    replace: "",
    expect: "4:5: a seleção sobrevive à troca para o tier Normal",
  },
];

export interface NormalAspectRatioCheckResult {
  failures: string[];
  notes: string[];
}

export function checkNormalAspectRatioPolicy(repoRoot: string): NormalAspectRatioCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const publishStep = readFileSync(path.join(repoRoot, PUBLISH_STEP), "utf-8").replace(/\r\n/g, "\n");
  const sceneStep = readFileSync(path.join(repoRoot, SCENE_STEP), "utf-8").replace(/\r\n/g, "\n");

  if (!/const feed45BloqueadoNoNormal = tierVideo === "normal";/.test(publishStep)) {
    failures.push(
      "4:5: o chip não fica desabilitado no tier Normal — esperava " +
        '`const feed45BloqueadoNoNormal = tierVideo === "normal";` em PublishStep.tsx e não achei. Sem ' +
        "isto, um vídeo Normal com Feed do Instagram paga a composição e só então leva a recusa do Wan " +
        "na animação (o enum de aspect_ratio do wan/v2.6/reference-to-video/flash não tem 4:5).",
    );
  }
  if (
    !/disabled=\{naoHonra \|\| bloqueadoPeloTier\}/.test(publishStep) ||
    !/option\.id === "instagram_feed" && feed45BloqueadoNoNormal/.test(publishStep)
  ) {
    failures.push(
      "4:5: o chip não fica desabilitado no tier Normal — a flag `bloqueadoPeloTier` existe mas não está " +
        "ligada ao atributo `disabled` do botão, ou não é calculada só para `instagram_feed`.",
    );
  }
  if (!/instagramFeedTierNotice/.test(publishStep)) {
    failures.push(
      "4:5: o aviso `instagramFeedTierNotice` não aparece em PublishStep.tsx — sem ele, o chip fica " +
        "desabilitado sem dizer por quê.",
    );
  }

  if (
    !/tierVideo === "normal" && publishPlatform === "instagram_feed"/.test(sceneStep) ||
    !/onPublishPlatformChange\("reels_tiktok"\)/.test(sceneStep)
  ) {
    failures.push(
      "4:5: a seleção sobrevive à troca para o tier Normal — esperava um efeito em SceneStep.tsx trocando " +
        'para "reels_tiktok" quando `tierVideo === "normal"` e `publishPlatform === "instagram_feed"`, e ' +
        "não achei. Sem isto, o chip fica visualmente bloqueado mas o valor já escolhido continua indo " +
        "para `POST /videos`.",
    );
  }
  if (!/tierVideo=\{tierVideo\}/.test(sceneStep)) {
    failures.push(
      "4:5: SceneStep.tsx deixou de passar `tierVideo` para `<PublishStep>` — sem o prop, o componente não " +
        "tem como saber que está no tier Normal.",
    );
  }

  for (const idioma of ["pt-BR", "en"]) {
    const textos = JSON.parse(
      readFileSync(path.join(repoRoot, `frontend/src/locales/${idioma}.json`), "utf8"),
    ) as { createVideo?: { publish?: Record<string, string> } };
    if (!textos.createVideo?.publish?.instagramFeedTierNotice) {
      failures.push(`4:5: falta \`createVideo.publish.instagramFeedTierNotice\` em ${idioma}.json.`);
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    4:5: o chip do Feed do Instagram fica desabilitado no tier Normal, com aviso nos 2 idiomas, e " +
        "uma seleção prévia de 4:5 é trocada para 9:16 ao entrar no tier Normal",
    );
  }

  return { failures, notes };
}
