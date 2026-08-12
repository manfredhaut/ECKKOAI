/**
 * Invariante do LOG-1: toda chamada a fornecedor registra a resposta bruta.
 *
 * O defeito congelado aqui é de OMISSÃO, e por isso sobreviveu a um bloco
 * inteiro dedicado ao assunto: o LOG-1 pôs a captura dentro do `fetchJson()`
 * do `avatarProvider`, e ninguém notou que `voiceProvider` não usa esse
 * caminho. Resultado medido na passada live do LIVE-1: a geração registrou
 * consumo de voz em `provider_usage` e produziu ZERO eventos
 * `vendor_response` de voz. Os dois caminhos que gastam dinheiro no
 * ElevenLabs — clonar e sintetizar — eram exatamente os sem rastro.
 *
 * A checagem é textual e por função, como a de `isFixtureMode()`: o que se
 * barra é o esquecimento (função nova que faz `fetch` e não registra), não
 * quem queira burlar. Ao contrário daquela, porém, esta NÃO tenta adivinhar
 * quais funções "alcançam" o fornecedor — o filtro esperto foi justamente o
 * que deixou `pollVideoJob` e `checkAvatarConnection` de fora lá. Aqui a regra
 * é simples e cega: **quem chama `fetch(` registra**.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

/**
 * Os dois "espertos" aqui são os defeitos REAIS que esta guarda teve, e é por
 * isso que eles estão congelados: os dois passaram verde quando descobertos.
 */
export const MUTANTS: Mutant[] = [
  {
    guard: "log de vendor",
    name: "função com fetch deixa de registrar",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find: `const data = await fetchJson(res, "HeyGen", "heygen.uploadAsset");`,
    replace: `const data = (await res.json()) as any;`,
    expect: "heygenUploadAsset() chama fetch() sem registrar",
  },
  {
    guard: "log de vendor",
    name: "helper esvaziado, chamada intacta",
    kind: "esperto",
    file: "backend/src/services/providers/voiceProvider.ts",
    find: `  logVendorResponse({ context, vendor: "ElevenLabs", status: res.status, res, rawBody });\n`,
    replace: "",
    expect: "é aceito como prova de registro, mas ele mesmo não chama",
  },
  {
    guard: "log de vendor",
    name: "elisão esvaziada, palavra viva no comentário",
    kind: "esperto",
    file: "backend/src/services/providers/vendorResponseLog.ts",
    find: `const ELIDE_KEY_PATTERN = /^(audio_base64|audio|alignment|normalized_alignment)$/i;`,
    replace: `const ELIDE_KEY_PATTERN = /^(nada_a_elidir)$/i;`,
    expect: `ELIDE_KEY_PATTERN não cobre mais "audio_base64"`,
  },
  {
    guard: "log de vendor",
    name: "teto de bytes por campo desativado",
    kind: "esperto",
    file: "backend/src/services/providers/vendorResponseLog.ts",
    find: "const MAX_FIELD_BYTES = 2048;",
    replace: "const MAX_FIELD_BYTES = Number.POSITIVE_INFINITY;",
    expect: "MAX_FIELD_BYTES",
  },
];

export interface VendorLogCheckResult {
  failures: string[];
  notes: string[];
}

/** Módulos que falam com fornecedor. Todo `fetch(` aqui precisa registrar. */
const VENDOR_MODULES = [
  "backend/src/services/providers/avatarProvider.ts",
  "backend/src/services/providers/voiceProvider.ts",
  // O cliente da fal entra na lista no mesmo bloco em que nasce. Ficar de fora
  // é exatamente o que aconteceu com `voiceProvider` — o LOG-1 pôs a captura
  // dentro do `fetchJson` do avatarProvider e os dois caminhos que gastam
  // dinheiro no ElevenLabs foram os únicos sem rastro.
  "backend/src/services/providers/falClient.ts",
];

/**
 * Formas aceitas de registrar. As duas primeiras são helpers que registram
 * por dentro; as duas últimas, a chamada direta.
 */
const LOGGING_CALLS = [
  "fetchJson(",
  "readVoiceJson(",
  "falFetchJson(",
  "logVendorResponse(",
  "logVendorBinaryResponse(",
];

/**
 * Helpers que a lista acima aceita como prova de registro, e que por isso
 * precisam eles mesmos registrar.
 *
 * Esta verificação existe porque a PRIMEIRA versão desta guarda não a tinha, e
 * o buraco apareceu na hora de provar que ela reprovava: removi o
 * `logVendorResponse` de dentro de `readVoiceJson` e o check passou verde.
 * Quem chama o helper continuava casando o nome dele, enquanto o helper já não
 * registrava mais nada. Confiar no nome de uma função sem olhar o corpo é
 * cobertura aparente — o mesmo defeito que a guarda de feature flags teve.
 */
const LOGGING_HELPERS = ["fetchJson", "readVoiceJson", "falFetchJson"];

/** O que conta como registrar de fato. */
const LOG_PRIMITIVES = ["logVendorResponse(", "logVendorBinaryResponse("];

/**
 * Funções que fazem `fetch` e comprovadamente NÃO devem registrar.
 *
 * Vazia hoje. Existe para que uma exceção futura seja uma decisão escrita — a
 * mesma razão de `DEBIT_WITHOUT_REFUND_ALLOWED` em checkRefundPolicy.ts.
 */
const FETCH_WITHOUT_LOG_ALLOWED: readonly string[] = [];

export async function checkVendorLogPolicy(repoRoot: string): Promise<VendorLogCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  let fetchers = 0;
  let helpersSeen = 0;

  for (const rel of VENDOR_MODULES) {
    let content: string;
    try {
      content = await readFile(path.join(repoRoot, rel), "utf-8");
    } catch {
      failures.push(`log de vendor: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      continue;
    }

    // Comentários fora antes de procurar: esta guarda já custou duas correções
    // neste projeto por acusar o próprio texto que a explicava.
    const code = stripComments(content);
    const funcs = splitFunctions(code);

    if (funcs.length === 0) {
      failures.push(`log de vendor: nenhuma função encontrada em ${rel} — o verificador ficou cego.`);
      continue;
    }

    // Os helpers primeiro: se um deles parou de registrar, todo mundo que
    // confia nele está descoberto, e a mensagem tem de apontar para a causa e
    // não para os treze sintomas.
    for (const fn of funcs) {
      if (!LOGGING_HELPERS.includes(fn.name)) continue;
      helpersSeen += 1;
      if (!LOG_PRIMITIVES.some((call) => fn.body.includes(call))) {
        failures.push(
          `log de vendor: ${rel} → ${fn.name}() é aceito como prova de registro, mas ele mesmo não chama ` +
            "logVendorResponse/logVendorBinaryResponse. Toda função que depende dele passa a não registrar " +
            "nada, sem que nenhuma delas mude — é o buraco que esta guarda teve na primeira versão.",
        );
      }
    }

    for (const fn of funcs) {
      if (!/\bfetch\(/.test(fn.body)) continue;
      fetchers += 1;

      if (FETCH_WITHOUT_LOG_ALLOWED.includes(`${rel}:${fn.name}`)) continue;

      if (!LOGGING_CALLS.some((call) => fn.body.includes(call))) {
        failures.push(
          `log de vendor: ${rel} → ${fn.name}() chama fetch() sem registrar a resposta bruta. ` +
            "Toda resposta de fornecedor vai ao log ANTES de qualquer parsing — é o que permite " +
            "recuperar um id perdido depois de o fornecedor já ter cobrado. Use fetchJson/readVoiceJson, " +
            "ou logVendorResponse/logVendorBinaryResponse se o corpo for lido à mão.",
        );
      }
    }
  }

  // Uma guarda que deixou de casar com o código passa verde sem inspecionar
  // nada — foi o que aconteceu com a de feature flags, que procurava um helper
  // inexistente. Se nenhum fetch for encontrado, o defeito é do verificador.
  if (fetchers === 0) {
    failures.push(
      "log de vendor: nenhuma função com fetch() encontrada nos módulos de vendor — " +
        "o verificador deixou de casar com o código e passaria verde sem olhar nada.",
    );
  }
  if (helpersSeen !== LOGGING_HELPERS.length) {
    failures.push(
      `log de vendor: esperava encontrar ${LOGGING_HELPERS.length} helper(s) de registro ` +
        `(${LOGGING_HELPERS.join(", ")}) e encontrei ${helpersSeen}. Se um foi renomeado, a lista ` +
        "LOGGING_CALLS passa a aceitar um nome que não existe mais — e aceitar um nome inexistente " +
        "é aceitar qualquer coisa.",
    );
  }

  // O guardrail de volume: o áudio não pode ir para o log. Verificado no
  // módulo de log, e não por inspeção de chamada, porque é ali que a decisão
  // mora — se a elisão sumir, todo caminho de voz volta a despejar mp3 em
  // base64 no log, e nenhum teste de fluxo perceberia.
  const logModule = "backend/src/services/providers/vendorResponseLog.ts";
  try {
    // Comentários fora ANTES de procurar, e a busca ancorada na constante —
    // não no arquivo inteiro. A primeira versão desta verificação procurava
    // "audio_base64" em qualquer lugar do fonte, e por isso continuou verde
    // depois de eu esvaziar a constante: a palavra seguia no comentário que
    // explica a elisão. Guarda satisfeita por um comentário é pior que guarda
    // nenhuma, porque a prova de que ela funciona também passa.
    const src = stripComments(await readFile(path.join(repoRoot, logModule), "utf-8"));
    const elideConst = /const\s+ELIDE_KEY_PATTERN\s*=\s*(.+)/.exec(src);
    if (!elideConst) {
      failures.push(
        `log de vendor: ${logModule} não define mais ELIDE_KEY_PATTERN. Sem ela, todo corpo JSON com ` +
          "áudio embutido vai inteiro para o log.",
      );
    } else if (!/audio_base64/.test(elideConst[1])) {
      failures.push(
        `log de vendor: ELIDE_KEY_PATTERN não cobre mais "audio_base64" (valor atual: ${elideConst[1].trim()}). ` +
          "Uma fala de 3 segundos são ~50 KB de base64 por geração indo para o log, onde ninguém consegue " +
          "lê-los e onde não deveriam estar.",
      );
    }
    // A retaguarda por tamanho é o que protege quando a lista de nomes erra —
    // e a lista É suposição, nenhum daqueles campos foi visto numa resposta
    // real. Um teto infinito desliga a retaguarda sem apagar uma linha sequer.
    const tetoConst = /const\s+MAX_FIELD_BYTES\s*=\s*(.+)/.exec(src);
    if (!tetoConst) {
      failures.push(
        `log de vendor: ${logModule} não define mais MAX_FIELD_BYTES. Sem teto por tamanho, a elisão ` +
          "depende de acertar o NOME do campo — e os nomes de hoje são suposição tirada da documentação.",
      );
    } else {
      const valor = Number(tetoConst[1].replace(/[^0-9_]/g, "").replace(/_/g, ""));
      if (!Number.isFinite(valor) || valor <= 0 || valor > 16_384) {
        failures.push(
          `log de vendor: MAX_FIELD_BYTES = ${tetoConst[1].trim()} não protege nada. O maior campo ` +
            "legítimo observado numa resposta real tem 519 caracteres; um teto ausente, infinito ou " +
            "grande demais deixa payload inteiro entrar no log.",
        );
      }
    }
    if (!/logVendorBinaryResponse/.test(src)) {
      failures.push(
        `log de vendor: ${logModule} perdeu logVendorBinaryResponse. Sem ela, um corpo binário ` +
          "(o mp3 do endpoint simples de TTS) só pode ser registrado despejando os bytes.",
      );
    }
  } catch {
    failures.push(`log de vendor: não consegui ler ${logModule}.`);
  }

  notes.push(
    `log de vendor: ${fetchers} função(ões) com fetch() nos módulos de vendor — todas registram a resposta bruta`,
  );
  return { failures, notes };
}

interface NamedFunction {
  name: string;
  body: string;
}

/**
 * Fatia o arquivo em funções — exportadas ou não.
 *
 * As privadas importam tanto quanto as exportadas: `heygenUploadAsset` e
 * `pollHeygenVideo` não são exportadas e são exatamente onde o `fetch` mora.
 */
function splitFunctions(content: string): NamedFunction[] {
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  const starts: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) starts.push({ name: m[1], index: m.index });

  return starts.map((s, i) => ({
    name: s.name,
    body: content.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : content.length),
  }));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
