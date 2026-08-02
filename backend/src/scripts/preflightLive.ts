/**
 * Checklist de véspera: o que precisa estar verdadeiro ANTES de trocar o
 * ambiente para `live`.
 *
 *   docker compose exec backend npm run preflight:live
 *
 * REGRA ABSOLUTA DESTE ARQUIVO: ele não chama fornecedor nenhum. Nem para
 * validar chave, nem para ler saldo. Um preflight que gasta cota é uma
 * contradição — a carteira do HeyGen comporta cerca de um vídeo, e descobrir
 * que "o preflight consumiu a geração da demo" seria o pior desfecho
 * possível. Ele lê configuração, banco e a própria API local, e mais nada.
 *
 * Também não imprime valor de chave, nem os 4 últimos: numa véspera de
 * apresentação esta saída é justamente o tipo de coisa que acaba colada num
 * chat ou fotografada numa tela compartilhada. Origem e presença bastam para
 * decidir; o valor não acrescenta nada à decisão.
 */
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import {
  LIVE_CONFIRM_ENV,
  LIVE_CONFIRM_VALUE,
  LIVE_ATTEMPT_LIMIT_ENV,
  LIVE_LIMIT_ENV,
  isLiveAuthorized,
  readLiveMaxAttempts,
  readLiveMaxGenerations,
} from "../services/providers/liveGuard.js";
import { readProviderMode } from "../services/providers/providerMode.js";
import { PLATFORM_CREDENTIALS, PLATFORM_CREDENTIAL_IDS } from "../services/platformCredentials.js";
import { listPlatformCredentials } from "../services/platformCredentialStore.js";
import { MIN_VIDEO_BYTES, validateVideoArtifact } from "../services/videoArtifact.js";

/**
 * NENHUMA chave de plataforma bloqueia a passagem para live, e isso não é
 * descuido — é a correção de um erro que a primeira versão deste arquivo
 * cometeu. Ela exigia as chaves de plataforma de HeyGen e ElevenLabs, logo
 * acima de uma linha dizendo que quem paga a geração é a credencial do
 * TENANT. As duas coisas não podiam ser verdade ao mesmo tempo.
 *
 * Quem manda é o código: `routes/videos.ts` e `routes/avatars.ts` leem
 * `getCredential(tenantId, ...)`. A chave de plataforma de vídeo/voz é hoje
 * só armazenada. Então o que bloqueia live é a credencial do tenant existir —
 * e é isso que se verifica abaixo.
 *
 * Reprovar por algo que live não precisa é pior que não verificar nada:
 * ensina a ignorar o preflight, e aí ele deixa de valer para o que importa.
 */
const TENANT_PROVIDERS_FOR_LIVE = ["avatar", "voice"] as const;

interface Line {
  ok: boolean;
  /** Bloqueia a passagem para live, ou é só informação. */
  blocking: boolean;
  label: string;
  detail: string;
}

const lines: Line[] = [];

function record(ok: boolean, blocking: boolean, label: string, detail: string): void {
  lines.push({ ok, blocking, label, detail });
}

async function main(): Promise<void> {
  const mode = readProviderMode();

  // --- 1. chaves de plataforma, por ORIGEM e sem valor --------------------
  const credentials = await listPlatformCredentials();
  for (const id of PLATFORM_CREDENTIAL_IDS) {
    const view = credentials.find((c) => c.id === id);
    const origin = view?.source === "panel" ? "painel (banco)" : view?.source === "env" ? ".env" : "ausente";
    record(
      Boolean(view?.configured),
      false,
      `chave de plataforma ${id}`,
      view?.configured
        ? `origem: ${origin}${view.forcedEnv ? " (PLATFORM_KEYS_FORCE_ENV ativo)" : ""}`
        : `ausente (${PLATFORM_CREDENTIALS[id].envVar} vazia, nada gravado no painel)`,
    );
  }

  // Quem a geração REALMENTE usa. Esta é a linha que bloqueia, e não as de
  // cima — ver o comentário de TENANT_PROVIDERS_FOR_LIVE.
  for (const provider of TENANT_PROVIDERS_FOR_LIVE) {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
         FROM api_credentials
        WHERE provider = $1 AND encrypted_key IS NOT NULL`,
      [provider],
    );
    const total = Number(rows[0].total);
    record(
      total > 0,
      true,
      `credencial de ${provider} do tenant`,
      total > 0
        ? `${total} tenant(s) com a chave conectada — é ela que a geração usa`
        : "nenhum tenant tem esta chave conectada; em live a geração falha antes de chamar o fornecedor",
    );
  }

  // --- 2. autorização e teto ---------------------------------------------
  const authorized = isLiveAuthorized();
  record(
    authorized,
    true,
    LIVE_CONFIRM_ENV,
    authorized
      ? "presente e com o valor exato"
      : `ausente — em live, exige exatamente "${LIVE_CONFIRM_VALUE}", e sem ela o servidor NÃO sobe`,
  );

  const cap = readLiveMaxGenerations();
  record(
    cap > 0,
    true,
    `teto de GASTO (${LIVE_LIMIT_ENV})`,
    `${cap} por sessão do servidor${cap > 1 ? " — acima do default de 1; confira se é intencional" : ""}` +
      "; conta voz e vídeo juntas, e a falha devolve a unidade",
  );

  // O segundo teto entra no preflight porque ele é o que pode travar uma
  // passada que está falhando — e descobrir sua existência no meio da passada
  // é exatamente o que este bloco eliminou do teto de gasto.
  const attemptCap = readLiveMaxAttempts();
  record(
    attemptCap >= cap,
    true,
    `teto de TENTATIVAS (${LIVE_ATTEMPT_LIMIT_ENV})`,
    attemptCap >= cap
      ? `${attemptCap} por sessão — margem de ${attemptCap - cap} falha(s) antes de travar. Não é devolvido.`
      : `${attemptCap}, ABAIXO do teto de gasto (${cap}): as tentativas acabam antes do gasto e o teto de ` +
        "gasto nunca é alcançado. Um dos dois números está errado.",
  );

  record(true, false, "PROVIDER_MODE atual", mode === "live" ? "live" : `${mode} (simulação)`);

  // --- 3. validação de download ativa ------------------------------------
  // Verificada exercitando a função de verdade, e não lendo uma flag: uma
  // flag diria que a proteção "está ligada" mesmo se a lógica tivesse sido
  // esvaziada.
  const truncado = validateVideoArtifact(Buffer.from("\0\0\0 ftypisom"), 1024);
  const semFtyp = validateVideoArtifact(Buffer.from("<!doctype html><h1>erro"), MIN_VIDEO_BYTES * 2);
  const valido = validateVideoArtifact(Buffer.from("\0\0\0 ftypisom"), MIN_VIDEO_BYTES);
  const guardaOk = !truncado.ok && !semFtyp.ok && valido.ok;
  record(
    guardaOk,
    true,
    "validação de artefato de vídeo",
    guardaOk
      ? `ativa — recusa abaixo de ${MIN_VIDEO_BYTES} bytes e sem assinatura ftyp`
      : "NÃO está recusando os casos inválidos — a proteção foi desfeita",
  );

  // --- 4. migrations aplicadas -------------------------------------------
  try {
    const { rows } = await pool.query<{ count: string; ultima: string }>(
      "SELECT count(*)::text AS count, max(name) AS ultima FROM schema_migrations",
    );
    record(Number(rows[0].count) > 0, true, "migrations", `${rows[0].count} aplicadas, última: ${rows[0].ultima}`);
  } catch (err) {
    record(false, true, "migrations", `não foi possível consultar: ${err instanceof Error ? err.message : err}`);
  }

  // --- 5. a própria API responde -----------------------------------------
  // Chamada à NOSSA origem, não a fornecedor.
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/health`);
    record(res.ok, true, "/api/health", `HTTP ${res.status}`);
  } catch (err) {
    record(false, true, "/api/health", `sem resposta: ${err instanceof Error ? err.message : err}`);
  }

  // --- saída --------------------------------------------------------------
  console.log("\nPreflight live — nenhuma chamada a fornecedor foi feita.\n");
  for (const l of lines) {
    const mark = l.ok ? "ok  " : l.blocking ? "FALTA" : "aviso";
    console.log(`  [${mark}] ${l.label}: ${l.detail}`);
  }

  const faltando = lines.filter((l) => !l.ok && l.blocking);
  console.log("");
  if (faltando.length === 0) {
    console.log("PRONTO PARA LIVE");
  } else {
    console.log(`FALTA PARA LIVE: ${faltando.map((l) => l.label).join("; ")}`);
  }

  await pool.end();
  // Sai 1 quando falta algo, para que um script de véspera possa encadear
  // isto sem ler a saída com os olhos.
  process.exit(faltando.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("preflight falhou:", err);
  process.exit(1);
});
