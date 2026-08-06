/**
 * A DÍVIDA COM PRAZO, e o traje que sumiu do fornecedor.
 *
 * Dois vetores que nasceram da mesma investigação de 06/08 e por isso moram
 * juntos: um traje pago ficou "em preparo" para sempre, a hipótese foi
 * "endpoint da família errada", e a medição respondeu outra coisa.
 *
 * ---------------------------------------------------------------------------
 * 1. NENHUMA CHAMADA v2 FORA DO INVENTÁRIO
 *
 * A HeyGen carimba `will be removed on 2026-10-31` no corpo de toda resposta
 * v2. Não é uma lista de coisas quebradas — é uma lista de coisas que param de
 * responder numa data conhecida. Um comentário não impede que a próxima entre
 * sem ninguém notar; esta guarda impede.
 *
 * A varredura ignora linhas de comentário (as que começam com `*`, `//` ou
 * `/*`), e é de propósito que ela NÃO tente remover comentários de fim de
 * linha: `//` aparece dentro de toda URL `https://`, e um recorte por `//`
 * cortaria justamente as chamadas que se quer enxergar.
 *
 * ---------------------------------------------------------------------------
 * 2. O TRAJE QUE SUMIU PARA DE SER ETERNO
 *
 * MEDIDO: o "TRAJE CASUAL" (`1fa904f6…`) nasceu com 200 e `looks_count: 2`, e
 * depois passou a responder 404 em quatro rotas — `/v2/photo_avatar`,
 * `/v2/avatar/{id}/details`, `/v3/avatars/looks/{id}` e `/v3/avatars/{id}` —
 * sem aparecer na listagem do grupo em nenhuma das duas famílias. O grupo
 * voltou a listar 1 look.
 *
 * O defeito era de VOCABULÁRIO, não de endpoint: o `catch` transformava
 * "o fornecedor diz que isto não existe" em `processing`, o único estado de
 * onde não se sai sozinho. Sete consultas, sete 404, sete vezes "em preparo".
 *
 * Os três vetores aqui são os três lados da mesma decisão, e cada um sozinho
 * seria satisfeito por um erro diferente:
 *   a) 404 depois da carência vira `failed` — senão o traje é eterno;
 *   b) 404 DENTRO da carência continua `processing` — senão um traje que
 *      ainda estava nascendo seria declarado morto;
 *   c) 5xx NUNCA vira `failed` — indisponibilidade não é resposta, e desistir
 *      aí é desistir por conta própria de um dólar que já saiu.
 * ---------------------------------------------------------------------------
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { HEYGEN_V2_SUNSET, LEGACY_V2_ENDPOINTS } from "../services/providers/legacyEndpoints.js";

export interface LegacyEndpointCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "endpoints legados: nenhuma chamada v2 fora do inventário",
    name: "uma chamada v2 volta ao produto por um caminho já declarado",
    kind: "esperto",
    // É a regressão exata que se acabou de consertar, e ela é ESPERTA por dois
    // motivos. Primeiro, continua funcionando: o v2 lê um look v3 com 200 —
    // medido no Jaleco. Nada quebra hoje; o que muda é a data em que quebra.
    // Segundo, `/v2/photo_avatar` ESTÁ no inventário (a sonda o usa de
    // propósito), então uma guarda que só olhasse a lista de caminhos passaria
    // verde. O que a pega é o inventário registrar também o ARQUIVO.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '    const res = await fetch(`${HEYGEN_BASE}/v3/avatars/looks/${encodeURIComponent(providerLookId)}`, {',
    replace: '    const res = await fetch(`${HEYGEN_BASE}/v2/photo_avatar/${encodeURIComponent(providerLookId)}`, {',
    expect: "endpoints legados: chamada a endpoint v2 fora do inventário",
  },
  {
    guard: "endpoints legados: nenhuma chamada v2 fora do inventário",
    name: "um caminho v2 inteiramente novo entra sem ser notado",
    kind: "obvio",
    // O outro modo de escapar: não reaproveitar um nome declarado, e sim
    // acrescentar um endpoint v2 que nunca esteve na lista. É o caso comum de
    // quem lê a doc do fornecedor, acha um exemplo antigo e copia.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    res = await fetch(`${HEYGEN_BASE}/v2/user/remaining_quota`, { headers: { \"x-api-key\": apiKey } });",
    replace: "    res = await fetch(`${HEYGEN_BASE}/v2/talking_photo/list`, { headers: { \"x-api-key\": apiKey } });",
    expect: "endpoints legados: chamada a endpoint v2 fora do inventário",
  },
  {
    guard: "traje: o que sumiu do fornecedor para de ser eterno",
    name: "o traje sumido volta a contar como em preparo",
    kind: "esperto",
    // O estado `vanished` continua existindo, o log continua saindo, a carência
    // continua sendo calculada — e no fim a linha recebe `processing`, que é
    // exatamente de onde ela não sai. O defeito volta inteiro por uma palavra.
    file: "backend/src/services/avatar/looks.ts",
    find: '      atual = { status: "failed", previewImageUrl: null };',
    replace: '      atual = { status: "processing", previewImageUrl: null };',
    expect: "um traje que sumiu do fornecedor continuou em preparo para sempre",
  },
  {
    guard: "traje: o que sumiu do fornecedor para de ser eterno",
    name: "indisponibilidade do fornecedor passa a matar o traje",
    kind: "esperto",
    // O irmão pelo outro lado, e o mais caro dos dois: qualquer 5xx, timeout ou
    // instabilidade de rede passaria a marcar como falho um traje pago que está
    // vivo. A guarda do lado a) sozinha ficaria verde com isto.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    if (err instanceof AvatarProviderError && err.httpStatus === 404) {",
    replace: "    if (err instanceof AvatarProviderError) {",
    expect: "uma indisponibilidade do fornecedor foi tratada como traje inexistente",
  },
];

// ---------------------------------------------------------------- 1 -------

/**
 * A frase que atribui a reprovação a ESTA guarda, comum aos dois modos de
 * escapar do inventário — caminho desconhecido e arquivo não declarado. Sem um
 * marcador único, o mutante mais realista (uma chamada v2 voltando a um arquivo
 * de produto) reprovava pelo texto do outro ramo, e o arnês chamava isso de
 * AMBÍGUO: reprovou, mas não dá para dizer que foi por causa dela.
 */
const FORA_DO_INVENTARIO = "endpoints legados: chamada a endpoint v2 fora do inventário";

const RAIZES = ["backend/src", "frontend/src"];
/** Só esta guarda pode falar de `/v2/` livremente: ela é o inventário em ação. */
const ESTE_ARQUIVO = "backend/src/scripts/checkLegacyEndpointPolicy.ts";
const INVENTARIO = "backend/src/services/providers/legacyEndpoints.ts";

async function arquivosTs(dir: string): Promise<string[]> {
  const saida: string[] = [];
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return saida;
  }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...(await arquivosTs(p)));
    else if (/\.tsx?$/.test(e.name)) saida.push(p);
  }
  return saida;
}

/**
 * O caminho v2 completo, em segmentos. Comparar por prefixo de STRING faria
 * `/v2/avatar` casar com `/v2/avatar_group`, e um endpoint entraria escondido
 * atrás de um nome declarado.
 */
function casaPorSegmento(achado: string, declarado: string): boolean {
  return achado === declarado || achado.startsWith(declarado + "/");
}

async function checarInventario(repoRoot: string, failures: string[], notes: string[]): Promise<void> {
  const encontrados = new Map<string, Set<string>>();

  for (const raiz of RAIZES) {
    for (const abs of await arquivosTs(path.join(repoRoot, raiz))) {
      const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
      if (rel === ESTE_ARQUIVO || rel === INVENTARIO) continue;
      const fonte = await readFile(abs, "utf-8");
      for (const linha of fonte.split("\n")) {
        const t = linha.trim();
        if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
        for (const m of linha.matchAll(/\/v2(?:\/[A-Za-z0-9_]+)+/g)) {
          const achado = m[0];
          if (!encontrados.has(achado)) encontrados.set(achado, new Set());
          encontrados.get(achado)!.add(rel);
        }
      }
    }
  }

  const usados = new Set<string>();
  for (const [achado, arquivos] of encontrados) {
    const entrada = LEGACY_V2_ENDPOINTS.find((e) => casaPorSegmento(achado, e.path));
    if (!entrada) {
      failures.push(
        `${FORA_DO_INVENTARIO} — \`${achado}\` é chamado em ${JSON.stringify([...arquivos])} e não está no ` +
          "inventário de `legacyEndpoints.ts`. A HeyGen remove os endpoints v2 em " +
          `${HEYGEN_V2_SUNSET} — o corpo de toda resposta v2 diz isso — e uma chamada fora do ` +
          "inventário é uma que ninguém decidiu manter: ela funciona hoje, para nessa data, e a " +
          "única testemunha é um `warning` dentro de um corpo que ninguém lê.",
      );
      continue;
    }
    usados.add(entrada.path);
    const foraDaLista = [...arquivos].filter((f) => !entrada.files.includes(f));
    if (foraDaLista.length > 0) {
      failures.push(
        `${FORA_DO_INVENTARIO} — \`${achado}\` apareceu em ${JSON.stringify(foraDaLista)}, que não está ` +
          "entre os arquivos declarados para ele. O inventário registra ONDE cada chamada v2 vive; um " +
          "lugar novo é uma decisão nova, e ela precisa ser escrita junto com o motivo. Um caminho já " +
          `declarado não é salvo-conduto: quem some em ${HEYGEN_V2_SUNSET} é a chamada, não o nome.`,
      );
    }
    const semUso = entrada.files.filter((f) => !arquivos.has(f));
    if (semUso.length > 0) {
      failures.push(
        `endpoints legados: o inventário declara \`${entrada.path}\` em ${JSON.stringify(semUso)} e a ` +
          "chamada não está mais lá. Inventário com entrada morta deixa de ser inventário: na data do " +
          "sunset alguém vai procurar um trabalho que já foi feito e não vai achar o que sobrou.",
      );
    }
  }

  for (const e of LEGACY_V2_ENDPOINTS) {
    if (!usados.has(e.path)) {
      failures.push(
        `endpoints legados: \`${e.path}\` está no inventário e não é chamado em lugar nenhum. ` +
          "Ou a migração terminou e a entrada tem de sair, ou a chamada mudou de forma e a varredura " +
          "deixou de enxergá-la — as duas exigem olhar.",
      );
    }
  }

  if (failures.length === 0) {
    const semSaida = LEGACY_V2_ENDPOINTS.filter((e) => e.replacement === null).map((e) => e.path);
    notes.push(
      `  endpoints legados: ${LEGACY_V2_ENDPOINTS.length} caminho(s) v2 inventariado(s), sunset em ` +
        `${HEYGEN_V2_SUNSET}; sem substituto v3 conhecido: ${JSON.stringify(semSaida)}`,
    );
  }
}

// ---------------------------------------------------------------- 2 -------

type Linha = Record<string, unknown>;

async function checarTrajeSumido(failures: string[], notes: string[]): Promise<void> {
  const { pool } = await import("../db/pool.js");
  const queryReal = pool.query.bind(pool);
  const fetchReal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;

  const { listarLooks } = await import("../services/avatar/looks.js");

  let linha: Linha = {};
  let statusHttp = 404;
  const desconhecidas: string[] = [];

  const responder = async (text: unknown, params?: unknown[]) => {
    const sql = String(text).replace(/\s+/g, " ").trim();
    if (/FROM avatar_looks/i.test(sql)) return { rows: [linha], rowCount: 1 };
    if (/UPDATE avatar_looks/i.test(sql)) {
      linha.status = params?.[2];
      return { rows: [], rowCount: 1 };
    }
    desconhecidas.push(sql.slice(0, 90));
    return { rows: [], rowCount: 0 };
  };
  (pool as unknown as { query: unknown }).query = responder;

  // O corpo é o MEDIDO em 06/08, com o código do fornecedor: `avatar_not_found`
  // no v3 e `photar_not_found` no v2. O que decide aqui é o status HTTP.
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: { code: "avatar_not_found", message: "avatar look not found" } }),
      { status: statusHttp, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  const CRED = { apiKey: "chave-de-verificacao", vendor: "heygen" as const };
  const nova = (idadeMs: number): Linha => ({
    id: "linha-1",
    provider_look_id: "look-sumido",
    name: "TRAJE CASUAL",
    preview_image_url: null,
    status: "processing",
    created_at: new Date(Date.now() - idadeMs),
  });

  try {
    process.env.PROVIDER_MODE = "live";

    // a) sumido HÁ MUITO TEMPO → terminal.
    statusHttp = 404;
    linha = nova(86_400_000); // um dia
    const velho = await listarLooks("t1", "a1", [], CRED);
    if (linha.status !== "failed") {
      failures.push(
        `traje: um traje que o fornecedor não conhece mais há 24 h continuou como \`${String(linha.status)}\`. ` +
          "MEDIDO em 06/08: o \"TRAJE CASUAL\" respondeu 404 em quatro rotas, duas v2 e duas v3, e sumiu da " +
          "listagem do grupo nas duas famílias. Tratar esse 404 como `processing` é o estado de onde não se " +
          "sai: sete consultas, sete 404, sete vezes \"em preparo\" — e a cada abertura da tela o produto " +
          "pergunta de novo, para sempre, por um traje que já foi esquecido.",
      );
    }
    if (velho.looks.some((l) => l.id === "look-sumido")) {
      failures.push("traje: um traje que sumiu do fornecedor apareceu no seletor.");
    }
    if (!velho.pendentes.some((p) => p.id === "look-sumido" && p.status === "failed")) {
      failures.push(
        "traje: o traje desistido sumiu da tela em vez de aparecer como falho. Ele custou 60 unidades " +
          "(US$ 1,00 medidos) e migration 045 já decidiu que dinheiro gasto não desaparece em silêncio.",
      );
    }

    // b) sumido AGORA → ainda em preparo. Sem isto, (a) seria satisfeito por
    //    marcar tudo como falho no primeiro 404, e um traje recém-criado —
    //    justamente o caso comum — nasceria morto.
    statusHttp = 404;
    linha = nova(5_000);
    await listarLooks("t1", "a1", [], CRED);
    if (linha.status !== "processing") {
      failures.push(
        `traje: um traje criado há 5 segundos já foi marcado \`${String(linha.status)}\`. O 404 é ambíguo ` +
          "perto do nascimento — pode ser \"sumiu\" ou \"ainda não apareceu\" — e as conclusões medidas " +
          "levaram 15 s e 50 s. Desistir na primeira consulta declara morto todo traje pago que ainda " +
          "estava vindo.",
      );
    }

    // c) INDISPONIBILIDADE não é resposta.
    statusHttp = 503;
    linha = nova(86_400_000);
    await listarLooks("t1", "a1", [], CRED);
    if (linha.status !== "processing") {
      failures.push(
        `traje: o fornecedor respondeu 503 e o traje foi marcado \`${String(linha.status)}\`. 5xx, timeout ` +
          "e chave recusada são a pergunta não ter sido respondida — só o 404 é o fornecedor dizendo que o " +
          "look não existe. Desistir de um traje pago por instabilidade de rede é desistir por conta " +
          "própria de um dólar que já saiu.",
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
        "  traje: 404 depois da carência vira falho e sai do seletor sem sumir da tela; 404 recente e " +
          "5xx continuam em preparo",
      );
    }
  } finally {
    (pool as unknown as { query: unknown }).query = queryReal;
    globalThis.fetch = fetchReal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }
}

export async function checkLegacyEndpointPolicy(repoRoot: string): Promise<LegacyEndpointCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  await checarInventario(repoRoot, failures, notes);
  await checarTrajeSumido(failures, notes);
  return { failures, notes };
}
