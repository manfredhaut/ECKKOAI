/**
 * DUAS PROPRIEDADES DE UM VENDOR NOVO NO CATÁLOGO, e as duas são sobre a chave
 * dele não sair de onde deveria ficar.
 *
 * ---------------------------------------------------------------------------
 * G-a · NENHUM VENDOR SEM SONDA ALCANÇA UM `fetch` NO CAMINHO DE TESTE
 *
 * `checkAvatarConnection` decide por TERNÁRIO:
 *
 *     return vendor === "did" ? checkDidConnection(apiKey) : checkHeygenConnection(apiKey);
 *
 * Um ternário não tem ramo "nenhum dos dois". Todo vendor de `avatar` que não
 * seja `did` cai no `else` e vai bater na HeyGen — e o que viaja no
 * `x-api-key` é a chave EM CLARO do vendor errado. Enquanto o catálogo tinha
 * dois vendors isso era invisível; com `fal` dentro, clicar em "Testar" passou
 * a ser um vazamento de credencial acionado por um botão que promete o
 * contrário.
 *
 * A guarda tem DUAS pernas porque uma só não fecha:
 *
 *  1. EXECUTA `hasConnectionProbe` contra o catálogo inteiro e exige que todo
 *     vendor que o ternário não atende esteja FORA da lista de sondas. Isto é
 *     a propriedade, e ela é avaliada — não casada por texto.
 *  2. Lê o handler da rota de teste e exige que a recusa venha ANTES do
 *     `decrypt`. Uma trava depois da decifragem já teria posto a chave em
 *     claro numa variável no mesmo escopo do `fetch`; a ordem é metade da
 *     propriedade, e só o texto a mostra.
 *
 * A âncora da perna 2 é INTRÍNSECA: o recorte vai do nome da rota
 * (`/test"`) até a chamada que gasta rede (`checkAvatarConnection`), nunca um
 * wrapper de layout ou um `try` — a lição do Gap 1b, onde `</Field>` como fim
 * fazia o recorte vazar para o bloco seguinte e a guarda acusar o vizinho.
 *
 * ---------------------------------------------------------------------------
 * G-b · A CHAVE DA fal É REDIGIDA NO LOG, NAS DUAS METADES
 *
 * A forma é `<uuid>:<hex>`, sem prefixo. MEDIDO em 12/08, contra o redator de
 * então:
 *
 *   · `uuid:32hex` → passava INTEIRA, em claro;
 *   · `uuid:64hex` → saía `uuid:***REDACTED***` — só a metade hex.
 *
 * Nenhum dos dois era coberto: o padrão genérico `opaco` exige 40+ caracteres
 * contíguos, o uuid tem 36, o hex de 32 tem 32, e o `:` corta o match. Meio
 * segredo num log é o que se vaza sem perceber — o `id` sozinho identifica a
 * credencial, e o hex sozinho é a senha.
 *
 * Esta guarda CHAMA `redactText` com as duas formas medidas. Casar o texto da
 * expressão regular provaria que alguém escreveu uma regex, não que ela redige
 * — e foi exatamente esse o defeito do LIVE-2 que originou o arnês.
 * ---------------------------------------------------------------------------
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de um arquivo, quatro
 * chamadas a uma função pura e uma varredura do catálogo.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";
import { redactText } from "../services/log/safeLog.js";
import {
  VENDORS_BY_PROVIDER,
  hasConnectionProbe,
} from "../services/providers/vendorCatalog.js";
import type { CredentialProvider } from "../types.js";

const ROTA_DE_TESTE = "backend/src/routes/adminPanel.ts";
const DESPACHO_DE_SONDA = "backend/src/services/providers/avatarProvider.ts";

/**
 * Os vendors que o ternário de `checkAvatarConnection` REALMENTE atende.
 *
 * Transcrito da linha que decide, e não deduzido do catálogo: é a divergência
 * entre esta lista e o catálogo que a guarda existe para pegar.
 */
const ATENDIDOS_PELO_DESPACHO: Readonly<Record<CredentialProvider, readonly string[]>> = {
  script: ["anthropic", "gemini", "openai"],
  avatar: ["heygen", "did"],
  voice: ["elevenlabs"],
};

/**
 * Os dois blocos do handler de teste, transcritos para o mutante que TROCA a
 * ordem deles.
 *
 * Trocar, e não apagar: apagar a trava faria a guarda reprovar por
 * "não chama `hasConnectionProbe`", que é o defeito do mutante óbvio e já está
 * coberto. O que este exercita é a outra metade da propriedade — a chave em
 * claro não pode existir antes da recusa —, e ela só se perde com a trava
 * presente, funcionando, e no lugar errado.
 */
const BLOCO_TRAVA =
  "      if (!hasConnectionProbe(provider, vendor)) {\n" +
  "        return reply.code(400).send({\n" +
  '          error: "probe_unavailable",\n' +
  "          message:\n" +
  '            `No connection probe exists for vendor "${vendor}". The key was NOT sent anywhere — ` +\n' +
  '            "testing it would have to guess a provider, and guessing means handing the key to the " +\n' +
  '            "wrong one.",\n' +
  "        });\n" +
  "      }";

const BLOCO_DECRYPT =
  "      let apiKey: string;\n" +
  "      try {\n" +
  "        apiKey = decrypt(credential.encrypted_key);\n" +
  "      } catch {\n" +
  "        // A key encrypted under a different ENCRYPTION_KEY can't be read\n" +
  "        // back — surface it as a failed test instead of a 500.\n" +
  '        return { ok: false, message: "Stored key could not be decrypted (ENCRYPTION_KEY mismatch?)." };\n' +
  "      }";

export const MUTANTS: Mutant[] = [
  {
    guard: "vendor sem sonda não alcança a rede no teste de credencial",
    name: "a trava da rota some e o ternário volta a decidir sozinho",
    kind: "obvio",
    // O defeito literal: `hasConnectionProbe` passa a dizer sim para todo
    // mundo. A trava continua escrita na rota, continua sendo chamada, e não
    // barra ninguém — a forma mais comum de uma proteção morrer.
    file: "backend/src/services/providers/vendorCatalog.ts",
    find: "  return VENDORS_WITH_CONNECTION_PROBE[provider].includes(vendor);",
    replace: "  return true;",
    expect: "alcançaria a rede no teste de credencial",
  },
  {
    guard: "vendor sem sonda não alcança a rede no teste de credencial",
    name: "fal entra na lista de sondas sem ganhar uma",
    kind: "esperto",
    // ESPERTO porque tudo continua no lugar: a função existe, a rota a chama,
    // a tela desabilita quem a lista diz que não tem sonda. Só que a lista
    // passou a mentir, e mentir aqui manda a chave da fal para a HeyGen. Uma
    // guarda que só verificasse "a trava é chamada" ficaria verde.
    file: "backend/src/services/providers/vendorCatalog.ts",
    // CONTEXTO ÚNICO, e a segunda vez que este `find` precisa dele. Antes ele
    // era só as três linhas do objeto — e desde o B2 existe uma SEGUNDA lista
    // com exatamente o mesmo corpo (`VENDORS_WITH_GENERATION_PATH`), o que fez
    // o trecho casar 2× e o mutante virar ERRO no meio da passada. A linha do
    // `export` é o que distingue as duas; apagar a lista nova do produto para
    // desambiguar seria trocar uma proteção por um `find` mais curto.
    find:
      "export const VENDORS_WITH_CONNECTION_PROBE: Readonly<Record<CredentialProvider, readonly string[]>> = {\n" +
      '  script: ["anthropic", "gemini", "openai"],\n' +
      '  avatar: ["heygen", "did"],',
    replace:
      "export const VENDORS_WITH_CONNECTION_PROBE: Readonly<Record<CredentialProvider, readonly string[]>> = {\n" +
      '  script: ["anthropic", "gemini", "openai"],\n' +
      '  avatar: ["heygen", "did", "fal"],',
    expect: "alcançaria a rede no teste de credencial",
  },
  {
    guard: "vendor sem sonda não alcança a rede no teste de credencial",
    name: "a recusa desce para depois da decifragem",
    kind: "esperto",
    // A trava continua existindo e continua recusando — só que a chave já foi
    // decifrada quando ela age. O teste continua falhando para a fal, a tela
    // continua igual, e mesmo assim a propriedade "a chave em claro não chega a
    // existir para um vendor sem sonda" foi perdida.
    // O mutante COMPILA — é a exigência do arnês. Ele só troca a ordem dos dois
    // blocos: a recusa continua idêntica, o `decrypt` continua idêntico, e o
    // gate só pode reprovar pela guarda, nunca pelo `tsc`.
    file: ROTA_DE_TESTE,
    find: BLOCO_TRAVA + "\n\n" + BLOCO_DECRYPT,
    replace: BLOCO_DECRYPT + "\n\n" + BLOCO_TRAVA,
    expect: "a recusa de vendor sem sonda não vem antes de `decrypt`",
  },
  {
    guard: "a chave da fal é redigida no log, nas duas metades",
    name: "o padrão da fal some da lista de formas",
    kind: "obvio",
    file: "backend/src/services/log/safeLog.ts",
    find:
      '  { nome: "fal", re: /\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,}\\b/gi },',
    replace: "",
    expect: "a chave da fal apareceu no log",
  },
  {
    guard: "a chave da fal é redigida no log, nas duas metades",
    name: "o padrão volta a exigir o comprimento que o genérico já exigia",
    kind: "esperto",
    // ESPERTO e realista: alguém "alinha" o número com o padrão `opaco` e o
    // `{32,}` vira `{40,}`. A forma de 64 hex continua redigida, o log de um
    // teste com ela continua limpo, e a de 32 — a que foi MEDIDA passando
    // inteira — volta a vazar. É a regressão que passa despercebida porque
    // metade dos casos continua funcionando.
    file: "backend/src/services/log/safeLog.ts",
    find: "[0-9a-f]{12}:[0-9a-f]{32,}\\b/gi }",
    replace: "[0-9a-f]{12}:[0-9a-f]{40,}\\b/gi }",
    expect: "a chave da fal apareceu no log",
  },
  {
    guard: "a chave da fal é redigida no log, nas duas metades",
    name: "uma chave que NÃO é da fal continua legível (contraponto)",
    kind: "esperto",
    expectGreen: true,
    // Sem este contraponto, um redator que apagasse toda string passaria nos
    // dois mutantes acima sem distinguir nada. Aqui o padrão é alargado para
    // aceitar qualquer separador; a guarda tem de continuar verde, porque o
    // que ela afirma é que a chave da fal É redigida — não que o log inteiro
    // vira asterisco.
    file: "backend/src/services/log/safeLog.ts",
    find: "[0-9a-f]{12}:[0-9a-f]{32,}\\b/gi }",
    replace: "[0-9a-f]{12}[:.][0-9a-f]{32,}\\b/gi }",
    expect: "fal: as duas formas medidas da chave são redigidas",
  },
];

export interface VendorProbeResult {
  failures: string[];
  notes: string[];
}

/**
 * As duas formas MEDIDAS da chave da fal, com o material sintético escolhido
 * para ser reconhecível na saída: se alguma delas escapar, o pedaço aparece no
 * texto da falha e diz qual escapou.
 */
const CHAVES_FAL = [
  {
    rotulo: "uuid:32hex",
    valor: "aa11bb22-cc33-dd44-ee55-ff6677889900:0123456789abcdef0123456789abcdef",
  },
  {
    rotulo: "uuid:64hex",
    valor:
      "aa11bb22-cc33-dd44-ee55-ff6677889900:" +
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
] as const;

/** Um texto que NÃO é chave da fal e tem de continuar legível. */
const NAO_E_CHAVE = "video 8e7941d1 entregue em 36,9876 s pelo avatar 7557957c";

export function checkVendorProbePolicy(repoRoot: string): VendorProbeResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // G-a, perna 1: o catálogo contra o que o despacho atende. AVALIADO.
  // ---------------------------------------------------------------------------
  let semSonda = 0;
  for (const provider of Object.keys(VENDORS_BY_PROVIDER) as CredentialProvider[]) {
    for (const vendor of VENDORS_BY_PROVIDER[provider]) {
      const atendido = ATENDIDOS_PELO_DESPACHO[provider].includes(vendor);
      const declarado = hasConnectionProbe(provider, vendor);

      if (declarado && !atendido) {
        failures.push(
          `vendor sem sonda: \`${vendor}\` (${provider}) está declarado com sonda de conexão, mas o ` +
            "despacho não o atende — ele alcançaria a rede no teste de credencial pelo ramo `else`, " +
            "que aponta para OUTRO fornecedor. O que viaja nessa chamada é a chave em claro do vendor " +
            "errado.",
        );
      }
      if (!declarado && atendido) {
        failures.push(
          `vendor sem sonda: \`${vendor}\` (${provider}) TEM sonda no despacho e está fora da lista — ` +
            "o botão Testar ficaria desabilitado para um vendor que funciona. Não vaza nada, e é " +
            "igualmente errado: a lista deixou de descrever o código.",
        );
      }
      if (!declarado) semSonda += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // G-a, perna 2: a recusa vem ANTES do `decrypt`. Recorte com âncora
  // intrínseca — do nome da rota até a chamada que gasta rede.
  // ---------------------------------------------------------------------------
  const rota = readFileSync(path.join(repoRoot, ROTA_DE_TESTE), "utf-8").replace(/\r\n/g, "\n");
  const inicio = rota.indexOf('/test",');
  const fim = rota.indexOf("checkAvatarConnection(", inicio);

  if (inicio < 0 || fim < 0) {
    failures.push(
      `vendor sem sonda: não achei o handler de \`POST …/credentials/:provider/test\` em ` +
        `${ROTA_DE_TESTE} pelas âncoras \`/test",\` e \`checkAvatarConnection(\`. A guarda não pode ` +
        "opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const trecho = rota.slice(inicio, fim);

    // Rede anti-vazamento: se o recorte engoliu a rota VIZINHA (a de gravar a
    // chave), a ordem medida abaixo seria a de outro handler.
    if (trecho.includes("INSERT INTO api_credentials")) {
      failures.push(
        "vendor sem sonda: o recorte do handler de teste engoliu a rota de GRAVAÇÃO da credencial — " +
          "a âncora vazou, e a ordem conferida abaixo seria a do handler errado.",
      );
    }

    const posTrava = trecho.indexOf("hasConnectionProbe(");
    const posDecrypt = trecho.indexOf("decrypt(");

    if (posTrava < 0) {
      failures.push(
        `vendor sem sonda: o handler de teste em ${ROTA_DE_TESTE} não chama \`hasConnectionProbe\` — ` +
          "sem essa recusa, um vendor sem sonda alcançaria a rede no teste de credencial pelo ramo " +
          "`else` do ternário.",
      );
    } else if (posDecrypt >= 0 && posTrava > posDecrypt) {
      failures.push(
        "vendor sem sonda: a recusa de vendor sem sonda não vem antes de `decrypt` no handler de " +
          "teste. A chave em claro passa a existir no mesmo escopo do `fetch` antes de alguém " +
          "decidir que ela não deveria ir a lugar nenhum.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-b: a redação, EXECUTADA sobre as duas formas medidas.
  // ---------------------------------------------------------------------------
  for (const { rotulo, valor } of CHAVES_FAL) {
    const [id, segredo] = valor.split(":");
    const redigido = redactText(`fal auth falhou para a chave ${valor} ao chamar o fornecedor`);

    if (redigido.includes(id) || redigido.includes(segredo)) {
      const qual = redigido.includes(id)
        ? redigido.includes(segredo)
          ? "as DUAS metades"
          : "a metade do id"
        : "a metade do segredo";
      failures.push(
        `a chave da fal apareceu no log — forma ${rotulo}, ${qual} sobreviveu à redação. Saída: ` +
          `"${redigido}". O id sozinho já identifica a credencial e o segredo sozinho é a senha: ` +
          "meia chave redigida é meia chave publicada.",
      );
    }
  }

  const controle = redactText(NAO_E_CHAVE);
  if (controle !== NAO_E_CHAVE) {
    failures.push(
      `fal: o CONTROLE foi redigido — "${NAO_E_CHAVE}" virou "${controle}". Uma redação que apaga ` +
        "texto comum passaria nos casos de chave sem distinguir nada, e tornaria o log inútil " +
        "exatamente quando ele é preciso.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `vendor sem sonda: ${semSonda} vendor(es) do catálogo sem sonda declarada; a recusa vem antes ` +
        "de `decrypt` no handler de teste, e nenhum vendor declarado com sonda fica fora do despacho.",
    );
    notes.push(
      "fal: as duas formas medidas da chave são redigidas (uuid:32hex e uuid:64hex), e o controle " +
        "sem chave nenhuma passa intacto.",
    );
  }

  return { failures, notes };
}
