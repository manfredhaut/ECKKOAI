/**
 * DE QUEM É O GASTO — a atribuição de consumo (R5, migration 063, 24/08).
 *
 * ┌─ O que a chave de plataforma apagou ─────────────────────────────────────┐
 * │ `resolveTenantAvatarFalKey` faz a chave da PLATAFORMA vencer a BYOK do   │
 * │ tenant, e isso é bom — uma chave só, trocada num lugar só. O efeito      │
 * │ colateral é que o painel do fornecedor passa a mostrar um total por      │
 * │ endpoint e NADA sobre quem pediu.                                        │
 * │                                                                          │
 * │ E não dá para etiquetar do lado deles: MEDIDO por leitura da doc em      │
 * │ 24/08 — a fila da fal tem `hint`, `priority` e headers da própria        │
 * │ plataforma, e nenhum campo de metadado ou id de usuário final. Logo a    │
 * │ atribuição é NOSSA, ou não existe.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  toda escrita em `provider_usage` leva `tenant_id` — o INSERT o inclui
 *       e a coluna é NOT NULL no schema. É a invariante do R5.3: nenhuma
 *       chamada paga sai sem dono registrado.
 *  G-2  o INSERT grava as três colunas novas (`endpoint_id`, `key_source`,
 *       `estimated_cost_usd`). Uma coluna que existe na migration e não é
 *       escrita pelo código é pior que coluna nenhuma: ela parece resposta.
 *  G-3  a resolução da chave da fal não descarta o `source` nos DOIS pontos
 *       que a chamam em `routes/videos.ts`. Era `(await …).apiKey` nos dois,
 *       e o `.apiKey` direto joga fora a única testemunha de quem paga.
 *  G-4  o consumo de VOZ leva `videoId`. MEDIDO em 24/08: as 12 linhas de
 *       `voice/elevenlabs` estavam TODAS sem vídeo, porque
 *       `GenerateVideoInput` não carregava o id.
 *  G-5  `custoConhecidoUsd` devolve `null` — nunca `0` — para vendor sem
 *       medição. Zero se soma como se a chamada fosse de graça, e é
 *       exatamente o `fal` (o caminho que mais gasta) que não tem medição.
 *
 * ┌─ G-5 mede por EXECUÇÃO; G-1 a G-4 medem FORMA ───────────────────────────┐
 * │ `custoConhecidoUsd` é função pura e importável: chamá-la é a prova. As   │
 * │ outras quatro são propriedades de call site dentro de um handler do      │
 * │ Fastify e de um INSERT — observá-las por execução exigiria subir a       │
 * │ aplicação e um Postgres, e uma guarda que precisa de infraestrutura se   │
 * │ desliga sozinha no primeiro dia difícil. Leem o arquivo real, com falha  │
 * │ nomeada quando a âncora não é encontrada.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { custoConhecidoUsd } from "../services/billing/providerCost.js";

const USAGE = "backend/src/services/billing/usageTracking.ts";
const ROTA = "backend/src/routes/videos.ts";
const AVATAR_PROVIDER = "backend/src/services/providers/avatarProvider.ts";
const COST = "backend/src/services/billing/providerCost.ts";
const MIGRATION = "backend/src/db/migrations/063_usage_attribution.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "toda escrita de consumo leva tenant_id",
    name: "o INSERT de provider_usage deixa de gravar tenant_id",
    kind: "obvio",
    file: USAGE,
    find: "         (tenant_id, video_id, provider, vendor, unit_type, unit_count,",
    replace: "         (video_id, provider, vendor, unit_type, unit_count,",
    expect: "atribuição: o INSERT de provider_usage não grava tenant_id",
  },
  {
    guard: "o consumo registra de qual CHAVE saiu (key_source)",
    name: "o INSERT para de gravar a origem da chave",
    kind: "esperto",
    // ESPERTO: a coluna continua existindo na migration, o INSERT continua
    // válido, e nada quebra em tempo de execução — as linhas simplesmente
    // nascem com `key_source` nulo. Com uma chave de plataforma servindo
    // todos os tenants, isso devolve o produto ao estado exato que o R5 veio
    // consertar, e sem nenhum sintoma até alguém tentar dividir uma fatura.
    file: USAGE,
    find: "        input.keySource ?? null,\n",
    replace: "        null,\n",
    expect: "atribuição: o INSERT não grava key_source",
  },
  {
    guard: "a resolução da chave da fal não descarta o source",
    name: "a criação volta a descartar a origem da chave",
    kind: "esperto",
    // ESPERTO: `.apiKey` direto é exatamente como o código era até esta
    // rodada, e continua funcionando — a geração roda igual. O que some é a
    // resposta para "de quem é este gasto?", e ela some em silêncio.
    file: ROTA,
    find:
      "    const chaveDoAvatar =\n" +
      '      avatarCredential.vendor === "fal"\n' +
      "        ? await resolveTenantAvatarFalKey(avatarCredential.apiKey)\n" +
      '        : { apiKey: avatarCredential.apiKey, source: "tenant_byok" as const };\n' +
      "    avatarCredential.apiKey = chaveDoAvatar.apiKey;",
    replace:
      '    const chaveDoAvatar = { apiKey: avatarCredential.apiKey, source: "tenant_byok" as const };\n' +
      '    if (avatarCredential.vendor === "fal") {\n' +
      "      avatarCredential.apiKey = (await resolveTenantAvatarFalKey(avatarCredential.apiKey)).apiKey;\n" +
      "    }",
    expect: "atribuição: a criação de vídeo descarta a origem da chave da fal",
  },
  {
    guard: "o consumo de voz leva o videoId",
    name: "a síntese de voz volta a registrar consumo órfão",
    kind: "esperto",
    // ESPERTO: `videoId` é opcional no tipo, então o `tsc` fica verde e a
    // geração não muda em nada. O consumo de voz volta a nascer sem ponte com
    // o vídeo — o estado medido de todas as 12 linhas anteriores ao R5, e o
    // consumo que mais se repete por vídeo (uma síntese por clique).
    file: AVATAR_PROVIDER,
    find: "    videoId: input.videoId ?? null,\n    provider: \"voice\",",
    replace: "    provider: \"voice\",",
    expect: "atribuição: o consumo de voz não leva videoId",
  },
  {
    guard: "custo desconhecido vira null, nunca zero",
    name: "custoConhecidoUsd devolve zero quando não há medição",
    kind: "esperto",
    // ESPERTO: `?? 0` parece defensivo e o tipo fica mais simples (`number` em
    // vez de `number | null`). O efeito é que `fal` — o caminho que mais gasta
    // e que não tem medição própria — passa a gravar US$ 0,00 em toda linha, e
    // qualquer soma de atribuição declara gratuito o mais caro do produto.
    file: COST,
    find: "  const c = estimateVideoCost(segundos, vendor);\n  return c.known ? c.usd : null;",
    replace: "  const c = estimateVideoCost(segundos, vendor);\n  return c.known ? c.usd : 0;",
    expect: "atribuição: custo desconhecido virou zero",
  },
];

export interface UsageAttributionCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/** Recorta entre duas âncoras, ou devolve `null` para o chamador nomear a falha. */
function recorte(texto: string, de: string, ate: string): string | null {
  const i = texto.indexOf(de);
  if (i < 0) return null;
  const f = texto.indexOf(ate, i);
  if (f < 0) return null;
  return texto.slice(i, f);
}

export async function checkUsageAttributionPolicy(): Promise<UsageAttributionCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-1 e G-2 — o INSERT
  // -------------------------------------------------------------------------
  const usage = lerDaRaiz(USAGE);
  const insert = recorte(usage, "INSERT INTO provider_usage", "logEvent(");
  if (!insert) {
    failures.push(
      `atribuição: não foi possível recortar o INSERT de provider_usage em ${USAGE} pelas âncoras ` +
        "`INSERT INTO provider_usage` e `logEvent(`. A guarda não pode opinar sobre um trecho que não " +
        "encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    if (!/\(tenant_id,/.test(insert)) {
      failures.push(
        "atribuição: o INSERT de provider_usage não grava tenant_id — sem dono, uma linha de consumo " +
          "não responde a única pergunta que a atribuição existe para responder, e a fatura de uma " +
          "chave de plataforma vira um total sem repartição possível.",
      );
    } else if (!insert.includes("input.tenantId")) {
      failures.push(
        "atribuição: o INSERT lista a coluna tenant_id mas não passa `input.tenantId` — a coluna é " +
          "NOT NULL, então isto explode em tempo de execução, e `writeUsage` engole o erro de propósito " +
          "(telemetria não pode derrubar a geração). O consumo pararia de ser gravado em silêncio.",
      );
    } else {
      notes.push("    atribuição: toda escrita de consumo grava tenant_id");
    }

    for (const [coluna, campo] of [
      ["endpoint_id", "input.endpointId"],
      ["key_source", "input.keySource"],
      ["estimated_cost_usd", "input.estimatedCostUsd"],
    ] as const) {
      if (!insert.includes(coluna) || !insert.includes(campo)) {
        failures.push(
          `atribuição: o INSERT não grava ${coluna} (esperado a coluna e o valor \`${campo}\`). A ` +
            "migration 063 cria a coluna; uma coluna que existe e nunca é escrita é pior que coluna " +
            "nenhuma, porque ela parece uma resposta quando é só ausência.",
        );
      }
    }
    if (failures.length === 0) {
      notes.push("    atribuição: o INSERT grava endpoint_id, key_source e estimated_cost_usd");
    }
  }

  // -------------------------------------------------------------------------
  // G-3 — a origem da chave não é descartada, nos DOIS pontos
  // -------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA);
  const descartes = rota.split("\n").filter((l) => /resolveTenantAvatarFalKey\([^)]*\)\)\.apiKey/.test(l));
  if (descartes.length > 0) {
    failures.push(
      `atribuição: a criação de vídeo descarta a origem da chave da fal — ${descartes.length} ocorrência(s) ` +
        "de `(await resolveTenantAvatarFalKey(…)).apiKey`, que joga fora o `source` no mesmo passo em que " +
        "lê a chave. Com a chave da plataforma vencendo a BYOK, esse `source` é a ÚNICA testemunha de " +
        "que aquele gasto é nosso e não do tenant — o fornecedor não guarda essa distinção e a fal não " +
        "tem campo de metadado onde gravá-la.",
    );
  } else if (!rota.includes("keySourceFal") || !rota.includes("chaveDoAvatar.source")) {
    failures.push(
      "atribuição: a rota não propaga a origem da chave da fal — esperava `keySourceFal` (caminho de " +
        "aprovação) e `chaveDoAvatar.source` (caminho de criação). Resolver o `source` e não usá-lo é o " +
        "mesmo que descartá-lo, só que com mais código.",
    );
  } else {
    notes.push("    atribuição: os dois caminhos da fal propagam a origem da chave (platform × tenant_byok)");
  }

  // -------------------------------------------------------------------------
  // G-4 — a voz leva o vídeo
  // -------------------------------------------------------------------------
  const provider = lerDaRaiz(AVATAR_PROVIDER);
  const registroDaVoz = recorte(provider, "await recordProviderUsage({", "});");
  if (!registroDaVoz) {
    failures.push(
      `atribuição: não achei o registro de consumo de voz em ${AVATAR_PROVIDER} pela âncora ` +
        "`await recordProviderUsage({`.",
    );
  } else if (!registroDaVoz.includes("videoId")) {
    failures.push(
      "atribuição: o consumo de voz não leva videoId — volta a nascer órfão, que era o estado MEDIDO " +
        "das 12 linhas de `voice/elevenlabs` antes do R5. É o consumo que mais se repete por vídeo " +
        "(uma síntese por clique em Gerar, mais uma por retomada), e sem a ponte ele não entra em " +
        "nenhuma conta por vídeo.",
    );
  } else {
    notes.push("    atribuição: o consumo de voz leva videoId, endpoint e a origem da chave");
  }

  // -------------------------------------------------------------------------
  // G-5 — ausência de medição vira null, por EXECUÇÃO
  // -------------------------------------------------------------------------
  const semMedicao = custoConhecidoUsd(10, "fal");
  const comMedicao = custoConhecidoUsd(10, "heygen");
  if (semMedicao !== null) {
    failures.push(
      `atribuição: custo desconhecido virou zero — \`custoConhecidoUsd(10, "fal")\` devolveu ` +
        `${JSON.stringify(semMedicao)}, esperado null. Zero se SOMA como se a chamada tivesse sido de ` +
        "graça, e `fal` é justamente o caminho que mais gasta e o que não tem medição própria: um " +
        "relatório de atribuição passaria a declarar gratuito o mais caro do produto.",
    );
  } else if (comMedicao === null || comMedicao <= 0) {
    // CONTROLE: sem um vendor que devolva número, "devolve null" seria verdade
    // por vacuidade — a função poderia estar devolvendo null para tudo.
    failures.push(
      `atribuição: o CONTROLE de G-5 falhou — \`custoConhecidoUsd(10, "heygen")\` devolveu ` +
        `${JSON.stringify(comMedicao)}, esperado um número positivo. Sem um caso conhecido, a guarda ` +
        "não distingue \"devolve null quando não sabe\" de \"nunca devolve nada\".",
    );
  } else {
    notes.push(
      `    atribuição: custo sem medição vira null (fal) e custo medido vira número (heygen, ` +
        `US$ ${comMedicao.toFixed(2)} para 10 s)`,
    );
  }

  // -------------------------------------------------------------------------
  // A migration existe e cria as três colunas
  // -------------------------------------------------------------------------
  let migration = "";
  try {
    migration = lerDaRaiz(MIGRATION);
  } catch {
    migration = "";
  }
  const faltando = ["endpoint_id", "key_source", "estimated_cost_usd"].filter((c) => !migration.includes(c));
  if (faltando.length > 0) {
    failures.push(
      `atribuição: ${MIGRATION} não cria ${faltando.join(", ")} — o INSERT passaria a falhar em toda ` +
        "escrita, e `writeUsage` engole o erro: o consumo pararia de ser gravado sem nada na tela.",
    );
  } else {
    notes.push("    atribuição: a migration 063 cria endpoint_id, key_source e estimated_cost_usd");
  }

  return { failures, notes };
}
