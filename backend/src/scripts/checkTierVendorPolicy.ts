/**
 * FASE C (multi-vendor de avatar) — o VENDOR sai do `tier_video` escolhido,
 * não mais da credencial default do tenant. 22/08.
 *
 * As Fases A (migration 060) e B (admin multi-seleção) deram a um tenant a
 * possibilidade de ter HEYGEN e FAL configurados ao mesmo tempo — mas os 3
 * call sites de `routes/videos.ts` que geram/aprovam/re-acompanham vídeo
 * continuavam pegando "a credencial de avatar do tenant" (`getCredential`,
 * sem ORDER BY determinístico, sem saber de vendor nenhum). Este bloco os
 * torna tier-aware:
 *
 *  G-1  `vendorRequiredByTier` — "simples" exige heygen; "normal"/"premium"
 *       exigem fal (`falPipeline.ts`)
 *  G-2  `getCredential` (a genérica, usada pelos 11 call sites NÃO-tier-
 *       aware) é DETERMINÍSTICA — `ORDER BY is_default DESC LIMIT 1`
 *  G-3  `getCredentialForVendor` filtra pelo vendor pedido, nunca devolve a
 *       chave de outro vendor
 *  G-4  criação (`POST /videos`): busca a credencial do vendor EXIGIDO pelo
 *       tier, não a default do tenant
 *  G-5  criação: credencial ausente para o tier vira 400
 *       `tier_vendor_unavailable`, nunca um crash nem um fallback silencioso
 *  G-6  aprovação (`carregarCorridaAprovavel`): busca a credencial "fal"
 *       diretamente, não a default do tenant seguida de checagem de vendor
 *  G-7  `rearmVideoPolling`: busca a credencial do vendor JÁ GRAVADO na
 *       linha (`provider_vendor`), não a default do tenant
 *
 * ┌─ G-1, G-2, G-3, G-7 medem por EXECUÇÃO ───────────────────────────────┐
 * │ `vendorRequiredByTier`, `getCredential`, `getCredentialForVendor` e    │
 * │ `rearmVideoPolling` são todos EXPORTADOS — nada impede chamar o código │
 * │ real. G-2 e G-3 substituem `pool.query` por um dublê que simula o que  │
 * │ o Postgres faz (ou deixa de fazer) com/sem a cláusula em questão: sem  │
 * │ isso, testar "a query tem ORDER BY" só por grep no texto não provaria  │
 * │ nada sobre o COMPORTAMENTO — e é o comportamento (qual linha volta em  │
 * │ `rows[0]`) que decide qual credencial o tenant recebe. G-7 substitui   │
 * │ `pool.query` E `globalThis.setInterval` (o segundo só para capturar e  │
 * │ CANCELAR o intervalo que `pollJob` cria — zero rede, mesmo padrão dos  │
 * │ outros arquivos deste projeto que zeram `PROVIDER_MODE`/`fetch`).      │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-4, G-5, G-6 medem por FORMA ───────────────────────────────────────┐
 * │ `carregarCorridaAprovavel` e o handler de criação são closures dentro  │
 * │ de `videoRoutes(app)`, sem função exportada para chamar isolada — a    │
 * │ mesma limitação de G-D/G-E em `checkFalApprovalPolicy.ts`. A guarda lê │
 * │ o arquivo real e confere texto de CÓDIGO (chamada de função, literal   │
 * │ de erro), nunca um comentário.                                        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Nenhuma rede real (fetch nunca é chamado; o único
 * `setInterval` que `rearmVideoPolling` cria é cancelado antes de qualquer
 * chance de disparar), nenhum banco real (`pool.query` sempre substituído
 * nos testes de execução).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { encrypt } from "../services/crypto.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { vendorRequiredByTier, type VideoTier } from "../services/video/falPipeline.js";
import { rearmVideoPolling } from "../routes/videos.js";
import type { VideoEmVoo } from "../services/video/recovery.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const CREDENTIAL_LOOKUP = "backend/src/services/credentialLookup.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "vendorRequiredByTier: simples exige heygen; normal/premium exigem fal",
    name: "o ternário do vendor exigido por tier é invertido",
    kind: "esperto",
    // ESPERTO: o `tsc` continua verde (os dois ramos devolvem AvatarVendor
    // válido), a função continua existindo e sendo chamada nos 3 call
    // sites — só o VEREDITO inverte. Um tenant heygen-only passaria a ver
    // "Normal"/"Premium" disponíveis e "Simples" recusado; o inverso para
    // fal-only.
    file: PIPELINE,
    find: '  return tier === "simples" ? "heygen" : "fal";',
    replace: '  return tier === "simples" ? "fal" : "heygen";',
    expect: "vendor por tier: vendorRequiredByTier deu o veredito errado",
  },
  {
    guard: "getCredential (a genérica) é determinística — ORDER BY is_default DESC LIMIT 1",
    name: "o ORDER BY is_default some da query de getCredential",
    kind: "esperto",
    // ESPERTO: a query continua sintaticamente válida, continua filtrando
    // por tenant+provider, continua devolvendo UMA linha — só que sem
    // garantia de qual, porque o Postgres não promete ordem nenhuma sem
    // ORDER BY. Os 11 call sites não-tier-aware (inclusive
    // `/video-format-support`, `/video-cost-estimate`, e o fallback legado
    // de `rearmVideoPolling`) passariam a receber, por sorte, a credencial
    // de QUALQUER vendor do tenant — não necessariamente a default.
    file: CREDENTIAL_LOOKUP,
    find:
      '    "SELECT encrypted_key, vendor FROM api_credentials WHERE tenant_id = $1 AND provider = $2 ORDER BY is_default DESC LIMIT 1",',
    replace: '    "SELECT encrypted_key, vendor FROM api_credentials WHERE tenant_id = $1 AND provider = $2",',
    expect: "vendor por tier: getCredential devolveu a credencial NÃO-default",
  },
  {
    guard: "getCredentialForVendor filtra pelo vendor pedido, nunca devolve a chave de outro",
    name: "o AND vendor = $3 some da query de getCredentialForVendor",
    kind: "esperto",
    // ESPERTO: a query continua válida, continua recebendo os 3 parâmetros
    // (o call site não muda), continua devolvendo uma linha — só que
    // IGNORA qual vendor foi pedido. Um tenant com heygen+fal configurados
    // receberia, para um vídeo tier "premium" (exige fal), a chave da
    // HeyGen — que `resolveTenantAvatarFalKey` ou o fornecedor da fal
    // rejeitariam, mas só DEPOIS de a corrida já ter sido autorizada.
    file: CREDENTIAL_LOOKUP,
    find:
      '    "SELECT encrypted_key FROM api_credentials WHERE tenant_id = $1 AND provider = $2 AND vendor = $3",',
    replace: '    "SELECT encrypted_key FROM api_credentials WHERE tenant_id = $1 AND provider = $2",',
    expect: "vendor por tier: getCredentialForVendor devolveu a credencial de outro vendor",
  },
  {
    guard: "criação: a credencial de avatar vem do vendor EXIGIDO pelo tier, não da default do tenant",
    name: "a criação volta a usar getCredential (a genérica) em vez de getCredentialForVendor",
    kind: "esperto",
    // ESPERTO: `getCredential` existe, devolve a MESMA forma
    // (ResolvedCredential), e o caminho feliz de um tenant com UM SÓ vendor
    // continua funcionando por acidente — o defeito só aparece no caso que
    // esta rodada existe para cobrir: um tenant com os DOIS vendors
    // configurados, escolhendo um tier cujo vendor não é o default.
    file: ROTA_DE_VIDEOS,
    find:
      "    const vendorDoTier = vendorRequiredByTier(tierVideo);\n" +
      '    const avatarCredential = await getCredentialForVendor(req.tenantId, "avatar", vendorDoTier);',
    replace:
      "    const vendorDoTier = vendorRequiredByTier(tierVideo);\n" +
      '    const avatarCredential = await getCredential(req.tenantId, "avatar");',
    expect: "vendor por tier: a criação usou a credencial default do tenant em vez da do vendor exigido pelo tier",
  },
  {
    guard: "criação: credencial ausente para o tier vira 400 tier_vendor_unavailable, nunca um crash",
    name: "a recusa tier_vendor_unavailable vira um 500 genérico",
    kind: "esperto",
    // ESPERTO: o `if (!avatarCredential)` FICA — apagar o bloco inteiro
    // removeria o narrowing e faria o `tsc` reprovar por TS18047 antes de a
    // guarda opinar (mesma família do gotcha `if (false && …)` já registrado
    // no CLAUDE.md). Só o CORPO muda: em vez do 400 limpo com
    // `tier_vendor_unavailable` e a mensagem explicando o que fazer, um 500
    // genérico — a recusa ainda acontece (nada é cobrado), mas sem o código
    // que a tela precisa para dizer à pessoa QUAL nível escolher.
    file: ROTA_DE_VIDEOS,
    find:
      '    if (!avatarCredential) {\n' +
      '      logEvent("warn", "video_tier_vendor_unavailable", {\n' +
      '        context: "videos.create",\n' +
      "        tier: tierVideo,\n" +
      "        vendorRequerido: vendorDoTier,\n" +
      '        consequence: "recusado antes do débito; nenhuma linha criada e nenhum crédito tocado",\n' +
      "      });\n" +
      "      return reply.code(400).send({\n" +
      '        error: "tier_vendor_unavailable",\n' +
      "        message:\n" +
      '          `O nível "${tierVideo}" exige um provedor (${vendorDoTier}) que esta conta não tem conectado. ` +\n' +
      '          "Escolha outro nível, ou conecte o provedor em Configurações. Nada foi cobrado.",\n' +
      "      });\n" +
      "    }",
    replace:
      '    if (!avatarCredential) {\n' +
      '      return reply.code(500).send({ error: "internal_error", message: "Erro interno." });\n' +
      "    }",
    expect: "vendor por tier: a recusa tier_vendor_unavailable desapareceu do handler de criação",
  },
  {
    guard: "aprovação: a credencial de avatar já vem do vendor fal, não da default do tenant",
    name: "a aprovação volta a usar getCredential (a genérica) em vez de getCredentialForVendor",
    kind: "esperto",
    // ESPERTO: `getCredential` existe, devolve a MESMA forma, e um tenant
    // com SÓ fal configurado continua aprovando normalmente — o defeito só
    // aparece com heygen COMO DEFAULT e fal como segundo vendor: a
    // aprovação de um vídeo que está de verdade na fal passaria a usar a
    // chave da HeyGen (ou falharia com "approval_unavailable" por sorte,
    // dependendo de qual linha `getCredential` devolvesse).
    file: ROTA_DE_VIDEOS,
    find: '    const avatarCredential = await getCredentialForVendor(tenantId, "avatar", "fal");',
    replace: '    const avatarCredential = await getCredential(tenantId, "avatar");',
    expect: "vendor por tier: a aprovação usou a credencial default do tenant em vez da credencial fal",
  },
  {
    guard: "rearmVideoPolling: busca a credencial pelo vendor JÁ GRAVADO na linha, não a default do tenant",
    name: "rearmVideoPolling volta a ignorar provider_vendor e usar sempre a credencial default",
    kind: "esperto",
    // ESPERTO: `vendorConhecido` continua sendo lido e usado logo abaixo
    // (em `vendorDoJob = vendorConhecido ?? credential.vendor`), então o
    // VENDOR do job continua certo — só a CHAVE muda, silenciosamente, para
    // a de outro vendor num tenant com heygen+fal configurados. O `tsc`
    // fica verde (mesma forma, `ResolvedCredential | null`), e o caminho
    // feliz de um tenant com UM SÓ vendor continua funcionando por acidente.
    file: ROTA_DE_VIDEOS,
    find:
      "  const vendorConhecido = linha.provider_vendor as AvatarVendor | null;\n" +
      "  const credential = vendorConhecido\n" +
      '    ? await getCredentialForVendor(linha.tenant_id, "avatar", vendorConhecido)\n' +
      '    : await getCredential(linha.tenant_id, "avatar");',
    replace:
      "  const vendorConhecido = linha.provider_vendor as AvatarVendor | null;\n" +
      '  const credential = await getCredential(linha.tenant_id, "avatar");',
    expect: "vendor por tier: rearmVideoPolling não buscou a credencial pelo vendor gravado na linha",
  },
];

export interface TierVendorCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

// ---------------------------------------------------------------------------
// G-1: vendorRequiredByTier, avaliada por EXECUÇÃO direta (função pura)
// ---------------------------------------------------------------------------

const CASOS_VENDOR_POR_TIER: ReadonlyArray<{ tier: VideoTier; vendorEsperado: string }> = [
  { tier: "simples", vendorEsperado: "heygen" },
  { tier: "normal", vendorEsperado: "fal" },
  { tier: "premium", vendorEsperado: "fal" },
];

// ---------------------------------------------------------------------------
// G-2: getCredential determinística, com pool.query substituído
// ---------------------------------------------------------------------------

async function testarGetCredentialDeterministico(): Promise<{ vendorObtido: string | null; erro: string }> {
  const queryOriginal = pool.query.bind(pool);
  const chaveHeygen = encrypt("chave-heygen-da-prova");
  const chaveFal = encrypt("chave-fal-da-prova");
  let vendorObtido: string | null = null;
  let erro = "";
  try {
    (pool as { query: unknown }).query = (async (texto: unknown) => {
      const sql = String(texto);
      if (/FROM api_credentials WHERE tenant_id = \$1 AND provider = \$2/.test(sql)) {
        const linhaFal = { encrypted_key: chaveFal, vendor: "fal" };
        const linhaHeygen = { encrypted_key: chaveHeygen, vendor: "heygen" };
        if (/ORDER BY is_default DESC/.test(sql)) {
          // Simula o Postgres HONRANDO o ORDER BY: a default (heygen) primeiro.
          return { rows: [linhaHeygen, linhaFal], rowCount: 2 };
        }
        // Sem ORDER BY o Postgres não promete ordem nenhuma — aqui,
        // deliberadamente, a NÃO-default primeiro, para expor quem lê
        // `rows[0]` sem pedir a ordem certa.
        return { rows: [linhaFal, linhaHeygen], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    const credencial = await getCredential("tenant-da-prova", "avatar");
    vendorObtido = credencial?.vendor ?? null;
  } catch (err) {
    erro = String(err);
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
  }
  return { vendorObtido, erro };
}

// ---------------------------------------------------------------------------
// G-3: getCredentialForVendor filtra por vendor, com pool.query substituído
// ---------------------------------------------------------------------------

async function testarGetCredentialForVendorFiltra(): Promise<{ chaveObtida: string | null; erro: string }> {
  const queryOriginal = pool.query.bind(pool);
  const chaveHeygen = encrypt("chave-heygen-da-prova");
  const chaveFal = encrypt("chave-fal-da-prova");
  let chaveObtida: string | null = null;
  let erro = "";
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/FROM api_credentials WHERE tenant_id = \$1 AND provider = \$2/.test(sql)) {
        const linhas = [
          { encrypted_key: chaveHeygen, vendor: "heygen" },
          { encrypted_key: chaveFal, vendor: "fal" },
        ];
        if (/AND vendor = \$3/.test(sql)) {
          const vendorPedido = (valores as unknown[] | undefined)?.[2];
          const achada = linhas.find((l) => l.vendor === vendorPedido);
          return { rows: achada ? [{ encrypted_key: achada.encrypted_key }] : [], rowCount: achada ? 1 : 0 };
        }
        // Sem o filtro por vendor: devolve sempre a PRIMEIRA linha, seja
        // qual for o vendor pedido — o pior caso: chave errada, sem erro.
        return { rows: [{ encrypted_key: linhas[0].encrypted_key }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    const credencial = await getCredentialForVendor("tenant-da-prova", "avatar", "fal");
    chaveObtida = credencial?.apiKey ?? null;
  } catch (err) {
    erro = String(err);
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
  }
  return { chaveObtida, erro };
}

// ---------------------------------------------------------------------------
// G-7: rearmVideoPolling busca a credencial do vendor JÁ GRAVADO na linha
// ---------------------------------------------------------------------------

async function testarRearmVideoPollingVendorAware(): Promise<{
  sqlCredencial: string;
  paramsCredencial: unknown[];
  erro: string;
}> {
  const queryOriginal = pool.query.bind(pool);
  const setIntervalOriginal = globalThis.setInterval;
  const intervalos: ReturnType<typeof setInterval>[] = [];
  const chaveHeygen = encrypt("chave-heygen-da-prova");
  const chaveFal = encrypt("chave-fal-da-prova");
  let sqlCredencial = "";
  let paramsCredencial: unknown[] = [];
  let erro = "";
  try {
    // Captura e CANCELA qualquer setInterval que `pollJob` crie — o
    // callback nunca dispara, então nenhuma rede real acontece. Mesmo
    // padrão de zerar `fetch`/`PROVIDER_MODE` já usado por outros arquivos
    // deste projeto, adaptado para o único ponto deste caminho que usa
    // temporizador em vez de rede direta.
    (globalThis as unknown as { setInterval: typeof setInterval }).setInterval = ((
      fn: (...args: unknown[]) => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      const id = setIntervalOriginal(fn as never, ms, ...(args as []));
      intervalos.push(id);
      return id;
    }) as typeof setInterval;

    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/FROM api_credentials WHERE tenant_id = \$1 AND provider = \$2/.test(sql)) {
        sqlCredencial = sql;
        paramsCredencial = (valores ?? []) as unknown[];
        if (/AND vendor = \$3/.test(sql)) {
          if (paramsCredencial[2] === "fal") return { rows: [{ encrypted_key: chaveFal }], rowCount: 1 };
          return { rows: [], rowCount: 0 };
        }
        // O fallback "default do tenant" — sempre devolve heygen, mesmo
        // quando o job é de outro vendor. É o comportamento pré-Fase C.
        return { rows: [{ encrypted_key: chaveHeygen, vendor: "heygen" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    const linha: VideoEmVoo = {
      id: "v-rearm-da-prova",
      tenant_id: "tenant-da-prova",
      status: "processing",
      provider_job_id: "job-da-prova",
      provider_vendor: "fal",
      publish_platform: "youtube",
      aspect_ratio: "16:9",
      resolution: "720p",
      provider_engine: null,
      duration_seconds: 10,
      simulated: false,
      idade_ms: 60_000,
    };
    await rearmVideoPolling(linha);
  } catch (err) {
    erro = String(err);
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
    globalThis.setInterval = setIntervalOriginal;
    for (const id of intervalos) clearInterval(id);
  }
  return { sqlCredencial, paramsCredencial, erro };
}

export async function checkTierVendorPolicy(): Promise<TierVendorCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-1
  // -------------------------------------------------------------------------
  let algumaFalhaG1 = false;
  for (const caso of CASOS_VENDOR_POR_TIER) {
    const obtido = vendorRequiredByTier(caso.tier);
    if (obtido === caso.vendorEsperado) continue;
    algumaFalhaG1 = true;
    failures.push(
      `vendor por tier: vendorRequiredByTier deu o veredito errado para o tier "${caso.tier}" — esperado ` +
        `"${caso.vendorEsperado}", obtido "${obtido}". Um tenant que só tem o vendor esperado configurado ` +
        "passaria a ser recusado (ou pior: um tenant com o vendor ERRADO configurado passaria a gerar).",
    );
  }
  if (!algumaFalhaG1) {
    notes.push(
      '    vendor por tier: vendorRequiredByTier — "simples" exige heygen, "normal"/"premium" exigem fal',
    );
  }

  // -------------------------------------------------------------------------
  // G-2
  // -------------------------------------------------------------------------
  const g2 = await testarGetCredentialDeterministico();
  if (g2.vendorObtido !== "heygen") {
    failures.push(
      `vendor por tier: getCredential devolveu a credencial NÃO-default — vendor obtido ` +
        `${JSON.stringify(g2.vendorObtido)}, esperado "heygen" (a linha is_default=true da prova). ` +
        `erro: ${JSON.stringify(g2.erro.slice(0, 140))}. Sem \`ORDER BY is_default DESC\`, os 11 call ` +
        "sites não-tier-aware de getCredential (inclusive o fallback legado de rearmVideoPolling) recebem " +
        "uma credencial ARBITRÁRIA quando o tenant tem mais de um vendor de avatar configurado.",
    );
  } else {
    notes.push("    vendor por tier: getCredential é determinística — ORDER BY is_default DESC LIMIT 1");
  }

  // -------------------------------------------------------------------------
  // G-3
  // -------------------------------------------------------------------------
  const g3 = await testarGetCredentialForVendorFiltra();
  if (g3.chaveObtida !== "chave-fal-da-prova") {
    failures.push(
      `vendor por tier: getCredentialForVendor devolveu a credencial de outro vendor — chave obtida ` +
        `${JSON.stringify(g3.chaveObtida)}, esperada "chave-fal-da-prova" (pedida com vendor="fal"). erro: ` +
        `${JSON.stringify(g3.erro.slice(0, 140))}. Sem o filtro \`AND vendor = $3\`, um tenant com heygen+fal ` +
        "configurados recebe a chave de QUALQUER um dos dois, independente do vendor pedido pelo call site.",
    );
  } else {
    notes.push("    vendor por tier: getCredentialForVendor filtra pelo vendor pedido — nunca devolve outro");
  }

  // -------------------------------------------------------------------------
  // G-7
  // -------------------------------------------------------------------------
  const g7 = await testarRearmVideoPollingVendorAware();
  if (!/AND vendor = \$3/.test(g7.sqlCredencial) || g7.paramsCredencial[2] !== "fal") {
    failures.push(
      "vendor por tier: rearmVideoPolling não buscou a credencial pelo vendor gravado na linha " +
        `(\`provider_vendor: "fal"\`) — SQL capturada: ${JSON.stringify(g7.sqlCredencial)}, params: ` +
        `${JSON.stringify(g7.paramsCredencial)}, erro: ${JSON.stringify(g7.erro.slice(0, 140))}. Um tenant ` +
        "com heygen+fal configurados teria a chave ERRADA usada para re-acompanhar um job que está na fal.",
    );
  } else {
    notes.push(
      "    vendor por tier: rearmVideoPolling busca a credencial pelo vendor já gravado na linha " +
        "(provider_vendor), não a default do tenant",
    );
  }

  // -------------------------------------------------------------------------
  // G-4, G-5, G-6 — FORMA, no arquivo real
  // -------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);

  if (
    !rota.includes(
      "    const vendorDoTier = vendorRequiredByTier(tierVideo);\n" +
        '    const avatarCredential = await getCredentialForVendor(req.tenantId, "avatar", vendorDoTier);',
    )
  ) {
    failures.push(
      "vendor por tier: a criação usou a credencial default do tenant em vez da do vendor exigido pelo " +
        `tier — o texto \`getCredentialForVendor(req.tenantId, "avatar", vendorDoTier)\` não está mais em ` +
        `${ROTA_DE_VIDEOS} logo após \`const vendorDoTier = vendorRequiredByTier(tierVideo);\`.`,
    );
  } else {
    notes.push("    vendor por tier: a criação busca a credencial do vendor exigido pelo tier escolhido");
  }

  if (!rota.includes('error: "tier_vendor_unavailable"')) {
    failures.push(
      "vendor por tier: a recusa tier_vendor_unavailable desapareceu do handler de criação — sem ela, " +
        "credencial ausente para o tier escolhido produz um TypeError (500 genérico) em vez de uma recusa " +
        "limpa antes do débito.",
    );
  } else {
    notes.push(
      "    vendor por tier: credencial ausente para o tier vira 400 tier_vendor_unavailable, antes do débito",
    );
  }

  if (!rota.includes('    const avatarCredential = await getCredentialForVendor(tenantId, "avatar", "fal");')) {
    failures.push(
      "vendor por tier: a aprovação usou a credencial default do tenant em vez da credencial fal — o texto " +
        `\`getCredentialForVendor(tenantId, "avatar", "fal")\` não está mais em ${ROTA_DE_VIDEOS}. Um tenant ` +
        "com heygen como default e fal como segundo vendor passa a ter a aprovação de um vídeo que ESTÁ na " +
        "fal decidida pela credencial errada.",
    );
  } else {
    notes.push("    vendor por tier: a aprovação busca a credencial fal diretamente, não a default do tenant");
  }

  return { failures, notes };
}
