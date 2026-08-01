/**
 * Invariante do polling: "concluído sem artefato" falha na hora.
 *
 * O defeito congelado aqui é de omissão, e por isso invisível numa revisão: o
 * caso caía no `return { status: "processing" }` do fim da função, sem que
 * ninguém tivesse escrito essa decisão. O job ficava em polling até o teto de
 * ~7,5 min e terminava como "demorou mais que o esperado" — mandando quem lê
 * procurar lentidão onde houve contrato quebrado, num vídeo que ficou pronto e
 * foi cobrado.
 *
 * A verificação exercita o CAMINHO REAL (`pollVideoJob`, incluindo `fetchJson`
 * e o log de resposta bruta) com `fetch` substituído por respostas
 * controladas — nenhuma chamada de rede. Testar a função de verdade, e não uma
 * cópia da lógica, é o que impede a guarda de continuar passando depois de
 * alguém reorganizar o parser.
 */
import { isFixtureMode } from "../services/providers/providerMode.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "poll: concluído sem artefato falha na hora",
    name: "volta a tratar concluído-sem-URL como processando",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find: `  if (status === "completed" && !videoUrl) {\n    return { status: "error", errorMessage: contractMismatch("heygen.pollVideo", "data.video_url", data) };\n  }`,
    replace: "",
    expect: `"completed SEM video_url" devolveu "processing"`,
  },
  {
    guard: "poll: mensagem não induz a estorno",
    name: "mensagem perde a menção a estorno",
    kind: "esperto",
    file: "backend/src/services/providers/vendorResponseLog.ts",
    // O caminho continua falhando na hora — só a mensagem deixa de dizer que
    // NÃO é erro de geração. Uma guarda que só checasse o status "error"
    // passaria, e quem lesse o alerta estornaria no susto.
    find: "O trabalho foi feito e provavelmente cobrado — isto NÃO é um erro de geração e NÃO gera estorno. ",
    replace: "Falhou. ",
    expect: "não nomeia o campo ausente nem diz que",
  },
];

export interface PollCheckResult {
  failures: string[];
  notes: string[];
}

interface Caso {
  nome: string;
  corpo: unknown;
  esperado: "error" | "ready" | "processing";
}

const CASOS: Caso[] = [
  {
    nome: "completed SEM video_url",
    corpo: { data: { status: "completed", duration: 12.4 } },
    esperado: "error",
  },
  {
    nome: "completed COM video_url",
    corpo: { data: { status: "completed", video_url: "https://exemplo/v.mp4" } },
    esperado: "ready",
  },
  // O contraponto que impede a guarda de virar "sempre erro": um job ainda
  // rodando tem de continuar rodando.
  { nome: "ainda processando", corpo: { data: { status: "processing" } }, esperado: "processing" },
  { nome: "falhou de verdade", corpo: { data: { status: "failed" } }, esperado: "error" },
];

export async function checkPollPolicy(): Promise<PollCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { pollVideoJob } = await import("../services/providers/avatarProvider.js");

  const modoOriginal = process.env.PROVIDER_MODE;
  const fetchOriginal = globalThis.fetch;
  // `isFixtureMode()` lê o ambiente a CADA chamada, então dá para exercitar o
  // ramo live sem reiniciar nada. Restaurado no `finally` — deixar o processo
  // do check em "live" seria um efeito colateral perigoso.
  process.env.PROVIDER_MODE = "live";

  let chamadas = 0;
  try {
    for (const caso of CASOS) {
      globalThis.fetch = (async () => {
        chamadas += 1;
        return new Response(JSON.stringify(caso.corpo), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      const resultado = await pollVideoJob("heygen", "chave-irrelevante-fetch-substituido", "job-teste");
      if (resultado.status !== caso.esperado) {
        failures.push(
          `poll: "${caso.nome}" devolveu "${resultado.status}", esperado "${caso.esperado}". ` +
            (caso.esperado === "error"
              ? "Concluído sem artefato precisa falhar na hora: esperar não conserta contrato quebrado, " +
                "só troca a mensagem certa por um timeout que aponta para o lado errado."
              : "O caminho normal do polling foi alterado."),
        );
      }
      if (caso.esperado === "error" && resultado.status === "error" && caso.nome.includes("SEM video_url")) {
        // A mensagem precisa nomear o que chegou e dizer que não é erro de
        // geração — é o que evita um estorno indevido decidido no susto.
        if (!resultado.errorMessage.includes("video_url") || !/estorno/i.test(resultado.errorMessage)) {
          failures.push(
            `poll: a mensagem de "concluído sem artefato" não nomeia o campo ausente nem diz que ` +
              `NÃO gera estorno. Recebida: "${resultado.errorMessage}"`,
          );
        }
      }
    }
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  if (chamadas !== CASOS.length) {
    failures.push(
      `poll: o verificador esperava ${CASOS.length} chamadas ao fornecedor substituído e contou ${chamadas} — ` +
        "sinal de que o caminho testado não é mais o que roda em produção.",
    );
  }

  // Se o modo não voltou, tudo que rodar depois neste processo fala com a rede.
  if (!isFixtureMode()) {
    failures.push("poll: PROVIDER_MODE não voltou para fixture depois da verificação.");
  }

  notes.push(`poll: ${CASOS.length} formas de resposta conferidas no caminho real, sem tocar a rede`);
  return { failures, notes };
}
