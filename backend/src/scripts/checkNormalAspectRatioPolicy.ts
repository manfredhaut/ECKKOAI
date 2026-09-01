/**
 * 4:5 (Feed do Instagram) REATIVADO no tier Normal, por DERIVAÇÃO — V34,
 * item 16/17 (01/09/2026). Substitui inteiramente a guarda da V25
 * (31/08/2026), que bloqueava o CHIP porque o motor de animação (Wan,
 * então 2.6, hoje 3.0) nunca teve 4:5 no próprio enum — MEDIDO nas duas
 * migrações, e ainda verdade hoje.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDOU
 *
 * Em vez de impedir a ESCOLHA (V25), esta rodada garante que 4:5 nunca
 * chega ao PAYLOAD do fornecedor: `aspectRatioParaFornecedor` (falPipeline.ts)
 * troca "4:5" por "9:16" em todo ponto que fala com a fal (compor E animar);
 * o vídeo nasce em 9:16 — o MASTER — e `/approve-video` deriva o corte
 * central para 4:5 por SOFTWARE (`deriveVariantsForVideo`, reaproveitando a
 * infraestrutura que já existia para o caminho HeyGen, nunca antes ligada
 * ao caminho da fal). Sem segunda geração, sem barra preta (o corte é
 * SEMPRE por CROP — `deriveFormat`/`buildDerivationArgs`, formatDerivation.ts
 * — nunca por padding).
 *
 * O chip do Feed do Instagram volta a ficar sempre clicável (PublishStep.tsx);
 * a troca forçada para "9:16" ao entrar no tier Normal (SceneStep.tsx, V25)
 * foi removida — não há mais nada de que "escapar".
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA GUARDA MEDE
 *
 *  G-1  `aspectRatioParaFornecedor` — por EXECUÇÃO direta da função pura:
 *       "4:5" vira "9:16"; qualquer outro valor (incluindo `undefined`)
 *       passa intacto.
 *  G-2  os DOIS pontos que falam com o fornecedor (compor, animar) usam a
 *       função acima — por LEITURA do texto que monta cada payload. Sem
 *       isto, a função existiria e não seria CONSULTADA em algum dos dois,
 *       e 4:5 vazaria por aquele lado.
 *  G-3  o chip do Feed do Instagram não é mais desabilitado por tier
 *       (PublishStep.tsx), e a troca forçada para 9:16 saiu de SceneStep.tsx
 *       — por LEITURA (ausência de um controle não se exercita chamando
 *       função).
 *  G-4  `/approve-video` deriva o corte de 4:5 quando `video.aspect_ratio
 *       === "4:5"` — por LEITURA do call site de `deriveVariantsForVideo`
 *       em routes/videos.ts.
 *
 * NÃO VERIFICADO, e a guarda não finge o contrário: que o corte central
 * realmente preserva o sujeito em qualquer vídeo real (a régua de
 * enquadramento, item 15, é uma INSTRUÇÃO de prompt, não uma garantia); e
 * que o schema do Wan 3.0 de fato recusaria "4:5" se alguém o mandasse (é
 * o enum documentado, nunca uma chamada real que testasse isso).
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";
import { aspectRatioParaFornecedor } from "../services/video/falPipeline.js";

const PUBLISH_STEP = "frontend/src/pages/CreateVideo/steps/PublishStep.tsx";
const SCENE_STEP = "frontend/src/pages/CreateVideo/steps/SceneStep.tsx";
const PIPELINE = "backend/src/services/video/falPipeline.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "aspectRatioParaFornecedor troca 4:5 por 9:16, e só 4:5",
    name: "aspectRatioParaFornecedor deixa de trocar 4:5 por 9:16",
    kind: "obvio",
    file: PIPELINE,
    find: 'return aspectRatio === "4:5" ? "9:16" : aspectRatio;',
    replace: "return aspectRatio;",
    expect: 'aspectRatioParaFornecedor: "4:5" deveria virar "9:16" e virou',
  },
  {
    guard: "aspectRatioParaFornecedor troca 4:5 por 9:16, e só 4:5",
    name: "aspectRatioParaFornecedor passa a trocar TUDO por 9:16",
    kind: "esperto",
    // ESPERTO: continua "corrigindo" 4:5 (o teste ingênuo continuaria
    // verde) — mas agora também reescreve 16:9/1:1/qualquer coisa para
    // 9:16, quebrando todo vídeo que NÃO pediu 4:5.
    file: PIPELINE,
    find: 'return aspectRatio === "4:5" ? "9:16" : aspectRatio;',
    replace: 'return "9:16";',
    expect: 'deveria passar intacto e virou "9:16"',
  },
  {
    guard: "compor() e animar() só falam com o fornecedor pela proporção MAPEADA",
    name: "compor() volta a mandar input.aspectRatio cru",
    kind: "obvio",
    file: PIPELINE,
    find: "aspect_ratio: aspectRatioParaFornecedor(input.aspectRatio),",
    replace: "aspect_ratio: input.aspectRatio,",
    expect: "4:5: compor() não usa `aspectRatioParaFornecedor`",
  },
  {
    guard: "compor() e animar() só falam com o fornecedor pela proporção MAPEADA",
    name: "corpoAnimarWan() volta a mandar input.aspectRatio cru",
    kind: "obvio",
    file: PIPELINE,
    find: "...(input.aspectRatio ? { aspect_ratio: aspectRatioParaFornecedor(input.aspectRatio) } : {}),",
    replace: "...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),",
    expect: "4:5: corpoAnimarWan() não usa `aspectRatioParaFornecedor`",
  },
  {
    guard: "o chip do Feed do Instagram não é mais desabilitado por tier",
    name: "o chip do Feed do Instagram volta a ser desabilitado no tier Normal",
    kind: "obvio",
    file: PUBLISH_STEP,
    find: "disabled={naoHonra}",
    replace: 'disabled={naoHonra || (option.id === "instagram_feed" && tierVideo === "normal")}',
    expect: "4:5: PublishStep.tsx volta a desabilitar um chip por tier",
  },
  {
    guard: "SceneStep.tsx não força mais a troca para 9:16 ao entrar no tier Normal",
    name: "a troca forçada para reels_tiktok volta a existir",
    kind: "obvio",
    file: SCENE_STEP,
    find: "  /**\n   * A CONFIANÇA do formato escolhido nesta mesma tela, NO TIER escolhido",
    replace:
      '  useEffect(() => {\n' +
      '    if (tierVideo === "normal" && publishPlatform === "instagram_feed") {\n' +
      '      onPublishPlatformChange("reels_tiktok");\n' +
      "    }\n" +
      "  }, [tierVideo, publishPlatform, onPublishPlatformChange]);\n\n" +
      "  /**\n   * A CONFIANÇA do formato escolhido nesta mesma tela, NO TIER escolhido",
    expect: '4:5: SceneStep.tsx ainda troca a seleção para "reels_tiktok" ao entrar no tier Normal',
  },
  {
    guard: "/approve-video deriva o corte de 4:5 quando o vídeo pediu Feed do Instagram",
    name: "a derivação de 4:5 some de /approve-video",
    kind: "obvio",
    // `if (false)` literal faz o `tsc` parar de tipar o bloco normalmente
    // (código "definitivamente inalcançável") e o gate reprovaria pelo
    // `tsc`, não pela guarda — mesmo gotcha documentado em
    // checkFalVideoApprovalPolicy.ts. `String(...) === "sentinela"` é
    // sempre falso em runtime sem ser PROVADO falso em tempo de
    // compilação, então o bloco continua tipado normalmente.
    file: ROTA_DE_VIDEOS,
    find: 'if (video.aspect_ratio === "4:5" && servedUrl.startsWith("/uploads/")) {',
    replace: 'if (String(video.aspect_ratio) === "impossivel-4-5-nunca-existe" && servedUrl.startsWith("/uploads/")) {',
    expect: "4:5: backend/src/routes/videos.ts não deriva o corte de 4:5",
  },
];

export interface NormalAspectRatioCheckResult {
  failures: string[];
  notes: string[];
}

export function checkNormalAspectRatioPolicy(repoRoot: string): NormalAspectRatioCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: execução direta, função pura -----------------------------------
  if (aspectRatioParaFornecedor("4:5") !== "9:16") {
    failures.push(
      `aspectRatioParaFornecedor: "4:5" deveria virar "9:16" e virou ` +
        `${JSON.stringify(aspectRatioParaFornecedor("4:5"))}. O Wan 3.0 não tem 4:5 no enum de aspect_ratio ` +
        "(MEDIDO por WebFetch, V32) — sem a troca, a chamada real seria recusada pelo fornecedor.",
    );
  }
  for (const passa of ["9:16", "16:9", "1:1"] as const) {
    if (aspectRatioParaFornecedor(passa) !== passa) {
      failures.push(
        `aspectRatioParaFornecedor: ${JSON.stringify(passa)} deveria passar intacto e virou ` +
          `${JSON.stringify(aspectRatioParaFornecedor(passa))}. Só 4:5 precisa de substituição.`,
      );
    }
  }
  if (aspectRatioParaFornecedor(undefined) !== undefined) {
    failures.push(
      "aspectRatioParaFornecedor: `undefined` (sonda de contrato, sem proporção) deveria passar como " +
        `\`undefined\` e virou ${JSON.stringify(aspectRatioParaFornecedor(undefined))}.`,
    );
  }

  // --- G-2: leitura dos dois call sites -------------------------------------
  const pipeline = readFileSync(path.join(repoRoot, PIPELINE), "utf-8").replace(/\r\n/g, "\n");
  if (!pipeline.includes("aspect_ratio: aspectRatioParaFornecedor(input.aspectRatio),")) {
    failures.push(
      "4:5: compor() não usa `aspectRatioParaFornecedor` — a linha exata não aparece em " +
        `${PIPELINE}. Sem ela, um vídeo 4:5 chegaria à composição com "4:5" cru.`,
    );
  }
  if (
    !pipeline.includes(
      "...(input.aspectRatio ? { aspect_ratio: aspectRatioParaFornecedor(input.aspectRatio) } : {}),",
    )
  ) {
    failures.push(
      "4:5: corpoAnimarWan() não usa `aspectRatioParaFornecedor` — a linha exata não aparece em " +
        `${PIPELINE}. Sem ela, "4:5" cru chegaria ao Wan, que não tem esse valor no enum.`,
    );
  }

  // --- G-3: leitura do front (ausência de bloqueio) -------------------------
  const publishStep = readFileSync(path.join(repoRoot, PUBLISH_STEP), "utf-8").replace(/\r\n/g, "\n");
  if (/feed45BloqueadoNoNormal|bloqueadoPeloTier/.test(publishStep)) {
    failures.push(
      `4:5: PublishStep.tsx ainda referencia lógica de bloqueio por tier (\`feed45BloqueadoNoNormal\`/` +
        "`bloqueadoPeloTier`) — deveria ter sido removida nesta rodada; o chip é sempre clicável agora " +
        "(o servidor nunca manda 4:5 ao fornecedor, então não há mais o que bloquear).",
    );
  }
  // Âncora EXATA, e não regex de nome antigo: qualquer condição nova de
  // tier colada ao `disabled` (mesmo com identificador nunca visto antes)
  // precisa derrubar esta linha para passar batido.
  if (!publishStep.includes("disabled={naoHonra}")) {
    failures.push(
      "4:5: PublishStep.tsx volta a desabilitar um chip por tier — a linha exata `disabled={naoHonra}` " +
        "não aparece mais, o que significa que alguma condição de tier foi colada ao `disabled` de novo.",
    );
  }
  if (!publishStep.includes("instagramFeedTierNotice")) {
    failures.push(
      "4:5: o aviso `instagramFeedTierNotice` não aparece em PublishStep.tsx — a nota informativa sobre " +
        "a derivação (gerado em 9:16, cortado depois) precisa continuar visível no chip.",
    );
  }

  const sceneStep = readFileSync(path.join(repoRoot, SCENE_STEP), "utf-8").replace(/\r\n/g, "\n");
  if (/onPublishPlatformChange\("reels_tiktok"\)/.test(sceneStep)) {
    failures.push(
      "4:5: SceneStep.tsx ainda troca a seleção para \"reels_tiktok\" ao entrar no tier Normal — essa " +
        "troca forçada existia porque 4:5 era bloqueado (V25) e deveria ter saído nesta rodada.",
    );
  }

  // --- G-4: leitura do call site de derivação -------------------------------
  const rota = readFileSync(path.join(repoRoot, ROTA_DE_VIDEOS), "utf-8").replace(/\r\n/g, "\n");
  if (!rota.includes('if (video.aspect_ratio === "4:5" && servedUrl.startsWith("/uploads/")) {')) {
    failures.push(
      `4:5: ${ROTA_DE_VIDEOS} não deriva o corte de 4:5 — a condição exata que dispara ` +
        "`deriveVariantsForVideo` para vídeos 4:5 não foi encontrada em /approve-video.",
    );
  }
  if (!rota.includes("deriveVariantsForVideo({")) {
    failures.push(`4:5: ${ROTA_DE_VIDEOS} não chama \`deriveVariantsForVideo\` — sem ela, não há derivação nenhuma.`);
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
      "    4:5: aspectRatioParaFornecedor troca 4:5→9:16 (e só 4:5), consultada por compor() e animar(); " +
        "o chip do Feed do Instagram fica sempre clicável, sem troca forçada de tier; /approve-video " +
        "deriva o corte central para 4:5 quando pedido",
    );
  }

  return { failures, notes };
}
