/**
 * OS PREÇOS, LIDOS DA TABELA — W2, 24/08/2026 (migration 065).
 *
 * ┌─ O defeito de DIREÇÃO, e ele é o motivo deste arquivo existir ───────────┐
 * │ `costFor` devolve `known:false` para a fal, e o produto trata ausência   │
 * │ de preço como se fosse BARATO: o teto de US$ 2,00 autorizou uma chamada  │
 * │ de sync-lipsync calculando US$ 0,45 onde o painel cobrou US$ 3,20. O     │
 * │ freio existia e mediu com a régua errada.                                │
 * │                                                                          │
 * │ **DESCONHECIDO É CARO** é a inversão que isto instala: sem preço na      │
 * │ tabela, nada é autorizado sozinho.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Cache de 60 s, invalidado na escrita — mesmo desenho de
 * `platformCredentialStore`, e pelo mesmo motivo: o ponto de editar preço sem
 * deploy é que a mudança valha sem reiniciar nada.
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";

export type UnidadeDePreco = "per_second" | "per_call" | "per_audio_second";
export type OrigemDePreco = "PAINEL" | "DOC" | "DEDUZIDO";

export interface PrecoDeEndpoint {
  endpointId: string;
  vendor: string;
  usd: number;
  unidade: UnidadeDePreco;
  origem: OrigemDePreco;
  medidoEm: string;
  /** `false` = TOTAL de período, não preço de uma chamada. Ver `precoConfiavel`. */
  unitario: boolean;
  nota: string | null;
}

/**
 * Depois de quantos dias um preço passa a ser AVISADO como velho — W2 item 4.
 *
 * 30 dias, e o número é do operador. Não é o prazo em que o fornecedor muda
 * de preço (isso ninguém sabe): é o prazo depois do qual afirmar um preço sem
 * reconferir deixa de ser honesto.
 */
export const DIAS_ATE_ENVELHECER = 30;

const CACHE_TTL_MS = 60_000;
let cache: { precos: Map<string, PrecoDeEndpoint>; em: number } | null = null;

export function invalidarCacheDePrecos(): void {
  cache = null;
}

async function carregar(): Promise<Map<string, PrecoDeEndpoint>> {
  if (cache && Date.now() - cache.em < CACHE_TTL_MS) return cache.precos;

  const { rows } = await pool.query<{
    endpoint_id: string;
    vendor: string;
    usd: string;
    unidade: UnidadeDePreco;
    origem: OrigemDePreco;
    medido_em: Date | string;
    unitario: boolean;
    nota: string | null;
  }>("SELECT endpoint_id, vendor, usd, unidade, origem, medido_em, unitario, nota FROM provider_prices");

  const precos = new Map<string, PrecoDeEndpoint>();
  for (const r of rows) {
    precos.set(r.endpoint_id, {
      endpointId: r.endpoint_id,
      vendor: r.vendor,
      // `numeric` chega como STRING no driver — somar sem converter
      // concatenaria em silêncio.
      usd: Number(r.usd),
      unidade: r.unidade,
      origem: r.origem,
      medidoEm: typeof r.medido_em === "string" ? r.medido_em : r.medido_em.toISOString().slice(0, 10),
      unitario: r.unitario,
      nota: r.nota,
    });
  }
  cache = { precos, em: Date.now() };
  return precos;
}

export async function precoDe(endpointId: string): Promise<PrecoDeEndpoint | null> {
  return (await carregar()).get(endpointId) ?? null;
}

export async function todosOsPrecos(): Promise<PrecoDeEndpoint[]> {
  return [...(await carregar()).values()];
}

/** Quantos dias desde a medição. `hoje` é injetável para a guarda não depender do relógio. */
export function idadeEmDias(preco: PrecoDeEndpoint, hoje = new Date()): number {
  const medido = new Date(`${preco.medidoEm}T00:00:00Z`);
  return Math.floor((hoje.getTime() - medido.getTime()) / 86_400_000);
}

export function estaVelho(preco: PrecoDeEndpoint, hoje = new Date()): boolean {
  return idadeEmDias(preco, hoje) > DIAS_ATE_ENVELHECER;
}

/**
 * Este preço pode AUTORIZAR um gasto sozinho? — W2 item 3.
 *
 * ┌─ Por que `unitario` é a linha divisória ─────────────────────────────────┐
 * │ Um TOTAL de período não responde "quanto custa esta chamada". US$ 3,20   │
 * │ em duas chamadas pode ser 1,60 + 1,60 ou 3,15 + 0,05 — e a diferença     │
 * │ decide se o teto libera ou barra. Autorizar com um agregado é o mesmo    │
 * │ erro de direção que o W2 veio consertar, com um número diferente.        │
 * │                                                                          │
 * │ Agregado ALERTA (o operador vê o número e a nota) mas não autoriza: o    │
 * │ caminho pede confirmação, como o desconhecido.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function precoConfiavel(preco: PrecoDeEndpoint | null): boolean {
  return preco !== null && preco.unitario;
}

export interface VeredictoDeCusto {
  /** `true` = dá para calcular e autorizar sem perguntar a ninguém. */
  autorizavel: boolean;
  usd: number | null;
  motivo: string;
  preco: PrecoDeEndpoint | null;
}

/**
 * Quanto custa `quantidade` unidades deste endpoint, e se isso AUTORIZA.
 *
 * As três respostas possíveis, e nenhuma delas é zero:
 *  · preço unitário → valor calculado, autorizável;
 *  · preço agregado → valor calculado, NÃO autorizável (a nota explica);
 *  · sem preço → `usd: null`, não autorizável, "custo desconhecido".
 *
 * **Nunca devolve `usd: 0` para ausência.** Zero soma como se a chamada fosse
 * de graça, e foi tratar ausência como barato que autorizou os US$ 3,20.
 */
export async function custoDe(endpointId: string, quantidade: number): Promise<VeredictoDeCusto> {
  const preco = await precoDe(endpointId);
  if (!preco) {
    return {
      autorizavel: false,
      usd: null,
      preco: null,
      motivo:
        `custo desconhecido: \`${endpointId}\` não está em \`provider_prices\`. Endpoint sem preço não ` +
        "é autorizado sozinho — cadastre o preço no painel ou confirme explicitamente.",
    };
  }

  const usd = preco.unidade === "per_call" ? preco.usd : preco.usd * quantidade;

  if (!preco.unitario) {
    return {
      autorizavel: false,
      usd,
      preco,
      motivo:
        `o preço de \`${endpointId}\` é um TOTAL de período (US$ ${preco.usd}), não o custo de uma ` +
        `chamada. ${preco.nota ?? ""} Serve para alertar, não para autorizar.`,
    };
  }

  if (estaVelho(preco)) {
    // VELHO ainda autoriza — mas avisa. Recusar por idade travaria o produto
    // por um preço que provavelmente continua certo; calar seria afirmar sem
    // reconferir. O aviso vai ao log e à tela.
    logEvent("warn", "preco_velho", {
      endpointId,
      medidoEm: preco.medidoEm,
      idadeEmDias: idadeEmDias(preco),
      origem: preco.origem,
    });
    return {
      autorizavel: true,
      usd,
      preco,
      motivo:
        `preço medido em ${preco.medidoEm} (${idadeEmDias(preco)} dias atrás, acima dos ` +
        `${DIAS_ATE_ENVELHECER} de validade). Continua valendo, mas vale reconferir no painel.`,
    };
  }

  return { autorizavel: true, usd, preco, motivo: `preço de ${preco.medidoEm} (${preco.origem}).` };
}
