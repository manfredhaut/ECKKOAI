/**
 * TRAJE: criar um look por TEXTO, dentro do freio, e cobrar o que foi medido.
 *
 * O defeito de origem, HISTÓRICO: o passo 1 tinha um upload de imagem e um
 * prompt de traje que não alimentavam nada — os campos iam para
 * `defaults.outfit` e paravam ali, porque `corpoDaGeracao()` nunca os incluiu.
 * Um formulário que aceita arquivo do cliente e não alimenta geração nenhuma é
 * pior que um campo ausente. **Isso mudou no BLOCO B5c**: `outfit`/
 * `outfit_prompt` passaram a ser lidos de verdade pela fal (B2/B5), e o campo
 * voltou à tela — no ramo de avatar EXISTENTE, não neste "Adicionar traje".
 * O item 7 abaixo, que media "nunca existir", passou a medir "se existir, tem
 * de estar ligado" — ver o comentário ali.
 *

 * O caminho live ficou fechado até 06/08 por não se conhecer o endpoint. Agora
 * é MEDIDO: `POST /v3/avatars` com `type: "prompt"`, `name` obrigatório e o id
 * do LOOK em `avatar_id`. Custo medido no mesmo dia: **60 unidades, US$ 1,00**,
 * debitado no 200 e não na conclusão.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA GUARDA PROTEGE
 *
 * 1. O FREIO vem antes da chamada. Um traje custa o mesmo que 20 segundos de
 *    vídeo cobrados; fora do teto diário, um laço esvazia a carteira sem nada
 *    opinar. É o vetor mais caro se quebrar, e é o pedido explícito do bloco.
 * 2. O débito acontece, e o estorno só no `catch` — depois do 200 o fornecedor
 *    já cobrou, e devolver crédito aí seria criar dinheiro.
 * 3. Traje em PREPARO não entra no seletor. Escolher um look que ainda não
 *    existe no fornecedor faz a geração — que custa — sair errada.
 * 4. O custo na tela é o MEDIDO, não um número digitado.
 * 5. Fixture continua inteiro e sem rede.
 * ---------------------------------------------------------------------------
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { HEYGEN_LOOK_COST } from "../services/billing/providerCost.js";

export interface OutfitCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "traje: criar look em live passa pelo teto diário",
    name: "criar look em live pula o teto",
    kind: "esperto",
    // O débito continua, o fornecedor continua sendo chamado, o traje continua
    // aparecendo. Só o freio some — e o sintoma é invisível até a carteira
    // acabar, porque cada criação isolada parece perfeitamente normal.
    file: "backend/src/services/avatar/looks.ts",
    find: "      await assertDailyGenerationBudget();",
    replace: "      void assertDailyGenerationBudget;",
    expect: "criar traje em live NÃO passou pelo teto diário",
  },
  {
    guard: "traje: em preparo não é escolhível",
    name: "o traje em preparo entra no seletor",
    kind: "esperto",
    // A linha existe, o status está gravado, a tela mostra o andamento — e o
    // seletor passa a oferecer um look que o fornecedor ainda não terminou.
    // Gerar com ele gasta uma geração de vídeo para receber erro ou o traje
    // antigo.
    file: "backend/src/services/avatar/looks.ts",
    find: '  const prontos = rows.filter((l) => l.status === "completed" && l.provider_look_id);',
    replace: "  const prontos = rows.filter((l) => l.provider_look_id);",
    expect: "um traje em preparo apareceu no seletor",
  },
  {
    guard: "traje: em preparo não é escolhível",
    name: "o preparo escapa pela lista do fornecedor",
    kind: "esperto",
    // O irmão do mutante acima, e o defeito que só a medição em live revelou:
    // o fornecedor LISTA o look assim que o cria, antes de terminar. Filtrar só
    // as nossas linhas deixa o traje em preparo entrar pela lista dele — e o
    // vetor "em preparo não é escolhível" passaria verde, porque a linha local
    // realmente está fora. Foi assim nos 40 s medidos em 06/08.
    file: "backend/src/services/avatar/looks.ts",
    find: "  const doFornecedorProntos = doFornecedor.filter((f) => !naoProntosAqui.has(f.id));",
    replace: "  const doFornecedorProntos = doFornecedor;",
    expect: "um traje em preparo entrou no seletor pela lista do fornecedor",
  },
  {
    guard: "traje: o custo declarado é o medido",
    name: "o custo do traje vira número digitado",
    kind: "esperto",
    // 60 unidades viram 30: metade do que o fornecedor cobrou de verdade. A
    // tela continua mostrando um custo, com aparência plausível, e a pessoa
    // decide com base num número que não é o da conta.
    file: "backend/src/services/billing/providerCost.ts",
    find: "export const HEYGEN_LOOK_COST = {\n  units: 60,",
    replace: "export const HEYGEN_LOOK_COST = {\n  units: 30,",
    expect: "o custo do traje deixou de bater com a medição",
  },
  {
    guard: "traje: até 3 reference_images (o teto do fornecedor) — nunca mais",
    name: "o truncamento de reference_images em 3 desaparece",
    kind: "esperto",
    // ESPERTO: o `.slice` continua ali, o resto da função não muda — só o
    // NÚMERO some. 4 imagens de referência viram 4 uploads e 4 entradas no
    // corpo, e o fornecedor recusaria a chamada de criação com um 400 —
    // DEPOIS de já ter cobrado os 4 uploads de asset.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "      .slice(0, MAX_REFERENCE_IMAGES);",
    replace: "      .slice(0, 99);",
    expect: "esperado exatamente 3",
  },
  {
    guard: "traje: reference_images está no formato {type:\"asset_id\", asset_id}",
    name: "reference_images passa a mandar a URL local em vez do asset_id",
    kind: "esperto",
    // ESPERTO: o array continua tendo 3 itens, `type` continua `"asset_id"`
    // — só o VALOR de `asset_id` passa a ser a nossa URL `/uploads/...` em
    // vez do id que o fornecedor devolveu no upload. `/uploads/...` é
    // servido por um host que a HeyGen não alcança — mesmo defeito já
    // medido para `background.uploadUrl` em `buildHeygenVideoPayload`.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '      referenceImages.push({ type: "asset_id", asset_id: assetId });',
    replace: '      referenceImages.push({ type: "asset_id", asset_id: url });',
    expect: "formato {type:\"asset_id\", asset_id}",
  },
  {
    guard: "traje: sem imageUrls, o corpo não tem reference_images",
    name: "reference_images entra no corpo mesmo sem imageUrls",
    kind: "esperto",
    // ESPERTO: com a lista de referências vazia, `referenceImages` continua
    // um array — só vazio. Mandar `reference_images: []` em vez de omitir o
    // campo é o tipo de detalhe que passa despercebido no código e pode não
    // passar despercebido no schema do fornecedor (`additionalProperties`
    // fechado não distingue "array vazio" de "array com algo", mas alguns
    // validadores de schema recusam array vazio onde esperam >=1 item).
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    if (referenceImages.length > 0) body.reference_images = referenceImages;",
    replace: "    body.reference_images = referenceImages;",
    expect: "reference_images` mesmo assim",
  },
];

type Row = Record<string, unknown>;

/** Registro do que o duplo observou durante uma chamada. */
interface Observado {
  fetchChamado: number;
  debitos: number;
  estornos: number;
  contagemDoDia: number;
}

export async function checkOutfitPolicy(repoRoot: string): Promise<OutfitCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { pool } = await import("../db/pool.js");
  const queryReal = pool.query.bind(pool);
  const connectReal = pool.connect.bind(pool);
  const fetchReal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;

  const { criarLook, listarLooks } = await import("../services/avatar/looks.js");
  const { resetLiveGenerationCount } = await import("../services/providers/liveGuard.js");

  const linhas: Row[] = [];
  const obs: Observado = { fetchChamado: 0, debitos: 0, estornos: 0, contagemDoDia: 0 };
  const desconhecidas: string[] = [];
  let fetchDeveLancar = false;

  // Duplo de banco. Responde à contagem do teto, guarda os INSERTs e devolve as
  // linhas na listagem — que é o vínculo que os vetores 1 e 3 medem.
  const responder = async (text: unknown, params?: unknown[]) => {
    const sql = String(text).replace(/\s+/g, " ").trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/date_trunc\('day', now\(\)\)/.test(sql)) {
      return { rows: [{ n: String(obs.contagemDoDia) }], rowCount: 1 };
    }
    if (/INSERT INTO avatar_looks/i.test(sql)) {
      // A linha nasce ANTES da chamada, sem id do fornecedor: é ela que serve
      // de chave de idempotência para o débito e o estorno (migration 046).
      const id = `linha-${linhas.length + 1}`;
      linhas.push({
        id,
        provider_look_id: null,
        name: params?.[2],
        preview_image_url: params?.[3] ?? null,
        status: "processing",
        cost_units: null,
        simulated: params?.[5],
      });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (/DELETE FROM avatar_looks/i.test(sql)) {
      const i = linhas.findIndex((l) => l.id === params?.[0]);
      if (i >= 0) linhas.splice(i, 1);
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE avatar_looks/i.test(sql)) {
      const alvo = linhas.find((l) => l.id === params?.[0]);
      if (alvo) {
        if (/SET status = 'failed'/.test(sql)) alvo.status = "failed";
        else {
          alvo.provider_look_id = params?.[1];
          alvo.status = params?.[2];
          alvo.cost_units = params?.[3] ?? null;
        }
      }
      return { rows: [], rowCount: 1 };
    }
    if (/FROM avatar_looks/i.test(sql)) return { rows: linhas, rowCount: linhas.length };
    if (/SELECT balance FROM tenant_credits/i.test(sql)) return { rows: [{ balance: 50 }], rowCount: 1 };
    if (/UPDATE tenant_credits/i.test(sql)) return { rows: [{ balance: 49 }], rowCount: 1 };
    if (/SELECT credit_type FROM credit_ledger/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/SELECT 1 FROM credit_ledger/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO credit_ledger/i.test(sql)) {
      const motivo = /'refund'/.test(sql) ? "estorno" : "debito";
      if (motivo === "estorno") obs.estornos += 1;
      else obs.debitos += 1;
      return { rows: [], rowCount: 1 };
    }
    desconhecidas.push(sql.slice(0, 90));
    return { rows: [], rowCount: 0 };
  };

  (pool as unknown as { query: unknown }).query = responder;
  (pool as unknown as { connect: unknown }).connect = async () => ({
    query: responder,
    release: () => {},
  });

  // Duplo de rede: devolve EXATAMENTE a resposta medida em 06/08, com o
  // `status: processing` que torna o caminho assíncrono observável. B4
  // (BLOCO HEYGEN-SIMPLES-1, 02/09/2026) diferencia por URL: `/v3/assets`
  // (upload das referências) responde com um asset_id; `/v3/avatars`
  // (criação do look) continua a resposta de sempre — e o corpo que ELA
  // recebe é capturado, para o item 8 medir `reference_images`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let corpoDeAvatarsRecebido: any = null;
  let chamadasDeAssets = 0;
  globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
    obs.fetchChamado += 1;
    if (fetchDeveLancar) throw new Error("HeyGen fora do ar (simulado pela guarda)");
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    if (url.includes("/v3/assets")) {
      chamadasDeAssets += 1;
      return new Response(
        JSON.stringify({ data: { asset_id: `asset-${chamadasDeAssets}` } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const initObj = init as { body?: string } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    corpoDeAvatarsRecebido = initObj?.body ? (JSON.parse(initObj.body) as any) : null;
    return new Response(
      JSON.stringify({
        data: {
          avatar_group: { id: "grupo-1", looks_count: 2 },
          avatar_item: { id: "look-novo-1", name: "Terno azul", status: "processing" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const BASE = {
    tenantId: "t1",
    avatarId: "a1",
    providerAvatarId: "pa-1",
    apiKey: "chave-de-verificacao",
    vendor: "heygen" as const,
  };

  try {
    // -----------------------------------------------------------------------
    // 1. O FREIO vem antes da chamada. Teto estourado → nada de rede.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "live";
    resetLiveGenerationCount();
    obs.contagemDoDia = 99; // muito acima de qualquer teto configurado
    obs.fetchChamado = 0;
    const barrado = await criarLook({ ...BASE, name: "Terno", prompt: "terno azul" });

    if (barrado.ok) {
      failures.push(
        "traje: criar traje em live NÃO passou pelo teto diário — com 99 gerações pagas hoje a criação " +
          "foi ACEITA. Um traje custa 60 unidades (US$ 1,00 medidos em 06/08), o mesmo que 20 segundos de " +
          "vídeo cobrados. Fora do teto, um laço esvazia a carteira e nada opina — e cada criação isolada " +
          "parece perfeitamente normal até o saldo acabar.",
      );
    } else if (barrado.code !== "daily_generation_limit") {
      failures.push(
        `traje: com o teto diário estourado a recusa veio como \`${barrado.code}\`, e não ` +
          "`daily_generation_limit`. O motivo certo importa: o teto é NOSSO e nada foi cobrado, e a " +
          "mensagem é o que diz a quem lê como levantá-lo.",
      );
    }
    if (obs.fetchChamado !== 0) {
      failures.push(
        `traje: o teto recusou mas a chamada ao fornecedor ACONTECEU (${obs.fetchChamado}×). O freio tem ` +
          "de vir antes da rede; depois dela o dinheiro já saiu — medido em 06/08, o débito acontece no " +
          "200 e não na conclusão.",
      );
    }

    // -----------------------------------------------------------------------
    // 2. Com folga no teto: debita, chama, persiste em preparo, com o custo.
    // -----------------------------------------------------------------------
    resetLiveGenerationCount();
    obs.contagemDoDia = 0;
    obs.fetchChamado = 0;
    obs.debitos = 0;
    obs.estornos = 0;
    linhas.length = 0;
    const criado = await criarLook({ ...BASE, name: "Terno azul", prompt: "terno azul-marinho" });

    if (!criado.ok) {
      failures.push(`traje: criar traje em live com teto livre foi recusado (${criado.code}: ${criado.message}).`);
    } else {
      if (obs.fetchChamado !== 1) {
        failures.push(`traje: esperava 1 chamada ao fornecedor e houve ${obs.fetchChamado}.`);
      }
      if (obs.debitos !== 1 || obs.estornos !== 0) {
        failures.push(
          `traje: o débito no ledger não bateu — ${obs.debitos} débito(s) e ${obs.estornos} estorno(s) ` +
            "para uma criação bem-sucedida. Criar traje consome cota paga e tem de aparecer no extrato " +
            "como as gerações de vídeo.",
        );
      }
      if (criado.status !== "processing") {
        failures.push(
          `traje: o status devolvido foi \`${criado.status}\`, e a resposta do fornecedor diz ` +
            "`processing`. Medido em 06/08: o 200 devolve `processing` e o look só fica utilizável quando " +
            "vira `completed`. Tratar como pronto de imediato entrega um traje que ainda não existe.",
        );
      }
      const linha = linhas[0];
      if (linha?.cost_units !== HEYGEN_LOOK_COST.units) {
        failures.push(
          `traje: a linha gravada tem cost_units=${String(linha?.cost_units)} e a medição diz ` +
            `${HEYGEN_LOOK_COST.units}. O extrato tem de guardar o que foi cobrado, por linha.`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 3. Traje em PREPARO não é escolhível — mas aparece como pendente.
    // -----------------------------------------------------------------------
    const doFornecedor = [{ id: "pa-1", name: "Traje atual", previewImageUrl: null }];
    const semCredencial = await listarLooks(BASE.tenantId, BASE.avatarId, doFornecedor);

    if (semCredencial.looks.some((l) => l.id === "look-novo-1")) {
      failures.push(
        "traje: um traje em preparo apareceu no seletor. O fornecedor ainda não terminou de gerá-lo — " +
          "escolhê-lo faz a geração de vídeo, que custa, sair com um look que não existe.",
      );
    }
    if (!semCredencial.pendentes.some((p) => p.id === "look-novo-1")) {
      failures.push(
        "traje: o traje em preparo sumiu da tela em vez de aparecer como pendente. Ele foi PAGO — " +
          "esconder dinheiro gasto é pior que mostrar um andamento.",
      );
    }

    // O FORNECEDOR já lista o look em preparo — medido em 06/08, ele apareceu
    // na listagem dele durante os ~50 s até concluir. Filtrar só as nossas
    // linhas deixaria o traje entrar por ali, e este vetor é o que pega isso.
    const comOFornecedorJaListando = await listarLooks(BASE.tenantId, BASE.avatarId, [
      ...doFornecedor,
      { id: "look-novo-1", name: "Terno azul", previewImageUrl: null },
    ]);
    if (comOFornecedorJaListando.looks.some((l) => l.id === "look-novo-1")) {
      failures.push(
        "traje: um traje em preparo entrou no seletor pela lista do fornecedor. Ele lista o look assim " +
          "que o cria, antes de terminar — medido em 06/08 —, então filtrar apenas as nossas linhas não " +
          "basta. Escolher esse look manda para a geração de vídeo, que custa, um traje que ainda não " +
          "existe.",
      );
    }

    // O nome é o que a PESSOA escreveu. Medido: "Jaleco branco" voltou da
    // listagem do fornecedor como "White Lab Coat, Blue Shirt".
    linhas[0].status = "completed";
    linhas[0].provider_look_id = "look-novo-1";
    const comNome = await listarLooks(BASE.tenantId, BASE.avatarId, [
      { id: "look-novo-1", name: "White Lab Coat, Blue Shirt", previewImageUrl: null },
    ]);
    if (!comNome.looks.some((l) => l.id === "look-novo-1" && l.name === "Terno azul")) {
      failures.push(
        "traje: o seletor mostra o nome que o FORNECEDOR devolveu, e não o que a pessoa escreveu. Ele " +
          "reescreve o nome a partir do prompt (medido: \"Jaleco branco\" virou \"White Lab Coat, Blue " +
          "Shirt\"), e quem criou o traje procura pelo nome que deu.",
      );
    }
    linhas[0].status = "processing";
    linhas[0].provider_look_id = "look-novo-1";

    // Quando o fornecedor conclui, ele entra no seletor. Sem isto, o vetor
    // acima seria satisfeito por uma listagem que esconde tudo para sempre.
    linhas[0].status = "completed";
    const depois = await listarLooks(BASE.tenantId, BASE.avatarId, doFornecedor);
    if (!depois.looks.some((l) => l.id === "look-novo-1")) {
      failures.push(
        "traje: o traje CONCLUÍDO não entrou no seletor. Ele foi pago, está pronto no fornecedor, e não " +
          "pode ser escolhido — que é o formulário órfão de volta, agora com uma cobrança junto.",
      );
    }
    if (depois.pendentes.length !== 0) {
      failures.push("traje: o traje concluído continuou listado como pendente.");
    }

    // -----------------------------------------------------------------------
    // 4. Fornecedor lançou → estorna, e nada é gravado.
    // -----------------------------------------------------------------------
    resetLiveGenerationCount();
    linhas.length = 0;
    obs.debitos = 0;
    obs.estornos = 0;
    fetchDeveLancar = true;
    const falhou = await criarLook({ ...BASE, name: "Terno preto", prompt: "terno preto" });
    fetchDeveLancar = false;

    if (falhou.ok) {
      failures.push("traje: a criação foi dada como bem-sucedida com o fornecedor lançando.");
    } else if (falhou.code !== "look_creation_failed") {
      failures.push(`traje: falha do fornecedor virou \`${falhou.code}\` em vez de \`look_creation_failed\`.`);
    }
    if (obs.estornos !== 1) {
      failures.push(
        `traje: o fornecedor lançou e houve ${obs.estornos} estorno(s), esperado 1. A chamada não foi ` +
          "aceita, nada foi produzido e nenhuma cota externa foi gasta — é a única fronteira em que " +
          "devolver o crédito é honesto.",
      );
    }
    // A linha SOBREVIVE marcada como `failed`, e isso é deliberado: ela é a
    // referência do estorno no ledger, e apagá-la desarmaria a idempotência que
    // acabou de ser usada. O que não pode é ficar cobrada nem escolhível.
    if (linhas.length !== 1 || linhas[0].status !== "failed") {
      failures.push(
        `traje: depois da falha do fornecedor esperava 1 linha marcada \`failed\`, e há ` +
          `${linhas.length} com status \`${String(linhas[0]?.status)}\`. A linha é a chave de ` +
          "idempotência do estorno — apagá-la desarma a proteção contra estornar duas vezes.",
      );
    } else if (linhas[0].cost_units !== null) {
      failures.push(
        `traje: a tentativa estornada ficou com cost_units=${String(linhas[0].cost_units)}. Estornado é o ` +
          "mesmo que não cobrado, e um custo no extrato de algo devolvido conta dinheiro duas vezes.",
      );
    }
    const listaAposFalha = await listarLooks(BASE.tenantId, BASE.avatarId, doFornecedor);
    if (listaAposFalha.looks.some((l) => l.id === "look-novo-1")) {
      failures.push("traje: um traje que FALHOU apareceu no seletor.");
    }

    // -----------------------------------------------------------------------
    // 5. FIXTURE: inteiro, sem rede, sem custo, sem teto.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "fixture";
    linhas.length = 0;
    obs.fetchChamado = 0;
    obs.contagemDoDia = 99; // teto estourado NÃO pode barrar em fixture
    const simulado = await criarLook({ ...BASE, name: "Casual", prompt: "camisa polo" });

    if (!simulado.ok) {
      failures.push(
        `traje: criar traje em fixture foi recusado (${simulado.code}). Ensaiar não toca fornecedor e não ` +
          "custa nada; incluir a simulação no teto inventaria um limite inexistente.",
      );
    } else {
      if (obs.fetchChamado !== 0) {
        failures.push(`traje: em fixture houve ${obs.fetchChamado} chamada(s) de rede. Fixture não fala com ninguém.`);
      }
      if (linhas[0]?.cost_units !== null) {
        failures.push(
          `traje: o traje simulado gravou cost_units=${String(linhas[0]?.cost_units)}. Simulação não custa, ` +
            "e um custo falso no extrato é pior que nenhum.",
        );
      }
      if (linhas[0]?.status !== "processing") {
        failures.push(
          "traje: o traje simulado nasceu pronto. O caminho assíncrono é onde moram os defeitos (tela " +
            "presa em 'preparando', look que não aparece quando conclui) e um stub que responde pronto " +
            "esconde os dois.",
        );
      }
    }

    // -----------------------------------------------------------------------
    // 6. O custo declarado é o MEDIDO.
    // -----------------------------------------------------------------------
    // Tipados como `number` de propósito: `HEYGEN_LOOK_COST` é `as const`, e
    // comparar a propriedade direto contra 60 faz o TypeScript reclamar de
    // comparação entre literais quando o mutante troca o valor — o gate sairia
    // pelo compilador e a guarda nunca opinaria, que é a definição de inerte.
    const unidades: number = HEYGEN_LOOK_COST.units;
    const dolares: number = HEYGEN_LOOK_COST.usd;
    if (unidades !== 60 || dolares !== 1.0) {
      failures.push(
        `traje: o custo do traje deixou de bater com a medição — declarado ${unidades} un / ` +
          `US$ ${dolares}, medido em 06/08 na conta real 60 un / US$ 1,00 (quota 660 → 600, ` +
          "wallet 11,00 → 10,00). Este número aparece na tela antes de a pessoa confirmar; errado, ela " +
          "decide com base numa conta que não é a do fornecedor.",
      );
    }
    if (unidades / dolares !== 60) {
      failures.push(
        "traje: a razão unidades/dólar do traje deixou de ser 60, que é a régua medida da conta em todas " +
          "as operações. Um dos dois números foi mexido sem o outro.",
      );
    }

    // -------------------------------------------------------------------------
    // 8. B4, BLOCO HEYGEN-SIMPLES-1 (02/09/2026) — reference_images.
    //
    // Até 3 imagens sobem para `POST /v3/assets` ANTES de `POST /v3/avatars`,
    // e os asset_ids entram em `reference_images` no formato
    // `{type:"asset_id", asset_id}`. `/uploads/.gitkeep` é o arquivo real de
    // prova já usado por outras guardas deste projeto (rastreado pelo git,
    // conteúdo irrelevante — o que se mede é o DESPACHO).
    // -------------------------------------------------------------------------
    process.env.PROVIDER_MODE = "live";
    resetLiveGenerationCount();
    obs.contagemDoDia = 0;
    chamadasDeAssets = 0;
    corpoDeAvatarsRecebido = null;
    const comReferencia = await criarLook({
      ...BASE,
      name: "Terno com referência",
      prompt: "terno azul",
      imageUrls: ["/uploads/.gitkeep", "/uploads/.gitkeep", "/uploads/.gitkeep", "/uploads/.gitkeep"],
    });
    if (!comReferencia.ok) {
      failures.push(`traje: criação com reference_images falhou inesperadamente — ${JSON.stringify(comReferencia)}.`);
    }
    if (chamadasDeAssets !== 3) {
      failures.push(
        `traje: 4 imagens de referência foram passadas e ${chamadasDeAssets} upload(s) de asset ` +
          "aconteceram — esperado exatamente 3 (o teto do fornecedor). Mandar mais uploads que o " +
          "necessário paga por asset que nunca vai ser usado no corpo.",
      );
    }
    const referencias = corpoDeAvatarsRecebido?.reference_images as unknown[] | undefined;
    if (!Array.isArray(referencias) || referencias.length !== 3) {
      failures.push(
        `traje: o corpo de POST /v3/avatars não trouxe 3 reference_images — veio ${JSON.stringify(referencias)}.`,
      );
    } else if (
      referencias.some((r) => (r as Record<string, unknown>).type !== "asset_id" || !(r as Record<string, unknown>).asset_id)
    ) {
      failures.push(
        `traje: reference_images não está no formato {type:"asset_id", asset_id} — veio ${JSON.stringify(referencias)}.`,
      );
    } else if (
      // O VALOR de asset_id precisa ser o id que o UPLOAD devolveu
      // ("asset-1"/"asset-2"/"asset-3", do duplo de fetch acima) — nunca a
      // URL local `/uploads/...`, que é um endereço que a HeyGen não alcança
      // (mesmo defeito já medido para `background.uploadUrl`).
      !(referencias as { asset_id: string }[]).every((r) => /^asset-\d+$/.test(r.asset_id))
    ) {
      failures.push(
        `traje: reference_images não está no formato {type:"asset_id", asset_id} — veio ${JSON.stringify(referencias)} ` +
          '(esperado asset_id no formato "asset-N", devolvido pelo upload; uma URL local aqui é um ' +
          "endereço que a HeyGen não alcança).",
      );
    }

    // Sem imageUrls, o corpo NÃO tem reference_images — o comportamento de
    // sempre, para todo traje criado só por texto (o caminho de produto hoje).
    //
    // SEGUNDO reset aqui — SIMPLES-2, 03/09/2026, achado ao rodar o gate fora
    // do container de origem. Sem ele, esta chamada consome a MESMA cota de
    // `PROVIDER_LIVE_MAX_GENERATIONS` que a chamada acima já gastou, e o
    // teste passa a depender do valor REAL desse env no processo (>=2) em
    // vez de testar só o comportamento de `criarLook` — hermético num
    // container e quebradiço noutro, pela mesma cota que protege geração
    // real, nunca pensada para gate de guarda.
    resetLiveGenerationCount();
    corpoDeAvatarsRecebido = null;
    const semReferencia = await criarLook({ ...BASE, name: "Terno sem referência", prompt: "terno cinza" });
    if (!semReferencia.ok) {
      failures.push(`traje: criação sem reference_images falhou inesperadamente — ${JSON.stringify(semReferencia)}.`);
    }
    if (corpoDeAvatarsRecebido && "reference_images" in corpoDeAvatarsRecebido) {
      failures.push(
        "traje: sem `imageUrls`, o corpo trouxe `reference_images` mesmo assim — todo traje criado só por " +
          "texto (o caminho de produto de hoje) passaria a mandar um campo que ninguém pediu.",
      );
    }

    if (desconhecidas.length > 0) {
      failures.push(
        "traje: o duplo de banco recebeu consulta que não sabe responder — " +
          `${JSON.stringify([...new Set(desconhecidas)])}.`,
      );
    }

    if (failures.length === 0) {
      notes.push(
        `  traje: teto barra antes da rede; com folga debita 1×, chama 1× e grava ${HEYGEN_LOOK_COST.units} un ` +
          "em preparo; preparo fora do seletor e concluído dentro; falha do fornecedor estorna sem gravar",
      );
      notes.push("  traje: fixture cria sem rede, sem custo e sem teto — e o custo declarado é o medido (US$ 1,00)");
      notes.push(
        "  traje: até 3 reference_images sobem para /v3/assets antes de /v3/avatars, no formato " +
          "{type:asset_id,asset_id}; a 4ª imagem é truncada, e sem imageUrls o campo não aparece",
      );
    }
  } finally {
    (pool as unknown as { query: unknown }).query = queryReal;
    (pool as unknown as { connect: unknown }).connect = connectReal;
    globalThis.fetch = fetchReal;
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  // ---------------------------------------------------------------------------
  // 7. Se o passo 1 coleta `outfit`, o corpo enviado tem de USÁ-LO.
  //
  // ⚠️ UI-PARIDADE-TRAJE (25/08): o bloco "Adicionar traje" (criação de LOOK
  // por esta tela) saiu do passo 1 — a criação morreu, a LEITURA de looks já
  // existentes não (rota, `criarLook`/`listarLooks` e os 4 mutantes acima
  // continuam de pé, testados por chamada direta ao serviço). Os 2 mutantes
  // que mutavam `LOOK_POLL_WINDOW_MS`/`addLookStillPreparing` em
  // `AvatarSetupStep.tsx`, e a checagem de `handleCreateLook`, saíram junto —
  // mutavam/exigiam texto que não existe mais no arquivo.
  //
  // ⚠️ ESTA INVARIANTE MUDOU no BLOCO B5c, e o histórico importa para não
  // reabrir a dúvida: até então, `handleAssetUpload("outfit", …)` NÃO PODIA
  // existir em lugar nenhum do passo 1, porque ele gravava em `defaults.outfit`
  // e `corpoDaGeracao()` não incluía o campo no corpo de `POST /videos` — era
  // literalmente um formulário órfão, e a regra era "nunca existir de novo".
  // O B2/B5 ligaram `outfit`/`outfit_prompt` à fal de verdade, e o B5c devolveu
  // o campo à tela (no ramo de avatar EXISTENTE, não no antigo). A regra
  // "nunca existir" ficaria mais forte que o produto real, e bloquearia
  // exatamente o conserto que fecha o gap que este próprio comentário
  // descrevia. O que continua protegido — e é o que importava desde o
  // início — é que upload sem fio até o corpo NÃO VOLTE: se `outfit` aparece
  // no passo 1, `corpoDaGeracao()` (GenerateStep.tsx) tem de mandá-lo.
  // ---------------------------------------------------------------------------
  const passo1 = path.join(repoRoot, "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx");
  try {
    const fonte = await readFile(passo1, "utf-8");
    if (/handleAssetUpload\(\s*["']outfit["']/.test(fonte)) {
      const generateStepPath = path.join(
        repoRoot,
        "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
      );
      const generateStepSrc = await readFile(generateStepPath, "utf-8").catch(() => "");
      if (!/outfit:\s*defaults\?\.outfit/.test(generateStepSrc)) {
        failures.push(
          "traje: o passo 1 volta a colher `outfit` (`handleAssetUpload(\"outfit\", …)`) sem que " +
            "`corpoDaGeracao()` (GenerateStep.tsx) o inclua no corpo de `POST /videos` — é o formulário " +
            "órfão de volta: upload que o cliente preenche e que não alimenta geração nenhuma.",
        );
      }
    }
  } catch {
    failures.push(`traje: não foi possível ler ${passo1}.`);
  }

  return { failures, notes };
}
