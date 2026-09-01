/**
 * 4:5 (Feed do Instagram) REATIVADO no tier Normal, por DERIVAÇÃO — V34,
 * item 16/17 (01/09/2026). Substitui inteiramente a guarda da V25
 * (31/08/2026), que bloqueava o CHIP porque o motor de animação (Wan,
 * então 2.6, hoje 3.0) nunca teve 4:5 no próprio enum — MEDIDO nas duas
 * migrações, e ainda verdade hoje.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDOU — SÓ NO BACKEND, NESTA RODADA
 *
 * `aspectRatioParaFornecedor` (falPipeline.ts) troca "4:5" por "9:16" em todo
 * ponto que fala com a fal (compor E animar); o vídeo nasce em 9:16 — o
 * MASTER — e `/approve-video` deriva o corte central para 4:5 por SOFTWARE
 * (`deriveVariantsForVideo`, reaproveitando a infraestrutura que já existia
 * para o caminho HeyGen, nunca antes ligada ao caminho da fal) quando
 * `video.aspect_ratio === "4:5"`. Sem segunda geração, sem barra preta (o
 * corte é SEMPRE por CROP — `deriveFormat`/`buildDerivationArgs`,
 * formatDerivation.ts — nunca por padding).
 *
 * ⚠️ **O CHIP DO FEED DO INSTAGRAM CONTINUA BLOQUEADO NO TIER NORMAL —
 * DECISÃO EXPLÍCITA DO OPERADOR NO FECHAMENTO DO V34.** A versão anterior
 * desta guarda também exigia o chip sempre clicável e a remoção da troca
 * forçada em SceneStep.tsx; as duas mudanças de frontend foram REVERTIDAS a
 * pedido do operador (frontend volta byte a byte ao que era antes do V34),
 * e esta guarda foi reduzida para não vigiar mais nenhum arquivo de
 * frontend. Hoje, "4:5" no tier Normal só é alcançável por quem montar o
 * corpo de `POST /videos` diretamente (fora do wizard) — o mapeamento e a
 * derivação no backend continuam corretos e testados, mas NADA na tela
 * oferece essa escolha.
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
 *  G-3  `/approve-video` deriva o corte de 4:5 quando `video.aspect_ratio
 *       === "4:5"` — por LEITURA do call site de `deriveVariantsForVideo`
 *       em routes/videos.ts.
 *
 * NÃO VERIFICADO, e a guarda não finge o contrário: que o corte central
 * realmente preserva o sujeito em qualquer vídeo real (a régua de
 * enquadramento, item 15, é uma INSTRUÇÃO de prompt, não uma garantia); que
 * o schema do Wan 3.0 de fato recusaria "4:5" se alguém o mandasse (é o
 * enum documentado, nunca uma chamada real que testasse isso); e se algo
 * fora do wizard hoje de fato envia `aspect_ratio: "4:5"` para o tier
 * Normal — a rota aceita, mas nada no produto atual o produz.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";
import { aspectRatioParaFornecedor } from "../services/video/falPipeline.js";

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

  // --- G-3: leitura do call site de derivação -------------------------------
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

  if (failures.length === 0) {
    notes.push(
      "    4:5: aspectRatioParaFornecedor troca 4:5→9:16 (e só 4:5), consultada por compor() e animar(); " +
        "/approve-video deriva o corte central para 4:5 quando pedido — SÓ NO BACKEND: o chip do Feed do " +
        "Instagram continua bloqueado no tier Normal, revertido a pedido do operador no fechamento do V34",
    );
  }

  return { failures, notes };
}
