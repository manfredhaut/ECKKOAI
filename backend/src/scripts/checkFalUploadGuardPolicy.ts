/**
 * RODADA 1, 29/08/2026 — três defeitos medidos no vídeo `134bc164` (US$ 0,94
 * gastos e perdidos, `vendor_rejected`) e fechados na mesma rodada.
 *
 * ┌─ O que foi medido, e o que cada guarda fecha ────────────────────────────┐
 * │ `video_url: String(videoMudoUrl)` mandava `/uploads/tenant/arquivo.mp4`  │
 * │ direto para `fal-ai/sync-lipsync/v2`. A fal não alcança o nosso disco —  │
 * │ 422 `file_download_error`, DEPOIS de o job já ter sido aceito e cobrado  │
 * │ (`provider_job_id` prova aceite). `/approve` baixa a URL da fal e        │
 * │ persiste uma cópia LOCAL para a Aprovação Nº2 tocar do nosso domínio —   │
 * │ e é essa cópia, não a URL original, que sobrevive em                    │
 * │ `videos.fal_muted_video_url` e chega a `runFalPipelineDoVideoMudo`.      │
 * │                                                                          │
 * │  G-1  `narrarSincronizar` publica de volta na fal ANTES de montar o      │
 * │       corpo de `sincronizar`, sempre que `videoMudoUrl` for local —      │
 * │       mesmo helper (`falUpload`) já usado para o áudio, duas linhas      │
 * │       acima.                                                             │
 * │  G-2  `etapaNaFal` — o único lugar por onde compor/animar/sincronizar    │
 * │       passam — recusa QUALQUER campo `*_url`/`*_urls` que comece com     │
 * │       `/`, ANTES do `falSubmit`. Não é específico de `sincronizar`: uma  │
 * │       reintrodução do mesmo defeito em `compor` ou `animar` cai na       │
 * │       mesma rede.                                                        │
 * │  G-3  `etapaNaFal` registra `fal_payload_enviado` (corpo redigido por    │
 * │       `redactDeep`) para as três etapas — o evento que faltava para      │
 * │       auditar o que de fato foi enviado a um fornecedor. Sem ele, nem    │
 * │       banco nem log guardavam o corpo de nenhuma submissão (medido:      │
 * │       `fal_pipeline_entradas_publicadas`, o mais próximo que existia,    │
 * │       só registra rótulo e quantidade das imagens de `compor`).          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ANCORAGEM: `narrarSincronizar` vai do comentário próprio até o comentário
 * que abre `runFalPipelineDoVideoMudo` — nunca um wrapper. `etapaNaFal` vai do
 * comentário de `garantirUrlsPublicas` (a guarda nasce imediatamente antes da
 * função que ela protege) até `export async function runFalPipeline(`.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "sincronizar: vídeo mudo local é publicado na fal antes do submit",
    name: "a resolução da URL do vídeo mudo perde o ramo de publicação local",
    kind: "esperto",
    // ESPERTO: a variável continua existindo, continua indo para `video_url`,
    // o tipo continua batendo (string) — só o CONTEÚDO deixa de ser
    // republicado quando é local. `videoMudoUrl` local passa direto, cru, e o
    // 422 volta a acontecer só quando a Aprovação Nº2 já tiver persistido
    // localmente (não no caminho de bloco único, onde `videoMudoUrl` já
    // nasce como URL da fal — por isso G-1b, abaixo, cobre o caso simples).
    file: PIPELINE,
    find:
      '  const videoUrlParaSincronizar = videoMudoUrl.startsWith("/")\n' +
      '    ? await falUpload(input.apiKeyFal, await readUpload(videoMudoUrl), "video/mp4")\n' +
      "    : videoMudoUrl;",
    replace: "  const videoUrlParaSincronizar = videoMudoUrl;",
    expect: "`narrarSincronizar` não republica mais o vídeo mudo local",
  },
  {
    guard: "sincronizar: vídeo mudo local é publicado na fal antes do submit",
    name: "o corpo de sincronizar volta a mandar o caminho local cru",
    kind: "obvio",
    file: PIPELINE,
    find: "    video_url: videoUrlParaSincronizar,",
    replace: "    video_url: String(videoMudoUrl),",
    expect: "o corpo de `sincronizar` em backend/src/services/video/falPipeline.ts não usa mais a URL resolvida",
  },
  {
    guard: "etapaNaFal: nenhum *_url/*_urls do corpo pode ser caminho local",
    name: "a chamada à guarda de URL some de etapaNaFal",
    kind: "esperto",
    // ESPERTO: `garantirUrlsPublicas` continua DEFINIDA, com a mesma lógica —
    // só deixa de ser CHAMADA. Uma guarda que só confira "a função existe"
    // passaria verde aqui, e é exatamente o caso que motivou a regra dos dois
    // mutantes (LIVE-2, cabeçalho de mutants.ts).
    file: PIPELINE,
    find:
      "  // RODADA 1 — corta ANTES de abrir a etapa no diário e antes de qualquer\n" +
      "  // chamada de rede. Ver `garantirUrlsPublicas`.\n" +
      "  garantirUrlsPublicas(etapa, endpointId, corpo);\n\n",
    replace: "",
    expect: "`etapaNaFal` não chama mais `garantirUrlsPublicas`",
  },
  {
    guard: "etapaNaFal: nenhum *_url/*_urls do corpo pode ser caminho local",
    name: "a condição de caminho local deixa de disparar",
    kind: "obvio",
    file: PIPELINE,
    find: 'if (typeof v === "string" && v.startsWith("/")) {',
    replace: 'if (false && typeof v === "string" && v.startsWith("/")) {',
    expect: "`garantirUrlsPublicas` não recusa mais caminho local",
  },
  {
    guard: "etapaNaFal: o corpo enviado a cada etapa é auditado (fal_payload_enviado)",
    name: "o evento de auditoria do payload some de etapaNaFal",
    kind: "obvio",
    file: PIPELINE,
    find:
      '  // RODADA 1 — o evento de auditoria que faltava: sem ele não havia como\n' +
      "  // saber o que de fato foi enviado a um fornecedor, em etapa nenhuma\n" +
      '  // (`fal_pipeline_entradas_publicadas`, o mais próximo que existia, só\n' +
      "  // registra rótulo e quantidade das imagens de `compor`, nunca o corpo).\n" +
      "  // `redactDeep` é o MESMO sumidouro de todo log estruturado deste projeto.\n" +
      '  logEvent("info", "fal_payload_enviado", {\n' +
      "    etapa,\n" +
      "    endpointId,\n" +
      "    corpo: redactDeep(corpo),\n" +
      "  });\n\n",
    replace: "",
    expect: '`etapaNaFal` não publica mais o evento "fal_payload_enviado"',
  },
];

export interface FalUploadGuardCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkFalUploadGuardPolicy(): FalUploadGuardCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const pipeline = lerDaRaiz(PIPELINE);

  // ---------------------------------------------------------------------------
  // G-1 — narrarSincronizar publica o vídeo mudo local antes de sincronizar.
  // ---------------------------------------------------------------------------
  const inicioNarrar = pipeline.indexOf("async function narrarSincronizar(");
  const fimNarrar = pipeline.indexOf("/**\n * RETOMA de um VÍDEO MUDO JÁ ANIMADO", inicioNarrar);
  if (inicioNarrar < 0 || fimNarrar < 0) {
    failures.push(
      `fal-upload-guard: não foi possível recortar \`narrarSincronizar\` em ${PIPELINE} pelas âncoras da ` +
        "própria função e de `runFalPipelineDoVideoMudo`.",
    );
  } else {
    const trecho = pipeline.slice(inicioNarrar, fimNarrar);
    if (!trecho.includes('videoMudoUrl.startsWith("/")') || !trecho.includes("await readUpload(videoMudoUrl)")) {
      failures.push(
        `fal-upload-guard: \`narrarSincronizar\` não republica mais o vídeo mudo local em ${PIPELINE} — ` +
          "esperado um ramo que detecta `videoMudoUrl.startsWith(\"/\")` e sobe o arquivo com `readUpload` " +
          "+ `falUpload` antes de montar o corpo de `sincronizar`. Sem isso, um vídeo mudo persistido " +
          "localmente pelo `/approve` (Aprovação Nº2) volta a ser mandado cru para `fal-ai/sync-lipsync/v2` " +
          "— 422 `file_download_error` depois de já aceito e cobrado.",
      );
    }
    if (!trecho.includes("video_url: videoUrlParaSincronizar,")) {
      failures.push(
        `fal-upload-guard: o corpo de \`sincronizar\` em ${PIPELINE} não usa mais a URL resolvida — ` +
          'esperado `video_url: videoUrlParaSincronizar,`. Um `video_url: String(videoMudoUrl)` cru ' +
          "reintroduz o defeito medido em 29/08 mesmo com a resolução acima intacta.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2/G-3 — etapaNaFal recusa URL local e audita o corpo enviado.
  // ---------------------------------------------------------------------------
  const inicioGuarda = pipeline.indexOf("function garantirUrlsPublicas(");
  const fimEtapa = pipeline.indexOf("export async function runFalPipeline(", inicioGuarda);
  if (inicioGuarda < 0 || fimEtapa < 0) {
    failures.push(
      `fal-upload-guard: não foi possível recortar \`garantirUrlsPublicas\`+\`etapaNaFal\` em ${PIPELINE} ` +
        "pelas âncoras `function garantirUrlsPublicas(` e `export async function runFalPipeline(`.",
    );
    return { failures, notes };
  }
  const trechoEtapa = pipeline.slice(inicioGuarda, fimEtapa);

  if (!trechoEtapa.includes('if (typeof v === "string" && v.startsWith("/")) {')) {
    failures.push(
      `fal-upload-guard: \`garantirUrlsPublicas\` não recusa mais caminho local em ${PIPELINE} — esperado ` +
        '`if (typeof v === "string" && v.startsWith("/")) {` lançando `FalPipelineError`. Sem isso, ' +
        "qualquer campo `*_url`/`*_urls` local (não só `video_url` de `sincronizar`) passa para o " +
        "`falSubmit` sem checagem nenhuma.",
    );
  }

  const inicioEtapaNaFal = trechoEtapa.indexOf("async function etapaNaFal(");
  if (inicioEtapaNaFal < 0) {
    failures.push(`fal-upload-guard: não encontrei \`async function etapaNaFal(\` em ${PIPELINE}.`);
  } else {
    const corpoEtapaNaFal = trechoEtapa.slice(inicioEtapaNaFal);
    if (!corpoEtapaNaFal.includes("garantirUrlsPublicas(etapa, endpointId, corpo);")) {
      failures.push(
        `fal-upload-guard: \`etapaNaFal\` não chama mais \`garantirUrlsPublicas\` em ${PIPELINE} — a função ` +
          "pode continuar definida e mesmo assim nunca rodar, o mesmo defeito de guarda inerte que motivou " +
          "a regra dos dois mutantes (LIVE-2).",
      );
    }
    const posChamadaGuarda = corpoEtapaNaFal.indexOf("garantirUrlsPublicas(etapa, endpointId, corpo);");
    const posSubmit = corpoEtapaNaFal.indexOf("falSubmit(input.apiKeyFal, endpointId, corpo");
    if (posChamadaGuarda >= 0 && posSubmit >= 0 && posChamadaGuarda > posSubmit) {
      failures.push(
        `fal-upload-guard: \`etapaNaFal\` chama \`garantirUrlsPublicas\` DEPOIS de \`falSubmit\` em ` +
          `${PIPELINE} — a guarda só vale alguma coisa antes do submit; depois dele a cota já foi ` +
          "consumida e a recusa chega tarde demais.",
      );
    }
    if (!corpoEtapaNaFal.includes('logEvent("info", "fal_payload_enviado", {') || !corpoEtapaNaFal.includes("redactDeep(corpo)")) {
      failures.push(
        `fal-upload-guard: \`etapaNaFal\` não publica mais o evento "fal_payload_enviado" em ${PIPELINE} — ` +
          "esperado `logEvent(\"info\", \"fal_payload_enviado\", { etapa, endpointId, corpo: redactDeep(corpo) })` " +
          "antes do submit. Sem ele, nenhuma etapa (compor/animar/sincronizar) deixa rastro do que foi " +
          "de fato enviado a um fornecedor.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "  fal-upload-guard: sincronizar publica vídeo mudo local antes do submit, etapaNaFal recusa " +
        "qualquer *_url/*_urls local ANTES do falSubmit (compor/animar/sincronizar) e audita o corpo " +
        "enviado via fal_payload_enviado",
    );
  }

  return { failures, notes };
}
