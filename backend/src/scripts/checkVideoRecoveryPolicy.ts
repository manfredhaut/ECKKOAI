/**
 * O VÍDEO QUE FOI PAGO NÃO PODE SUMIR SEM RASTRO.
 *
 * Seis invariantes que fecham o mesmo buraco por ângulos diferentes: o tenant
 * paga, o vídeo não chega, o crédito não volta, e não há como descobrir depois
 * o que aconteceu.
 *
 *  G1 · a chave da tentativa é gravada ANTES de a chamada sair;
 *  G2 · falha sem cobrança estorna; falha com cobrança não estorna;
 *  G3 · o estorno é único, e a garantia final é do banco;
 *  G4 · o boot recolhe o que ficou preso, inclusive o antigo;
 *  G5 · toda chamada a fornecedor tem teto de tempo;
 *  G6 · cada um dos sete pontos de falha grava o SEU motivo.
 *
 * ┌─ Por que parte é leitura de fonte e parte é execução ───────────────────┐
 * │ G2, G4 e G5 (o classificador de erro) chamam as funções REAIS com       │
 * │ entradas construídas — sem rede, sem banco, sem gastar. É o que impede  │
 * │ a guarda de continuar passando depois de alguém reorganizar a lógica.   │
 * │                                                                         │
 * │ G1 e G6 são sobre ORDEM e sobre COBERTURA dentro de um arquivo — "a     │
 * │ gravação vem antes da chamada", "os sete pontos usam sete motivos       │
 * │ diferentes". Nenhuma das duas é observável chamando uma função: só o    │
 * │ texto do arquivo tem essa informação. G5 tem as duas metades pelo mesmo │
 * │ motivo: que o sinal exista é execução, que ele seja PASSADO ao `fetch`  │
 * │ em todos os pontos é leitura.                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  VIDEO_FAILURE_REASONS,
  classificarGasto,
  decidirEstorno,
  type VideoFailureReason,
} from "../services/video/videoFailure.js";
import { ehTimeoutDeFornecedor, vendorTimeoutMs, DEFAULT_VENDOR_TIMEOUT_MS } from "../services/providers/vendorTimeout.js";
import { recoverInFlightVideos, videoRecoveryMaxAgeMs } from "../services/video/recovery.js";

const ROTA = "backend/src/routes/videos.ts";
const BOOT = "backend/src/index.ts";
const ESTORNO = "backend/src/services/billing/creditGate.ts";
const MIGRATION_ESTORNO = "backend/src/db/migrations/035_credit_ledger_refund_reason.sql";
const MOTIVOS = "backend/src/services/video/videoFailure.ts";
const RECUPERACAO = "backend/src/services/video/recovery.ts";

/** Arquivos com saída para fornecedor. Todo `fetch` deles precisa de sinal. */
const ARQUIVOS_COM_SAIDA = [
  "backend/src/services/providers/avatarProvider.ts",
  "backend/src/services/providers/voiceProvider.ts",
  "backend/src/services/providers/providerRegistry.ts",
  "backend/src/services/providers/platformKeyProbe.ts",
  "backend/src/services/downloadProxy.ts",
];

export const MUTANTS: Mutant[] = [
  // ------------------------------------------------------------------ G1
  {
    guard: "recuperação: a chave da tentativa é gravada antes da chamada",
    name: "grava a chave depois da chamada, não antes",
    kind: "esperto",
    // A gravação continua ANTES da chamada, continua no mesmo lugar, e a
    // coluna continua sendo preenchida em toda geração. Só que o valor deixa
    // de ser o que o header leva — e o vínculo, que é a única razão de a
    // coluna existir, vira um texto parecido que não casa com nada do lado do
    // fornecedor. Uma guarda que só olhasse a ORDEM passaria.
    file: ROTA,
    find: "      [video.id, idempotencyKey],",
    replace: '      [video.id, idempotencyKey + "-" + String(Date.now())],',
    expect: "a chave GRAVADA não é a mesma que vai no header",
  },
  {
    guard: "recuperação: a chave da tentativa é gravada antes da chamada",
    name: "não grava a chave",
    kind: "obvio",
    file: ROTA,
    find: `    await pool.query(
      "UPDATE videos SET provider_idempotency_key = $2, provider_request_at = now() WHERE id = $1",
      [video.id, idempotencyKey],
    );`,
    replace: "",
    expect: "a chave da tentativa não é gravada ANTES da chamada",
  },
  {
    guard: "recuperação: a chave da tentativa é gravada antes da chamada",
    name: "a gravação antecipada continua no lugar (contraponto)",
    kind: "esperto",
    // Contraponto: trocar o texto do log NÃO pode reprovar. Uma guarda que
    // casasse o bloco inteiro por igualdade textual passaria a reprovar
    // qualquer edição vizinha, e viraria ruído até alguém desligá-la.
    file: ROTA,
    find: `      context: "videos.create",
      videoId: video.id,
      idempotencyKey: idempotencyKey ? idempotencyKey.slice(0, 14) + "…" : null,`,
    replace: `      context: "videos.create",
      videoId: video.id,
      idempotencyKey: idempotencyKey ? idempotencyKey.slice(0, 12) + "…" : null,`,
    expect: "recuperação: a chave da tentativa é gravada antes de a chamada sair",
    expectGreen: true,
  },

  // ------------------------------------------------------------------ G2
  {
    guard: "recuperação: falha sem cobrança estorna, falha com cobrança não",
    name: "estorna também quando o fornecedor cobrou",
    kind: "esperto",
    // A função continua existindo, continua sendo chamada nos sete pontos, e
    // continua devolvendo `estorna` — só que agora devolve `true` para um
    // artefato que o fornecedor RENDEROU e cobrou. Crédito criado do nada, e
    // o tipo de erro que ninguém reclama.
    file: MOTIVOS,
    find: `  if (gasto === "saiu") {
    return {
      estorna: false,`,
    replace: `  if (gasto === "saiu") {
    return {
      estorna: true,`,
    expect: "estorna uma falha em que o fornecedor comprovadamente cobrou",
  },
  {
    guard: "recuperação: falha sem cobrança estorna, falha com cobrança não",
    name: "não estorna nunca",
    kind: "obvio",
    file: MOTIVOS,
    find: `  if (gasto === "nao_saiu") {
    return {
      estorna: true,`,
    replace: `  if (gasto === "nao_saiu") {
    return {
      estorna: false,`,
    expect: "não estorna uma falha anterior ao aceite",
  },
  {
    guard: "recuperação: falha sem cobrança estorna, falha com cobrança não",
    name: "a nota do estorno muda de redação (contraponto)",
    kind: "esperto",
    file: MOTIVOS,
    find: "o fornecedor nunca aceitou o trabalho (sem provider_job_id), então nada foi cobrado — o crédito volta",
    replace: "sem provider_job_id não houve aceite, logo não houve cobrança — o crédito volta",
    expect: "recuperação: o veredito de estorno separa o que foi cobrado do que não foi",
    expectGreen: true,
  },

  // ------------------------------------------------------------------ G3
  {
    guard: "recuperação: o estorno é único",
    name: "estorna duas vezes em corrida",
    kind: "esperto",
    // O `FOR UPDATE` continua lá, a transação continua lá, o lançamento
    // continua sendo gravado. Só a CHECAGEM de estorno anterior sai — e duas
    // chamadas concorrentes passam as duas.
    file: ESTORNO,
    find: "      `SELECT 1 FROM credit_ledger WHERE reason = 'refund' AND ${column} = $1`,",
    replace: "      `SELECT 1 FROM credit_ledger WHERE reason = 'refund' AND ${column} = $1 AND false`,",
    expect: "o estorno deixou de checar se já havia sido estornado",
  },
  {
    guard: "recuperação: o estorno é único",
    name: "ignora o índice único",
    kind: "obvio",
    file: MIGRATION_ESTORNO,
    find: `CREATE UNIQUE INDEX credit_ledger_one_refund_per_video
  ON credit_ledger (related_video_id)
  WHERE reason = 'refund' AND related_video_id IS NOT NULL;`,
    replace: "",
    expect: "a garantia de estorno único do BANCO sumiu",
  },

  // ------------------------------------------------------------------ G4
  {
    guard: "recuperação: o boot recolhe o que ficou preso",
    name: "recolhe só os recentes e ignora os antigos",
    kind: "esperto",
    // A varredura continua rodando, continua achando as linhas, continua
    // reacompanhando as recentes. Só o ramo do ANTIGO inverte — e o registro
    // velho volta a ficar preso para sempre, que é o defeito original.
    file: "backend/src/services/video/recovery.ts",
    find: "      if (linha.idade_ms > idadeMax) {",
    replace: "      if (linha.idade_ms < 0) {",
    expect: "registro preso ANTIGO não foi encerrado",
  },
  {
    guard: "recuperação: o boot recolhe o que ficou preso",
    name: "não recolhe nada",
    kind: "obvio",
    file: BOOT,
    find: "  const recuperacao = await recoverInFlightVideos(rearmVideoPolling);",
    replace: "  const recuperacao = { encontrados: 0, reacompanhados: 0, encerradosOrfaos: 0, encerradosVelhos: 0, estornados: 0, falhas: 0 };",
    expect: "o boot não chama a varredura de registros presos",
  },
  {
    guard: "recuperação: o boot recolhe o que ficou preso",
    name: "a idade máxima muda de valor, e a varredura continua correta (contraponto)",
    kind: "esperto",
    // Trocar o DEFAULT não pode reprovar: o número é configurável de
    // propósito. O que a guarda protege é o COMPORTAMENTO — antigo encerra,
    // recente reacompanha —, não a constante.
    env: { VIDEO_RECOVERY_MAX_AGE_MS: "900000" },
    expect: "recuperação: o boot recolhe preso órfão, preso antigo e preso recente",
    expectGreen: true,
  },

  // ------------------------------------------------------------------ G5
  {
    guard: "recuperação: toda chamada a fornecedor tem teto de tempo",
    name: "AbortSignal criado mas não passado ao fetch",
    kind: "esperto",
    // O import continua, a função continua existindo, todas as OUTRAS
    // chamadas continuam com sinal. Só a mais cara do produto — a que roda
    // DEPOIS do débito — perde o dela. Uma guarda que checasse a presença do
    // import, ou a existência de `vendorSignal`, passaria.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: `      body: JSON.stringify(body),
      // A chamada mais cara do produto, e a que acontece DEPOIS do débito. Um
      // socket pendurado aqui era o pior caso do ciclo de vida: crédito
      // debitado, aceite desconhecido, linha em \`queued\` para sempre.
      signal: vendorSignal(),`,
    replace: "      body: JSON.stringify(body),",
    expect: "chamada a fornecedor sem teto de tempo",
  },
  {
    guard: "recuperação: toda chamada a fornecedor tem teto de tempo",
    name: "fetch sem AbortSignal",
    kind: "obvio",
    file: "backend/src/services/providers/voiceProvider.ts",
    // O `find` NÃO inclui a linha do `body`. Ele já incluiu, e quebrou: quando
    // o corpo passou a ser montado por `buildSynthesisBody(text)`, o trecho
    // casou 0× e o mutante virou ERRO de aplicação — deixou de exercitar a
    // guarda sem que nada acusasse. O que este mutante precisa tocar é o
    // `signal`, e só ele; amarrá-lo ao conteúdo do corpo o torna refém de
    // qualquer mudança na síntese.
    find: `      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(buildSynthesisBody(text)),
      signal: vendorSignal(),`,
    replace: `      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(buildSynthesisBody(text)),`,
    expect: "chamada a fornecedor sem teto de tempo",
  },
  {
    guard: "recuperação: toda chamada a fornecedor tem teto de tempo",
    name: "o teto vem do ambiente, e continua sendo respeitado (contraponto)",
    kind: "esperto",
    env: { VENDOR_HTTP_TIMEOUT_MS: "45000" },
    expect: "recuperação: toda chamada a fornecedor leva teto de tempo",
    expectGreen: true,
  },

  // ------------------------------------------------------------------ G6
  {
    guard: "recuperação: cada ponto de falha grava o seu motivo",
    name: "grava motivo genérico em todos os sete pontos",
    kind: "esperto",
    // A coluna continua sendo preenchida, o valor continua sendo um literal
    // válido do CHECK, e nenhuma linha fica sem motivo. Só que os sete pontos
    // passam a dizer a mesma coisa — e a coluna volta a não distinguir nada,
    // que é exatamente o estado que ela veio corrigir.
    file: ROTA,
    find: `          reason: "artifact_invalid",`,
    replace: `          reason: "vendor_rejected",`,
    expect: "dois pontos de falha diferentes gravam o MESMO motivo",
  },
  {
    guard: "recuperação: cada ponto de falha grava o seu motivo",
    name: "não grava motivo",
    kind: "obvio",
    file: ROTA,
    find:
      "      `UPDATE videos SET status = 'error', error_message = $2, failure_reason = $3\n" +
      "        WHERE id = $1 AND status = ANY($4)`,",
    replace:
      "      `UPDATE videos SET status = 'error', error_message = $2\n" +
      "        WHERE id = $1 AND status = ANY($4) AND $3 IS NOT NULL`,",
    expect: "ponto de falha que não grava failure_reason",
  },
];

export interface RecoveryCheckResult {
  failures: string[];
  notes: string[];
}

/** Sem comentários: guardas deste projeto já acusaram o texto que as explicava. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

async function ler(repoRoot: string, rel: string): Promise<string | null> {
  try {
    return await readFile(path.join(repoRoot, rel), "utf-8");
  } catch {
    return null;
  }
}

export async function checkVideoRecoveryPolicy(repoRoot: string): Promise<RecoveryCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // =======================================================================
  // G1 — a chave da tentativa é gravada ANTES de a chamada sair
  // =======================================================================
  const rotaBruta = await ler(repoRoot, ROTA);
  if (!rotaBruta) {
    failures.push(`recuperação: não consegui ler ${ROTA} — verificador cego é pior que reprovar.`);
  } else {
    const rota = semComentarios(rotaBruta);
    const posGravacao = rota.indexOf("provider_idempotency_key = $2");
    const posChamada = rota.indexOf("await generateVideo({");
    if (posGravacao === -1) {
      failures.push(
        "recuperação: a chave da tentativa não é gravada ANTES da chamada — não achei o UPDATE de " +
          "`provider_idempotency_key` em routes/videos.ts. Sem ele, morrer entre o débito e a resposta " +
          "deixa a linha sem nada que a ligue ao trabalho do fornecedor: perdida E sem rastro.",
      );
    } else if (posChamada === -1) {
      failures.push("recuperação: não achei a chamada `await generateVideo({` — o verificador perdeu o alvo.");
    } else if (posGravacao > posChamada) {
      failures.push(
        "recuperação: a chave da tentativa não é gravada ANTES da chamada — o UPDATE aparece DEPOIS de " +
          "`generateVideo({`. Gravar depois fecha zero: a janela que a chave existe para cobrir é " +
          "exatamente o intervalo em que a resposta pode não voltar.",
      );
    }
    // A chave GRAVADA tem de ser a MESMA que vai no header. Gravar uma chave
    // "parecida" é pior que não gravar: a coluna fica preenchida, a tela não
    // acusa nada, e a reconciliação procura do lado do fornecedor um valor que
    // nunca existiu lá.
    if (posGravacao !== -1) {
      if (!/\[video\.id, idempotencyKey\],/.test(rota)) {
        failures.push(
          "recuperação: a chave GRAVADA não é a mesma que vai no header — o valor passado ao UPDATE " +
            "deixou de ser exatamente `idempotencyKey`. O vínculo com o job do fornecedor é a única razão " +
            "de a coluna existir; uma chave derivada do instante não casa com nada do outro lado.",
        );
      }
      if (!/const idempotencyKey\s*=[\s\S]{0,600}heygenIdempotencyKey\(/.test(rota)) {
        failures.push(
          "recuperação: a chave gravada deixou de vir de `heygenIdempotencyKey` — se ela não for a mesma " +
            "função que monta o header, as duas divergem em silêncio.",
        );
      }
    }
    if (posGravacao !== -1 && !rota.includes("provider_request_at = now()")) {
      failures.push(
        "recuperação: a chave é gravada sem `provider_request_at`. Sem o instante da emissão, " +
          "\"queued sem job id\" não distingue \"nunca chamou\" de \"chamou e não voltou\" — e as duas " +
          "têm consequências opostas no estorno.",
      );
    }
    notes.push("recuperação: a chave da tentativa é gravada antes de a chamada sair");

    // =====================================================================
    // G6 — cada um dos sete pontos grava o SEU motivo
    // =====================================================================
    // A primeira versão desta verificação lia só `reason: "literal"` e exigia
    // um piso de 6. Ela enxergava 4 dos 8 motivos que a rota alcança —
    // `vendor_timeout` e `poll_loop_error` chegam por ternário, e os três da
    // criação chegam pela variável `motivoDaCriacao` —, então reprovava o
    // código correto e não havia código que a fizesse passar. Agora o sinal é
    // a presença do literal no arquivo, que é o que sobrevive às três formas.
    const escreve = (fonte: string, r: string) => fonte.includes(`"${r}"`);
    const recuperacaoBruta = await ler(repoRoot, RECUPERACAO);
    const recuperacaoFonte = recuperacaoBruta ? semComentarios(recuperacaoBruta) : "";
    // O piso deixou de ser digitado: os motivos que ESTA rota deve saber
    // escrever são os declarados menos os que a varredura de boot escreve.
    // Motivo novo em videoFailure.ts que ninguém escreve aparece aqui como
    // ausente, em vez de engordar o CHECK do banco sem nunca ser gravado.
    const daRecuperacao = VIDEO_FAILURE_REASONS.filter((r) => escreve(recuperacaoFonte, r));
    const esperadosNaRota = VIDEO_FAILURE_REASONS.filter((r) => !daRecuperacao.includes(r));
    const distintos = new Set(VIDEO_FAILURE_REASONS.filter((r) => escreve(rota, r)));
    const ausentes = esperadosNaRota.filter((r) => !distintos.has(r));
    if (ausentes.length > 0) {
      failures.push(
        `recuperação: dois pontos de falha diferentes gravam o MESMO motivo — routes/videos.ts deixou de ` +
          `escrever ${ausentes.length} motivo(s) que só ela escreve (${[...ausentes].sort().join(", ")}), ` +
          `e usa ${distintos.size} dos ${esperadosNaRota.length} esperados. O ponto continua marcando ` +
          `'error' e gravando um literal válido do CHECK — só que passou a dizer o que outro ponto já ` +
          `dizia. Um motivo repetido devolve a coluna ao estado que ela veio corrigir: 'error' ` +
          `significando cinco coisas.`,
      );
    }
    const atualizacoesDeErro = [...rota.matchAll(/UPDATE videos SET status = 'error'/g)].length;
    const comMotivo = [...rota.matchAll(/UPDATE videos SET status = 'error'[^`"]*failure_reason/g)].length;
    if (atualizacoesDeErro > 0 && comMotivo < atualizacoesDeErro) {
      failures.push(
        `recuperação: ponto de falha que não grava failure_reason — ${atualizacoesDeErro} UPDATE(s) marcam ` +
          `'error' e só ${comMotivo} gravam o motivo. O que não grava é indistinguível dos outros no dia ` +
          `seguinte, e é o pós-morte de uma passada paga que paga a conta.`,
      );
    }
    notes.push(
      `recuperação: ${distintos.size}/${esperadosNaRota.length} motivos da rota e ` +
        `${comMotivo}/${atualizacoesDeErro} pontos de erro com motivo gravado ` +
        `(${daRecuperacao.length} motivo(s) são da varredura de boot)`,
    );
  }

  // =======================================================================
  // G2 — o veredito de estorno, exercitado na função REAL
  // =======================================================================
  interface CasoEstorno {
    nome: string;
    reason: VideoFailureReason;
    temJobId: boolean;
    estorna: boolean;
    gasto: "nao_saiu" | "saiu" | "indeterminado";
  }
  const CASOS: CasoEstorno[] = [
    { nome: "recusa antes do aceite", reason: "vendor_rejected", temJobId: false, estorna: true, gasto: "nao_saiu" },
    { nome: "teto nosso, nada saiu", reason: "live_budget_exhausted", temJobId: false, estorna: true, gasto: "nao_saiu" },
    { nome: "timeout na criação", reason: "vendor_timeout", temJobId: false, estorna: true, gasto: "nao_saiu" },
    { nome: "preso sem job", reason: "recovery_orphan", temJobId: false, estorna: true, gasto: "nao_saiu" },
    { nome: "artefato inútil, mas renderizado", reason: "artifact_invalid", temJobId: true, estorna: false, gasto: "saiu" },
    { nome: "fornecedor reportou erro no job aceito", reason: "vendor_reported_error", temJobId: true, estorna: false, gasto: "indeterminado" },
    { nome: "timeout do polling sobre job aceito", reason: "poll_timeout", temJobId: true, estorna: false, gasto: "indeterminado" },
    { nome: "erro nosso no laço, job aceito", reason: "poll_loop_error", temJobId: true, estorna: false, gasto: "indeterminado" },
  ];
  for (const caso of CASOS) {
    const d = decidirEstorno(caso.reason, caso.temJobId);
    if (d.estorna !== caso.estorna) {
      failures.push(
        d.estorna
          ? `recuperação: estorna uma falha em que o fornecedor comprovadamente cobrou — "${caso.nome}" ` +
            `(motivo ${caso.reason}) devolveu crédito. Devolver sobre gasto que aconteceu cria crédito do nada.`
          : `recuperação: não estorna uma falha anterior ao aceite — "${caso.nome}" (motivo ${caso.reason}) ` +
            `não devolveu crédito, e nesse caminho nenhuma cota do fornecedor foi consumida. O cliente paga por nada.`,
      );
    }
    if (d.gasto !== caso.gasto) {
      failures.push(
        `recuperação: "${caso.nome}" foi classificado como gasto "${d.gasto}", esperado "${caso.gasto}".`,
      );
    }
    if (classificarGasto(caso.reason, caso.temJobId) !== caso.gasto) {
      failures.push(`recuperação: classificarGasto discorda de decidirEstorno em "${caso.nome}".`);
    }
  }
  notes.push(`recuperação: o veredito de estorno separa o que foi cobrado do que não foi (${CASOS.length} casos)`);

  // =======================================================================
  // G3 — o estorno é único: a checagem no código E o índice no banco
  // =======================================================================
  const estornoFonte = await ler(repoRoot, ESTORNO);
  if (!estornoFonte) {
    failures.push(`recuperação: não consegui ler ${ESTORNO} — verificador cego é pior que reprovar.`);
  } else {
    const limpo = semComentarios(estornoFonte);
    if (!/reason = 'refund' AND \$\{column\} = \$1`/.test(limpo)) {
      failures.push(
        "recuperação: o estorno deixou de checar se já havia sido estornado. O `FOR UPDATE` serializa duas " +
          "requisições, mas sem a consulta a segunda passa e devolve o crédito de novo — dinheiro criado do nada.",
      );
    }
    if (!/FOR UPDATE/.test(limpo)) {
      failures.push("recuperação: o estorno deixou de travar a linha de saldo antes de decidir.");
    }
  }
  const migracaoEstorno = await ler(repoRoot, MIGRATION_ESTORNO);
  if (!migracaoEstorno) {
    failures.push(`recuperação: não consegui ler ${MIGRATION_ESTORNO} — verificador cego é pior que reprovar.`);
  } else if (!/CREATE UNIQUE INDEX credit_ledger_one_refund_per_video/.test(migracaoEstorno)) {
    failures.push(
      "recuperação: a garantia de estorno único do BANCO sumiu — sem `credit_ledger_one_refund_per_video`, " +
        "a proteção passa a depender só do código, e o dia em que houver mais de uma réplica gravando ela " +
        "deixa de valer. Crédito devolvido duas vezes só aparece na conciliação, meses depois.",
    );
  }
  notes.push("recuperação: o estorno é único — checado no código e garantido por índice único parcial");

  // =======================================================================
  // G4 — a varredura de boot, exercitada com o banco substituído
  // =======================================================================
  const queryOriginal = pool.query.bind(pool);
  const agora = Date.now();
  const idadeMax = videoRecoveryMaxAgeMs();
  const linhasFalsas = [
    // recente COM job → tem de ser reacompanhado
    { id: "v-recente", provider_job_id: "job-1", idade_ms: Math.floor(idadeMax / 2) },
    // preso SEM job → órfão, encerra e estorna
    { id: "v-orfao", provider_job_id: null, idade_ms: 1000 },
    // antigo COM job → encerra por idade
    { id: "v-antigo", provider_job_id: "job-2", idade_ms: idadeMax + 60_000 },
  ].map((l) => ({
    ...l,
    tenant_id: "t-1",
    status: "queued",
    provider_vendor: "heygen",
    publish_platform: "youtube",
    aspect_ratio: "16:9",
    resolution: "720p",
    provider_engine: null,
    duration_seconds: 10,
    simulated: false,
  }));

  const reacompanhados: string[] = [];
  const encerrados: { id: string; reason: string }[] = [];
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/FROM videos\s+WHERE status = ANY/.test(sql)) return { rows: linhasFalsas, rowCount: linhasFalsas.length };
      if (/UPDATE videos SET status = 'error'/.test(sql)) {
        const v = valores as unknown[];
        encerrados.push({ id: String(v[0]), reason: String(v[2]) });
        return { rows: [], rowCount: 1 };
      }
      // Consumo, notificação e estorno: aceitos e ignorados. O que esta guarda
      // mede é a DECISÃO da varredura, não o que cada dependência grava.
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    const r = await recoverInFlightVideos(async (linha) => {
      reacompanhados.push(linha.id);
    });

    if (r.encontrados !== 3) {
      failures.push(`recuperação: a varredura encontrou ${r.encontrados} registros presos, esperado 3.`);
    }
    if (!reacompanhados.includes("v-recente")) {
      failures.push(
        "recuperação: registro preso RECENTE com job id não foi reacompanhado. É o caso do `restart backend` " +
          "com geração em voo — o vídeo existe no fornecedor e só precisa de alguém voltando a perguntar.",
      );
    }
    const encerradoAntigo = encerrados.find((e) => e.id === "v-antigo");
    if (!encerradoAntigo || encerradoAntigo.reason !== "recovery_stale") {
      failures.push(
        "recuperação: registro preso ANTIGO não foi encerrado — recolher só os recentes deixa o registro " +
          "velho preso para sempre, que é exatamente o defeito que a varredura existe para fechar.",
      );
    }
    const encerradoOrfao = encerrados.find((e) => e.id === "v-orfao");
    if (!encerradoOrfao || encerradoOrfao.reason !== "recovery_orphan") {
      failures.push(
        "recuperação: registro preso SEM provider_job_id não foi encerrado como órfão. Sem job id não há o " +
          "que reacompanhar, e o crédito precisa voltar: o fornecedor nunca aceitou o trabalho.",
      );
    }
    if (reacompanhados.includes("v-orfao")) {
      failures.push(
        "recuperação: a varredura tentou reacompanhar um registro SEM job id — é pedir status de um " +
          "trabalho que não existe do outro lado.",
      );
    }
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
  }
  notes.push("recuperação: o boot recolhe preso órfão, preso antigo e preso recente");

  // -----------------------------------------------------------------------
  // G4, segunda metade: o BOOT precisa CHAMAR a varredura.
  //
  // Tudo acima prova que `recoverInFlightVideos` funciona — com o banco
  // substituído, exercitando os três ramos. Não prova que alguém a chama, e
  // essa distinção não é teórica: MEDIDO em 08/08, o mutante "não recolhe
  // nada" (que troca a chamada em index.ts por um objeto de zeros) passou o
  // gate VERDE. A guarda inteira olhava para a função e nunca para o arquivo
  // de boot — a constante BOOT existia só na declaração do mutante.
  //
  // Uma função de recuperação perfeita que ninguém invoca deixa o vídeo preso
  // exatamente como antes dela existir, e o resumo verde diz que está tudo
  // certo. É o caso que o próprio runner chama de guarda inerte.
  // -----------------------------------------------------------------------
  const bootBruto = await ler(repoRoot, BOOT);
  if (!bootBruto) {
    failures.push(`recuperação: não consegui ler ${BOOT} — verificador cego é pior que reprovar.`);
  } else {
    const boot = semComentarios(bootBruto);
    const posVarredura = boot.indexOf("recoverInFlightVideos(");
    const posListen = boot.indexOf(".listen(");
    if (posVarredura === -1) {
      failures.push(
        "recuperação: o boot não chama a varredura de registros presos — `recoverInFlightVideos` não " +
          "aparece em index.ts. O laço de acompanhamento vive na memória do processo, então sem esta " +
          "chamada um reinício deixa a linha em queued/processing para sempre, com o crédito debitado.",
      );
    } else if (posListen !== -1 && posVarredura > posListen) {
      failures.push(
        "recuperação: o boot chama a varredura DEPOIS de abrir a porta. Um registro preso recolhido " +
          "depois do `listen` disputa com geração nova o mesmo teto de sessão, e o cliente pode receber " +
          "recusa por um limite que a recuperação ainda estava consumindo.",
      );
    }
    // A varredura tem de re-armar pelo MESMO `pollJob` da criação. Um segundo
    // mecanismo de acompanhamento é a forma mais cara de os dois divergirem:
    // um grava consumo e o outro não, e a diferença só aparece na conciliação.
    if (posVarredura !== -1 && !/recoverInFlightVideos\(\s*rearmVideoPolling\s*\)/.test(boot)) {
      failures.push(
        "recuperação: o boot chama a varredura sem passar `rearmVideoPolling` — reacompanhar por outro " +
          "caminho cria um segundo mecanismo de polling ao lado do da criação.",
      );
    }
  }
  notes.push("recuperação: o boot chama a varredura antes do listen, pelo mesmo pollJob da criação");

  // =======================================================================
  // G5 — teto de tempo em toda chamada a fornecedor
  // =======================================================================
  let totalFetch = 0;
  let semSinal = 0;
  for (const rel of ARQUIVOS_COM_SAIDA) {
    const fonte = await ler(repoRoot, rel);
    if (!fonte) {
      failures.push(`recuperação: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      continue;
    }
    const limpo = semComentarios(fonte);
    // Cada chamada é lida do `fetch(` até o `);` que a fecha — é dentro desse
    // trecho que o sinal precisa estar. Contar `fetch` e contar `signal` no
    // arquivo inteiro passaria com um sinal a mais num lugar e nenhum noutro,
    // que é precisamente a forma do mutante esperto.
    for (const m of limpo.matchAll(/\bfetch\s*\(/g)) {
      totalFetch += 1;
      const inicio = m.index ?? 0;
      let profundidade = 0;
      let fim = inicio;
      for (let i = inicio; i < limpo.length; i += 1) {
        if (limpo[i] === "(") profundidade += 1;
        else if (limpo[i] === ")") {
          profundidade -= 1;
          if (profundidade === 0) {
            fim = i;
            break;
          }
        }
      }
      const chamada = limpo.slice(inicio, fim + 1);
      if (!/signal:\s*vendor(Download)?Signal\(\)/.test(chamada)) {
        semSinal += 1;
        const linha = limpo.slice(0, inicio).split("\n").length;
        failures.push(
          `recuperação: chamada a fornecedor sem teto de tempo — ${rel}:${linha}. Sem AbortSignal o \`fetch\` ` +
            `fica pendurado no default do runtime; no caminho de criação isso é dinheiro, porque a chamada ` +
            `acontece DEPOIS do débito.`,
        );
      }
    }
  }
  if (totalFetch === 0) {
    failures.push(
      "recuperação: nenhuma chamada a fornecedor foi encontrada nos arquivos de saída — o verificador " +
        "perdeu o alvo, e um verificador cego é pior que reprovar.",
    );
  }
  // A frase é FIXA e a contagem vai entre parênteses: um contraponto do arnês
  // casa esta nota por texto, e embutir o número faria acrescentar um `fetch`
  // legítimo reprovar um mutante que devia continuar verde.
  notes.push(`recuperação: toda chamada a fornecedor leva teto de tempo (${totalFetch} conferidas)`);

  // O classificador de timeout, exercitado de verdade.
  const timeoutErr = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
  const embrulhado = Object.assign(new Error("fetch failed"), { cause: timeoutErr });
  const comum = new Error("getaddrinfo ENOTFOUND api.heygen.com");
  if (!ehTimeoutDeFornecedor(timeoutErr) || !ehTimeoutDeFornecedor(abortErr) || !ehTimeoutDeFornecedor(embrulhado)) {
    failures.push(
      "recuperação: um estouro de teto deixou de ser reconhecido como timeout — ele viraria " +
        "`poll_loop_error`, e o pós-morte mandaria procurar defeito no fornecedor em vez do relógio.",
    );
  }
  if (ehTimeoutDeFornecedor(comum)) {
    failures.push("recuperação: erro de rede comum está sendo classificado como timeout — o motivo perde o sentido.");
  }
  if (vendorTimeoutMs() <= 0) {
    failures.push(`recuperação: o teto de tempo resolveu para ${vendorTimeoutMs()} ms — todo fornecedor falharia na hora.`);
  }
  notes.push(
    `recuperação: teto de ${vendorTimeoutMs()} ms (padrão declarado ${DEFAULT_VENDOR_TIMEOUT_MS} ms), ` +
      `idade máxima de recuperação ${idadeMax} ms`,
  );

  // O CHECK do banco e a constante do código precisam falar a mesma língua.
  const migracaoMotivos = await ler(repoRoot, "backend/src/db/migrations/048_video_failure_reason.sql");
  if (!migracaoMotivos) {
    failures.push("recuperação: não consegui ler a migration 048 — verificador cego é pior que reprovar.");
  } else {
    for (const motivo of VIDEO_FAILURE_REASONS) {
      if (!migracaoMotivos.includes(`'${motivo}'`)) {
        failures.push(
          `recuperação: o motivo "${motivo}" existe no código e NÃO está no CHECK da migration 048 — ` +
            `gravá-lo derrubaria a escrita no banco, no meio de um caminho de falha.`,
        );
      }
    }
    notes.push(`recuperação: os ${VIDEO_FAILURE_REASONS.length} motivos do código estão no CHECK do banco`);
  }

  void agora;
  return { failures, notes };
}
