/**
 * ABAS-15, 30/09/2026 — invariantes de backend/src/routes/creativeJobs.ts.
 *
 * Verificação PURA por leitura de arquivo, mesma técnica de
 * checkVideoTitlePolicy.ts (TITULO-1): recorta cada rota pelo texto que já
 * existe no arquivo real, e confere presença/ausência/ordem de padrões
 * dentro de cada recorte — nunca aplica mutação de verdade, porque esta
 * rota ainda não tem nenhuma sonda funcional para pegar uma mutação real
 * (diferente do mecanismo MUTANTS/mutantRegistry.ts, que exige um teste
 * funcional catching a quebra; ver o comentário do TITULO-1 sobre mutante
 * "inerte" — o mesmo risco existiria aqui sem essa sonda).
 *
 * As 7 invariantes cobertas, na ordem em que aparecem no arquivo real:
 *  1. isFixtureMode() é checado ANTES de qualquer outra validação em
 *     POST /creative-jobs — nunca valida corpo antes de saber se pode gerar.
 *  2. Duplo clique com a MESMA chave_cliente nunca cria uma segunda linha —
 *     as 3 rotas de criação (POST, /upload, /upload-visual) têm o mesmo
 *     bloco catch(23505) devolvendo o job já existente.
 *  3. Em /upload-visual, vídeo fora de 4-30s NUNCA é recusado (422) — só
 *     marcado em duracaoForaDoEsperado. Decisão explícita do operador,
 *     30/09/2026.
 *  4. Em /upload (áudio), duração fora de 3-600s É recusada (422) — o
 *     oposto da 3, mesma classe de dado, fácil de inverter sem perceber.
 *  5. DELETE /creative-jobs/:id sempre filtra por tenant_id, no SELECT e
 *     no DELETE — nunca só por id.
 *  6. Em /upload-visual, o teto de bytes (takeUpload) é fixado ANTES de
 *     up.file.fields estar disponível — é a checagem de tipo real, depois,
 *     que decide o modo, nunca um campo lido cedo demais (o bug real que
 *     este bloco caçou e corrigiu hoje).
 *  7. tituloValido() é chamado nas 3 rotas que criam job — nunca uma delas
 *     esquece a validação que TITULO-1 já estabeleceu como necessária.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface CreativeJobsCheckResult {
  failures: string[];
  notes: string[];
}

const ROUTE_FILE = "backend/src/routes/creativeJobs.ts";

function slice(fonte: string, inicioMarca: string, fimMarca: string | null): string {
  const inicio = fonte.indexOf(inicioMarca);
  if (inicio < 0) return "";
  if (!fimMarca) return fonte.slice(inicio);
  const fim = fonte.indexOf(fimMarca, inicio + inicioMarca.length);
  return fim < 0 ? fonte.slice(inicio) : fonte.slice(inicio, fim);
}

export function checkCreativeJobsPolicy(repoRoot: string): CreativeJobsCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const fonte = readFileSync(path.join(repoRoot, ROUTE_FILE), "utf8");

  const rotaCriar = slice(fonte, '>("/creative-jobs", async (req, reply) => {', 'app.post("/creative-jobs/upload"');
  const rotaUploadAudio = slice(fonte, 'app.post("/creative-jobs/upload", async', 'app.post("/creative-jobs/upload-visual"');
  const rotaUploadVisual = slice(fonte, 'app.post("/creative-jobs/upload-visual", async', 'app.delete<{');
  const rotaDelete = slice(fonte, "app.delete<{", null);

  if (!rotaCriar || !rotaUploadAudio || !rotaUploadVisual || !rotaDelete) {
    failures.push(
      `criative-jobs: não consegui recortar as 4 rotas de ${ROUTE_FILE} pelos marcadores esperados — ` +
        "o arquivo mudou de forma, e as 7 invariantes abaixo não têm o que examinar.",
    );
    return { failures, notes };
  }

  // 1 — isFixtureMode() ANTES de qualquer outra validação.
  const idxFixture = rotaCriar.indexOf("if (!isFixtureMode())");
  const idxModo = rotaCriar.indexOf("MODOS_SUPORTADOS");
  if (idxFixture < 0 || idxModo < 0 || idxFixture > idxModo) {
    failures.push(
      "criative-jobs: POST /creative-jobs não confere isFixtureMode() antes de validar o corpo — " +
        "um PROVIDER_MODE=live acidental passaria pelas validações e tentaria gerar de verdade sem " +
        "provedor real implementado.",
    );
  } else {
    notes.push("criative-jobs: isFixtureMode() é a primeira checagem em POST /creative-jobs");
  }

  // 2 — duplo clique nunca cria segunda linha, nas 3 rotas de criação.
  const ocorrenciasDuplaChave = fonte.split('(err as { code?: string }).code === "23505"').length - 1;
  if (ocorrenciasDuplaChave !== 3) {
    failures.push(
      `criative-jobs: esperava 3 tratamentos de chave_cliente duplicada (código 23505), achei ` +
        `${ocorrenciasDuplaChave} — uma das rotas de criação (POST, /upload, /upload-visual) pode ter ` +
        "perdido a defesa contra duplo clique, que gastaria dinheiro duas vezes.",
    );
  } else {
    notes.push("criative-jobs: as 3 rotas de criação tratam chave_cliente duplicada (23505)");
  }

  // 3 — upload-visual: duração fora de 4-30s NUNCA é 422, só aviso.
  if (!rotaUploadVisual.includes("duracaoForaDoEsperado = geometria.durationSeconds < 4 || geometria.durationSeconds > 30")) {
    failures.push(
      "criative-jobs: /creative-jobs/upload-visual não marca mais duracaoForaDoEsperado pela faixa 4-30s " +
        "— a decisão do operador (vídeo fora da faixa entra com aviso, nunca é recusado) pode ter sido revertida.",
    );
  } else if (rotaUploadVisual.includes(".code(422)")) {
    failures.push(
      "criative-jobs: /creative-jobs/upload-visual agora recusa (422) por duração — isso contraria a " +
        "decisão explícita do operador de 30/09/2026: vídeo fora de 4-30s deve ENTRAR com aviso, nunca ser recusado.",
    );
  } else {
    notes.push("criative-jobs: upload-visual nunca recusa por duração, só marca duracaoForaDoEsperado");
  }

  // 4 — upload de áudio: duração fora de 3-600s É 422 (o oposto da 3).
  if (
    !rotaUploadAudio.includes("duracaoReal < 3 || duracaoReal > 600") ||
    !rotaUploadAudio.includes('"audio_duration_out_of_range"')
  ) {
    failures.push(
      "criative-jobs: /creative-jobs/upload não recusa mais áudio fora de 3-600s — essa regra é o " +
        "OPOSTO da 3 (vídeo aceita fora da faixa, áudio não); as duas são fáceis de inverter por engano " +
        "numa refatoração que trate os dois caminhos como iguais.",
    );
  } else {
    notes.push("criative-jobs: upload de áudio recusa (422) fora de 3-600s");
  }

  // 5 — DELETE sempre filtra por tenant_id, no SELECT e no DELETE.
  if (
    !rotaDelete.includes("WHERE id = $1 AND tenant_id = $2") ||
    (rotaDelete.match(/tenant_id = \$2/g) ?? []).length < 2
  ) {
    failures.push(
      "criative-jobs: DELETE /creative-jobs/:id não filtra por tenant_id nos dois pontos esperados " +
        "(SELECT e DELETE) — sem isso, um tenant poderia apagar o arquivo de outro, a mesma classe de " +
        "vazamento que o PREFLIGHT-1 fechou em getCredentialForVendor.",
    );
  } else {
    notes.push("criative-jobs: DELETE filtra por tenant_id no SELECT e no DELETE");
  }

  // 6 — upload-visual: teto de bytes fixado ANTES de up.file.fields.
  const idxTakeUpload = rotaUploadVisual.indexOf("const up = await takeUpload(");
  const idxFields = rotaUploadVisual.indexOf("up.file.fields?.modo");
  if (idxTakeUpload < 0 || idxFields < 0 || idxTakeUpload > idxFields) {
    failures.push(
      "criative-jobs: /creative-jobs/upload-visual lê up.file.fields.modo ANTES (ou sem nunca chamar) " +
        "takeUpload — é exatamente o bug real caçado e corrigido em 30/09/2026 (o teto de bytes tem de " +
        "estar fixado antes de @fastify/multipart expor os campos do formulário).",
    );
  } else {
    notes.push("criative-jobs: upload-visual fixa o teto de bytes antes de ler up.file.fields");
  }

  // 7 — tituloValido() chamado nas 3 rotas de criação.
  const ocorrenciasTitulo = fonte.split("tituloValido(").length - 1;
  // A primeira ocorrência é a DEFINIÇÃO da função — as 3 seguintes são os
  // call sites em POST, /upload e /upload-visual.
  if (ocorrenciasTitulo !== 4) {
    failures.push(
      `criative-jobs: esperava tituloValido() definido 1 vez e chamado 3 vezes (4 ocorrências no total), ` +
        `achei ${ocorrenciasTitulo} — uma das rotas de criação pode ter perdido a validação de título que ` +
        "o TITULO-1 já estabeleceu como necessária (1-80 caracteres, sem caracteres de controle).",
    );
  } else {
    notes.push("criative-jobs: tituloValido() é chamado nas 3 rotas de criação");
  }

  return { failures, notes };
}
