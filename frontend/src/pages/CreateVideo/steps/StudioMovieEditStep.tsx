import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import type { Video } from "../../../types";
import {
  duracaoFinal,
  linhaDoTempo,
  corrigirTrecho,
  corrigirInsercao,
  dividirEm,
  podeJuntar,
  montarCorpo,
  decidirRota,
  listarBloqueios,
  payloadDoProjeto,
  urlDoAsset,
  type Trecho,
  type TrechoBroll,
  type Insercao,
  type Fundo,
  type BaseVideo,
  type ProjectPayload,
} from "../editProject";

/**
 * Aba "5. Studio Movie Edit" (era "5. Editar"). Porte de
 * `uploads/_prova/studio-movie-edit/aba5-editar-splice.html` (protótipo
 * aprovado, modelo de EMENDA). BLOCO STUDIO-EDIT-1.
 *
 * NÃO PORTADO, de propósito: análise de onda por Web Audio e detecção de
 * pausas (dependem de saber se os timestamps do ElevenLabs já são
 * persistidos — ficam para depois), e o arraste com o mouse para
 * redimensionar clipe na timeline (o protótipo tinha "alças" arrastáveis; o
 * mesmo ajuste aqui é feito pelos campos numéricos do inspetor, que já
 * existiam no protótipo ao lado do arraste). Nenhuma rota de exportação:
 * "Exportar" fica desabilitado, com o motivo explicado na tela.
 */

type EditAssetKind = "broll" | "sobreposicao" | "fundo";

async function enviarEditAsset(kind: EditAssetKind, file: File): Promise<{ asset_id: string; url: string }> {
  return api.upload<{ asset_id: string; url: string }>("/tenant/edit-assets", file, file.name, { kind });
}

function excluirEditAsset(assetId: string): void {
  // Idempotente do lado do servidor (404/410 não é erro) — por isso não há
  // nada a tratar aqui além de não deixar uma promise rejeitada solta.
  api.delete(`/tenant/edit-assets/${assetId}`).catch(() => {});
}

interface VideoParaEditar {
  id: string;
  nome: string;
  duracao: number;
  pronto: boolean;
  url: string | null;
}

function paraVideoParaEditar(v: Video): VideoParaEditar {
  const duracao = v.delivered_seconds ?? v.duration_seconds ?? 0;
  const url = v.playback_url ?? v.output_url ?? null;
  const nomeBase = v.script.trim().replace(/\s+/g, " ");
  return {
    id: v.id,
    nome: nomeBase.length > 60 ? `${nomeBase.slice(0, 60)}…` : nomeBase || v.id,
    duracao,
    pronto: v.status === "ready" && duracao > 0 && !!url,
    url,
  };
}

interface EditProjectRow {
  id: string;
  source_video_id: string;
  payload: ProjectPayload;
}

let contadorId = 0;
function gerarId(prefixo: string): string {
  contadorId += 1;
  return `${prefixo}${contadorId.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function seg(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} s`;
}

const POSICOES = ["cheia", "centro", "sup-dir", "inf-esq"] as const;

export function StudioMovieEditStep() {
  const { t } = useTranslation();

  const [videos, setVideos] = useState<VideoParaEditar[]>([]);
  const [carregandoVideos, setCarregandoVideos] = useState(true);

  const [base, setBase] = useState<BaseVideo>({ id: null, nome: "", url: "", duracaoOriginal: 0 });
  const [trechos, setTrechos] = useState<Trecho[]>([]);
  const [insercoes, setInsercoes] = useState<Insercao[]>([]);
  const [volVoz, setVolVoz] = useState(100);
  const [fundo, setFundo] = useState<Fundo>({ nome: null, assetId: null, url: null, volume: 35 });

  const [sel, setSel] = useState<string | null>(null);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);

  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [projetoSalvo, setProjetoSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [enviandoIds, setEnviandoIds] = useState<Record<string, boolean>>({});
  const [errosUpload, setErrosUpload] = useState<Record<string, string>>({});

  const videoBaseRef = useRef<HTMLVideoElement>(null);
  const videoBrollRef = useRef<HTMLVideoElement>(null);
  const audioFundoRef = useRef<HTMLAudioElement>(null);
  const relogioAnteriorRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    api
      .get<Video[]>("/videos")
      .then((rows) => {
        if (cancelado) return;
        setVideos(rows.map(paraVideoParaEditar));
      })
      .finally(() => {
        if (!cancelado) setCarregandoVideos(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const linha = useMemo(() => linhaDoTempo(trechos), [trechos]);
  const dur = useMemo(() => duracaoFinal(trechos), [trechos]);
  const corpo = useMemo(
    () => montarCorpo(base, trechos, insercoes, volVoz, fundo),
    [base, trechos, insercoes, volVoz, fundo],
  );
  const rota = useMemo(() => decidirRota(base, trechos, insercoes), [base, trechos, insercoes]);
  const bloqueios = useMemo(() => listarBloqueios(base, trechos, insercoes), [base, trechos, insercoes]);

  const trechoAtivo = useMemo(() => {
    return linha.find((x) => tempo >= x.offset - 0.001 && tempo < x.fim) ?? linha[linha.length - 1] ?? null;
  }, [linha, tempo]);
  const noBroll = !!trechoAtivo && trechoAtivo.tipo === "broll";
  const ativas = useMemo(
    () => (noBroll ? [] : insercoes.filter((i) => tempo >= i.inicio && tempo < i.inicio + i.duracao)),
    [noBroll, insercoes, tempo],
  );

  const trechoSel = trechos.find((x) => x.id === sel) ?? null;
  const insercaoSel = insercoes.find((x) => x.id === sel) ?? null;

  // Corte que encolheu a duração final não pode deixar o cursor além dela.
  useEffect(() => {
    setTempo((tAtual) => Math.min(tAtual, dur));
  }, [dur]);

  // Relógio-mestre em JS — os elementos de mídia são escravos, resincronizados
  // no efeito seguinte. Mesma escolha do protótipo: é o que torna simples
  // atravessar a fronteira base↔b-roll.
  useEffect(() => {
    if (!tocando) {
      relogioAnteriorRef.current = null;
      return;
    }
    let ativo = true;
    function passo(agora: number) {
      if (!ativo) return;
      if (relogioAnteriorRef.current == null) relogioAnteriorRef.current = agora;
      const delta = (agora - relogioAnteriorRef.current) / 1000;
      relogioAnteriorRef.current = agora;
      setTempo((tAtual) => {
        const n = tAtual + delta;
        if (n >= dur) {
          setTocando(false);
          return dur;
        }
        return n;
      });
      if (ativo) rafRef.current = requestAnimationFrame(passo);
    }
    rafRef.current = requestAnimationFrame(passo);
    return () => {
      ativo = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [tocando, dur]);

  // Sincroniza os elementos de mídia reais ao relógio-mestre.
  useEffect(() => {
    const TOL = 0.3;
    const vBase = videoBaseRef.current;
    const vBroll = videoBrollRef.current;
    const aFundo = audioFundoRef.current;

    if (vBase) {
      if (trechoAtivo && trechoAtivo.tipo === "base" && base.url) {
        const alvo = trechoAtivo.entrada + (tempo - trechoAtivo.offset);
        if (Math.abs(vBase.currentTime - alvo) > TOL) vBase.currentTime = alvo;
        if (tocando && vBase.paused) vBase.play().catch(() => {});
        if (!tocando && !vBase.paused) vBase.pause();
      } else if (!vBase.paused) {
        vBase.pause();
      }
    }

    if (vBroll) {
      if (noBroll && trechoAtivo && trechoAtivo.tipo === "broll" && trechoAtivo.url) {
        const alvo = tempo - trechoAtivo.offset;
        if (Math.abs(vBroll.currentTime - alvo) > TOL) vBroll.currentTime = alvo;
        if (tocando && vBroll.paused) vBroll.play().catch(() => {});
        if (!tocando && !vBroll.paused) vBroll.pause();
      } else if (!vBroll.paused) {
        vBroll.pause();
      }
    }

    if (aFundo && fundo.url) {
      if (Math.abs(aFundo.currentTime - tempo) > TOL) aFundo.currentTime = tempo;
      if (tocando && aFundo.paused) aFundo.play().catch(() => {});
      if (!tocando && !aFundo.paused) aFundo.pause();
    }
  }, [tempo, tocando, trechoAtivo, noBroll, base.url, fundo.url]);

  function mexeu() {
    setProjetoSalvo(false);
  }

  function irPara(novoTempo: number) {
    setTempo(Math.min(Math.max(0, novoTempo), dur));
  }

  async function selecionarVideo(v: VideoParaEditar) {
    if (!v.pronto || !v.url) return;
    setBase({ id: v.id, nome: v.nome, url: v.url, duracaoOriginal: v.duracao });
    setSel(null);
    setTempo(0);
    setTocando(false);
    setProjetoId(null);
    setProjetoSalvo(false);

    let existente: EditProjectRow | null = null;
    try {
      existente = await api.get<EditProjectRow | null>(`/tenant/edit-projects/by-video/${v.id}`);
    } catch {
      existente = null;
    }
    if (existente) {
      const p = existente.payload;
      setTrechos(
        p.trechos.map((x) =>
          x.tipo === "base" ? x : { ...x, url: urlDoAsset(x.assetId) },
        ),
      );
      setInsercoes(p.insercoes.map((i) => ({ ...i, url: urlDoAsset(i.assetId) })));
      setVolVoz(p.volVoz);
      setFundo(
        p.fundo
          ? { nome: p.fundo.nome, assetId: p.fundo.assetId, url: urlDoAsset(p.fundo.assetId), volume: p.fundo.volume }
          : { nome: null, assetId: null, url: null, volume: 35 },
      );
      setProjetoId(existente.id);
      setProjetoSalvo(true);
    } else {
      setTrechos([{ id: gerarId("t"), tipo: "base", entrada: 0, saida: v.duracao }]);
      setInsercoes([]);
      setVolVoz(100);
      setFundo({ nome: null, assetId: null, url: null, volume: 35 });
    }
  }

  function dividirAqui() {
    const r = dividirEm(trechos, tempo, () => gerarId("t"));
    if (!r.dividiu) return;
    setTrechos(r.trechos);
    setSel(r.trechos[r.indice - 1].id);
    mexeu();
  }

  function adicionarBroll() {
    const r = dividirEm(trechos, tempo, () => gerarId("t"));
    const novo: TrechoBroll = {
      id: gerarId("t"),
      tipo: "broll",
      nome: "",
      duracao: 3,
      volume: 100,
      assetId: null,
      url: null,
    };
    const novos = r.trechos.slice();
    novos.splice(r.indice, 0, novo);
    setTrechos(novos);
    setSel(novo.id);
    mexeu();
  }

  function alterarTrecho(id: string, campos: Partial<Trecho>) {
    setTrechos((ts) =>
      ts.map((x) => (x.id === id ? corrigirTrecho({ ...x, ...campos } as Trecho, base.duracaoOriginal) : x)),
    );
    mexeu();
  }

  function removerTrecho(id: string) {
    const alvo = trechos.find((x) => x.id === id);
    setTrechos((ts) => ts.filter((x) => x.id !== id));
    if (sel === id) setSel(null);
    mexeu();
    if (alvo && alvo.tipo === "broll" && alvo.assetId) excluirEditAsset(alvo.assetId);
  }

  function juntarComProximo(id: string) {
    setTrechos((ts) => {
      const i = ts.findIndex((x) => x.id === id);
      if (!podeJuntar(ts, i)) return ts;
      const a = ts[i];
      const b = ts[i + 1];
      if (a.tipo !== "base" || b.tipo !== "base") return ts;
      const novos = ts.slice();
      novos.splice(i, 2, { id: a.id, tipo: "base", entrada: a.entrada, saida: b.saida });
      return novos;
    });
    mexeu();
  }

  function adicionarInsercao(tipo: "imagem" | "video") {
    const nova = corrigirInsercao(
      {
        id: gerarId("i"),
        nome: "",
        tipo,
        inicio: tempo,
        duracao: 2,
        escala: tipo === "imagem" ? 0.5 : 1,
        posicao: tipo === "imagem" ? "sup-dir" : "cheia",
        assetId: null,
        url: null,
      },
      dur,
    );
    setInsercoes((ins) => [...ins, nova]);
    setSel(nova.id);
    mexeu();
  }

  function alterarInsercao(id: string, campos: Partial<Insercao>) {
    setInsercoes((ins) => ins.map((i) => (i.id === id ? corrigirInsercao({ ...i, ...campos }, dur) : i)));
    mexeu();
  }

  function removerInsercao(id: string) {
    const alvo = insercoes.find((x) => x.id === id);
    setInsercoes((ins) => ins.filter((x) => x.id !== id));
    if (sel === id) setSel(null);
    mexeu();
    if (alvo?.assetId) excluirEditAsset(alvo.assetId);
  }

  async function handleUploadBroll(trechoId: string, file: File) {
    const antigo = trechos.find((x) => x.id === trechoId);
    const assetIdAntigo = antigo && antigo.tipo === "broll" ? antigo.assetId : null;
    setEnviandoIds((s) => ({ ...s, [trechoId]: true }));
    setErrosUpload((e) => {
      const n = { ...e };
      delete n[trechoId];
      return n;
    });
    try {
      const resp = await enviarEditAsset("broll", file);
      setTrechos((ts) =>
        ts.map((x) => (x.id === trechoId && x.tipo === "broll" ? { ...x, nome: file.name, assetId: resp.asset_id, url: resp.url } : x)),
      );
      mexeu();
      // ORDEM OBRIGATÓRIA: só apaga o antigo DEPOIS do novo confirmado.
      if (assetIdAntigo) excluirEditAsset(assetIdAntigo);
    } catch (err) {
      setErrosUpload((e) => ({ ...e, [trechoId]: err instanceof ApiError ? err.message : String(err) }));
    } finally {
      setEnviandoIds((s) => {
        const n = { ...s };
        delete n[trechoId];
        return n;
      });
    }
  }

  async function handleUploadInsercao(insercaoId: string, file: File) {
    const antigo = insercoes.find((x) => x.id === insercaoId);
    const assetIdAntigo = antigo?.assetId ?? null;
    setEnviandoIds((s) => ({ ...s, [insercaoId]: true }));
    setErrosUpload((e) => {
      const n = { ...e };
      delete n[insercaoId];
      return n;
    });
    try {
      const resp = await enviarEditAsset("sobreposicao", file);
      setInsercoes((ins) =>
        ins.map((x) =>
          x.id === insercaoId
            ? { ...x, nome: file.name, assetId: resp.asset_id, url: resp.url, tipo: file.type.startsWith("video") ? "video" : "imagem" }
            : x,
        ),
      );
      mexeu();
      if (assetIdAntigo) excluirEditAsset(assetIdAntigo);
    } catch (err) {
      setErrosUpload((e) => ({ ...e, [insercaoId]: err instanceof ApiError ? err.message : String(err) }));
    } finally {
      setEnviandoIds((s) => {
        const n = { ...s };
        delete n[insercaoId];
        return n;
      });
    }
  }

  async function handleUploadFundo(file: File) {
    const assetIdAntigo = fundo.assetId;
    setEnviandoIds((s) => ({ ...s, fundo: true }));
    setErrosUpload((e) => {
      const n = { ...e };
      delete n.fundo;
      return n;
    });
    try {
      const resp = await enviarEditAsset("fundo", file);
      setFundo((f) => ({ ...f, nome: file.name, assetId: resp.asset_id, url: resp.url }));
      mexeu();
      if (assetIdAntigo) excluirEditAsset(assetIdAntigo);
    } catch (err) {
      setErrosUpload((e) => ({ ...e, fundo: err instanceof ApiError ? err.message : String(err) }));
    } finally {
      setEnviandoIds((s) => {
        const n = { ...s };
        delete n.fundo;
        return n;
      });
    }
  }

  async function guardarProjeto() {
    if (bloqueios.length || !base.id) return;
    setSalvando(true);
    try {
      const payload = payloadDoProjeto(trechos, insercoes, volVoz, fundo);
      if (projetoId) {
        await api.put(`/tenant/edit-projects/${projetoId}`, { payload });
      } else {
        const criado = await api.post<{ id: string }>("/tenant/edit-projects", {
          source_video_id: base.id,
          payload,
        });
        setProjetoId(criado.id);
      }
      setProjetoSalvo(true);
    } finally {
      setSalvando(false);
    }
  }

  function buscarNaPista(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    irPara(((e.clientX - rect.left) / rect.width) * dur);
  }

  const pct = (s: number, d: number) => (d > 0 ? (s / d) * 100 : 0);

  const idxBase =
    trechoAtivo && trechoAtivo.tipo === "base"
      ? linha.filter((x) => x.tipo === "base").findIndex((x) => x.id === trechoAtivo.id) + 1
      : 0;

  const liveV2 = noBroll
    ? t("createVideo.studioEdit.liveOverlaysBlocked")
    : ativas.length
      ? ativas.map((i) => i.nome || t("createVideo.studioEdit.noFile")).join(", ")
      : t("createVideo.studioEdit.liveOverlaysNone");
  const liveV1 = noBroll
    ? t("createVideo.studioEdit.liveSequenceBroll", { nome: (trechoAtivo as TrechoBroll).nome || t("createVideo.studioEdit.noFile") })
    : trechoAtivo
      ? t("createVideo.studioEdit.liveSequenceBase", { indice: idxBase })
      : t("createVideo.studioEdit.liveSequenceNone");
  const liveA1 = noBroll
    ? t("createVideo.studioEdit.liveVoiceMuted")
    : t("createVideo.studioEdit.liveVoiceActive", { volume: volVoz });
  const liveA2 = fundo.url
    ? t("createVideo.studioEdit.liveMusicActive", { nome: fundo.nome, volume: fundo.volume })
    : t("createVideo.studioEdit.liveMusicNone");

  const bases = trechos.filter((x) => x.tipo === "base");
  const brolls = trechos.filter((x) => x.tipo === "broll");
  const vozTotal = linha.filter((x) => x.tipo === "base").reduce((s, x) => s + x.dur, 0);
  const brollTotal = linha.filter((x) => x.tipo === "broll").reduce((s, x) => s + x.dur, 0);

  const rotaTitulo =
    rota.chave === "nada"
      ? t("createVideo.studioEdit.routeNada")
      : rota.chave === "corte"
        ? t("createVideo.studioEdit.routeCorte")
        : rota.chave === "emenda"
          ? t("createVideo.studioEdit.routeEmenda")
          : t("createVideo.studioEdit.routeRecodifica", { contagem: rota.contagemSobreposicoes });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 14 }}>
        {/* --------------------------------------------------------- monitor */}
        <div className="card">
          <div className="card-title">{t("createVideo.studioEdit.monitorTitle")}</div>
          <div
            style={{
              position: "relative",
              aspectRatio: "16/9",
              background: "#0B0D09",
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid #3A4034",
            }}
          >
            <video
              ref={videoBaseRef}
              src={base.url || undefined}
              playsInline
              muted={volVoz === 0}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: !noBroll && base.url ? "block" : "none",
              }}
            />
            <video
              ref={videoBrollRef}
              src={noBroll ? (trechoAtivo as TrechoBroll).url || undefined : undefined}
              playsInline
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: noBroll && (trechoAtivo as TrechoBroll)?.url ? "block" : "none",
              }}
            />
            {(!base.url || (noBroll && !(trechoAtivo as TrechoBroll).url)) && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "#59614F",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  textAlign: "center",
                  padding: 14,
                }}
              >
                {base.id ? seg(tempo) : t("createVideo.studioEdit.noVideos")}
              </div>
            )}
            {ativas.map((i) => (
              <div
                key={i.id}
                style={{
                  position: "absolute",
                  border: `2px solid ${i.id === sel ? "var(--color-primary)" : "rgba(255,255,255,.55)"}`,
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                  background: i.url ? "#000" : "rgba(124,58,237,.45)",
                  ...(i.posicao === "cheia"
                    ? { inset: 0 }
                    : {
                        aspectRatio: "16/9",
                        width: `${i.escala * 100}%`,
                        ...(i.posicao === "centro"
                          ? { left: "50%", top: "50%", transform: "translate(-50%,-50%)" }
                          : i.posicao === "sup-dir"
                            ? { right: "4%", top: "6%" }
                            : { left: "4%", bottom: "6%" }),
                      }),
                }}
              >
                {!i.url && (
                  <span style={{ color: "#fff", fontSize: 11.5, fontFamily: "ui-monospace, monospace", padding: 6 }}>
                    {i.nome || t("createVideo.studioEdit.noFile")}
                  </span>
                )}
                {i.url && i.tipo === "imagem" && (
                  <img src={i.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                {i.url && i.tipo === "video" && (
                  <video src={i.url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
            ))}
            {noBroll && (
              <span
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 10.5,
                  color: "#fff",
                  background: "#C2591B",
                  padding: "3px 9px",
                  borderRadius: 999,
                }}
              >
                b-roll
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn-outline" onClick={() => irPara(0)} title={t("createVideo.studioEdit.toStart")}>
              ⏮
            </button>
            <button className="btn btn-primary" onClick={() => setTocando((v) => !v)}>
              {tocando ? t("createVideo.studioEdit.pause") : t("createVideo.studioEdit.play")}
            </button>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
              {seg(tempo)} <span className="text-muted">/ {seg(dur)}</span>
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 1,
              marginTop: 12,
              background: "var(--color-border)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {[
              { pista: `${t("createVideo.studioEdit.trackOverlays")} ${t("createVideo.studioEdit.trackOverlaysSub")}`, valor: liveV2 },
              { pista: `${t("createVideo.studioEdit.trackSequence")} ${t("createVideo.studioEdit.trackSequenceSub")}`, valor: liveV1 },
              { pista: `${t("createVideo.studioEdit.trackVoice")} ${t("createVideo.studioEdit.trackVoiceSub")}`, valor: liveA1 },
              { pista: `${t("createVideo.studioEdit.trackMusic")} ${t("createVideo.studioEdit.trackMusicSub")}`, valor: liveA2 },
            ].map((item) => (
              <div key={item.pista} style={{ background: "var(--color-surface)", padding: "7px 10px", minWidth: 0 }}>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9.5, color: "var(--color-text-muted)" }}>
                  {item.pista}
                </div>
                <div style={{ fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.valor}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* -------------------------------------------------------- timeline */}
        <div className="card" style={{ background: "#1C1F1A", borderColor: "#3A4034" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#939D8B" }}>
              {t("createVideo.studioEdit.title")}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-outline" onClick={dividirAqui} disabled={!base.id}>
                {t("createVideo.studioEdit.splitHere")}
              </button>
              <button className="btn btn-outline" onClick={adicionarBroll} disabled={!base.id}>
                {t("createVideo.studioEdit.addBroll")}
              </button>
              <button className="btn btn-outline" onClick={() => adicionarInsercao("imagem")} disabled={!base.id}>
                {t("createVideo.studioEdit.addImage")}
              </button>
              <button className="btn btn-outline" onClick={() => adicionarInsercao("video")} disabled={!base.id}>
                {t("createVideo.studioEdit.addOverlay")}
              </button>
            </div>
          </div>

          {/* V2 */}
          <TrackRow label={t("createVideo.studioEdit.trackOverlays")} sub={t("createVideo.studioEdit.trackOverlaysSub")}>
            <div style={{ position: "relative", height: 42, background: "#282C25", border: "1px solid #3A4034", borderRadius: 8 }} onClick={buscarNaPista}>
              {insercoes.map((i) => (
                <div
                  key={i.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSel(i.id);
                  }}
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: `${pct(i.inicio, dur)}%`,
                    width: `${pct(i.duracao, dur)}%`,
                    borderRadius: 6,
                    background: i.tipo === "video" ? "#1F7A3A" : "#7C3AED",
                    border: i.id === sel ? "2px solid var(--color-primary)" : "2px solid transparent",
                    color: "#fff",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 7px",
                    overflow: "hidden",
                    cursor: "grab",
                  }}
                  title={i.nome || t("createVideo.studioEdit.noFile")}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i.nome || t("createVideo.studioEdit.noFile")}
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.85, flex: "none", marginLeft: 6 }}>
                    {seg(i.duracao)}
                  </span>
                </div>
              ))}
            </div>
          </TrackRow>

          {/* V1 */}
          <TrackRow label={t("createVideo.studioEdit.trackSequence")} sub={t("createVideo.studioEdit.trackSequenceSub")}>
            <div style={{ position: "relative", height: 42, background: "#282C25", border: "1px solid #3A4034", borderRadius: 8 }} onClick={buscarNaPista}>
              {linha.map((x) => (
                <div
                  key={x.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSel(x.id);
                  }}
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: `${pct(x.offset, dur)}%`,
                    width: `${pct(x.dur, dur)}%`,
                    borderRadius: 6,
                    background: x.tipo === "base" ? "#2F5FBF" : "#C2591B",
                    border: x.id === sel ? "2px solid var(--color-primary)" : "2px solid transparent",
                    color: "#fff",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 7px",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {x.tipo === "base" ? base.nome : `▶ ${(x as TrechoBroll).nome || t("createVideo.studioEdit.noFile")}`}
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.85, flex: "none", marginLeft: 6 }}>
                    {seg(x.dur)}
                  </span>
                </div>
              ))}
            </div>
          </TrackRow>

          {/* A1 */}
          <TrackRow
            label={t("createVideo.studioEdit.trackVoice")}
            sub={t("createVideo.studioEdit.trackVoiceSub")}
            extra={
              <input
                type="range"
                min={0}
                max={100}
                value={volVoz}
                onChange={(e) => {
                  setVolVoz(Number(e.target.value));
                  mexeu();
                }}
                aria-label={t("createVideo.studioEdit.fieldVolume", { volume: volVoz })}
                style={{ width: 52 }}
              />
            }
          >
            <div style={{ position: "relative", height: 42, background: "#282C25", border: "1px solid #3A4034", borderRadius: 8 }}>
              {linha.map((x) =>
                x.tipo === "base" ? (
                  <div
                    key={x.id}
                    style={{
                      position: "absolute",
                      top: 4,
                      bottom: 4,
                      left: `${pct(x.offset, dur)}%`,
                      width: `${pct(x.dur, dur)}%`,
                      borderRadius: 6,
                      background: "#0E7E8C",
                      color: "#fff",
                      fontSize: 9.5,
                      fontFamily: "ui-monospace, monospace",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 8px",
                      overflow: "hidden",
                    }}
                  >
                    {t("createVideo.studioEdit.trackVoiceSub")}
                  </div>
                ) : (
                  <div
                    key={x.id}
                    style={{
                      position: "absolute",
                      top: 4,
                      bottom: 4,
                      left: `${pct(x.offset, dur)}%`,
                      width: `${pct(x.dur, dur)}%`,
                      borderRadius: 6,
                      border: "1px dashed #3A4034",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 9,
                      color: "#8B9481",
                    }}
                  >
                    {t("createVideo.studioEdit.liveVoiceMuted")}
                  </div>
                ),
              )}
            </div>
          </TrackRow>

          {/* A2 */}
          <TrackRow
            label={t("createVideo.studioEdit.trackMusic")}
            sub={t("createVideo.studioEdit.trackMusicSub")}
            extra={
              <input
                type="range"
                min={0}
                max={100}
                value={fundo.volume}
                onChange={(e) => {
                  setFundo((f) => ({ ...f, volume: Number(e.target.value) }));
                  mexeu();
                }}
                aria-label={t("createVideo.studioEdit.fieldVolume", { volume: fundo.volume })}
                style={{ width: 52 }}
              />
            }
          >
            <div style={{ position: "relative", height: 42, background: "#282C25", border: "1px solid #3A4034", borderRadius: 8 }}>
              {fundo.url ? (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: 0,
                    width: "100%",
                    borderRadius: 6,
                    background: "#5B4B95",
                    color: "#fff",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 8px",
                    overflow: "hidden",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fundo.nome}</span>
                  <label className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 11, padding: "3px 8px" }}>
                    {enviandoIds.fundo ? t("createVideo.studioEdit.uploading") : t("createVideo.studioEdit.replaceFile")}
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      disabled={!!enviandoIds.fundo}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) handleUploadFundo(f);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: 0,
                    width: "100%",
                    borderRadius: 6,
                    border: "1px dashed #3A4034",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 8px",
                  }}
                >
                  <label className="btn btn-ghost" style={{ fontSize: 11.5, padding: "6px 12px" }}>
                    {enviandoIds.fundo ? t("createVideo.studioEdit.uploading") : t("createVideo.studioEdit.addMusic")}
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      disabled={!!enviandoIds.fundo}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) handleUploadFundo(f);
                      }}
                    />
                  </label>
                  <span style={{ marginLeft: "auto", color: "#767F6C", fontSize: 11 }}>
                    {t("createVideo.studioEdit.musicEmpty")}
                  </span>
                </div>
              )}
            </div>
          </TrackRow>
          {errosUpload.fundo && (
            <p className="alert-error" style={{ fontSize: 12, marginTop: 8 }}>
              {t("createVideo.studioEdit.uploadError", { motivo: errosUpload.fundo })}
            </p>
          )}
        </div>

        {/* -------------------------------------------------------- inspetor */}
        <div className="card">
          {!trechoSel && !insercaoSel && (
            <p className="text-muted" style={{ margin: 0 }}>{t("createVideo.studioEdit.inspectorEmpty")}</p>
          )}

          {trechoSel && trechoSel.tipo === "base" && (
            <div>
              <div className="card-title">
                {t("createVideo.studioEdit.inspectorBaseTitle")} —{" "}
                {t("createVideo.studioEdit.trechoOf", {
                  indice: trechos.findIndex((x) => x.id === trechoSel.id) + 1,
                  total: trechos.length,
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                <Field label={t("createVideo.studioEdit.fieldEntrada")}>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={trechoSel.entrada}
                    onChange={(e) => alterarTrecho(trechoSel.id, { entrada: Number(e.target.value) } as Partial<Trecho>)}
                  />
                </Field>
                <Field label={t("createVideo.studioEdit.fieldSaida")}>
                  <input
                    type="number"
                    step={0.1}
                    value={trechoSel.saida}
                    onChange={(e) => alterarTrecho(trechoSel.id, { saida: Number(e.target.value) } as Partial<Trecho>)}
                  />
                </Field>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-outline" onClick={dividirAqui}>
                    {t("createVideo.studioEdit.split")}
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={!podeJuntar(trechos, trechos.findIndex((x) => x.id === trechoSel.id))}
                    onClick={() => juntarComProximo(trechoSel.id)}
                  >
                    {t("createVideo.studioEdit.merge")}
                  </button>
                  <button className="btn btn-outline" disabled={trechos.length <= 1} onClick={() => removerTrecho(trechoSel.id)}>
                    {t("createVideo.studioEdit.removeTrecho")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {trechoSel && trechoSel.tipo === "broll" && (
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                <div className="card-title" style={{ margin: 0 }}>
                  {t("createVideo.studioEdit.inspectorBrollTitle")}
                </div>
                <strong style={{ fontSize: 14 }}>{trechoSel.nome || t("createVideo.studioEdit.noFile")}</strong>
                <label className="btn btn-ghost" style={{ fontSize: 12.5, padding: "6px 12px" }}>
                  {enviandoIds[trechoSel.id]
                    ? t("createVideo.studioEdit.uploading")
                    : trechoSel.assetId
                      ? t("createVideo.studioEdit.replaceFile")
                      : t("createVideo.studioEdit.chooseFile")}
                  <input
                    type="file"
                    accept="video/*"
                    hidden
                    disabled={!!enviandoIds[trechoSel.id]}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) handleUploadBroll(trechoSel.id, f);
                    }}
                  />
                </label>
              </div>
              {errosUpload[trechoSel.id] && (
                <p className="alert-error" style={{ fontSize: 13, marginBottom: 10 }}>
                  {t("createVideo.studioEdit.uploadError", { motivo: errosUpload[trechoSel.id] })}
                </p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                <Field label={t("createVideo.studioEdit.fieldDuration")}>
                  <input
                    type="number"
                    step={0.1}
                    min={0.2}
                    value={trechoSel.duracao}
                    onChange={(e) => alterarTrecho(trechoSel.id, { duracao: Number(e.target.value) } as Partial<Trecho>)}
                  />
                </Field>
                <Field label={t("createVideo.studioEdit.fieldVolume", { volume: trechoSel.volume })}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={trechoSel.volume}
                    onChange={(e) => alterarTrecho(trechoSel.id, { volume: Number(e.target.value) } as Partial<Trecho>)}
                  />
                </Field>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => removerTrecho(trechoSel.id)}>
                    {t("createVideo.studioEdit.removeBroll")}
                  </button>
                </div>
                <p className="text-muted" style={{ alignSelf: "end", fontSize: 12, margin: 0 }}>
                  {t("createVideo.studioEdit.brollNote")}
                </p>
              </div>
            </div>
          )}

          {insercaoSel && (
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                <div className="card-title" style={{ margin: 0 }}>
                  {t("createVideo.studioEdit.inspectorOverlayTitle")}
                </div>
                <strong style={{ fontSize: 14 }}>{insercaoSel.nome || t("createVideo.studioEdit.noFile")}</strong>
                <label className="btn btn-ghost" style={{ fontSize: 12.5, padding: "6px 12px" }}>
                  {enviandoIds[insercaoSel.id]
                    ? t("createVideo.studioEdit.uploading")
                    : insercaoSel.assetId
                      ? t("createVideo.studioEdit.replaceFile")
                      : t("createVideo.studioEdit.chooseFile")}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    hidden
                    disabled={!!enviandoIds[insercaoSel.id]}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) handleUploadInsercao(insercaoSel.id, f);
                    }}
                  />
                </label>
              </div>
              {errosUpload[insercaoSel.id] && (
                <p className="alert-error" style={{ fontSize: 13, marginBottom: 10 }}>
                  {t("createVideo.studioEdit.uploadError", { motivo: errosUpload[insercaoSel.id] })}
                </p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                <Field label={t("createVideo.studioEdit.fieldStart")}>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={insercaoSel.inicio}
                    onChange={(e) => alterarInsercao(insercaoSel.id, { inicio: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t("createVideo.studioEdit.fieldStay")}>
                  <input
                    type="number"
                    step={0.1}
                    min={0.2}
                    value={insercaoSel.duracao}
                    onChange={(e) => alterarInsercao(insercaoSel.id, { duracao: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t("createVideo.studioEdit.fieldPosition")}>
                  <select
                    value={insercaoSel.posicao}
                    onChange={(e) => alterarInsercao(insercaoSel.id, { posicao: e.target.value as Insercao["posicao"] })}
                  >
                    {POSICOES.map((p) => (
                      <option key={p} value={p}>
                        {t(`createVideo.studioEdit.position${p === "cheia" ? "Full" : p === "centro" ? "Center" : p === "sup-dir" ? "TopRight" : "BottomLeft"}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("createVideo.studioEdit.fieldScale", { percent: Math.round(insercaoSel.escala * 100) })}>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    disabled={insercaoSel.posicao === "cheia"}
                    value={insercaoSel.escala}
                    onChange={(e) => alterarInsercao(insercaoSel.id, { escala: Number(e.target.value) })}
                  />
                </Field>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button className="btn btn-outline" onClick={() => removerInsercao(insercaoSel.id)}>
                    {t("createVideo.studioEdit.removeOverlay")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================= lateral */}
      <div style={{ display: "grid", gap: 14 }}>
        <div className="card">
          <div className="card-title">{t("createVideo.studioEdit.chooseVideoTitle")}</div>
          {carregandoVideos && <p className="text-muted">{t("createVideo.studioEdit.loadingVideos")}</p>}
          {!carregandoVideos && videos.length === 0 && <p className="text-muted">{t("createVideo.studioEdit.noVideos")}</p>}
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {videos.map((v) => (
              <button
                key={v.id}
                disabled={!v.pronto}
                onClick={() => selecionarVideo(v)}
                style={{
                  textAlign: "left",
                  background: v.id === base.id ? "var(--color-surface-raised)" : "var(--color-surface)",
                  border: `1px solid ${v.id === base.id ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: v.pronto ? "pointer" : "not-allowed",
                  opacity: v.pronto ? 1 : 0.55,
                  width: "100%",
                }}
              >
                <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nome}</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {v.duracao > 0 ? seg(v.duracao) : "—"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">{t("createVideo.studioEdit.summaryTitle")}</div>
          <div style={{ marginTop: 12, display: "grid", gap: 4, fontSize: 13.5 }}>
            <SummaryRow label={t("createVideo.studioEdit.summaryBase")} value={base.nome || "—"} />
            <SummaryRow
              label={t("createVideo.studioEdit.summarySequence")}
              value={t("createVideo.studioEdit.summarySequenceValue", {
                total: trechos.length,
                bases: bases.length,
                brolls: brolls.length,
              })}
            />
            <SummaryRow label={t("createVideo.studioEdit.summaryDuration")} value={seg(dur)} />
            <SummaryRow
              label={t("createVideo.studioEdit.summaryVoice")}
              value={t("createVideo.studioEdit.summaryVoiceValue", { segundos: vozTotal.toFixed(2).replace(".", ","), volume: volVoz })}
            />
            <SummaryRow
              label={t("createVideo.studioEdit.summaryMutedInBroll")}
              value={brolls.length ? seg(brollTotal) : t("createVideo.studioEdit.summaryNoneValue")}
              muted={!brolls.length}
            />
            <SummaryRow
              label={t("createVideo.studioEdit.summaryOverlays")}
              value={insercoes.length ? String(insercoes.length) : t("createVideo.studioEdit.summaryOverlaysNone")}
              muted={!insercoes.length}
            />
            <SummaryRow
              label={t("createVideo.studioEdit.summaryMusic")}
              value={fundo.url ? `${fundo.nome} · ${fundo.volume}%` : t("createVideo.studioEdit.summaryMusicNone")}
              muted={!fundo.url}
            />
            <SummaryRow label={t("createVideo.studioEdit.summaryRoute")} value={rotaTitulo} />
          </div>
          <details style={{ marginTop: 12 }}>
            <summary className="text-muted" style={{ fontSize: 12.5, cursor: "pointer" }}>
              {t("createVideo.studioEdit.viewBody")}
            </summary>
            <pre
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 10.5,
                lineHeight: 1.5,
                color: "var(--color-text-muted)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 10,
                marginTop: 8,
                maxHeight: 230,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(corpo, null, 2)}
            </pre>
          </details>
        </div>

        <div className="card">
          <div className="card-title">{t("createVideo.studioEdit.saveTitle")}</div>
          {bloqueios.length > 0 && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 16, fontSize: 12.5, color: "var(--color-tertiary)" }}>
              {bloqueios.map((b, i) => (
                <li key={i}>
                  {t(`createVideo.studioEdit.blocked.${b.code}`, b.params as Record<string, unknown>)}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <button className="btn btn-outline" disabled={bloqueios.length > 0 || salvando} onClick={guardarProjeto} style={{ width: "100%" }}>
              {salvando ? t("createVideo.studioEdit.saving") : t("createVideo.studioEdit.save")}
            </button>
            <button className="btn btn-primary" disabled title={t("createVideo.studioEdit.exportOutOfScope")} style={{ width: "100%" }}>
              {t("createVideo.studioEdit.export")}
            </button>
          </div>
          {projetoSalvo && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
              {t("createVideo.studioEdit.saved")}
            </p>
          )}
          <p className="text-muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            {t("createVideo.studioEdit.exportOutOfScope")}
          </p>
        </div>
      </div>

      {fundo.url && <audio ref={audioFundoRef} src={fundo.url} />}
    </div>
  );
}

function TrackRow({
  label,
  sub,
  extra,
  children,
}: {
  label: string;
  sub: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <div style={{ textAlign: "right", paddingRight: 4 }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#DDE6D2" }}>{label}</div>
        <div style={{ fontSize: 9.5, color: "#767F6C" }}>{sub}</div>
        {extra && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>{extra}</div>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr" }}>
      <span className="text-muted">{label}</span>
      <span style={muted ? { color: "var(--color-text-muted)", fontStyle: "italic" } : undefined}>{value}</span>
    </div>
  );
}
