/**
 * O TENANT ZERADO NASCE FUNCIONANDO — a herança de chave de plataforma (W1).
 *
 * ┌─ O estado que o W1 veio consertar, MEDIDO em 24/08 ──────────────────────┐
 * │ A chave de plataforma substituía o VALOR da linha do tenant e nunca      │
 * │ CRIAVA a linha. Tenant recém-criado nasce com três linhas de vendor      │
 * │ VAZIO e chave nula — **23 de 34 tenants deste banco** —, então           │
 * │ `getCredential` devolvia `null` e a geração respondia 400                │
 * │ `tier_vendor_unavailable` com as chaves de plataforma gravadas, válidas  │
 * │ e nunca consultadas.                                                     │
 * │                                                                          │
 * │ Decisão do operador (24/08), fechando o que o bloco CHAVES-2 deixou em   │
 * │ aberto: a plataforma paga quando o tenant não tem chave própria; o       │
 * │ tenant que tem continua pagando a dele.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  tenant SEM linha nenhuma alcança os vendors cobertos, via plataforma.
 *  G-2  tenant COM chave própria continua usando a DELE — a herança cobre a
 *       ausência, nunca substitui uma escolha (exceto no par declarado como
 *       `plataforma_vence`; ver G-4).
 *  G-3  sem chave nos DOIS níveis, a resposta é `null` — falha FECHADA e
 *       explícita, jamais uma chave herdada por acidente de nomenclatura.
 *  G-4  a divergência de precedência da fal é DECLARADA no mapa, não
 *       escondida: `avatar/fal` é `plataforma_vence` e os demais são
 *       `byok_vence`.
 *  G-5  `source` vem preenchido em TODA credencial resolvida — é ele que
 *       alimenta `provider_usage.key_source` (migration 063, R5).
 *
 * ┌─ Tudo por EXECUÇÃO, com o banco substituído ─────────────────────────────┐
 * │ `pool.query` é trocado por um banco de mentira que responde às DUAS      │
 * │ tabelas do caminho (`api_credentials` e `platform_credentials`), e as    │
 * │ funções reais rodam por cima. Medir isto por forma seria ler um `if` e   │
 * │ acreditar nele — e o que importa aqui é a PRECEDÊNCIA, que só aparece    │
 * │ quando os dois níveis existem ao mesmo tempo.                            │
 * │                                                                          │
 * │ O cache de `platformCredentialStore` (60 s) é invalidado no começo, e a  │
 * │ ordem dos casos é fixa por isso: sem invalidar, o segundo caso leria a   │
 * │ resposta do primeiro e a guarda mediria o cache em vez do código.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco de verdade.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { encrypt } from "../services/crypto.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { invalidatePlatformKeyCache } from "../services/platformCredentialStore.js";
import { HERANCA_DE_PLATAFORMA, plataformaQueCobre } from "../services/platformInheritance.js";

const LOOKUP = "backend/src/services/credentialLookup.ts";
const MAPA = "backend/src/services/platformInheritance.ts";
const ESTADO_DO_SELO = "frontend/src/pages/AdminPanel/platformKeyState.ts";
const CARTAO = "frontend/src/pages/AdminPanel/AdminPlatformKeysSection.tsx";
const CSS = "frontend/src/styles/global.css";
const LOCALES = ["frontend/src/locales/pt-BR.json", "frontend/src/locales/en.json"];

/** Os cinco estados do selo — W1 item 6. VERDE é só `validada`. */
const ESTADOS_DO_SELO = ["ausente", "gravada", "gravada_sem_sonda", "validada", "recusada"];

export const MUTANTS: Mutant[] = [
  {
    guard: "tenant sem chave própria herda a da plataforma",
    name: "a herança some e o tenant zerado volta a não ter acesso",
    kind: "obvio",
    file: LOOKUP,
    find:
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  // W1 — sem chave própria, a plataforma cobre. Antes disto a função devolvia\n" +
      "  // `null` aqui, e um tenant recém-criado não alcançava fornecedor nenhum\n" +
      "  // mesmo com todas as chaves de plataforma gravadas.\n" +
      "  return herdarDaPlataforma(provider, vendor);",
    replace:
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  return null;",
    expect: "herança: tenant zerado não alcançou",
  },
  {
    guard: "a chave do tenant vence a da plataforma",
    name: "a plataforma passa a vencer a chave do tenant em todos os pares",
    kind: "esperto",
    // ESPERTO: continua havendo herança, o tenant zerado continua funcionando,
    // e o caminho feliz do W1 segue verde. O que muda é quem PAGA: todo tenant
    // que conectou a própria chave passa a gastar a da plataforma sem nada na
    // tela dizendo isso — o oposto exato da decisão do operador ("tenant COM
    // chave própria continua pagando a dele").
    file: LOOKUP,
    find:
      "  const cobertura = plataformaQueCobre(provider, vendor);\n" +
      "  if (cobertura?.precedencia !== \"plataforma_vence\") return null;\n" +
      "  return herdarDaPlataforma(provider, vendor);",
    replace:
      "  const cobertura = plataformaQueCobre(provider, vendor);\n" +
      "  if (!cobertura) return null;\n" +
      "  return herdarDaPlataforma(provider, vendor);",
    expect: "herança: a chave do tenant foi substituída",
  },
  {
    guard: "par sem cobertura falha FECHADO",
    name: "um par sem chave de plataforma passa a herdar por nome",
    kind: "esperto",
    // ESPERTO: derivar o id pelo nome do vendor parece a simplificação óbvia
    // — e três dos cinco pares quebram a regra. O pior deles é
    // `script/anthropic`, que tem uma chave de nome parecido (`copilot`)
    // servindo o SUPORTE: o roteiro do cliente passaria a consumir a cota do
    // copiloto público sem uma linha de código dizendo isso.
    file: MAPA,
    find: "  return HERANCA_DE_PLATAFORMA[`${provider}/${vendor}`] ?? null;",
    replace:
      "  return (\n" +
      "    HERANCA_DE_PLATAFORMA[`${provider}/${vendor}`] ??\n" +
      "    ({ id: vendor, precedencia: \"byok_vence\" } as Cobertura)\n" +
      "  );",
    expect: "herança: par sem cobertura não falhou fechado",
  },
  {
    guard: "a divergência de precedência da fal é declarada",
    name: "a fal passa a seguir a regra geral e a BYOK inválida volta",
    kind: "esperto",
    // ESPERTO: alinhar a fal à regra geral parece CONSERTAR uma
    // inconsistência. O efeito medido é o oposto: a BYOK do tenant
    // `dev-c77a5b` é a chave que devolveu 401 em 19/08, e fazê-la vencer
    // re-bloqueia o caminho da fal — o P7.c volta a estar travado, sem nada
    // na tela dizendo por quê.
    file: MAPA,
    find: '  "avatar/fal": { id: "fal", precedencia: "plataforma_vence" },',
    replace: '  "avatar/fal": { id: "fal", precedencia: "byok_vence" },',
    expect: "herança: a fal deixou de ser plataforma_vence",
  },
  {
    guard: "o selo verde significa que o fornecedor respondeu",
    name: "o selo volta a ler apenas se existe linha gravada",
    kind: "esperto",
    // ESPERTO: `configured` continua sendo a informação certa para SABER que
    // há chave — o defeito é chamá-la de "conectado". MEDIDO em 24/08: o
    // operador gravou quatro chaves pelo painel e as quatro ficaram com
    // `last_validated_at` NULL (a validação só roda por clique), com a tela
    // dizendo "conectado" nas quatro. E o cartão da fal não tem sonda: ali o
    // verde nunca poderia significar nada.
    file: CARTAO,
    find: "        <StatusPill status={`platform_key_${platformKeyState(credential)}`} />",
    replace: '        <StatusPill status={credential.configured ? "connected" : "disconnected"} />',
    expect: "selo: o cartão não deriva o estado de platformKeyState",
  },
];

export interface PlatformInheritanceCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_ZERADO = "00000000-0000-4000-8000-00000000w1a0".replace("w", "0");
const TENANT_COM_CHAVE = "00000000-0000-4000-8000-00000000w1b0".replace("w", "0");

/** O que cada tenant de prova tem em `api_credentials`. */
const LINHAS: Record<string, { provider: string; vendor: string; chave: string }[]> = {
  [TENANT_ZERADO]: [],
  [TENANT_COM_CHAVE]: [
    { provider: "avatar", vendor: "heygen", chave: "BYOK-AVATAR-DO-TENANT" },
    { provider: "voice", vendor: "elevenlabs", chave: "BYOK-VOZ-DO-TENANT" },
    { provider: "avatar", vendor: "fal", chave: "BYOK-FAL-DO-TENANT" },
  ],
};

const CHAVES_DE_PLATAFORMA: Record<string, string> = {
  heygen: "PLATAFORMA-HEYGEN",
  elevenlabs: "PLATAFORMA-ELEVENLABS",
  google: "PLATAFORMA-GOOGLE",
  fal: "PLATAFORMA-FAL",
};

/**
 * Roda `chamada` com `pool.query` respondendo às duas tabelas do caminho.
 *
 * `platformKeysForceEnv` NÃO é tocado: se o ambiente do gate o ligasse, a
 * resolução leria o `.env` e esta guarda mediria outra coisa. O caso é
 * detectado pelo próprio controle (a plataforma teria de devolver os valores
 * abaixo, e não devolveria).
 */
async function comBancoDeMentira<T>(chamada: () => Promise<T>): Promise<T> {
  const queryOriginal = pool.query.bind(pool);
  invalidatePlatformKeyCache();
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      const v = (valores ?? []) as unknown[];

      if (/FROM api_credentials/.test(sql)) {
        const linhas = LINHAS[String(v[0])] ?? [];
        const doProvider = linhas.filter((l) => l.provider === String(v[1]));
        // A busca por vendor explícito tem um terceiro parâmetro; a outra não.
        const casadas = v.length >= 3 ? doProvider.filter((l) => l.vendor === String(v[2])) : doProvider;
        return {
          rows: casadas.map((l) => ({ encrypted_key: encrypt(l.chave), vendor: l.vendor })),
          rowCount: casadas.length,
        };
      }

      if (/FROM platform_credentials/.test(sql)) {
        const valor = CHAVES_DE_PLATAFORMA[String(v[0])];
        return valor
          ? { rows: [{ key: String(v[0]), encrypted_key: encrypt(valor) }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    return await chamada();
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
    invalidatePlatformKeyCache();
  }
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkPlatformInheritancePolicy(): Promise<PlatformInheritanceCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const medido = await comBancoDeMentira(async () => ({
    zeradoAvatar: await getCredential(TENANT_ZERADO, "avatar"),
    zeradoVoz: await getCredential(TENANT_ZERADO, "voice"),
    zeradoScript: await getCredential(TENANT_ZERADO, "script"),
    zeradoDid: await getCredentialForVendor(TENANT_ZERADO, "avatar", "did"),
    proprioAvatar: await getCredentialForVendor(TENANT_COM_CHAVE, "avatar", "heygen"),
    proprioVoz: await getCredentialForVendor(TENANT_COM_CHAVE, "voice", "elevenlabs"),
    proprioFal: await getCredentialForVendor(TENANT_COM_CHAVE, "avatar", "fal"),
  }));

  // -------------------------------------------------------------------------
  // G-1 — o tenant zerado alcança
  // -------------------------------------------------------------------------
  const zerados = [
    ["avatar", medido.zeradoAvatar],
    ["voice", medido.zeradoVoz],
    ["script", medido.zeradoScript],
  ] as const;
  const naoAlcancados = zerados.filter(([, c]) => c === null).map(([p]) => p);
  if (naoAlcancados.length > 0) {
    failures.push(
      `herança: tenant zerado não alcançou ${naoAlcancados.join(", ")} — sem chave própria e sem ` +
        "herança, um tenant recém-criado não fala com fornecedor nenhum, mesmo com todas as chaves de " +
        "plataforma gravadas. Era o estado de 23 dos 34 tenants deste banco antes do W1.",
    );
  } else if (zerados.some(([, c]) => c?.source !== "platform")) {
    failures.push(
      "herança: o tenant zerado alcançou os providers, mas alguma credencial NÃO veio da plataforma — " +
        `${JSON.stringify(zerados.map(([p, c]) => [p, c?.source]))}. Ele não tem chave própria: qualquer ` +
        "outra origem aqui significa que a guarda está lendo um estado que não é o que ela montou.",
    );
  } else {
    notes.push(
      "    herança: tenant sem chave nenhuma alcança avatar, voice e script — os três via plataforma",
    );
  }

  // -------------------------------------------------------------------------
  // G-2 — a chave do tenant vence
  // -------------------------------------------------------------------------
  if (medido.proprioAvatar?.source !== "tenant_byok" || medido.proprioVoz?.source !== "tenant_byok") {
    failures.push(
      "herança: a chave do tenant foi substituída pela da plataforma — " +
        `avatar=${JSON.stringify(medido.proprioAvatar?.source)}, voz=${JSON.stringify(medido.proprioVoz?.source)}. ` +
        "A decisão do operador é explícita: a plataforma paga a AUSÊNCIA, e quem conectou a própria " +
        "chave continua pagando a dele. Inverter isso muda quem recebe a fatura, em silêncio.",
    );
  } else {
    notes.push("    herança: tenant COM chave própria continua usando a dele (avatar e voz)");
  }

  // -------------------------------------------------------------------------
  // G-3 — sem cobertura, falha fechada
  // -------------------------------------------------------------------------
  if (medido.zeradoDid !== null) {
    failures.push(
      `herança: par sem cobertura não falhou fechado — \`avatar/did\` devolveu ` +
        `${JSON.stringify(medido.zeradoDid?.source)}. Não há chave de plataforma para o did; herdar ` +
        "aqui faria a plataforma pagar uma conta que ninguém decidiu, e por um vendor que o produto " +
        "sequer despacha hoje.",
    );
  } else {
    notes.push("    herança: par sem chave de plataforma (avatar/did) devolve null — falha fechada");
  }

  // -------------------------------------------------------------------------
  // G-4 — a divergência da fal, declarada e efetiva
  // -------------------------------------------------------------------------
  const coberturaFal = plataformaQueCobre("avatar", "fal");
  if (coberturaFal?.precedencia !== "plataforma_vence") {
    failures.push(
      "herança: a fal deixou de ser plataforma_vence — ela é a exceção DECLARADA desde `2a04b4a` " +
        "(21/08), e alinhá-la à regra geral traz de volta a BYOK do tenant `dev-c77a5b`, que é a chave " +
        "que devolveu 401 em 19/08. O caminho da fal voltaria a estar bloqueado sem nada dizer por quê.",
    );
  } else if (medido.proprioFal?.source !== "platform") {
    failures.push(
      `herança: a fal está declarada como plataforma_vence mas resolveu ${JSON.stringify(medido.proprioFal?.source)} ` +
        "num tenant que TEM BYOK de fal. A declaração e o comportamento têm de contar a mesma história.",
    );
  } else {
    notes.push(
      "    herança: `avatar/fal` é a exceção declarada (plataforma_vence) e se comporta como tal",
    );
  }

  // -------------------------------------------------------------------------
  // G-5 — `source` sempre presente
  // -------------------------------------------------------------------------
  const resolvidas = [
    medido.zeradoAvatar,
    medido.zeradoVoz,
    medido.zeradoScript,
    medido.proprioAvatar,
    medido.proprioVoz,
    medido.proprioFal,
  ].filter((c) => c !== null);
  const semSource = resolvidas.filter((c) => c!.source !== "platform" && c!.source !== "tenant_byok");
  if (semSource.length > 0) {
    failures.push(
      `herança: ${semSource.length} credencial(is) resolvida(s) sem \`source\` válido. É ele que alimenta ` +
        "`provider_usage.key_source` (migration 063): sem ele a atribuição de gasto volta a não saber de " +
        "quem é a fatura, que foi o buraco inteiro do R5.",
    );
  } else if (resolvidas.length >= 6) {
    notes.push(`    herança: as ${resolvidas.length} credenciais resolvidas trazem \`source\` preenchido`);
  }

  // -------------------------------------------------------------------------
  // O mapa não perdeu as ausências deliberadas
  // -------------------------------------------------------------------------
  const mapa = lerDaRaiz(MAPA);
  for (const par of ["avatar/did", "script/anthropic", "script/openai"]) {
    if (!HERANCA_DE_PLATAFORMA[par] && !mapa.includes(`"${par}"`)) {
      failures.push(
        `herança: o par \`${par}\` sumiu do mapa. Faltar e estar como \`null\` produzem o mesmo ` +
          "comportamento, mas só o segundo diz ao leitor que alguém pensou no caso — e é justamente " +
          "em `script/anthropic` que a decisão importa (a chave `copilot` serve o suporte).",
      );
    }
  }

  // -------------------------------------------------------------------------
  // O SELO — W1 item 6. FORMA, porque o componente é JSX e a derivação vive
  // no frontend, fora do alcance de import do gate.
  // -------------------------------------------------------------------------
  const cartao = lerDaRaiz(CARTAO);
  if (/StatusPill status={credential\.configured \? "connected"/.test(cartao)) {
    failures.push(
      "selo: o cartão não deriva o estado de platformKeyState — voltou a ler `configured`, que " +
        "significa apenas \"existe linha gravada\". Foi assim que quatro chaves recém-gravadas, nenhuma " +
        "delas validada, apareceram como \"conectado\" em 24/08 — inclusive a da fal, que NÃO TEM sonda " +
        "e cujo verde não pode significar nada.",
    );
  } else if (!cartao.includes("platformKeyState(credential)")) {
    failures.push(
      `selo: não achei \`platformKeyState(credential)\` em ${CARTAO}. A guarda não pode opinar sobre um ` +
        "trecho que não encontrou.",
    );
  } else {
    notes.push("    selo: o cartão deriva o estado de platformKeyState, e não de `configured`");
  }

  const derivacao = lerDaRaiz(ESTADO_DO_SELO);
  const posOk = derivacao.indexOf("lastValidationOk === true");
  const posSonda = derivacao.indexOf("c.hasProbe");
  if (posOk < 0 || posSonda < 0) {
    failures.push(
      `selo: ${ESTADO_DO_SELO} perdeu a comparação de \`lastValidationOk\` ou a de \`hasProbe\` — as duas ` +
        "são o que separa os cinco estados.",
    );
  } else if (posOk > posSonda) {
    failures.push(
      "selo: `hasProbe` é avaliado ANTES de `lastValidationOk` — uma chave já validada com sucesso " +
        "passaria a aparecer como \"gravada\" no dia em que a sonda saísse do código. O que aconteceu " +
        "com o fornecedor não se apaga por causa de uma mudança nossa.",
    );
  } else {
    notes.push("    selo: validação real vence ausência de sonda na derivação do estado");
  }

  for (const arquivo of LOCALES) {
    let texto = "";
    try {
      texto = lerDaRaiz(arquivo);
    } catch {
      failures.push(`selo: não consegui ler ${arquivo}.`);
      continue;
    }
    const faltando = ESTADOS_DO_SELO.filter((e) => !texto.includes(`platform_key_${e}`));
    if (faltando.length > 0) {
      failures.push(
        `selo: ${arquivo} não tem as chaves ${faltando.map((e) => `platform_key_${e}`).join(", ")} — o ` +
          "selo mostraria a chave de tradução crua no painel que vai ser apresentado.",
      );
    }
  }

  const css = lerDaRaiz(CSS);
  const semEstilo = ESTADOS_DO_SELO.filter((e) => !css.includes(`status-platform_key_${e}`));
  if (semEstilo.length > 0) {
    failures.push(
      `selo: ${CSS} não estiliza ${semEstilo.map((e) => `status-platform_key_${e}`).join(", ")} — um ` +
        "selo sem cor própria herda a neutra, e `recusada` passaria despercebida ao lado de `validada`.",
    );
  } else {
    notes.push("    selo: os 5 estados têm rótulo nos dois idiomas e cor própria no CSS");
  }

  return { failures, notes };
}
