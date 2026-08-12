/**
 * Invariantes do ORQUESTRADOR: resposta crua antes de interpretada, teto no
 * laço de polling, e nenhum default do fornecedor herdado em silêncio.
 *
 * ┌─ Ancorada no USO ───────────────────────────────────────────────────────┐
 * │ Ela não procura texto no arquivo. Roda `runFalPipeline` de verdade, com  │
 * │ `globalThis.fetch` substituído e um diário em memória, e observa a       │
 * │ SEQUÊNCIA do que aconteceu e os CORPOS que saíram.                       │
 * │                                                                          │
 * │ É a única forma de medir as três: "grava cru" continua verdade quando a  │
 * │ gravação desce para depois do parsing; "tem teto" continua verdade       │
 * │ quando o teto existe e nunca é comparado; e um default herdado não deixa │
 * │ rastro nenhum no nosso código — ele aparece só no corpo que sai.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o diário é um      │
 * │ array), nenhuma espera real (o `esperar` é injetado e devolve na hora).  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { Mutant } from "./mutants.js";
import { DEFAULTS_NUNCA_HERDADOS } from "../services/video/falPipeline.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "pipeline: a resposta crua é gravada antes de ser interpretada",
    name: "a gravação do corpo bruto desce para depois da leitura do campo",
    kind: "esperto",
    // ESPERTO: o corpo continua sendo gravado, com o mesmo conteúdo, e o
    // caminho feliz termina idêntico — qualquer guarda que perguntasse "a
    // resposta é persistida?" seguiria verde. Só a ORDEM muda, e com ela o
    // que sobra quando a resposta vem em forma inesperada: justamente o corpo
    // que se precisa ler para descobrir o que o fornecedor mudou.
    file: "backend/src/services/video/falPipeline.ts",
    find:
      "  // CRU ANTES DE INTERPRETADO. Nenhum campo de `saida` foi lido até aqui.\n" +
      "  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));",
    replace:
      "  const jaInterpretado = (saida as any)?.images?.[0]?.url ?? (saida as any)?.video?.url;\n" +
      "  void jaInterpretado;\n" +
      "  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));",
    expect: "pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua",
  },
  {
    guard: "pipeline: o laço de polling tem teto de tempo",
    name: "o teto some e o laço passa a esperar para sempre",
    kind: "obvio",
    // O teto continua sendo PARÂMETRO — a assinatura não muda, o valor chega,
    // e o `logEvent` de esgotamento continua no arquivo. O que sai é a
    // comparação, que é a única linha que faz o teto existir.
    file: "backend/src/services/video/falPipeline.ts",
    find: "    if (Date.now() >= limite) {",
    replace: "    if (false) {",
    expect: "pipeline: o laço de polling não desistiu",
  },
  {
    guard: "pipeline: nenhum default do fornecedor é herdado",
    name: "generate_audio sai do payload do Wan e volta a ser o default",
    kind: "esperto",
    // O mais caro dos cinco: com o default, o Wan sintetiza uma trilha PRÓPRIA
    // e PAGA, que a etapa de sincronia descarta. Some do payload sem quebrar
    // nada visível — o vídeo continua saindo, só que com áudio que ninguém
    // pediu e por um preço que ninguém viu.
    file: "backend/src/services/video/falPipeline.ts",
    find: "    generate_audio: false,\n    resolution: PIPELINE_RESOLUTION,",
    replace: "    resolution: PIPELINE_RESOLUTION,",
    expect: "pipeline: um default do fornecedor foi herdado em silêncio",
  },
  {
    guard: "pipeline: nenhum default do fornecedor é herdado",
    name: "o roteiro cresce dentro do teto de caracteres",
    kind: "esperto",
    // CONTRAPONTO. Mexer no CONTEÚDO do roteiro, dentro do teto, não pode
    // reprovar nada: a guarda mede os campos do payload e a ordem das
    // gravações, não o texto. Uma guarda presa ao roteiro da prova passaria a
    // cobrar autorização para editar uma string.
    file: "backend/src/scripts/checkFalPipelinePolicy.ts",
    find: 'const ROTEIRO_DA_PROVA = "Roteiro da prova, curto o bastante para caber no teto.";',
    replace: 'const ROTEIRO_DA_PROVA = "Outro roteiro, tambem curto, tambem dentro do teto.";',
    expect: "pipeline: corpo cru gravado antes de qualquer leitura",
    expectGreen: true,
  },
];

export interface FalPipelineCheckResult {
  failures: string[];
  notes: string[];
}

const ROTEIRO_DA_PROVA = "Roteiro da prova, curto o bastante para caber no teto.";

/** O que aconteceu, na ordem em que aconteceu. */
type Passo =
  | `abriu:${string}`
  | `request_id:${string}`
  | `cru:${string}`
  | `fechou:${string}`
  | `POST:${string}`
  | `STATUS:${string}`
  | `RESULT:${string}`
  | "UPLOAD";

interface Corrida {
  passos: Passo[];
  corpos: { endpoint: string; corpo: any }[];
  crus: string[];
  erro: unknown;
  leiturasDeStatus: number;
}

/**
 * Roda o pipeline REAL com tudo substituído.
 *
 * `statusEternamentePendente` é o que exercita o teto: a fila responde
 * `IN_PROGRESS` para sempre, e um laço sem teto nunca sai daqui.
 */
async function correr(opcoes: { statusEternamentePendente?: boolean } = {}): Promise<Corrida> {
  const { runFalPipeline } = await import("../services/video/falPipeline.js");
  const passos: Passo[] = [];
  const corpos: { endpoint: string; corpo: any }[] = [];
  const crus: string[] = [];
  let leiturasDeStatus = 0;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: RequestInit) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );

    if (url.includes("rest.fal.ai") || url.includes("fal.invalido")) {
      passos.push("UPLOAD");
      return new Response(
        JSON.stringify({
          file_url: "https://exemplo.fal.invalido/arquivo-da-prova.bin",
          upload_url: "https://exemplo.fal.invalido/put/arquivo-da-prova.bin",
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
      leiturasDeStatus += 1;
      passos.push(`STATUS:${leiturasDeStatus}`);
      const status = opcoes.statusEternamentePendente ? "IN_PROGRESS" : "COMPLETED";
      return new Response(JSON.stringify({ status }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/requests/")) {
      const endpoint = url.split("/requests/")[0].replace("https://queue.fal.run/", "");
      passos.push(`RESULT:${endpoint}`);
      return new Response(
        JSON.stringify({
          images: [{ url: "https://exemplo.fal.invalido/imagem.png" }],
          video: { url: "https://exemplo.fal.invalido/video.mp4" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // Submissão.
    const endpoint = url.replace("https://queue.fal.run/", "");
    passos.push(`POST:${endpoint}`);
    corpos.push({ endpoint, corpo: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(
      JSON.stringify({
        request_id: `req-${endpoint.replace(/[^a-z0-9]+/gi, "-")}`,
        status_url: `https://queue.fal.run/${endpoint}/requests/req/status`,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  // Diário em memória: um array, e a ORDEM dele é a medição.
  let seq = 0;
  const diario = {
    async abrirEtapa(etapa: string) {
      const id = `step-${++seq}-${etapa}`;
      passos.push(`abriu:${etapa}`);
      return id;
    },
    async gravarRequestId(stepId: string, requestId: string) {
      passos.push(`request_id:${stepId}`);
      void requestId;
    },
    async gravarRespostaCrua(stepId: string, raw: string) {
      passos.push(`cru:${stepId}`);
      crus.push(raw);
    },
    async fecharEtapa(stepId: string) {
      passos.push(`fechou:${stepId}`);
    },
  };

  let erro: unknown = null;
  const modoOriginal = process.env.PROVIDER_MODE;
  try {
    // `live` porque em fixture o falClient desvia e nada disto acontece.
    process.env.PROVIDER_MODE = "live";
    await runFalPipeline({
      apiKeyFal: "chave-irrelevante-fetch-substituido",
      apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      script: ROTEIRO_DA_PROVA,
      fotoBase: Buffer.from("foto-da-prova"),
      fotoMimeType: "image/jpeg",
      promptDeComposicao: "traje e cenário da prova",
      diario: diario as never,
      // Teto CURTO e espera que não espera: o laço com teto sai em
      // milissegundos; o laço sem teto roda para sempre e é isso que se mede.
      pollTimeoutMs: 50,
      pollIntervalMs: 1,
      esperar: async () => {},
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { passos, corpos, crus, erro, leiturasDeStatus };
}

/**
 * O laço sem teto não termina, então ele não pode ser esperado sem trava. A
 * corrida inteira ganha um limite de tempo próprio; estourá-lo É a reprovação.
 */
async function correrComLimite(opcoes: { statusEternamentePendente?: boolean }, limiteMs: number) {
  let estourou = false;
  const corrida = await Promise.race([
    correr(opcoes),
    new Promise<Corrida>((resolve) =>
      setTimeout(() => {
        estourou = true;
        resolve({ passos: [], corpos: [], crus: [], erro: null, leiturasDeStatus: -1 });
      }, limiteMs),
    ),
  ]);
  return { corrida, estourou };
}

export async function checkFalPipelinePolicy(): Promise<FalPipelineCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const feliz = await correr();

  // -------------------------------------------------------------------------
  // 1. CRU ANTES DE INTERPRETADO.
  //
  // Medido pela ORDEM: em cada etapa da fal, `cru:` tem de vir antes de o
  // orquestrador ler qualquer campo — e ler campo é o que produz o passo
  // seguinte (a submissão da etapa seguinte, ou o retorno).
  // -------------------------------------------------------------------------
  for (const etapa of ["compor", "animar", "sincronizar"]) {
    const iResult = feliz.passos.findIndex((p) => p.startsWith("RESULT:") && p.includes(etapa === "compor" ? "nano-banana" : etapa === "animar" ? "wan" : "sync-lipsync"));
    const iCru = feliz.passos.findIndex((p) => p.startsWith("cru:") && p.includes(etapa));
    if (iCru === -1) {
      failures.push(
        `pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua (${etapa}): ela ` +
          `não foi gravada de forma alguma. Passos: ${feliz.passos.join(" → ")}. O corpo bruto é a base ` +
          "da cobrança por camada e a única coisa que sobra quando o contrato muda.",
      );
    } else if (iResult !== -1 && iCru < iResult) {
      failures.push(
        `pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua (${etapa}): a ` +
          `ordem observada foi ${feliz.passos.join(" → ")}.`,
      );
    }
  }
  // A prova direta: nenhum campo lido antes da gravação. Com a gravação
  // deslocada, o `jaInterpretado` do mutante roda primeiro — e a única forma de
  // observar isso de fora é o corpo cru já não ser o primeiro toque na resposta.
  const cruDaComposicao = feliz.crus[0];
  if (!cruDaComposicao || !cruDaComposicao.includes("images")) {
    failures.push(
      "pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua (composição): o " +
        `primeiro corpo gravado foi ${JSON.stringify(String(cruDaComposicao).slice(0, 80))}, que não é a ` +
        "resposta da composição. O que se grava tem de ser o corpo inteiro, como veio.",
    );
  }

  // -------------------------------------------------------------------------
  // 2. O LAÇO TEM TETO.
  //
  // A fila responde IN_PROGRESS para sempre. Com teto, o pipeline desiste
  // rápido e a mensagem diz que o trabalho NÃO deve ser refeito. Sem teto, a
  // corrida não termina — e é o estouro do limite externo que reprova.
  // -------------------------------------------------------------------------
  const { corrida: pendente, estourou } = await correrComLimite({ statusEternamentePendente: true }, 4000);
  if (estourou) {
    failures.push(
      "pipeline: o laço de polling não desistiu — a fila respondeu IN_PROGRESS indefinidamente e a " +
        "corrida ainda estava rodando 4000 ms depois, com o teto configurado em 50 ms. Sem teto, uma " +
        "etapa que nunca conclui prende o processo para sempre, e quem paga por ela não tem como saber " +
        "que ela parou de progredir.",
    );
  } else if (!(pendente.erro instanceof Error) || !String(pendente.erro).includes("teto de")) {
    failures.push(
      "pipeline: o laço de polling não desistiu com o erro certo — veio " +
        `${pendente.erro === null ? "sucesso" : JSON.stringify(String(pendente.erro).slice(0, 160))}. ` +
        "O esgotamento precisa dizer que o trabalho já foi pago e NÃO deve ser refeito: sem isso, a " +
        "reação natural é repetir a etapa e pagar duas vezes pelo mesmo resultado.",
    );
  }

  // -------------------------------------------------------------------------
  // 3. NENHUM DEFAULT HERDADO.
  //
  // Conferido no CORPO que saiu, e não no código: um campo omitido não deixa
  // rastro nenhum do nosso lado — só na requisição.
  // -------------------------------------------------------------------------
  for (const [endpoint, campos] of Object.entries(DEFAULTS_NUNCA_HERDADOS)) {
    const enviado = feliz.corpos.find((c) => c.endpoint === endpoint);
    if (!enviado) {
      failures.push(
        `pipeline: um default do fornecedor foi herdado em silêncio — nenhuma submissão para ` +
          `${endpoint} foi observada, então os campos ${campos.join(", ")} não puderam ser conferidos. ` +
          `Corpos observados: ${feliz.corpos.map((c) => c.endpoint).join(", ") || "(nenhum)"}.`,
      );
      continue;
    }
    for (const campo of campos) {
      if (!(campo in enviado.corpo)) {
        failures.push(
          `pipeline: um default do fornecedor foi herdado em silêncio — "${campo}" não está no corpo ` +
            `enviado a ${endpoint}. O default é do FORNECEDOR e muda sem aviso: omitir aceita a mudança ` +
            "em silêncio. `generate_audio` é o caro — o Wan sintetiza uma trilha PRÓPRIA e paga que a " +
            "sincronia descarta; `sync_mode: cut_off` corta a fala, que é a entrada preservada deste " +
            `pipeline. Campos presentes: ${Object.keys(enviado.corpo).join(", ")}.`,
        );
      }
    }
  }

  if (failures.length === 0) {
    notes.push(
      `  pipeline: corpo cru gravado antes de qualquer leitura nas 3 etapas da fal ` +
        `(${feliz.crus.length} corpos registrados)`,
    );
    notes.push(
      `  pipeline: o laço de polling desistiu no teto e disse que o trabalho não deve ser refeito ` +
        `(${pendente.leiturasDeStatus} leitura(s) antes de desistir)`,
    );
    notes.push(
      `  pipeline: os ${Object.values(DEFAULTS_NUNCA_HERDADOS).flat().length} campos que não se herda ` +
        `estão explícitos nos 3 corpos enviados`,
    );
  }

  return { failures, notes };
}
