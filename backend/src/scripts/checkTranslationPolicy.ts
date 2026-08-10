/**
 * Invariantes da TRADUÇÃO VELADA da Interpretação.
 *
 * ---------------------------------------------------------------------------
 * O MODELO DO PRODUTO, EM UMA FRASE
 *
 * A FALA fica no idioma escrito e nunca passa pelo tradutor. A INSTRUÇÃO vai em
 * inglês ao fornecedor. Quem escreve vê e revisa sempre o próprio texto, e não
 * sabe que existe uma versão em inglês.
 *
 * Cada uma dessas três frases é uma invariante aqui, e as três falham de formas
 * diferentes: a primeira trocaria o idioma do vídeo entregue; a segunda cairia
 * calada de volta ao português; a terceira vazaria numa tela.
 * ---------------------------------------------------------------------------
 *
 * ANCORADO NO USO, NUNCA NA MENÇÃO. Esta regra já custou sete guardas inertes
 * neste projeto — o comentário que explica a invariante casava com a busca que
 * deveria encontrá-la no código. Aqui, tudo que dá para exercitar é exercitado
 * chamando a função de produção; o que é ausência de linha (e ausência não se
 * chama) é lido do arquivo com os comentários REMOVIDOS antes da busca.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  needsTranslation,
  resolveInterfaceLocale,
  translateDirection,
} from "../services/video/directionTranslation.js";
import { semCamposVelados, CAMPOS_VELADOS } from "../services/video/tenantView.js";
import { withDeliveredSeconds } from "../routes/videos.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "tradução: o ROTEIRO nunca passa pelo tradutor",
    name: "o roteiro passa a ser traduzido junto com a interpretação",
    kind: "esperto",
    // O vídeo continua saindo, o fornecedor continua respondendo 200, o custo
    // é o mesmo. O que muda é o IDIOMA da fala — e só quem assistir descobre,
    // depois de pago.
    file: "backend/src/routes/videos.ts",
    find: "        scene: { ...scene, motionPrompt: motionPromptEn ?? scene.motionPrompt },",
    replace:
      "        script: motionPromptEn ? await translateDirection({ tenantId: req.tenantId, apiKey: (await getCredential(req.tenantId, \"script\"))!.apiKey, vendor: \"gemini\", source: script, locale: interfaceLocale }).then((r) => r.english) : script,\n" +
      "        scene: { ...scene, motionPrompt: motionPromptEn ?? scene.motionPrompt },",
    expect: "o roteiro passou pelo tradutor",
  },
  {
    guard: "tradução: a versão nova SUBSTITUI a anterior",
    name: "a tradução concatena à anterior em vez de substituir",
    kind: "esperto",
    // O texto continua em inglês e o fornecedor continua aceitando. Só que a
    // direção cresce a cada geração, e na terceira ela é três instruções
    // empilhadas, contraditórias entre si.
    file: "backend/src/services/video/directionTranslation.ts",
    find: "    return { english: jaFeita, origin: \"reused\" };",
    replace: "    return { english: input.source + \" \" + jaFeita, origin: \"reused\" };",
    expect: "a tradução reaproveitada não é a tradução",
  },
  {
    guard: "tradução: o gatilho é o idioma da interface",
    name: "locale en passa a disparar chamada de tradução",
    kind: "obvio",
    file: "backend/src/services/video/directionTranslation.ts",
    find: "  return locale !== \"en\";",
    replace: "  return true;",
    expect: "com a interface em inglês",
  },
  {
    guard: "tradução: falha RECUSA a geração, nunca envia o português",
    name: "falha de tradução cai em enviar o texto em português",
    kind: "esperto",
    // O MUTANTE MAIS IMPORTANTE DESTA PASSADA. É o precedente medido de
    // `background_asset_failed` renascendo: cai num catch, a geração segue, o
    // vídeo é cobrado por inteiro e a tela não diz nada. Aqui o sintoma seria
    // um avatar recebendo direção em português — que o fornecedor aceita com
    // 200 e interpreta como puder.
    file: "backend/src/services/video/directionTranslation.ts",
    find: "    throw new DirectionTranslationError(err instanceof Error ? err.message : String(err));",
    replace: "    return { english: input.source, origin: \"model\" };",
    expect: "devolveu o texto de origem em vez de falhar",
  },
  {
    guard: "tradução: não debita crédito de roteiro",
    name: "a tradução passa a debitar crédito de roteiro",
    kind: "esperto",
    // Nada quebra e nada aparece: o saldo simplesmente cai por um passo que a
    // pessoa não pediu, e o "Gerar com IA" dela acaba mais cedo sem explicação.
    file: "backend/src/services/video/directionTranslation.ts",
    find: "  if (usage) {\n    await recordProviderUsage({",
    replace:
      "  {\n    const { debitCredit } = await import(\"../billing/creditGate.js\");\n" +
      "    await debitCredit({ tenantId: input.tenantId, creditType: \"script\" });\n  }\n" +
      "  if (usage) {\n    await recordProviderUsage({",
    expect: "a tradução debitou crédito",
  },
  {
    guard: "tradução: o VÉU — a versão inglesa não sai para o tenant",
    name: "a versão traduzida volta a sair na resposta do tenant",
    kind: "obvio",
    file: "backend/src/routes/videos.ts",
    find: "    ...semCamposVelados(row as unknown as Record<string, unknown>),",
    replace: "    ...row,",
    expect: "a versão traduzida saiu na resposta do tenant",
  },
  {
    guard: "tradução: o VÉU — a versão inglesa não sai para o tenant",
    name: "a lista de campos velados fica vazia",
    kind: "esperto",
    // O filtro continua sendo chamado, o código continua parecendo certo, e a
    // função devolve a linha inteira. É o defeito na forma mais silenciosa: a
    // proteção existe, roda, e não protege nada.
    file: "backend/src/services/video/tenantView.ts",
    find: "export const CAMPOS_VELADOS: readonly string[] = [\"motion_prompt_en\"];",
    replace: "export const CAMPOS_VELADOS: readonly string[] = [];",
    expect: "a versão traduzida saiu na resposta do tenant",
  },
];

export interface TranslationCheckResult {
  failures: string[];
  notes: string[];
}

const ROTA = "backend/src/routes/videos.ts";
const MODULO = "backend/src/services/video/directionTranslation.ts";

/** O arquivo sem comentários — é sobre isto que qualquer busca textual roda. */
function apenasCodigo(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

export async function checkTranslationPolicy(repoRoot: string): Promise<TranslationCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. O GATILHO é o idioma da interface, e o default falha fechado.
  // ---------------------------------------------------------------------------
  const casos: { bruto: unknown; traduz: boolean; porque: string }[] = [
    { bruto: "pt-BR", traduz: true, porque: "interface em português traduz" },
    { bruto: "en", traduz: false, porque: "interface em inglês não chama modelo nenhum" },
    { bruto: undefined, traduz: true, porque: "ausente cai no lado seguro" },
    { bruto: "xx-YY", traduz: true, porque: "lixo cai no lado seguro" },
  ];
  for (const caso of casos) {
    const traduz = needsTranslation(resolveInterfaceLocale(caso.bruto));
    if (traduz !== caso.traduz) {
      failures.push(
        `tradução: o gatilho decidiu ${traduz ? "traduzir" : "não traduzir"} para ` +
          `${JSON.stringify(caso.bruto)}, e ${caso.porque}. ` +
          (caso.traduz
            ? "Não traduzir manda a direção em português ao fornecedor, que aceita com 200 e faz o que puder."
            : "Traduzir com a interface em inglês gasta tokens para não mudar nada."),
      );
    }
  }

  // O caminho inglês NÃO PODE tocar em rede nem em banco. Provado com `fetch`
  // substituído por uma bomba: se a função chamar qualquer coisa, ela estoura.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("BOMBA: o caminho de interface em inglês chamou a rede");
  }) as typeof fetch;
  try {
    const r = await translateDirection({
      tenantId: "tenant-de-teste",
      apiKey: "irrelevante",
      vendor: "gemini",
      source: "open hands at chest height",
      locale: "en",
    });
    if (r.origin !== "locale_is_english" || r.english !== "open hands at chest height") {
      failures.push(
        `tradução: com a interface em inglês o texto deveria voltar inalterado e sem chamada — recebi ` +
          `origin=${r.origin}, texto=${JSON.stringify(r.english)}.`,
      );
    }
  } catch (err) {
    failures.push(
      "tradução: com a interface em inglês a função tocou a rede — " +
        (err instanceof Error ? err.message : String(err)) +
        ". O caminho em inglês tem de sair antes de qualquer I/O; é isso que faz " +
        "'sem chamada de modelo' ser observável pela ausência de registro de tokens.",
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  // ---------------------------------------------------------------------------
  // 2. FALHA RECUSA — e a recusa é uma exceção, não um valor devolvido.
  //
  // Exercitado de verdade: `complete()` é forçado a falhar pela rede, e o que
  // se exige é que NADA volte. Um retorno aqui — qualquer um — significa que o
  // caminho caiu de volta em enviar alguma coisa.
  // ---------------------------------------------------------------------------
  const modoOriginal = process.env.PROVIDER_MODE;
  process.env.PROVIDER_MODE = "live";
  globalThis.fetch = (async () => {
    throw new Error("fornecedor de texto fora do ar (simulado pela guarda)");
  }) as typeof fetch;
  try {
    const r = await translateDirection({
      tenantId: "tenant-de-teste",
      apiKey: "irrelevante",
      vendor: "gemini",
      source: "mãos abertas na altura do peito",
      locale: "pt-BR",
    });
    failures.push(
      `tradução: a falha do modelo devolveu o texto de origem em vez de falhar — recebi ` +
        `${JSON.stringify(r.english)} (origin=${r.origin}). É o precedente medido de ` +
        "`background_asset_failed` renascendo: cai num catch, a geração segue, o vídeo é cobrado por " +
        "inteiro e a tela fica calada. Aqui o avatar receberia direção em português.",
    );
  } catch {
    // Esperado: lançou.
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  // ---------------------------------------------------------------------------
  // 3. O VÉU, exercitado na FUNÇÃO que serializa para o tenant.
  //
  // Não é leitura de arquivo: `withDeliveredSeconds` é a única saída das três
  // rotas de vídeo, e aqui ela é chamada com uma linha que carrega as duas
  // versões. O que se exige é que a inglesa não esteja no resultado — nem como
  // chave, nem como valor em canto nenhum do JSON.
  // ---------------------------------------------------------------------------
  const MARCA = "PROVA-DO-VEU-hands-open-at-chest-height";
  const serializada = withDeliveredSeconds({
    id: "v-guarda",
    tenant_id: "t",
    script: "roteiro em português",
    status: "ready",
    output_url: "/uploads/v.mp4",
    captioned_output_url: null,
    captions: false,
    motion_prompt: "mãos abertas na altura do peito",
    motion_prompt_en: MARCA,
    aspect_ratio: "16:9",
    delivered_seconds: "16.136",
    delivered_source: "vendor_response",
  } as never);
  const json = JSON.stringify(serializada);
  if (json.includes(MARCA) || "motion_prompt_en" in (serializada as Record<string, unknown>)) {
    failures.push(
      "tradução: a versão traduzida saiu na resposta do tenant. Ela existe para auditoria — log de " +
        "servidor e painel admin — e o modelo do produto é que quem escreve vê e revisa sempre o " +
        "próprio texto. Uma tela que mostrasse as duas transformaria uma decisão interna numa segunda " +
        "caixa de texto a revisar, e numa que não dá para editar.",
    );
  }
  // O contraponto: o texto do usuário CONTINUA saindo. Sem ele, uma guarda que
  // apagasse os dois campos passaria — e a tela ficaria sem a Interpretação.
  if (!json.includes("mãos abertas")) {
    failures.push(
      "tradução: o véu levou junto o texto do USUÁRIO. É ele que a tela mostra; velado é só o inglês.",
    );
  }
  if (CAMPOS_VELADOS.length === 0) {
    failures.push(
      "tradução: a lista de campos velados está vazia. O filtro continua sendo chamado e não filtra " +
        "nada — a proteção existe, roda, e não protege.",
    );
  }
  // E a função de filtro, direto, com um objeto construído aqui.
  const filtrado = semCamposVelados({ a: 1, motion_prompt_en: MARCA });
  if ("motion_prompt_en" in filtrado) {
    failures.push("tradução: `semCamposVelados` deixou passar o campo que ela existe para remover.");
  }

  // ---------------------------------------------------------------------------
  // 4. O ROTEIRO não passa pelo tradutor — ausência de linha, lida no código.
  //
  // Esta é a única invariante do módulo que não dá para exercitar chamando
  // função: o defeito é a PRESENÇA de uma chamada onde não deve haver nenhuma.
  // Comentários fora antes da busca — este arquivo e a rota falam de roteiro e
  // de tradução na mesma frase o tempo todo, e é exatamente assim que as sete
  // guardas inertes deste projeto nasceram.
  // ---------------------------------------------------------------------------
  const rota = apenasCodigo(readFileSync(path.join(repoRoot, ROTA), "utf8"));
  const modulo = apenasCodigo(readFileSync(path.join(repoRoot, MODULO), "utf8"));

  // `translateDirection` só pode receber `scene.motionPrompt` — nunca `script`.
  for (const [arquivo, fonte] of [
    [ROTA, rota],
    [MODULO, modulo],
  ] as const) {
    if (/translateDirection\([^)]*\bsource:\s*script\b/s.test(fonte)) {
      failures.push(
        `tradução: o roteiro passou pelo tradutor em ${arquivo}. O roteiro é FALA: sai pela boca do ` +
          "avatar, e traduzi-lo troca o idioma do vídeo entregue. Só a direção de cena atravessa — ela " +
          "é instrução, e ninguém a ouve.",
      );
    }
  }
  // O corpo enviado ao fornecedor troca `motionPrompt`, e só ele.
  if (!/scene:\s*\{\s*\.\.\.scene,\s*motionPrompt:\s*motionPromptEn/.test(rota)) {
    failures.push(
      `tradução: a rota deixou de trocar SÓ a direção na cena enviada ao fornecedor. É esse ponto que ` +
        "separa os dois caminhos: a linha gravada guarda o texto do usuário, o payload leva o inglês.",
    );
  }
  // A tradução acontece ANTES do débito. Se ela descer para depois, falhar
  // passa a exigir estorno — uma janela a mais para errar, com dinheiro dentro.
  const posTraducao = rota.indexOf("await translateDirection(");
  const posDebito = rota.indexOf("const debit = await debitCredit(");
  if (posTraducao < 0 || posDebito < 0 || posTraducao > posDebito) {
    failures.push(
      "tradução: ela deixou de acontecer ANTES do débito. Traduzir depois obriga a estornar quando o " +
        "modelo falha, e estorno só vale antes do aceite do fornecedor — falhar antes custa zero por " +
        "construção, sem nada a desfazer.",
    );
  }

  notes.push(
    `tradução: ${casos.length} decisões de gatilho conferidas (default falha fechado), caminho inglês ` +
      "provado sem tocar a rede, falha do modelo provada RECUSANDO, véu exercitado na função que " +
      "serializa para o tenant, e o roteiro conferido fora do tradutor nos dois arquivos",
  );
  return { failures, notes };
}
