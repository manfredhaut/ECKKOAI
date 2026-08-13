/**
 * A APROVAÇÃO da imagem composta — as três invariantes do BLOCO B3.
 *
 *  G-A  vídeo em `awaiting_approval` não é tratado como órfão pelo recovery
 *  G-B  nenhuma etapa paga posterior à composição sai sem aprovação registrada
 *  G-C  refazer recompõe sem disparar o Wan
 *
 * ┌─ As três medem por EXECUÇÃO, e cada uma tem um desfecho ─────────────────┐
 * │ G-A  a varredura de boot roda com `pool.query` substituído. Sem a        │
 * │      exceção, a linha `awaiting_approval` é REACOMPANHADA — e            │
 * │      reacompanhar chama `pollVideoJob`, que despacha por                 │
 * │      `did ? … : heygen`: a chave da fal sairia para `api.heygen.com`.    │
 * │      O desfecho não é estético, é o vazamento que                        │
 * │      `VENDORS_WITH_CONNECTION_PROBE` existe para impedir.                │
 * │                                                                          │
 * │ G-B  ordem com desfecho, e o desfecho é o SEGUNDO CLIQUE. No caminho     │
 * │      feliz as duas ordens terminam igual (gotcha 9); a corrida que as    │
 * │      distingue é `marcarAprovado` devolvendo `false`. Nesta ordem        │
 * │      `animar` não é chamado; na inversa o Wan já foi pago quando o       │
 * │      registro responde que a aprovação não era daquele clique.           │
 * │                                                                          │
 * │ G-C  o pipeline REAL roda com `globalThis.fetch` substituído, e o sinal  │
 * │      é o endpoint SUBMETIDO. "Refazer" que encadeia não parece diferente │
 * │      em tela nenhuma — só na fatura, 12× maior.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o `pool.query` é   │
 * │ substituído e o diário é um array), nenhuma espera real.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { ENDPOINT_ANIMAR, ENDPOINT_COMPOR } from "../services/video/falPipeline.js";
import { aprovarEAnimar, recompor } from "../services/video/falApproval.js";
import { recoverInFlightVideos, videoRecoveryMaxAgeMs, videoApprovalMaxAgeMs } from "../services/video/recovery.js";

const RECUPERACAO = "backend/src/services/video/recovery.ts";
const APROVACAO = "backend/src/services/video/falApproval.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "vídeo em awaiting_approval não é tratado como órfão pelo recovery",
    name: "a exceção da aprovação pendente some da varredura",
    kind: "obvio",
    // O `if` continua no arquivo, a função de expiração continua sendo
    // chamada em lugar nenhum de novo, e o `tsc` continua verde — só a
    // CONDIÇÃO deixa de casar. É a mesma forma dos mutantes `if (limite < 0)`
    // e `if (previsto < 0)` deste projeto: manter a linha compilando e tirar
    // dela o efeito, em vez de apagá-la e arriscar `noUnusedLocals`.
    //
    // ⚠️ NÃO usar `if (false && …)`: o TypeScript trata o corpo como
    // inalcançável e o gate sai 2 pelo `tsc` — o arnês devolveu AMBÍGUO com a
    // guarda saudável quando isso foi tentado no B2.
    file: RECUPERACAO,
    find: "      if (linha.status === STATUS_AGUARDANDO_APROVACAO) {",
    replace: '      if (linha.status === "estado-que-nenhuma-linha-tem") {',
    expect: "vídeo aguardando aprovação foi tratado como registro preso",
  },
  {
    guard: "nenhuma etapa paga posterior à composição sai sem aprovação registrada",
    name: "anima primeiro e registra a aprovação depois",
    kind: "esperto",
    // ESPERTO: o caminho feliz termina IDÊNTICO — o vídeo sai, a linha fica
    // aprovada, e uma guarda que perguntasse "a aprovação é registrada?"
    // seguiria verde. O que muda é o segundo clique, que num botão de tela é
    // o caso comum: o Wan roda ANTES de alguém descobrir que aquela aprovação
    // já tinha acontecido.
    file: APROVACAO,
    find:
      "  const aprovado = await input.registro.marcarAprovado();\n" +
      "  if (!aprovado) {",
    replace:
      "  const jaAnimado = await input.animar();\n" +
      "  void jaAnimado;\n" +
      "  const aprovado = await input.registro.marcarAprovado();\n" +
      "  if (!aprovado) {",
    expect: "uma etapa paga rodou sem aprovação registrada antes dela",
  },
  {
    guard: "refazer recompõe sem disparar o Wan",
    name: "o refazer encadeia até a sincronia",
    kind: "esperto",
    // ESPERTO porque nada na tela muda: o botão continua dizendo "Refazer", a
    // imagem continua sendo recomposta, e a corrida continua terminando bem.
    // Só que ela passa a seguir para a animação — e o clique que existe para
    // iterar por US$ 0,08 passa a custar ~US$ 1,52, sem uma palavra diferente
    // em lugar nenhum.
    file: APROVACAO,
    find: 'export const PARAR_APOS_RECOMPOR: EtapaDoPipeline = "compor";',
    replace: 'export const PARAR_APOS_RECOMPOR: EtapaDoPipeline = "sincronizar";',
    expect: "o refazer disparou a animação",
  },
];

export interface FalApprovalCheckResult {
  failures: string[];
  notes: string[];
}

const ROTEIRO_DA_PROVA = "Roteiro da prova, curto o bastante para caber no teto.";

// ---------------------------------------------------------------------------
// G-A: a varredura, com o banco substituído
// ---------------------------------------------------------------------------

interface Varredura {
  reacompanhados: string[];
  encerrados: { id: string; reason: string }[];
  encontrados: number;
}

/**
 * Roda `recoverInFlightVideos` sobre linhas construídas.
 *
 * Duas delas estão em `awaiting_approval`: uma RECENTE (que não pode ser
 * tocada) e uma VELHA (que tem de expirar). A terceira é um `queued` recente
 * com job, e existe como controle — sem ela, uma varredura que não fizesse
 * nada passaria nas duas primeiras verificações.
 */
async function varrer(): Promise<Varredura> {
  const queryOriginal = pool.query.bind(pool);
  const idadeAprovacao = videoApprovalMaxAgeMs();
  const idadeRecuperacao = videoRecoveryMaxAgeMs();

  const linhas = [
    {
      id: "v-aguardando-recente",
      status: "awaiting_approval",
      // COM job id: o `request_id` da composição, que a rota grava. É o que
      // torna esta linha perigosa sem a exceção — ela não cai no ramo do
      // órfão, cai no de REACOMPANHAR.
      provider_job_id: "req-da-composicao",
      idade_ms: Math.floor(idadeAprovacao / 2),
    },
    {
      id: "v-aguardando-velho",
      status: "awaiting_approval",
      provider_job_id: "req-da-composicao-velha",
      idade_ms: idadeAprovacao + 60_000,
    },
    {
      id: "v-queued-recente",
      status: "queued",
      provider_job_id: "job-heygen",
      idade_ms: Math.floor(idadeRecuperacao / 2),
    },
  ].map((l) => ({
    ...l,
    tenant_id: "t-1",
    provider_vendor: "fal",
    publish_platform: "youtube",
    aspect_ratio: "16:9",
    resolution: "720p",
    provider_engine: null,
    duration_seconds: 10,
    simulated: false,
  }));

  const reacompanhados: string[] = [];
  const encerrados: { id: string; reason: string }[] = [];
  let encontrados = 0;
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/FROM videos\s+WHERE status = ANY/.test(sql)) return { rows: linhas, rowCount: linhas.length };
      if (/UPDATE videos SET status = 'error'/.test(sql)) {
        const v = valores as unknown[];
        encerrados.push({ id: String(v[0]), reason: String(v[2]) });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    const r = await recoverInFlightVideos(async (linha) => {
      reacompanhados.push(linha.id);
    });
    encontrados = r.encontrados;
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
  }

  return { reacompanhados, encerrados, encontrados };
}

// ---------------------------------------------------------------------------
// G-C: o refazer, com a rede substituída
// ---------------------------------------------------------------------------

/** Roda `recompor` de verdade e devolve os endpoints SUBMETIDOS, na ordem. */
async function refazer(): Promise<{ submetidos: string[]; erro: string }> {
  const fetchOriginal = globalThis.fetch;
  const submetidos: string[] = [];

  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );
    if (url.includes("rest.fal.ai") || url.includes("fal.invalido")) {
      return new Response(
        JSON.stringify({
          file_url: "https://exemplo.fal.invalido/entrada.bin",
          upload_url: "https://exemplo.fal.invalido/put/entrada.bin",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.elevenlabs.io")) {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("audio-da-prova").toString("base64"),
          alignment: { character_end_times_seconds: [0.1, 4.87] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/requests/") && url.endsWith("/status")) {
      return new Response(JSON.stringify({ status: "COMPLETED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/requests/")) {
      return new Response(
        JSON.stringify({
          images: [{ url: "https://exemplo.fal.invalido/imagem.png" }],
          video: { url: "https://exemplo.fal.invalido/video.mp4" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const endpoint = url.replace("https://queue.fal.run/", "");
    submetidos.push(endpoint);
    return new Response(
      JSON.stringify({
        request_id: "req-da-prova",
        status_url: `https://queue.fal.run/${endpoint}/requests/req-da-prova/status`,
        response_url: `https://queue.fal.run/${endpoint}/requests/req-da-prova`,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const diario = {
    async abrirEtapa() {
      return "step";
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
  };

  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";
  try {
    // `live` porque em fixture o `falClient` desvia antes da rede e nenhuma
    // submissão existiria para contar.
    process.env.PROVIDER_MODE = "live";
    await recompor({
      apiKeyFal: "chave-irrelevante-fetch-substituido",
      apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      script: ROTEIRO_DA_PROVA,
      fotoBase: Buffer.from("foto-da-prova"),
      fotoMimeType: "image/jpeg",
      promptDeComposicao: "traje e cenário da prova",
      diario: diario as never,
      // Teto FOLGADO de propósito: com um teto apertado, quem barraria o Wan
      // seria o dinheiro, e a guarda passaria a medir o teto em vez do
      // `pararApos`. O que se afirma aqui é que o REFAZER não encadeia — e
      // isso só é observável quando nada mais está barrando.
      tetoDeGastoUsd: 99,
      pollTimeoutMs: 50,
      pollIntervalMs: 1,
      esperar: async () => {},
    });
  } catch (err) {
    erro = String(err);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { submetidos, erro };
}

export async function checkFalApprovalPolicy(): Promise<FalApprovalCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-A
  // -------------------------------------------------------------------------
  const v = await varrer();

  if (v.encontrados !== 3) {
    failures.push(
      `aprovação: a varredura encontrou ${v.encontrados} registros, esperado 3. Se ela deixou de SELECIONAR ` +
        "os `awaiting_approval`, a expiração de 24 h nunca acontece — e uma aprovação abandonada fica na " +
        "galeria para sempre, com o crédito debitado.",
    );
  }
  if (v.reacompanhados.includes("v-aguardando-recente")) {
    failures.push(
      "aprovação: vídeo aguardando aprovação foi tratado como registro preso — a varredura o REACOMPANHOU. " +
        "Reacompanhar chama `pollVideoJob`, que despacha por `did ? … : heygen`: com vendor `fal` a chave " +
        "do tenant sairia em claro para `api.heygen.com`, no header `x-api-key`. Não há nada a acompanhar " +
        "numa composição que já terminou e está esperando um clique humano.",
    );
  }
  const encerradoRecente = v.encerrados.find((e) => e.id === "v-aguardando-recente");
  if (encerradoRecente) {
    failures.push(
      `aprovação: vídeo aguardando aprovação foi tratado como registro preso — encerrado como ` +
        `\`${encerradoRecente.reason}\` dentro da janela. A composição foi PAGA e a imagem existe; ` +
        "encerrá-la joga fora US$ 0,08 já gastos e, se o motivo estornar, cria crédito do nada.",
    );
  }
  const encerradoVelho = v.encerrados.find((e) => e.id === "v-aguardando-velho");
  if (!encerradoVelho || encerradoVelho.reason !== "approval_expired") {
    failures.push(
      "aprovação: aprovação pendente ALÉM da janela não foi expirada como `approval_expired` — " +
        `encerrados: ${JSON.stringify(v.encerrados)}. Ignorar o estado é tão ruim quanto encerrá-lo cedo: ` +
        "sem expiração, `awaiting_approval` vira o novo `queued` para sempre.",
    );
  }
  if (!v.reacompanhados.includes("v-queued-recente")) {
    failures.push(
      "aprovação: o CONTROLE falhou — um `queued` recente com job id deixou de ser reacompanhado. A " +
        "exceção da aprovação vazou para os estados que ela não devia tocar.",
    );
  }
  if (failures.length === 0) {
    notes.push(
      "    aprovação: a varredura ignora aprovação pendente recente, expira a velha como " +
        "`approval_expired`, e continua reacompanhando `queued`",
    );
  }

  // -------------------------------------------------------------------------
  // G-B — a ordem, com o desfecho do segundo clique
  // -------------------------------------------------------------------------
  const eventos: string[] = [];
  const segundoClique = await aprovarEAnimar({
    videoId: "v-da-prova",
    registro: {
      async marcarAprovado() {
        eventos.push("registrou");
        // `false` = a linha já não estava em `awaiting_approval`. É a corrida
        // que dá desfecho à ordem.
        return false;
      },
    },
    animar: async () => {
      eventos.push("animou");
      return "video-da-prova";
    },
  });

  if (eventos.includes("animou")) {
    failures.push(
      "aprovação: uma etapa paga rodou sem aprovação registrada antes dela — com `marcarAprovado` " +
        `devolvendo false, a sequência foi ${eventos.join(" → ")}. Registrar DEPOIS de animar não protege ` +
        "nada: no segundo clique o Wan (~US$ 1,00) já foi pago quando o registro finalmente responde que " +
        "aquela aprovação não era daquele clique.",
    );
  }
  if (segundoClique.aprovado || segundoClique.resultado !== null) {
    failures.push(
      `aprovação: o segundo clique voltou como aprovado (${JSON.stringify(segundoClique)}). Quem não ` +
        "conseguiu marcar não aprovou nada, e devolver o contrário faz a rota responder 200 sobre trabalho " +
        "que ela não fez.",
    );
  }

  // CONTRAPONTO: com `marcarAprovado` devolvendo true, `animar` TEM de rodar.
  // Sem isto, uma guarda que simplesmente nunca animasse passaria acima.
  const eventosFeliz: string[] = [];
  const primeiroClique = await aprovarEAnimar({
    videoId: "v-da-prova",
    registro: {
      async marcarAprovado() {
        eventosFeliz.push("registrou");
        return true;
      },
    },
    animar: async () => {
      eventosFeliz.push("animou");
      return "video-da-prova";
    },
  });
  if (eventosFeliz.join(" → ") !== "registrou → animou" || primeiroClique.resultado !== "video-da-prova") {
    failures.push(
      `aprovação: o caminho aprovado não registrou-e-animou nessa ordem — sequência ${eventosFeliz.join(" → ")}, ` +
        `resultado ${JSON.stringify(primeiroClique.resultado)}. Uma guarda que só exigisse "não animou" ` +
        "passaria com um botão que nunca anima nada.",
    );
  } else {
    notes.push(
      "    aprovação: a aprovação é registrada ANTES da etapa paga — no segundo clique nada é animado, " +
        "e no primeiro a ordem é registrou → animou",
    );
  }

  // -------------------------------------------------------------------------
  // G-C — refazer não encadeia
  // -------------------------------------------------------------------------
  const r = await refazer();
  if (!r.submetidos.includes(ENDPOINT_COMPOR)) {
    failures.push(
      `aprovação: o refazer não submeteu \`${ENDPOINT_COMPOR}\` — submetidos: ` +
        `${JSON.stringify(r.submetidos)}, erro ${JSON.stringify(r.erro.slice(0, 140))}. Um "Refazer" que ` +
        "não recompõe é um botão que não faz nada, e a verificação abaixo passaria por vacuidade.",
    );
  }
  if (r.submetidos.includes(ENDPOINT_ANIMAR)) {
    failures.push(
      `aprovação: o refazer disparou a animação — \`${ENDPOINT_ANIMAR}\` foi submetido (${JSON.stringify(r.submetidos)}). ` +
        "Refazer existe para iterar na imagem por US$ 0,08; encadeando, o mesmo clique passa a custar " +
        "~US$ 1,52 e nada na tela diz isso. O freio é `PARAR_APOS_RECOMPOR`, e ele tem de valer `compor`.",
    );
  } else if (r.submetidos.includes(ENDPOINT_COMPOR)) {
    notes.push(
      `    aprovação: o refazer submete só \`${ENDPOINT_COMPOR}\` e para — a animação não é alcançada ` +
        "nem com teto folgado",
    );
  }

  return { failures, notes };
}
