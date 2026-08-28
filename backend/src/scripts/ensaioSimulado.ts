/**
 * O ENSAIO — os caminhos do produto ponta a ponta, com ZERO chamada paga (R7).
 *
 *   docker compose exec -T -e PROVIDER_MODE=fixture backend \
 *     npx tsx src/scripts/ensaioSimulado.ts
 *
 * ┌─ Irmão de `probeFalPipeline.ts`, e o oposto dele ────────────────────────┐
 * │ A SONDA existe para medir o CONTRATO do fornecedor, e por isso ela paga  │
 * │ — é o preço de descobrir o que a doc não diz. O ENSAIO existe para       │
 * │ percorrer o NOSSO fluxo, e por isso ele não paga nada: o que ele mede é  │
 * │ a ordem das nossas decisões, os custos que a nossa régua prevê e os      │
 * │ estados em que as nossas linhas ficam.                                   │
 * │                                                                          │
 * │ Os dois rodam o MESMO orquestrador. Um ensaio contra um caminho          │
 * │ paralelo ensaiaria o script, não o produto.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Como o custo zero é GARANTIDO, e não prometido ─────────────────────────┐
 * │ Em `PROVIDER_MODE=fixture` todo export dos providers desvia ANTES da     │
 * │ rede (`isFixtureMode()`, conferido por `checkProviderMode.ts`, que       │
 * │ reprova o build se algum deixar de consultar). O ensaio RECUSA rodar     │
 * │ fora de fixture — não por precaução decorativa: em `live` este mesmo     │
 * │ arquivo gastaria os dois níveis inteiros, e o Premium sozinho passa de   │
 * │ US$ 7 pela régua.                                                        │
 * │                                                                          │
 * │ E a garantia é MEDIDA, não deduzida: `checkEnsaioSimuladoPolicy.ts` roda │
 * │ o ensaio com `globalThis.fetch` substituído e conta as submissões. O     │
 * │ número esperado é ZERO.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * O que ele NÃO cobre, e é dependência declarada: o item 4 do R7 (cada etapa
 * paga com interruptor na TELA, mostrando o custo antes de rodar). O
 * interruptor já existe no fluxo — é o Modo B, com as duas aprovações — mas o
 * CUSTO mostrado depende da régua, e a régua está sub judice: a reconciliação
 * de 24/08 achou `compor` exato ao centavo, `animar` ~2× alto e `sincronizar`
 * possivelmente ~4,6× baixo. Mostrar na tela um número que pode estar 4,6×
 * abaixo é pior que não mostrar nenhum.
 */
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import {
  PIPELINE_TETO_USD_PREMIUM,
  PRECOS_FAL,
  conferirRoteiro,
  custoSeedanceUsd,
  runFalPipeline,
  tetoNormalUsd,
  vendorRequiredByTier,
  type DiarioDoPipeline,
  type FalPipelineInput,
  type PipelineTier,
} from "../services/video/falPipeline.js";

/** Cabe na menor duração (5 s), para o ensaio ser rápido e previsível. */
const ROTEIRO = "Roteiro do ensaio, curto.";

interface Passo {
  etapa: string;
  status: string;
  motivo?: string;
}

/**
 * Um diário em memória que também registra o GASTO — é ele que torna o ensaio
 * legível: sem os valores autorizados, a saída seria uma lista de etapas sem
 * a informação que a rodada inteira gira em torno.
 */
function diarioDoEnsaio(passos: Passo[], gastos: number[]): DiarioDoPipeline {
  let n = 0;
  return {
    async abrirEtapa(etapa) {
      n += 1;
      passos.push({ etapa, status: "aberta" });
      return `step-${n}`;
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa(_id, status, motivo) {
      passos.push({ etapa: "(fecha)", status, motivo });
    },
    async registrarGastoPrevisto(acumulado) {
      gastos.push(acumulado);
    },
  };
}

function entradaBase(tier: PipelineTier, diario: DiarioDoPipeline): FalPipelineInput {
  return {
    apiKeyFal: "ensaio-sem-rede",
    apiKeyElevenLabs: "ensaio-sem-rede",
    voiceId: "ensaio-voice-id",
    script: ROTEIRO,
    fotoBase: Buffer.from("foto-do-ensaio"),
    fotoMimeType: "image/jpeg",
    promptDeComposicao: "jaleco branco, consultório claro",
    tenantId: "00000000-0000-4000-8000-00000000e0a1",
    promptDeDirecao: "olhar para a câmera, gesto contido",
    aspectRatio: "9:16",
    diario,
    tier,
    pollTimeoutMs: 50,
    pollIntervalMs: 1,
  };
}

/**
 * O que a RÉGUA prevê para cada etapa, antes de qualquer coisa rodar.
 *
 * ⚠️ `sincronizar` é TETO, não previsão — e a distinção não é preciosismo. O
 * lipsync é tarifado por segundo de ÁUDIO, e a duração do áudio só é conhecida
 * DEPOIS de `narrar`, que roda entre `animar` e `sincronizar`. Antes disso o
 * único número disponível é a duração do CLIPE, que é sempre >= a da fala (a
 * régua de caracteres por duração garante folga). Então o valor mostrado aqui
 * é o pior caso: a fala ocupando o clipe inteiro.
 *
 * Rotular isso como previsão faria a saída parecer errada quando ela está
 * certa — no ensaio de 24/08 o previsto deu US$ 0,25 e o autorizado US$ 0,15,
 * porque a fixture fala 3 s num clipe de 5 s.
 */
function orcamento(
  tier: PipelineTier,
  segundos: number,
): { etapa: string; usd: number; teto?: true }[] {
  return [
    { etapa: "compor", usd: PRECOS_FAL.comporUsd },
    {
      etapa: "animar",
      usd: tier === "premium" ? custoSeedanceUsd(segundos) : PRECOS_FAL.animarUsdPorSegundo * segundos,
    },
    { etapa: "sincronizar", usd: PRECOS_FAL.sincronizarUsdPorSegundoDeAudio * segundos, teto: true },
  ];
}

function dinheiro(v: number): string {
  return `US$ ${v.toFixed(4)}`;
}

export async function ensaiarNivel(tier: PipelineTier): Promise<void> {
  const rotulo = tier === "premium" ? "PREMIUM (Seedance)" : "CENA COMPOSTA (Wan)";
  console.log(`\n${"=".repeat(78)}\n  ${rotulo}\n${"=".repeat(78)}`);

  const { chars, duracaoEscolhida } = conferirRoteiro(ROTEIRO);
  // BLOCO FRACOES-1 — o ensaio usa um roteiro curto e fixo (cabe num bloco
  // só), então `tetoNormalUsd(duracaoEscolhida)` aqui é exatamente o teto
  // que a corrida de verdade usaria para este mesmo roteiro.
  const teto = tier === "premium" ? PIPELINE_TETO_USD_PREMIUM : tetoNormalUsd(duracaoEscolhida);
  console.log(`roteiro: ${chars} caracteres → duração escolhida ${duracaoEscolhida} s`);
  console.log(`vendor exigido pelo nível: ${vendorRequiredByTier(tier)}`);
  console.log(`teto da corrida: ${dinheiro(teto)}`);

  // O ORÇAMENTO ANTES — é este bloco que responde "o que vou pagar se eu
  // clicar?", e ele existe separado da execução de propósito: um custo
  // impresso DEPOIS é relatório, não decisão.
  const previsto = orcamento(tier, duracaoEscolhida);
  console.log("\n  interruptores (o que cada etapa custaria, pela régua):");
  let acumulado = 0;
  for (const p of previsto) {
    acumulado += p.usd;
    const marca = p.teto ? " (TETO — a fala pode ser mais curta que o clipe)" : "";
    console.log(
      `    [ ] ${p.etapa.padEnd(12)} ${dinheiro(p.usd).padStart(12)}   acumulado ${dinheiro(acumulado)}${marca}`,
    );
  }
  console.log(`    TOTAL no pior caso: ${dinheiro(acumulado)}`);
  if (acumulado > teto) {
    console.log(`    ⚠ acima do teto (${dinheiro(teto)}) — o porteiro recusaria antes da primeira submissão`);
  }

  const passos: Passo[] = [];
  const gastos: number[] = [];
  try {
    const r = await runFalPipeline(entradaBase(tier, diarioDoEnsaio(passos, gastos)));
    console.log("\n  execução (fixture, zero rede):");
    for (const p of passos) {
      console.log(`    ${p.etapa.padEnd(12)} ${p.status}${p.motivo ? ` (${p.motivo})` : ""}`);
    }
    console.log(`\n  gasto autorizado, etapa a etapa: ${gastos.map(dinheiro).join(" → ")}`);
    console.log(`  gasto previsto devolvido pela corrida: ${dinheiro(r.gastoPrevistoUsd)}`);
    console.log(`  vídeo final: ${r.videoUrl ? "produzido" : "(nenhum)"}`);
  } catch (err) {
    console.log(`\n  execução INTERROMPIDA: ${String(err).slice(0, 300)}`);
    console.log(`  etapas até aqui: ${passos.map((p) => `${p.etapa}/${p.status}`).join(" > ")}`);
    console.log(`  gasto já autorizado: ${gastos.length ? gastos.map(dinheiro).join(" → ") : "(nenhum)"}`);
  }
}

/**
 * A FALHA PARCIAL, mostrada e não escondida — item 3 do R7.
 *
 * O caso: `compor` e `animar` já foram pagos e aceitos, e `sincronizar`
 * falha. O ensaio força isso com um teto que cabe nas duas primeiras e não na
 * terceira — o mesmo porteiro do produto, sem nenhum caminho especial.
 *
 * O que ele precisa DEIXAR VISÍVEL: não há estorno. `decidirEstorno` trata
 * gasto já aceito pelo fornecedor como `indeterminado`, nunca `nao_saiu`, e
 * `debitCredit` cobra por VÍDEO e não por etapa. Uma simulação que mostrasse
 * "falhou, tudo certo" treinaria a leitura errada do caso mais caro do fluxo.
 */
export async function ensaiarFalhaParcial(): Promise<void> {
  console.log(`\n${"=".repeat(78)}\n  FALHA PARCIAL — as duas primeiras etapas pagas, a terceira recusada\n${"=".repeat(78)}`);

  const { duracaoEscolhida } = conferirRoteiro(ROTEIRO);
  const [compor, animar] = orcamento("normal", duracaoEscolhida);
  // Cabe compor + animar, não cabe sincronizar. Derivado, nunca digitado.
  const tetoApertado = compor.usd + animar.usd + 0.0001;

  const passos: Passo[] = [];
  const gastos: number[] = [];
  try {
    await runFalPipeline({
      ...entradaBase("normal", diarioDoEnsaio(passos, gastos)),
      tetoDeGastoUsd: tetoApertado,
    });
    console.log("  ⚠ a corrida COMPLETOU — o teto apertado não barrou nada, e este ensaio deixou de medir o que existe para medir.");
  } catch (err) {
    console.log(`  teto desta corrida: ${dinheiro(tetoApertado)} (compor + animar + 1 centésimo de centavo)`);
    console.log(`\n  etapas: ${passos.map((p) => `${p.etapa}/${p.status}`).join(" > ")}`);
    console.log(`  gasto autorizado antes da recusa: ${gastos.map(dinheiro).join(" → ")}`);
    console.log(`\n  recusa: ${String(err).slice(0, 400)}`);
    console.log(
      "\n  ⚠ O ESTADO REAL, que este ensaio NÃO esconde:\n" +
        "    · compor e animar foram aceitos pelo fornecedor e SAÍRAM do bolso;\n" +
        "    · não há estorno — `decidirEstorno` classifica gasto já aceito como `indeterminado`;\n" +
        "    · `debitCredit` cobra 1 crédito por VÍDEO, não por etapa, então o crédito também já saiu;\n" +
        "    · o `request_id` de cada etapa está no diário: o trabalho é RECUPERÁVEL e não deve ser refeito.",
    );
  }
}

/**
 * O CAMINHO DO USUÁRIO NOVO — item 2 do R7, e o item 4 do W1.
 *
 * ⚠️ **Esta função MUDOU DE VEREDITO em 24/08.** Até o W1 ela imprimia quatro
 * degraus e o ponto em que cada um PARAVA: tenant recém-criado nascia com
 * três linhas de vendor VAZIO e chave nula, `getCredential` devolvia `null`,
 * e a geração respondia 400 `tier_vendor_unavailable` — com as chaves de
 * plataforma gravadas e nunca consultadas.
 *
 * Agora ela MEDE em vez de descrever: chama `getCredential` e
 * `getCredentialForVendor` de verdade, para um tenant real sem credencial
 * própria, e imprime de onde cada chave veio. Um ensaio que afirma "nasce
 * funcionando" com texto fixo continuaria afirmando isso no dia em que
 * parasse de ser verdade.
 */
export async function ensaiarUsuarioNovo(): Promise<void> {
  console.log(`
${"=".repeat(78)}
  USUÁRIO NOVO — do cadastro ao primeiro vídeo
${"=".repeat(78)}`);

  const { rows } = await pool.query<{ id: string; slug: string; vendors: string | null }>(
    `SELECT t.id, t.slug,
            nullif(string_agg(nullif(c.vendor, ''), ','), '') AS vendors
       FROM tenants t LEFT JOIN api_credentials c ON c.tenant_id = t.id AND c.provider = 'avatar'
      GROUP BY t.id, t.slug ORDER BY t.slug`,
  );
  const zerados = rows.filter((r) => !r.vendors);
  console.log(`  tenants sem NENHUM vendor de avatar próprio: ${zerados.length} de ${rows.length}`);

  if (zerados.length === 0) {
    console.log("  (nenhum tenant zerado neste banco — nada a medir)");
    return;
  }

  // Um tenant REAL, sem credencial própria — não um id inventado. A herança
  // lê `api_credentials` antes de cair na plataforma, e um id que não existe
  // exercitaria só metade do caminho.
  const cobaia = zerados[0];
  console.log(`  medindo em: ${cobaia.slug}
`);

  const providers = ["avatar", "voice", "script"] as const;
  let alcancados = 0;
  for (const p of providers) {
    const c = await getCredential(cobaia.id, p);
    if (c) alcancados += 1;
    console.log(
      `    ${p.padEnd(6)} -> ${c ? `${c.vendor.padEnd(10)} via ${c.source}` : "SEM ACESSO (null)"}`,
    );
  }

  const pares = [
    ["avatar", "heygen"],
    ["avatar", "fal"],
    ["voice", "elevenlabs"],
    ["script", "gemini"],
    ["avatar", "did"],
  ] as const;
  console.log("\n    por vendor explícito (o que cada NÍVEL da tela exige):");
  for (const [p, v] of pares) {
    const c = await getCredentialForVendor(cobaia.id, p, v);
    console.log(`      ${`${p}/${v}`.padEnd(20)} -> ${c ? `via ${c.source}` : "SEM ACESSO (null)"}`);
  }

  console.log(
    `
  ${alcancados === providers.length ? "✓" : "⚠"} o tenant zerado alcança ${alcancados} de ` +
      `${providers.length} providers sem ter chave nenhuma.`,
  );
  console.log(
    "    `avatar/did` responde null DE PROPÓSITO: não há chave de plataforma para ele, e falhar\n" +
      "    fechado é o certo — herdar por acidente faria a plataforma pagar uma conta que ninguém\n" +
      "    decidiu. Ver `HERANCA_DE_PLATAFORMA`.",
  );
}

async function main(): Promise<void> {
  if (!isFixtureMode()) {
    console.error(
      "RECUSADO: o ensaio só roda em PROVIDER_MODE=fixture.\n" +
        "Fora de fixture ele executaria os dois níveis inteiros com dinheiro real — o Premium\n" +
        "sozinho passa de US$ 7 pela régua. Invoque com `-e PROVIDER_MODE=fixture`.",
    );
    process.exit(2);
  }

  console.log("ENSAIO SIMULADO — nenhuma chamada paga. PROVIDER_MODE=fixture confirmado.");
  await ensaiarNivel("normal");
  await ensaiarNivel("premium");
  await ensaiarFalhaParcial();
  await ensaiarUsuarioNovo();

  console.log(`\n${"=".repeat(78)}`);
  console.log("  SEGUE NÃO VERIFICADO — só se prova com chave real e crédito:");
  console.log(`${"=".repeat(78)}`);
  for (const linha of [
    "a régua do sync-lipsync (régua US$ 0,69 × painel US$ 3,20 em 2 chamadas)",
    "a régua do animar no Wan (régua US$ 2,00 × painel US$ 1,00 em 80 s)",
    "o preço do Seedance (US$ 6,93 para 15 s) — nenhuma cobrança correspondente no painel",
    "o id do endpoint do Seedance (sem prefixo `fal-ai/`, deduzido por analogia com o Wan)",
    "se `sync-lipsync/v2` tem mínimo por chamada",
    "se a reclonagem reproduz a voz original (o IVC não treina modelo — deduzido, não medido)",
    "se `labels` do ElevenLabs aceita chave livre (testar consome um slot)",
  ]) {
    console.log(`    · ${linha}`);
  }

  await pool.end();
}

/**
 * SÓ RODA COMO ENTRYPOINT — e isto não é estilo, é o conserto de um defeito
 * medido em 24/08.
 *
 * `checkEnsaioSimuladoPolicy.ts` importa `ensaiarNivel` e `ensaiarFalhaParcial`
 * para exercitá-los dentro do gate. Sem esta condição, o `import` executava o
 * módulo inteiro — incluindo o `main()`, incluindo o `pool.end()` — e o gate
 * morria dezenas de checagens depois com `Cannot use a pool after calling end
 * on the pool`, num ponto que não tem nada a ver com a causa.
 */
const ehEntrypoint =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (ehEntrypoint) {
  main().catch(async (err) => {
    console.error("ENSAIO FALHOU:", err);
    await pool.end();
    process.exit(1);
  });
}
