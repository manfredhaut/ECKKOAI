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
 * ┌─ h.3, 25/08 — A REGRA MUDOU DE NOVO, e esta guarda mudou junto ──────────┐
 * │ Até aqui a fal era a ÚNICA exceção: `avatar/fal` vencia a BYOK do        │
 * │ tenant, todo o resto seguia `byok_vence`. O operador generalizou: a      │
 * │ plataforma vence SEMPRE que tiver cobertura, para QUALQUER vendor — não  │
 * │ há mais campo de precedência, não há mais ramo à parte para a fal. Os    │
 * │ testes abaixo foram REESCRITOS para provar a regra geral, não a exceção  │
 * │ antiga; ver `platformInheritance.ts` para o mapa e `credentialLookup.ts` │
 * │ para onde a decisão é aplicada.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  tenant SEM linha nenhuma alcança os vendors cobertos, via plataforma.
 *  G-2  tenant COM chave própria e a plataforma TAMBÉM cobrindo: a plataforma
 *       vence — para heygen e voz, não só para a fal. É a prova de que a
 *       regra é geral, não uma exceção isolada.
 *  G-3  sem cobertura de plataforma para o par (ex.: `avatar/did`), o BYOK do
 *       tenant segue funcionando sem erro — o fallback não regrediu.
 *  G-3b sem chave nos DOIS níveis, a resposta é `null` — falha FECHADA e
 *       explícita, jamais uma chave herdada por acidente de nomenclatura.
 *  G-4  a exceção isolada da fal não existe mais NO CÓDIGO — nenhum arquivo
 *       menciona `precedencia`, `plataforma_vence` ou `byok_vence`.
 *  G-6  o tenant ZERADO vê os TRÊS níveis disponíveis — é a mesma cadeia que
 *       a criação usa para recusar (`vendorRequiredByTier` +
 *       `getCredentialForVendor`), e a tela pergunta em vez de reimplementar.
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
import { HERANCA_DE_PLATAFORMA } from "../services/platformInheritance.js";
import { VIDEO_TIERS, vendorRequiredByTier } from "../services/video/falPipeline.js";

const LOOKUP = "backend/src/services/credentialLookup.ts";
const MAPA = "backend/src/services/platformInheritance.ts";
const ESTADO_DO_SELO = "frontend/src/pages/AdminPanel/platformKeyState.ts";
const PASSO_CENA = "frontend/src/pages/CreateVideo/steps/SceneStep.tsx";
const CARTAO = "frontend/src/pages/AdminPanel/AdminPlatformKeysSection.tsx";
const CSS = "frontend/src/styles/global.css";
const LOCALES = ["frontend/src/locales/pt-BR.json", "frontend/src/locales/en.json"];

/** Os cinco estados do selo — W1 item 6. VERDE é só `validada`. */
const ESTADOS_DO_SELO = ["ausente", "gravada", "gravada_sem_sonda", "validada", "recusada"];

export const MUTANTS: Mutant[] = [
  {
    guard: "tenant sem chave própria herda a da plataforma",
    name: "a herança some inteiramente e o tenant zerado volta a não ter acesso",
    kind: "obvio",
    // ÓBVIO: com a regra geral (h.3), platform-first é a ÚNICA chamada que
    // resolve herança — não há mais um segundo caminho de fallback separado
    // para "sem chave própria". Removê-la quebra as duas pernas de uma vez:
    // o tenant zerado (W1) E o tenant com BYOK que a plataforma deveria
    // vencer (h.3) — a mais grosseira das duas quebras possíveis aqui.
    file: LOOKUP,
    find:
      "  const daPlataforma = await herdarDaPlataforma(provider, vendor);\n" +
      "  if (daPlataforma) return daPlataforma;\n" +
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  return null;\n" +
      "}\n" +
      "\n" +
      "// A busca por VENDOR EXPLÍCITO",
    replace:
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  return null;\n" +
      "}\n" +
      "\n" +
      "// A busca por VENDOR EXPLÍCITO",
    expect: "herança: tenant zerado não alcançou",
  },
  {
    guard: "a plataforma vence SEMPRE que tiver cobertura — regra GERAL, não exceção isolada da fal (h.3)",
    name: "reintroduz a exceção isolada da fal — só ela consulta a plataforma primeiro",
    kind: "esperto",
    // ESPERTO: a fal continua funcionando exatamente como antes — é
    // justamente por isso que este mutante é perigoso. O que ele reintroduz
    // é o ramo à parte que h.3 existe para eliminar: heygen e elevenlabs
    // voltam a `byok_vence` (a BYOK do tenant vence, a plataforma só cobre a
    // ausência), enquanto a fal segue plataforma-primeiro — a MESMA
    // divergência declarada de 24/08, só que sem o campo dizendo isso.
    //
    // ⚠️ ALVO: `getCredentialForVendor`, não `getCredential` — é ela que G-2
    // exercita (os 3 call sites tier-aware de `routes/videos.ts` usam
    // `getCredentialForVendor`, e é assim que a guarda mede). Mutar
    // `getCredential` deixaria o mutante INERTE: a função mutada nunca
    // seria chamada pelo caminho que a guarda observa.
    file: LOOKUP,
    find:
      "  // A PLATAFORMA PRIMEIRO, SEMPRE — mesma regra geral de `getCredential`\n" +
      "  // acima, e aqui o vendor não precisa ser adivinhado: ele é o parâmetro.\n" +
      "  // É este mesmo caminho que faz um tenant zerado poder escolher QUALQUER\n" +
      "  // nível na tela (W1), e não só o do vendor que alguém tenha cadastrado\n" +
      "  // para ele.\n" +
      "  const daPlataforma = await herdarDaPlataforma(provider, vendor);\n" +
      "  if (daPlataforma) return daPlataforma;\n" +
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  return null;\n" +
      "}",
    replace:
      "  if (vendor === \"fal\") {\n" +
      "    const daPlataforma = await herdarDaPlataforma(provider, vendor);\n" +
      "    if (daPlataforma) return daPlataforma;\n" +
      "  }\n" +
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  return herdarDaPlataforma(provider, vendor);\n" +
      "}",
    expect: "herança: a plataforma não venceu a BYOK do tenant",
  },
  {
    guard: "sem cobertura de plataforma, o BYOK do tenant segue funcionando (fallback preservado)",
    name: "quebra o fallback para BYOK quando não há credencial de plataforma",
    kind: "esperto",
    // ESPERTO: continua havendo herança para os pares COM cobertura — o
    // caminho feliz do h.3 segue verde. O que quebra é o outro lado da
    // mesma decisão: um vendor sem chave de plataforma (ex.: `avatar/did`)
    // deixa de cair no BYOK do tenant. Não é erro visível — é `null` onde
    // deveria haver a chave que o tenant conectou, e a geração recusa como
    // se o tenant nunca tivesse configurado nada.
    file: LOOKUP,
    find:
      "  // A PLATAFORMA PRIMEIRO, SEMPRE — mesma regra geral de `getCredential`\n" +
      "  // acima, e aqui o vendor não precisa ser adivinhado: ele é o parâmetro.\n" +
      "  // É este mesmo caminho que faz um tenant zerado poder escolher QUALQUER\n" +
      "  // nível na tela (W1), e não só o do vendor que alguém tenha cadastrado\n" +
      "  // para ele.\n" +
      "  const daPlataforma = await herdarDaPlataforma(provider, vendor);\n" +
      "  if (daPlataforma) return daPlataforma;\n" +
      "  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: \"tenant_byok\" };\n" +
      "  return null;\n" +
      "}",
    replace:
      "  const daPlataforma = await herdarDaPlataforma(provider, vendor);\n" +
      "  if (daPlataforma) return daPlataforma;\n" +
      "  return null;\n" +
      "}",
    expect: "herança: o fallback para BYOK regrediu",
  },
  {
    guard: "par sem cobertura falha FECHADO",
    name: "um par sem chave de plataforma passa a herdar por nome",
    kind: "esperto",
    // ⚠️ O ALVO É A ENTRADA DO MAPA, e não a função que o lê — 24/08.
    //
    // A primeira versão mutava `plataformaQueCobre`, e o desfecho saía
    // AMBÍGUO por AUTO-COLISÃO: aquela é a mesma linha que o `find` deste
    // mutante procura, então com o mutante aplicado a conferência de cadastro
    // acusava "0x no alvo" e a reprovação da guarda ficava encoberta pela
    // dela. Mesmo padrão que fez `frontendStampFetch.ts` ser extraído de
    // `checkImageFreshnessPolicy.ts`.
    //
    // Mutar a ENTRADA testa a mesma propriedade e não toca no texto que o
    // registro procura: `avatar/did` deixa de ser a ausência deliberada e
    // passa a herdar a chave do heygen — a plataforma pagando por um vendor
    // que ninguém decidiu cobrir, e que o produto sequer despacha hoje.
    //
    // ESPERTO: derivar cobertura por semelhança de nome parece a
    // simplificação óbvia, e três dos cinco pares quebram essa regra. O pior
    // é `script/anthropic`, cuja chave parecida (`copilot`) serve o SUPORTE:
    // o roteiro do cliente passaria a consumir a cota do copiloto público.
    file: MAPA,
    find: '  "avatar/did": null,',
    replace: '  "avatar/did": { id: "heygen" },',
    expect: "herança: par sem cobertura não falhou fechado",
  },
  {
    guard: "o mapa não tem mais campo de precedência — a exceção isolada da fal está eliminada, não só inerte",
    name: "o campo de precedência volta ao mapa de herança",
    kind: "esperto",
    // MEDIDO por execução manual (não só previsto): este mutante nem chega
    // a rodar `checkPolicy.ts` — `tsc --noEmit` reprova ANTES, porque
    // `Cobertura` não tem mais o campo `precedencia` (a interface foi
    // simplificada para `{ id: PlatformCredentialId }`, sem o campo). É uma
    // garantia MAIS FORTE que a checagem estrutural por texto abaixo: o
    // compilador, e não um `.includes()`, é quem barra a reintrodução —
    // confirmado com `docker compose exec backend npm run check` rodando de
    // verdade sobre o arquivo mutado à mão, EXIT 2, `error TS2353`.
    file: MAPA,
    find: '  "avatar/heygen": { id: "heygen" },',
    replace: '  "avatar/heygen": { id: "heygen", precedencia: "byok_vence" },',
    expect: "error TS2353: Object literal may only specify known properties, and 'precedencia' does not exist in type 'Cobertura'",
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
  {
    guard: "a tela pergunta a disponibilidade ao servidor",
    name: "o passo Gerar volta a decidir o nível pelas linhas do tenant",
    kind: "esperto",
    // ESPERTO: era o código CERTO até o W1 — ler `/credentials` e testar o
    // vendor era exato enquanto a credencial do tenant era a única fonte. Com
    // a herança, a linha do tenant continua com `vendor` VAZIO e os dois
    // predicados dão `false`: os três cartões nascem travados num tenant que
    // o servidor atende. MEDIDO em 24/08 — 23 de 34 tenants nesse estado, e o
    // servidor gerando normalmente. O defeito não aparece em nenhum dos dois
    // lados isoladamente, e nenhuma guarda de servidor o pegaria.
    // ⚠️ MIRA A FONTE, não o predicado — 24/08. Mutar o predicado colide com
    // `checkTierAvailabilityPolicy`, que o AVALIA com `tiersDisponiveis`
    // injetado: a troca produz `ReferenceError: credentials is not defined` e
    // aquela guarda grita primeiro, deixando esta sem prova (AMBÍGUO). Mutar
    // o ENDPOINT deixa o predicado intacto — a guarda de tier segue verde — e
    // ataca exatamente o que esta guarda mede: de ONDE a tela tira a
    // disponibilidade.
    //
    // Movido de GenerateStep.tsx para SceneStep.tsx em 25/08, junto com os
    // cartões de tier — a propriedade (perguntar ao servidor, não
    // reimplementar) não mudou, só o arquivo onde a chamada mora.
    file: PASSO_CENA,
    find: '      .get<Record<string, boolean>>("/videos/tier-availability")',
    replace: '      .get<Record<string, boolean>>("/credentials")',
    // TRANSCRITO: o mutante deixa a rota nova no arquivo (o `useEffect`
    // continua lá) e só troca o PREDICADO, então quem dispara é a segunda
    // condição da guarda — a que pega o predicado antigo decidindo — e não a
    // primeira, que cobre a rota ter sumido.
    expect: "níveis: a tela decide a disponibilidade pelas linhas do tenant",
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
    // SEM cobertura de plataforma (`avatar/did` é `null` no mapa) — h.3,
    // item 3/4: prova que o fallback para BYOK não regrediu para os pares
    // que a plataforma não cobre.
    { provider: "avatar", vendor: "did", chave: "BYOK-DID-DO-TENANT" },
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

  // G-6 — o tenant ZERADO vê os três níveis. Mesma cadeia da criação.
  const niveisDoZerado = await comBancoDeMentira(async () => {
    const r: Record<string, string | null> = {};
    for (const tier of VIDEO_TIERS) {
      const c = await getCredentialForVendor(TENANT_ZERADO, "avatar", vendorRequiredByTier(tier));
      r[tier] = c?.source ?? null;
    }
    return r;
  });

  const travados = Object.entries(niveisDoZerado).filter(([, origem]) => origem === null);
  if (travados.length > 0) {
    failures.push(
      `níveis: o tenant zerado não alcança ${travados.map(([t]) => t).join(", ")} — os cartões desses ` +
        "níveis nascem TRAVADOS na tela, num tenant que o servidor atende pela herança. Era o estado de " +
        "23 dos 34 tenants deste banco antes do W4, e o defeito não aparece em nenhum dos dois lados " +
        "isoladamente: o servidor gera, a tela não deixa escolher.",
    );
  } else if (Object.values(niveisDoZerado).some((o) => o !== "platform")) {
    failures.push(
      `níveis: o CONTROLE falhou — o tenant zerado alcançou os três níveis, mas nem todos pela ` +
        `plataforma: ${JSON.stringify(niveisDoZerado)}. Ele não tem chave própria; qualquer outra origem ` +
        "significa que a guarda está lendo um estado que não é o que ela montou.",
    );
  } else {
    notes.push(
      `    níveis: tenant zerado vê os ${VIDEO_TIERS.length} níveis disponíveis, todos via plataforma`,
    );
  }

  const medido = await comBancoDeMentira(async () => ({
    zeradoAvatar: await getCredential(TENANT_ZERADO, "avatar"),
    zeradoVoz: await getCredential(TENANT_ZERADO, "voice"),
    zeradoScript: await getCredential(TENANT_ZERADO, "script"),
    zeradoDid: await getCredentialForVendor(TENANT_ZERADO, "avatar", "did"),
    proprioAvatar: await getCredentialForVendor(TENANT_COM_CHAVE, "avatar", "heygen"),
    proprioVoz: await getCredentialForVendor(TENANT_COM_CHAVE, "voice", "elevenlabs"),
    proprioFal: await getCredentialForVendor(TENANT_COM_CHAVE, "avatar", "fal"),
    // SEM cobertura de plataforma para `did` — h.3, item 3/4: o BYOK deste
    // tenant para um par que a plataforma NÃO cobre tem de continuar
    // vencendo, exatamente como antes da mudança de regra.
    proprioDid: await getCredentialForVendor(TENANT_COM_CHAVE, "avatar", "did"),
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
  // G-2 — a plataforma vence a BYOK, para QUALQUER vendor com cobertura —
  // h.3, 25/08. Reescrita: até 24/08 esperava-se `tenant_byok` aqui; a
  // decisão do operador (h.3) inverteu isso — agora é a plataforma quem
  // paga sempre que tiver a chave. Os TRÊS pares abaixo (heygen, elevenlabs,
  // fal) provam que não é mais um caso isolado da fal: os dois primeiros
  // eram `byok_vence` até esta rodada e passam a se comportar IGUAL à fal.
  // -------------------------------------------------------------------------
  const proprios = [
    ["avatar/heygen", medido.proprioAvatar],
    ["voice/elevenlabs", medido.proprioVoz],
    ["avatar/fal", medido.proprioFal],
  ] as const;
  const naoVenceram = proprios.filter(([, c]) => c?.source !== "platform").map(([par]) => par);
  if (naoVenceram.length > 0) {
    failures.push(
      `herança: a plataforma não venceu a BYOK do tenant para ${naoVenceram.join(", ")} — ` +
        `${JSON.stringify(proprios.map(([par, c]) => [par, c?.source]))}. Decisão do operador (h.3, ` +
        "25/08): a plataforma vence SEMPRE que tiver cobertura, para qualquer vendor — não é mais uma " +
        "exceção isolada da fal. Um tenant com BYOK própria continuar sendo cobrado é o sintoma exato " +
        "de a regra geral ter regredido para a antiga (`byok_vence` por padrão, fal como exceção).",
    );
  } else {
    notes.push(
      "    herança: a plataforma vence a BYOK do tenant nos três pares medidos (heygen, elevenlabs, " +
        "fal) — regra geral, não mais exceção isolada da fal",
    );
  }

  // -------------------------------------------------------------------------
  // G-3 — sem cobertura, o fallback para BYOK segue funcionando (não regrediu)
  // -------------------------------------------------------------------------
  if (medido.zeradoDid !== null) {
    failures.push(
      `herança: par sem cobertura não falhou fechado — \`avatar/did\` (tenant zerado) devolveu ` +
        `${JSON.stringify(medido.zeradoDid?.source)}. Não há chave de plataforma para o did; herdar ` +
        "aqui faria a plataforma pagar uma conta que ninguém decidiu, e por um vendor que o produto " +
        "sequer despacha hoje.",
    );
  } else if (medido.proprioDid?.source !== "tenant_byok") {
    failures.push(
      `herança: o fallback para BYOK regrediu — \`avatar/did\` (tenant COM chave própria) devolveu ` +
        `${JSON.stringify(medido.proprioDid?.source)}, esperado \`tenant_byok\`. A plataforma não cobre ` +
        "este par (declarado `null` no mapa); sem o fallback, um tenant que configurou a própria chave " +
        "para um vendor sem credencial de plataforma perde acesso a ele — regressão da propriedade que " +
        "h.3 promete preservar: 'sem credencial de plataforma, cai no BYOK exatamente como hoje'.",
    );
  } else {
    notes.push(
      "    herança: sem cobertura de plataforma (avatar/did), o tenant zerado falha fechado (null) e o " +
        "tenant COM chave própria segue usando a dele (tenant_byok) — fallback preservado",
    );
  }

  // -------------------------------------------------------------------------
  // G-4 — a exceção isolada da fal não existe mais NO CÓDIGO, estruturalmente
  // — h.3. Por TEXTO, e não só por comportamento: um campo de precedência
  // que ninguém lê ainda convidaria alguém a reintroduzir o ramo à parte
  // amanhã. Ver o mutante "o campo de precedência volta ao mapa" acima.
  // -------------------------------------------------------------------------
  // Comentários FORA da checagem, de propósito: o cabeçalho de
  // platformInheritance.ts cita os nomes antigos (`byok_vence`,
  // `plataforma_vence`) para explicar a HISTÓRIA da mudança — exatamente o
  // estilo de comentário que este projeto usa em toda parte. O que não pode
  // sobreviver é o termo em CÓDIGO: um tipo, um campo, uma comparação.
  const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const mapaFonte = semComentarios(lerDaRaiz(MAPA));
  const lookupFonte = semComentarios(lerDaRaiz(LOOKUP));
  const TERMOS_DA_EXCECAO_ISOLADA = ["precedencia", "plataforma_vence", "byok_vence", "Precedencia"];
  const achadosNoMapa = TERMOS_DA_EXCECAO_ISOLADA.filter((t) => mapaFonte.includes(t));
  const achadosNoLookup = TERMOS_DA_EXCECAO_ISOLADA.filter((t) => lookupFonte.includes(t));
  if (achadosNoMapa.length > 0 || achadosNoLookup.length > 0) {
    failures.push(
      "herança: a exceção isolada da fal voltou a existir NO CÓDIGO — " +
        `${MAPA} contém ${JSON.stringify(achadosNoMapa)}, ${LOOKUP} contém ${JSON.stringify(achadosNoLookup)}. ` +
        "h.3 (25/08) generalizou a regra para eliminar o campo de precedência por vendor, não só o " +
        "comportamento — um campo desses, mesmo não lido, é convite para reabrir o ramo à parte.",
    );
  } else {
    notes.push(
      "    herança: nenhum termo da precedência antiga (precedencia/plataforma_vence/byok_vence) " +
        "sobrevive em platformInheritance.ts ou credentialLookup.ts — a exceção da fal está eliminada, " +
        "não só inerte",
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
    medido.proprioDid,
  ].filter((c) => c !== null);
  const semSource = resolvidas.filter((c) => c!.source !== "platform" && c!.source !== "tenant_byok");
  if (semSource.length > 0) {
    failures.push(
      `herança: ${semSource.length} credencial(is) resolvida(s) sem \`source\` válido. É ele que alimenta ` +
        "`provider_usage.key_source` (migration 063): sem ele a atribuição de gasto volta a não saber de " +
        "quem é a fatura, que foi o buraco inteiro do R5.",
    );
  } else if (resolvidas.length >= 7) {
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

  // -------------------------------------------------------------------------
  // A TELA pergunta a disponibilidade, não a reimplementa — W4
  // -------------------------------------------------------------------------
  //
  // Casa a CHAMADA, não a string solta: a primeira versão procurava
  // `"/videos/tier-availability"` em qualquer lugar do arquivo, e o
  // COMENTÁRIO que explica a rota bastava para satisfazê-la — o mutante
  // trocou o endpoint por `/credentials` e a guarda seguiu verde (INERTE,
  // medido em 24/08). É o mesmo defeito que a `checkVendorLogPolicy` teve:
  // casar a menção em vez do uso.
  const passoCena = lerDaRaiz(PASSO_CENA);
  if (!passoCena.includes('.get<Record<string, boolean>>("/videos/tier-availability")')) {
    failures.push(
      "níveis: a tela decide a disponibilidade pelas linhas do tenant — parou de perguntar a " +
        "`/videos/tier-availability` e voltou a reimplementar a regra. Enquanto a credencial do tenant " +
        "era a única fonte isso era exato; com a herança do W1 a linha fica com `vendor` VAZIO, e os " +
        "três cartões travam num tenant que o servidor atende (23 de 34, medido em 24/08).",
    );
  } else {
    notes.push("    níveis: a tela lê `/videos/tier-availability`, a mesma cadeia que a criação usa para recusar");
  }

  return { failures, notes };
}
