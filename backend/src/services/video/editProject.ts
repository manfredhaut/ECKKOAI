/**
 * Studio Movie Edit — lógica pura da aba "5. Studio Movie Edit" (era "5.
 * Editar"). Porte de `uploads/_prova/studio-movie-edit/aba5-editar-splice.html`
 * (protótipo aprovado, modelo de EMENDA), BLOCO STUDIO-EDIT-1.
 *
 * MUDANÇA DE MODELO em relação ao RELATORIO-aba5-edicao.md (28/08), que
 * descrevia CUTAWAY (sobreposição, duração constante) e afirmava "a voz é
 * contínua e não é cortada". O modelo aprovado agora é EMENDA (splice): V1 é
 * uma SEQUÊNCIA de trechos, um b-roll entra como trecho EXCLUSIVO com áudio
 * próprio, a voz é cortada ali, e a duração final CRESCE. Aquele relatório
 * está desatualizado nesse ponto.
 *
 * Trilhas:
 *   V2  sobreposições .... sobre o V1 (nunca sobre um b-roll)
 *   V1  sequência ........ trechos do vídeo gerado + trechos de b-roll exclusivo
 *   A1  voz .............. segmentada: existe sob os trechos de base, cala no b-roll
 *   A2  fundo ............ opcional, contínuo por toda a duração final
 *
 * Duplicado byte-a-byte (exceto comentários de cabeçalho) em
 * `frontend/src/pages/CreateVideo/editProject.ts` — mesma convenção já usada
 * neste projeto para lógica que precisa rodar dos dois lados sem depender de
 * um pacote compartilhado (ver `scriptDuration.ts`, presente em três lugares
 * por razões de isolamento entre pipelines). O backend usa isto para validar
 * e medir a duração ao salvar um projeto (`routes/editProjects.ts`); o
 * frontend usa a MESMA lógica para o monitor, a timeline e o resumo "O que
 * vai ser enviado" ao vivo.
 *
 * `duracaoFinal` MUDOU de assinatura em relação ao antigo EdicaoStep.jsx:
 * não é mais `saida - entrada` de um único vídeo — é a SOMA dos trechos da
 * sequência. Isso é intencional: o modelo mudou de cutaway para emenda.
 */

export const MIN_TRECHO = 0.2;

export interface TrechoBase {
  id: string;
  tipo: "base";
  entrada: number;
  saida: number;
}

/** B-roll: trecho EXCLUSIVO — enquanto ele toca, nada mais do vídeo gerado roda. */
export interface TrechoBroll {
  id: string;
  tipo: "broll";
  nome: string;
  duracao: number;
  /** 0-100. */
  volume: number;
  /**
   * Referência ao arquivo enviado por `POST /tenant/edit-assets`. `null`
   * enquanto nenhum arquivo foi enviado (ou durante o upload).
   *
   * NUNCA uma URL de blob local — ver G3 em `checkStudioMovieEditPolicy.ts`.
   */
  assetId: string | null;
  /** URL de reprodução (`/tenant/edit-assets/{assetId}`), derivada do assetId — nunca gravada no payload. */
  url: string | null;
}

export type Trecho = TrechoBase | TrechoBroll;

// Condicional (não interseção direta) DE PROPÓSITO: `T & {...}` sozinho não
// distribui sobre a união `Trecho` quando instanciado com o tipo default —
// TS mantinha `(TrechoBase | TrechoBroll) & Extra` como uma interseção só,
// e `.filter()`/narrowing por `isBase` parava de enxergar `entrada`/`saida`
// mesmo no ramo correto. `T extends Trecho ? ... : never` força a
// distribuição membro a membro.
export type TrechoNaLinha<T extends Trecho = Trecho> = T extends Trecho
  ? T & { offset: number; dur: number; fim: number }
  : never;

export function isBase(t: Trecho): t is TrechoBase {
  return t.tipo === "base";
}

/**
 * Mesma checagem, tipada para item DA LINHA (pós `linhaDoTempo`) — necessária
 * à parte porque `Array.prototype.filter` só escolhe a sobrecarga que
 * preserva o tipo quando o predicado é declarado sobre o MESMO tipo do
 * array; `isBase` (parâmetro `Trecho`) aplicado a um `TrechoNaLinha[]`
 * compilava, mas o resultado filtrado perdia `entrada`/`saida` do tipo.
 */
export function isBaseNaLinha(t: TrechoNaLinha): t is TrechoNaLinha<TrechoBase> {
  return t.tipo === "base";
}

export interface Insercao {
  id: string;
  nome: string;
  tipo: "imagem" | "video";
  inicio: number;
  duracao: number;
  /** 0.2 a 1 — fração do quadro. Ignorado quando `posicao === "cheia"`. */
  escala: number;
  posicao: "cheia" | "centro" | "sup-dir" | "inf-esq";
  assetId: string | null;
  url: string | null;
}

export interface Fundo {
  nome: string | null;
  assetId: string | null;
  url: string | null;
  /** 0-100. */
  volume: number;
}

export interface BaseVideo {
  /** `null` enquanto nenhum vídeo gerado foi escolhido. */
  id: string | null;
  nome: string;
  url: string;
  duracaoOriginal: number;
}

function arred(n: number): number {
  return +n.toFixed(2);
}

export function duracaoTrecho(t: Trecho): number {
  return t.tipo === "base" ? arred(t.saida - t.entrada) : arred(t.duracao);
}

/** Sequência com os tempos acumulados na linha final. */
export function linhaDoTempo(trechos: Trecho[]): TrechoNaLinha[] {
  let acc = 0;
  return trechos.map((t) => {
    const d = duracaoTrecho(t);
    const item: TrechoNaLinha = { ...t, offset: arred(acc), dur: d, fim: arred(acc + d) };
    acc = arred(acc + d);
    return item;
  });
}

/** SOMA dos trechos — não `saida - entrada` de um único vídeo. Ver o cabeçalho do arquivo. */
export function duracaoFinal(trechos: Trecho[]): number {
  return arred(trechos.reduce((s, t) => s + duracaoTrecho(t), 0));
}

export function corrigirTrecho(t: Trecho, duracaoOriginal: number): Trecho {
  if (t.tipo !== "base") {
    return { ...t, duracao: Math.max(MIN_TRECHO, arred(t.duracao)) };
  }
  let entrada = Math.min(Math.max(0, t.entrada), Math.max(0, duracaoOriginal - MIN_TRECHO));
  let saida = Math.min(Math.max(t.saida, arred(entrada + MIN_TRECHO)), duracaoOriginal);
  if (!Number.isFinite(entrada)) entrada = t.entrada;
  if (!Number.isFinite(saida)) saida = t.saida;
  return { ...t, entrada: arred(entrada), saida: arred(saida) };
}

export function corrigirInsercao(ins: Insercao, limite: number): Insercao {
  const inicio = Math.min(Math.max(0, ins.inicio), Math.max(0, limite - MIN_TRECHO));
  const duracao = Math.max(MIN_TRECHO, Math.min(ins.duracao, arred(limite - inicio)));
  return { ...ins, inicio: arred(inicio), duracao: arred(duracao) };
}

export interface ResultadoDivisao {
  trechos: Trecho[];
  /** Onde um trecho novo caberia — usado por quem insere logo após dividir. */
  indice: number;
  dividiu: boolean;
}

/**
 * Divide a sequência no instante dado. Nunca divide um b-roll (ele é
 * exclusivo, sem "dentro" para cortar).
 */
export function dividirEm(trechos: Trecho[], tempo: number, novoId: () => string): ResultadoDivisao {
  const linha = linhaDoTempo(trechos);
  const dentro = linha.findIndex((t) => tempo > t.offset + 0.01 && tempo < t.fim - 0.01);
  if (dentro === -1) {
    const naBorda = linha.findIndex((t) => Math.abs(t.offset - tempo) <= 0.01);
    return { trechos: trechos.slice(), indice: naBorda === -1 ? trechos.length : naBorda, dividiu: false };
  }
  const t = linha[dentro];
  if (!isBase(t)) return { trechos: trechos.slice(), indice: dentro + 1, dividiu: false };
  const local = arred(tempo - t.offset);
  if (local < MIN_TRECHO || t.dur - local < MIN_TRECHO) {
    return { trechos: trechos.slice(), indice: dentro + 1, dividiu: false };
  }
  const corte = arred(t.entrada + local);
  const novos = trechos.slice();
  novos.splice(
    dentro,
    1,
    { id: novoId(), tipo: "base", entrada: t.entrada, saida: corte },
    { id: novoId(), tipo: "base", entrada: corte, saida: t.saida },
  );
  return { trechos: novos, indice: dentro + 1, dividiu: true };
}

/** Dois trechos de base só se juntam de volta se forem contíguos na fonte. */
export function podeJuntar(trechos: Trecho[], indice: number): boolean {
  const a = trechos[indice];
  const b = trechos[indice + 1];
  if (!a || !b) return false;
  return isBase(a) && isBase(b) && Math.abs(a.saida - b.entrada) < 0.01;
}

export interface CorpoTrack {
  id: string;
  type: "video" | "audio";
  keyframes: Record<string, unknown>[];
}

export interface Corpo {
  tracks: CorpoTrack[];
}

/**
 * Monta o corpo exibido em "O que vai ser enviado" — NÃO é uma rota de
 * exportação (fora de escopo desta rodada; ver FORA DE ESCOPO no bloco de
 * fechamento). Cada referência de arquivo é `asset_id`, nunca `url` — a
 * única exceção é o vídeo BASE, que não é um edit-asset: é o vídeo já
 * gerado, identificado por `source_video_id` na persistência (migration
 * 080), e `base.url` aqui serve só para o monitor/preview ao vivo.
 */
export function montarCorpo(
  base: BaseVideo,
  trechos: Trecho[],
  insercoes: Insercao[],
  volVoz: number,
  fundo: Fundo | null,
): Corpo {
  const linha = linhaDoTempo(trechos);
  const dur = duracaoFinal(trechos);

  const video = linha.map((t) =>
    isBase(t)
      ? { url: base.url, timestamp: t.offset, duration: t.dur, trim_start: t.entrada }
      : { asset_id: (t as TrechoNaLinha<TrechoBroll>).assetId, timestamp: t.offset, duration: t.dur, trim_start: 0 },
  );

  const voz = linha.filter(isBaseNaLinha).map((t) => ({
    url: base.url,
    timestamp: t.offset,
    duration: t.dur,
    trim_start: t.entrada,
    volume: arred(volVoz / 100),
  }));

  const audioBroll = linha
    .filter((t): t is TrechoNaLinha<TrechoBroll> => t.tipo === "broll" && !!(t as TrechoNaLinha<TrechoBroll>).assetId)
    .map((t) => ({ asset_id: t.assetId, timestamp: t.offset, duration: t.dur, volume: arred(t.volume / 100) }));

  const tracks: CorpoTrack[] = [
    { id: "video-principal", type: "video", keyframes: video },
    { id: "audio-voz", type: "audio", keyframes: voz },
  ];
  if (audioBroll.length) tracks.push({ id: "audio-broll", type: "audio", keyframes: audioBroll });
  if (insercoes.length) {
    tracks.push({
      id: "video-sobreposicoes",
      type: "video",
      keyframes: insercoes
        .slice()
        .sort((a, b) => a.inicio - b.inicio)
        .map((i) => ({
          asset_id: i.assetId,
          timestamp: i.inicio,
          duration: i.duracao,
          placement: i.posicao,
          scale: arred(i.escala),
          mute: true,
        })),
    });
  }
  if (fundo && fundo.assetId) {
    tracks.push({
      id: "audio-fundo",
      type: "audio",
      keyframes: [{ asset_id: fundo.assetId, timestamp: 0, duration: dur, volume: arred(fundo.volume / 100) }],
    });
  }
  return { tracks };
}

export type RotaChave = "nada" | "corte" | "emenda" | "recodifica";

export interface Rota {
  chave: RotaChave;
  /** Só relevante para "recodifica" — quantas sobreposições motivam a recodificação. */
  contagemSobreposicoes: number;
}

/**
 * Decide COMO o projeto seria processado, sem decidir strings de exibição —
 * a tela (Parte 3) traduz `chave` via `t()`, para que esta função pura não
 * carregue texto de um idioma só.
 */
export function decidirRota(base: BaseVideo, trechos: Trecho[], insercoes: Insercao[]): Rota {
  const temBroll = trechos.some((t) => t.tipo === "broll");
  const bases = trechos.filter(isBase);
  const cortou = bases.length > 1 || bases.some((t) => t.entrada > 0 || t.saida < base.duracaoOriginal);
  if (!insercoes.length && !temBroll && !cortou) return { chave: "nada", contagemSobreposicoes: 0 };
  if (!insercoes.length && !temBroll) return { chave: "corte", contagemSobreposicoes: 0 };
  if (!insercoes.length && temBroll) return { chave: "emenda", contagemSobreposicoes: 0 };
  return { chave: "recodifica", contagemSobreposicoes: insercoes.length };
}

export type BloqueioCode =
  | "semVideoEscolhido"
  | "sequenciaVazia"
  | "semDuracao"
  | "brollSemArquivo"
  | "sobreposicaoPassaDoFim"
  | "sobreposicaoSemArquivo"
  | "sobreposicaoSobreBroll";

export interface Bloqueio {
  code: BloqueioCode;
  params?: { indice?: number; nome?: string };
}

/** Bloqueios travam Guardar/Exportar. Estruturados (não string pronta) para a tela traduzir via `t()`. */
export function listarBloqueios(base: BaseVideo, trechos: Trecho[], insercoes: Insercao[]): Bloqueio[] {
  const b: Bloqueio[] = [];
  const dur = duracaoFinal(trechos);
  const linha = linhaDoTempo(trechos);
  if (!base.id) b.push({ code: "semVideoEscolhido" });
  if (!trechos.length) b.push({ code: "sequenciaVazia" });
  if (dur <= MIN_TRECHO) b.push({ code: "semDuracao" });
  linha.forEach((t, n) => {
    if (t.tipo === "broll" && !(t as TrechoNaLinha<TrechoBroll>).assetId) {
      b.push({ code: "brollSemArquivo", params: { indice: n + 1, nome: (t as TrechoNaLinha<TrechoBroll>).nome } });
    }
  });
  insercoes.forEach((i, n) => {
    if (i.inicio + i.duracao > dur + 0.01) {
      b.push({ code: "sobreposicaoPassaDoFim", params: { indice: n + 1, nome: i.nome } });
    }
    if (!i.assetId) b.push({ code: "sobreposicaoSemArquivo", params: { indice: n + 1 } });
    const colide = linha.some(
      (t) => t.tipo === "broll" && i.inicio < t.fim - 0.01 && i.inicio + i.duracao > t.offset + 0.01,
    );
    if (colide) b.push({ code: "sobreposicaoSobreBroll", params: { indice: n + 1, nome: i.nome } });
  });
  return b;
}

/**
 * `/api/tenant/edit-assets/{assetId}` é determinístico — não precisa de
 * round-trip de banco para reidratar `url`. O prefixo `/api` é OBRIGATÓRIO:
 * esta url alimenta `<img>`/`<video>`/`<audio src=...>` direto, nunca passa
 * pelo client `api.*` (que prefixa sozinho) — sem ele, o pedido cai no
 * fallback do SPA em vez da rota real (achado em 14/09/2026,
 * STUDIO-EDIT-1-VERIF item 3).
 */
export function urlDoAsset(assetId: string | null): string | null {
  return assetId ? `/api/tenant/edit-assets/${assetId}` : null;
}

export interface PayloadTrechoBase {
  id: string;
  tipo: "base";
  entrada: number;
  saida: number;
}
export interface PayloadTrechoBroll {
  id: string;
  tipo: "broll";
  nome: string;
  duracao: number;
  volume: number;
  assetId: string | null;
}
export type PayloadTrecho = PayloadTrechoBase | PayloadTrechoBroll;

export interface PayloadInsercao {
  id: string;
  nome: string;
  tipo: "imagem" | "video";
  inicio: number;
  duracao: number;
  escala: number;
  posicao: "cheia" | "centro" | "sup-dir" | "inf-esq";
  assetId: string | null;
}

export interface PayloadFundo {
  nome: string | null;
  assetId: string;
  volume: number;
}

export interface ProjectPayload {
  trechos: PayloadTrecho[];
  insercoes: PayloadInsercao[];
  volVoz: number;
  fundo: PayloadFundo | null;
}

/**
 * O que vai para `edit_projects.payload` — NUNCA `url`, sempre `assetId`.
 *
 * Existe como função PRÓPRIA (não "montar o objeto na hora de salvar")
 * exatamente para dar à guarda G3 (`checkStudioMovieEditPolicy.ts`) um alvo
 * de EXECUÇÃO: alimentar um trecho com uma `url` de blob e conferir que ela
 * não sobrevive à conversão é uma prova mais forte que ler o texto do
 * arquivo.
 */
export function payloadDoProjeto(
  trechos: Trecho[],
  insercoes: Insercao[],
  volVoz: number,
  fundo: Fundo,
): ProjectPayload {
  return {
    trechos: trechos.map((t) =>
      t.tipo === "base"
        ? { id: t.id, tipo: "base", entrada: t.entrada, saida: t.saida }
        : { id: t.id, tipo: "broll", nome: t.nome, duracao: t.duracao, volume: t.volume, assetId: t.assetId },
    ),
    insercoes: insercoes.map((i) => ({
      id: i.id,
      nome: i.nome,
      tipo: i.tipo,
      inicio: i.inicio,
      duracao: i.duracao,
      escala: i.escala,
      posicao: i.posicao,
      assetId: i.assetId,
    })),
    volVoz,
    fundo: fundo.assetId ? { nome: fundo.nome, assetId: fundo.assetId, volume: fundo.volume } : null,
  };
}
