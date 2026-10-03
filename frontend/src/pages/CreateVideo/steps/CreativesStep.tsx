import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import type { CreativeJob, CreativeModelDef, CreativeRef } from "../../../types";

interface VoiceOption {
  voice_id: string;
  name: string;
}

/**
 * Aba "5. Gerar Vídeos & Imagens" — ABAS-2 → ABAS-7 → ABAS-8 → ABAS-11
 * (Narração/Música por IA) → ABAS-12 (upload de áudio) → ABAS-13,
 * 30/09/2026 (upload de Imagem/Propaganda/B-roll/Sobreposição).
 *
 * TODO modo, agora, tem upload direto como alternativa a "Gerar" — decisão
 * do operador: "tudo que é produzido ou gerado na aba 5" pode entrar por
 * upload. Tipo aceito por modo: imagem/sobreposição só imagem; b-roll só
 * vídeo; propaganda os dois; narração/música só áudio.
 *
 * DURAÇÃO: dois domínios distintos. O controle 4-30s (vídeo) é só um
 * VALOR-ALVO para geração por IA (ainda não existe para
 * b-roll/propaganda). No upload de vídeo, essa mesma faixa vira um AVISO,
 * nunca uma recusa (`entrada.duracao_fora_do_esperado`) — o arquivo já
 * existe pronto. Narração/música têm seu próprio controle, 3-600s.
 */

type Modo = "imagem" | "propaganda" | "broll" | "trocarproduto" | "sobreposicao" | "narracao" | "musica";
const MODOS_DE_AUDIO = new Set<Modo>(["narracao", "musica"]);
// ABAS-23, 30/09/2026 — broll e propaganda ganharam motor real no
// backend (fixture, Seedance 2.5 image-to-video); liberando aqui.
const MODOS_COM_MOTOR = new Set<Modo>(["imagem", "narracao", "musica", "broll", "propaganda", "trocarproduto"]);
const AUDIO_DURATION_MIN = 3;
const AUDIO_DURATION_MAX = 600;
const AUDIO_DURATION_DEFAULT = 30;

const ACCEPT_POR_MODO: Record<Modo, string> = {
  imagem: "image/*",
  sobreposicao: "image/*",
  broll: "video/*",
  propaganda: "image/*,video/*",
  trocarproduto: "video/*",
  narracao: "audio/*",
  musica: "audio/*",
};

const REFERENCIAS = ["produto", "cenario", "personagem", "marca"] as const;
type TipoReferencia = (typeof REFERENCIAS)[number];

const POLL_INTERVAL_MS = 2000;
const ESTADOS_TERMINAIS = new Set(["pronto", "falhou", "recusado", "cancelado"]);

const EXT_DE_VIDEO = [".mp4", ".webm", ".mov", ".m4v"];
function ehArquivoDeVideo(url: string): boolean {
  const semQuery = url.split("?")[0].toLowerCase();
  return EXT_DE_VIDEO.some((ext) => semQuery.endsWith(ext));
}

// PAINEL-REFDESIGN-2, 03/10/2026 -- texto contextual do card "Referencias
// para X" no Criar: muda conforme modo + modelo escolhidos. So informativo
// por enquanto -- a selecao de referencia em si continua pelo select/chips
// existentes (patch 3 trata a grade de 8 + "Escolher da Galeria").
function referenciaResumo(modo: string, modeloId: string): { titulo: string; linhas: string[] } {
  if (modo === "imagem") {
    if (modeloId === "marketing-studio/image") {
      return {
        titulo: 'Referências para "Imagem"',
        linhas: ["Com Marketing Studio Image: aceita 1 referência (qualquer tipo salvo em REFERÊNCIAS)."],
      };
    }
    return {
      titulo: 'Referências para "Imagem"',
      linhas: [
        "Com Soul 2: nenhuma referência é usada — a imagem sai só do texto do prompt.",
        "Trocando o modelo para Marketing Studio Image: aceita 1 referência (qualquer tipo).",
      ],
    };
  }
  if (modo === "propaganda" || modo === "broll") {
    return {
      titulo: `Referências para "${modo === "propaganda" ? "Propaganda" : "B-roll"}"`,
      linhas: ["1 a 8 referências, qualquer tipo (Produto, Cenário, Personagem, Marca)."],
    };
  }
  if (modo === "trocarproduto") {
    return {
      titulo: 'Referências para "Trocar Produto"',
      linhas: ["1 vídeo de origem (obrigatório) + 1 a 8 imagens do tipo Produto."],
    };
  }
  if (modo === "sobreposicao") {
    return {
      titulo: 'Referências para "Sobreposição"',
      linhas: ["Modo ainda em desenvolvimento — sem seletor de referência por enquanto."],
    };
  }
  return {
    titulo: `Referências para "${modo === "narracao" ? "Narração" : "Música"}"`,
    linhas: ["Não usa referência de imagem — só duração e voz."],
  };
}

export function CreativesStep() {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>("imagem");
  const [titulo, setTitulo] = useState("");
  const [prompt, setPrompt] = useState("");
  const [audioDuration, setAudioDuration] = useState(AUDIO_DURATION_DEFAULT);
  const [voiceId, setVoiceId] = useState<string>("");
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const pollRef = useRef<number | null>(null);
  const createSectionRef = useRef<HTMLDivElement | null>(null);

  const [refs, setRefs] = useState<CreativeRef[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // PAINEL-MODELO-1, 01/10/2026 — modelos reais do modo atual, vindos do
  // catálogo (creativeCatalog.ts), substituindo o antigo mapeamento
  // hardcoded modeloPorModo. modeloId começa vazio; o efeito abaixo
  // escolhe o default assim que a lista chega.
  const [modelos, setModelos] = useState<CreativeModelDef[] | null>(null);
  const [modeloId, setModeloId] = useState<string>("");
  // PAINEL-REFAZER-1, 02/10/2026 -- "Refazer com variação": guarda o
  // modelo do job original até a lista de modelos do modo carregar, pra
  // não ser sobrescrito pelo default do catálogo (ver efeito abaixo).
  // Ponte de 1 render entre handleRefazer e esse efeito -- nunca fica em
  // estado.
  const pendingRefazerModeloRef = useRef<string | null>(null);
  // Aviso não-bloqueante: aparece quando "Refazer com variação" não
  // conseguiu reencontrar alguma referência original na Galeria atual.
  const [refazerAviso, setRefazerAviso] = useState<string | null>(null);

  // PAINEL-SEEDANCE-1, 01/10/2026 — duration/resolution confirmados contra
  // a doc oficial da Higgsfield (bytedance/seedance-2.5/image-to-video e
  // text-to-video): duration inteiro 4-30s, resolution 480p/720p/1080p.
  // Só usados em broll/propaganda (Seedance 2.5); imagem não tem vídeo.
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoResolution, setVideoResolution] = useState<"480p" | "720p" | "1080p">("720p");

  // GENJUTSU-1, 02/10/2026 -- video de origem (upload direto, nunca da
  // Galeria -- decisao do operador) e imagens de referencia do produto
  // novo (reaproveita os cartoes "produto" ja existentes em Referencias).
  const [genjutsuVideoUrl, setGenjutsuVideoUrl] = useState<string | null>(null);
  const [genjutsuVideoUploading, setGenjutsuVideoUploading] = useState(false);
  const [genjutsuVideoError, setGenjutsuVideoError] = useState<string | null>(null);
  const [genjutsuImagens, setGenjutsuImagens] = useState<string[]>([]);

  function reloadRefs() {
    api
      .get<CreativeRef[]>("/creative-refs")
      .then(setRefs)
      .catch(() => {})
      .finally(() => setLoadingRefs(false));
  }

  // ABAS-14 — recarrega a Galeria depois de excluir um job. Recarga
  // completa, não filtro local: o mesmo padrão de reloadRefs acima.
  function reloadJobs() {
    api
      .get<CreativeJob[]>("/creative-jobs")
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoadingJobs(false));
  }

  useEffect(() => {
    let cancelado = false;
    api
      .get<CreativeJob[]>("/creative-jobs")
      .then((rows) => {
        if (!cancelado) setJobs(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setLoadingJobs(false);
      });
    api
      .get<CreativeRef[]>("/creative-refs")
      .then((rows) => {
        if (!cancelado) setRefs(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setLoadingRefs(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if ((modo !== "narracao" && modo !== "musica") || voices !== null) return;
    api
      .get<{ voices: VoiceOption[] }>("/voice/voices")
      .then((r) => setVoices(r.voices))
      .catch(() => setVoices([]));
  }, [modo, voices]);

  // PAINEL-MODELO-1 — recarrega ao trocar de modo; escolhe o default
  // (default: true no catálogo) assim que a lista chega. Se não houver
  // default marcado (não deveria acontecer — ver nota em
  // creativeCatalog.ts), cai no primeiro da lista para nunca deixar o
  // select vazio.
  useEffect(() => {
    let cancelado = false;
    setModelos(null);
    api
      .get<CreativeModelDef[]>(`/creative-models?modo=${modo}`)
      .then((lista) => {
        if (cancelado) return;
        setModelos(lista);
        const pendente = pendingRefazerModeloRef.current;
        pendingRefazerModeloRef.current = null;
        const escolhido =
          (pendente && lista.find((m) => m.id === pendente)) || lista.find((m) => m.default) || lista[0];
        setModeloId(escolhido?.id ?? "");
      })
      .catch(() => {
        if (!cancelado) {
          setModelos([]);
          setModeloId("");
        }
      });
    return () => {
      cancelado = true;
    };
  }, [modo]);

  function upsertJob(job: CreativeJob) {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx === -1) return [job, ...prev];
      const copy = prev.slice();
      copy[idx] = job;
      return copy;
    });
  }

  async function handleGenerate() {
    if (!MODOS_COM_MOTOR.has(modo)) return;
    if (!titulo.trim() || !prompt.trim()) return;
    if (modo === "trocarproduto" && (!genjutsuVideoUrl || genjutsuImagens.length === 0)) return;
    // ABAS-30 -- resolve a URL da referência escolhida (se houver) a
    // partir da lista já carregada (refs) -- nenhuma chamada extra.
    const refEscolhida = refs.find((r) => r.id === refImagemId);

    setSubmitting(true);
    setError(null);
    setRefazerAviso(null);
    try {
      // PAINEL-MODELO-1, 01/10/2026 — modeloId vem do catálogo real
      // (/creative-models), escolhido automaticamente pelo default
      // curado ou trocado manualmente pela pessoa; substitui o antigo
      // mapeamento hardcoded modeloPorModo.
      const created = await api.post<CreativeJob>("/creative-jobs", {
        modo,
        modelo_id: modeloId,
        titulo: titulo.trim(),
        prompt: prompt.trim(),
        chave_cliente: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...(MODOS_DE_AUDIO.has(modo) ? { duracao_segundos: audioDuration } : {}),
        ...((modo === "broll" || modo === "propaganda")
          ? { video_duracao_segundos: videoDuration, video_resolution: videoResolution }
          : {}),
        ...(modo === "trocarproduto" ? { video_resolution: videoResolution } : {}),
        ...(modo === "trocarproduto"
          ? { video_url_fonte: genjutsuVideoUrl, imagens_referencia_urls: genjutsuImagens }
          : {}),
        ...((modo === "narracao" || modo === "musica") && voiceId ? { voice_id: voiceId } : {}),
        ...(modo === "imagem" && refEscolhida ? { imagem_referencia_url: refEscolhida.arquivo_url } : {}),
        ...((modo === "broll" || modo === "propaganda")
          ? (videoReferenciaUrls.length === 1
              ? { imagem_referencia_url: videoReferenciaUrls[0] }
              : videoReferenciaUrls.length >= 2
                ? { imagens_referencia_urls: videoReferenciaUrls }
                : {})
          : {}),
      });
      upsertJob(created);

      if (!ESTADOS_TERMINAIS.has(created.estado)) {
        pollRef.current = window.setInterval(async () => {
          const latest = await api.get<CreativeJob>(`/creative-jobs/${created.id}`);
          upsertJob(latest);
          if (ESTADOS_TERMINAIS.has(latest.estado) && pollRef.current) {
            window.clearInterval(pollRef.current);
          }
        }, POLL_INTERVAL_MS);
      }
      setTitulo("");
      setPrompt("");
      setRefImagemId("");
      setVideoReferenciaUrls([]);
      setGenjutsuVideoUrl(null);
      setGenjutsuImagens([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  // PAINEL-REFAZER-1, 02/10/2026 -- "Refazer com variação": preenche o
  // formulário a partir de um job pronto, pra gerar de novo ajustando o
  // que quiser. Nunca edita o job original -- sempre cria um job novo
  // (mesmo caminho do handleGenerate).
  function handleRefazer(job: CreativeJob) {
    setError(null);
    setRefazerAviso(null);
    const avisos: string[] = [];

    if (job.modo !== modo) {
      pendingRefazerModeloRef.current = job.modelo;
      setModo(job.modo);
    } else {
      setModeloId(job.modelo);
    }

    setTitulo(job.titulo);
    setPrompt(job.entrada.prompt ?? "");

    if (job.modo === "narracao" || job.modo === "musica") {
      setAudioDuration(job.entrada.duracao_segundos ?? AUDIO_DURATION_DEFAULT);
      setVoiceId(job.entrada.voice_id ?? "");
    }

    if (job.modo === "broll" || job.modo === "propaganda") {
      setVideoDuration(job.entrada.video_duracao_segundos ?? 5);
      setVideoResolution(job.entrada.video_resolution ?? "720p");
    }

    if (job.modo === "imagem") {
      const url = job.entrada.imagem_referencia_url ?? null;
      const encontrada = url ? refs.find((r) => r.arquivo_url === url) : undefined;
      setRefImagemId(encontrada?.id ?? "");
      if (url && !encontrada) {
        avisos.push(t("createVideo.creatives.refazerReferenciaIndisponivel"));
      }
    }

    if (job.modo === "broll" || job.modo === "propaganda") {
      const urlsOriginais =
        job.entrada.imagens_referencia_urls ?? (job.entrada.imagem_referencia_url ? [job.entrada.imagem_referencia_url] : []);
      const urlsDisponiveis = urlsOriginais.filter((u) => refs.some((r) => r.arquivo_url === u));
      setVideoReferenciaUrls(urlsDisponiveis);
      if (urlsDisponiveis.length < urlsOriginais.length) {
        avisos.push(t("createVideo.creatives.refazerReferenciaIndisponivel"));
      }
    }

    if (job.modo === "trocarproduto") {
      setVideoResolution(job.entrada.video_resolution ?? "720p");
      setGenjutsuVideoUrl(job.entrada.video_url_fonte ?? null);
      const urlsOriginais = job.entrada.imagens_referencia_urls ?? [];
      const urlsDisponiveis = urlsOriginais.filter((u) => refs.some((r) => r.arquivo_url === u && r.tipo === "produto"));
      setGenjutsuImagens(urlsDisponiveis);
      if (urlsDisponiveis.length < urlsOriginais.length) {
        avisos.push(t("createVideo.creatives.refazerReferenciaIndisponivel"));
      }
      if (!job.entrada.video_url_fonte) {
        avisos.push(t("createVideo.creatives.refazerVideoFonteIndisponivel"));
      }
    }

    if (avisos.length > 0) setRefazerAviso(avisos.join(" "));
    createSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ABAS-12/13 — alternativa ao "Gerar" em TODO modo: subir um arquivo
  // pronto. Áudio vai para uma rota (duração real decide 3-600s, recusa se
  // fora); os quatro visuais vão para outra (duração de vídeo é só aviso).
  async function handleUpload(file: File) {
    if (!titulo.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const endpoint = MODOS_DE_AUDIO.has(modo) ? "/creative-jobs/upload" : "/creative-jobs/upload-visual";
      const created = await api.upload<CreativeJob>(endpoint, file, file.name, {
        modo,
        titulo: titulo.trim(),
        chave_cliente: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      upsertJob(created);
      setTitulo("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setUploading(false);
    }
  }

  // ABAS-30 -- estado do seletor de imagem de referência (só
  // broll/propaganda; "" = nenhuma, gera por texto puro).
  // GENJUTSU-1, 02/10/2026 -- upload do video de origem (sempre novo,
  // nunca escolhido da Galeria -- decisao do operador) e selecao das
  // imagens de referencia do produto novo, entre os cartoes "produto" ja
  // enviados em Referencias (reaproveita refs, nenhum upload duplicado).
  async function handleGenjutsuVideo(file: File) {
    setGenjutsuVideoUploading(true);
    setGenjutsuVideoError(null);
    try {
      const up = await api.upload<{ url: string }>("/creative-jobs/genjutsu-source", file, file.name, {});
      setGenjutsuVideoUrl(up.url);
    } catch (err) {
      setGenjutsuVideoError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setGenjutsuVideoUploading(false);
    }
  }

  function toggleGenjutsuImagem(url: string) {
    setGenjutsuImagens((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : prev.length >= 8 ? prev : [...prev, url],
    );
  }

  function toggleVideoReferencia(url: string) {
    setVideoReferenciaUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : prev.length >= 8 ? prev : [...prev, url],
    );
  }

  // PAINEL-SEEDANCE-REF-MULTI-1, 02/10/2026 -- broll/propaganda: 0 ou 1
  // referência usa o caminho de sempre (image-to-video); 2+ usa
  // reference-to-video com array -- ver construirCorpoHiggsfield.
  const [videoReferenciaUrls, setVideoReferenciaUrls] = useState<string[]>([]);

  const [refImagemId, setRefImagemId] = useState<string>("");

  const podeGerar =
    MODOS_COM_MOTOR.has(modo) &&
    titulo.trim().length > 0 &&
    prompt.trim().length > 0 &&
    !submitting &&
    (modo !== "trocarproduto" || (genjutsuVideoUrl !== null && genjutsuImagens.length > 0));
  const podeUpload = titulo.trim().length > 0 && !uploading;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card criar-mockup" ref={createSectionRef}>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          {(["imagem", "propaganda", "broll", "trocarproduto", "sobreposicao", "narracao", "musica"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${modo === m ? " selected" : ""}`}
              style={{ padding: "7px 18px", fontSize: 14 }}
              onClick={() => setModo(m)}
            >
              {t(`createVideo.creatives.mode.${m}`)}
            </button>
          ))}
        </div>

        <div className="card-title" style={{ margin: "22px 0 0" }}>
          {t("createVideo.creatives.createTitle")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 36, marginTop: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16, minWidth: 0, alignContent: "start" }}>
            <Field label={t("createVideo.creatives.materialTitleLabel")} help={t("createVideo.creatives.materialTitleHelp")}>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={80}
                placeholder={t("createVideo.creatives.materialTitlePlaceholder")}
              />
            </Field>
            {modo === "trocarproduto" && (
              <>
                <Field
                  label={t("createVideo.creatives.genjutsuVideoLabel")}
                  help={t("createVideo.creatives.genjutsuVideoHelp")}
                >
                  <label className="btn btn-file" style={{ opacity: genjutsuVideoUploading ? 0.6 : 1 }}>
                    {genjutsuVideoUploading
                      ? t("createVideo.creatives.genjutsuVideoUploading")
                      : genjutsuVideoUrl
                        ? t("createVideo.creatives.genjutsuVideoReady")
                        : t("createVideo.creatives.orUploadFile")}
                    <input
                      type="file"
                      accept="video/*"
                      hidden
                      disabled={genjutsuVideoUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) handleGenjutsuVideo(f);
                      }}
                    />
                  </label>
                  {genjutsuVideoError && (
                    <p className="alert-error" style={{ fontSize: 12, margin: "6px 0 0" }}>
                      {genjutsuVideoError}
                    </p>
                  )}
                </Field>
                <Field
                  label={t("createVideo.creatives.genjutsuImagesLabel")}
                  help={t("createVideo.creatives.genjutsuImagesHelp")}
                >
                  {refs.filter((r) => r.tipo === "produto").length === 0 ? (
                    <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                      {t("createVideo.creatives.genjutsuImagesEmpty")}
                    </p>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {refs
                        .filter((r) => r.tipo === "produto")
                        .map((r) => (
                          <span
                            key={r.id}
                            className={`chip${genjutsuImagens.includes(r.arquivo_url) ? " selected" : ""}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => toggleGenjutsuImagem(r.arquivo_url)}
                          >
                            {r.rotulo ?? r.arquivo_url.slice(-10)}
                          </span>
                        ))}
                    </div>
                  )}
                </Field>
              </>
            )}

            {(modo === "broll" || modo === "propaganda") && (
              <Field
                label={t("createVideo.creatives.referenceImagesMultiLabel")}
                help={t("createVideo.creatives.referenceImagesMultiHelp")}
              >
                {refs.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                    {t("createVideo.creatives.referenceImagesMultiEmpty")}
                  </p>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {refs.map((r) => (
                      <span
                        key={r.id}
                        className={`chip${videoReferenciaUrls.includes(r.arquivo_url) ? " selected" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleVideoReferencia(r.arquivo_url)}
                      >
                        {t(`createVideo.creatives.card.${r.tipo}`)}
                        {r.rotulo ? ` — ${r.rotulo}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            )}
            {MODOS_DE_AUDIO.has(modo) ? (
              <Field label={t("createVideo.creatives.audioDurationLabel")} help={t("createVideo.creatives.audioDurationHelp")}>
                <input
                  type="number"
                  min={AUDIO_DURATION_MIN}
                  max={AUDIO_DURATION_MAX}
                  value={audioDuration}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setAudioDuration(Math.min(AUDIO_DURATION_MAX, Math.max(AUDIO_DURATION_MIN, v)));
                    }
                  }}
                />
              </Field>
            ) : (
              <>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Field label={t("createVideo.creatives.modelLabel")}>
                      <select
                        value={modeloId}
                        onChange={(e) => setModeloId(e.target.value)}
                        disabled={!modelos || modelos.length <= 1}
                      >
                        {(modelos ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {modo !== "trocarproduto" && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {modo === "broll" || modo === "propaganda" ? (
                        <Field label={`${t("createVideo.creatives.durationLabel")} (${videoDuration}s)`}>
                          <input
                            type="range"
                            min={4}
                            max={30}
                            value={videoDuration}
                            onChange={(e) => setVideoDuration(Number(e.target.value))}
                          />
                        </Field>
                      ) : (
                        <Field label={t("createVideo.creatives.durationLabel")}>
                          <input type="range" min={4} max={30} defaultValue={5} disabled />
                        </Field>
                      )}
                    </div>
                  )}
                </div>
                {(modo === "trocarproduto" || modo === "broll" || modo === "propaganda") && (
                  <Field
                    label={t("createVideo.creatives.resolutionLabel")}
                    help={modo === "trocarproduto" ? t("createVideo.creatives.genjutsuResolutionHelp") : undefined}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {(["480p", "720p", "1080p"] as const).map((r) => (
                        <span
                          key={r}
                          className={`chip${videoResolution === r ? " selected" : ""}`}
                          style={{ cursor: "pointer" }}
                          onClick={() => setVideoResolution(r)}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </Field>
                )}
              </>
            )}
            {(modo === "narracao" || modo === "musica") && voices && voices.length > 0 && (
              <Field label={t("createVideo.creatives.voiceLabel")} help={t("createVideo.creatives.voiceHelp")}>
                <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  <option value="">{t("createVideo.creatives.voiceDefault")}</option>
                  {voices.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t("createVideo.creatives.promptLabel")}>
              <textarea
                rows={12}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("createVideo.creatives.promptPlaceholder")}
              />
            </Field>
            {!MODOS_COM_MOTOR.has(modo) && (
              <p className="text-muted" style={{ fontSize: 12 }}>
                {t("createVideo.creatives.modeNotReadyYet")}
              </p>
            )}
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
            {(() => {
              const info = referenciaResumo(modo, modeloId);
              const selecionadas: string[] =
                modo === "imagem"
                  ? refImagemId
                    ? [refImagemId]
                    : []
                  : modo === "broll" || modo === "propaganda"
                  ? videoReferenciaUrls
                  : modo === "trocarproduto"
                  ? [...(genjutsuVideoUrl ? [genjutsuVideoUrl] : []), ...genjutsuImagens]
                  : [];
              return (
                <div
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "14px 16px",
                    background: "#fafafa",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "#374151" }}>
                    {info.titulo}
                  </div>
                  {info.linhas.map((linha, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
                      {linha}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <label className="btn btn-file" style={{ opacity: podeUpload ? 1 : 0.6, flex: 1, textAlign: "center" }}>
                      {uploading ? t("createVideo.creatives.uploading") : "Escolher arquivos"}
                      <input
                        type="file"
                        accept={ACCEPT_POR_MODO[modo]}
                        hidden
                        disabled={!podeUpload}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) handleUpload(f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn"
                      title="Em breve"
                      onClick={(e) => e.preventDefault()}
                      style={{
                        flex: 1,
                        borderColor: "#7CC934",
                        background: "#f0fdf4",
                        color: "#3f6212",
                        cursor: "default",
                      }}
                    >
                      🖼 Escolher da Galeria
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    "Escolher da Galeria" abre o seletor ao lado — dá pra marcar direto uma ou mais imagens já geradas antes, sem precisar passar primeiro por "Usar como referência" no card de cada job.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 104px))", justifyContent: "start", gap: 6, marginTop: 6 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          aspectRatio: "1 / 1",
                          borderRadius: 8,
                          border: selecionadas[i] ? "1px solid #7CC934" : "1px dashed #d1d5db",
                          background: selecionadas[i] ? "#f0fdf4" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
            {!podeUpload && !uploading && (
              <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                {t("createVideo.creatives.uploadNeedsTitle")}
              </p>
            )}
            {uploadError && (
              <p className="alert-error" style={{ fontSize: 12, margin: 0 }}>
                {uploadError}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {t("createVideo.creatives.costLabel")}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {t("createVideo.creatives.costSimulatedNote")}
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!podeGerar}>
            {submitting ? t("createVideo.creatives.generating") : t("createVideo.creatives.generateButton")}
          </button>
        </div>
        {refazerAviso && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
            {refazerAviso}
          </p>
        )}
        {error && (
          <p className="alert-error" style={{ fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-title">{t("createVideo.creatives.galleryTitle")}</div>
        <p className="text-muted" style={{ marginTop: 4, fontSize: 13 }}>
          {t("createVideo.creatives.galleryHint")}
        </p>
        {loadingJobs && <p className="text-muted">{t("createVideo.creatives.loadingJobs")}</p>}
        {!loadingJobs && jobs.length === 0 && (
          <p className="text-muted">{t("createVideo.creatives.noJobs")}</p>
        )}
        <div
          style={{
            display: "grid",
            gap: 14,
            marginTop: 12,
          }}
        >
          {(["imagem", "propaganda", "broll", "trocarproduto", "sobreposicao", "narracao", "musica"] as const).map((m) => {
            const doModo = jobs.filter((job) => job.modo === m);
            if (doModo.length === 0) return null;
            return (
              <div key={m} style={{ marginTop: 16 }}>
                <div className="text-muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  {t(`createVideo.creatives.mode.${m}`)}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 14,
                  }}
                >
                  {doModo.map((job) => (
                    <JobCard key={job.id} job={job} onDeleted={reloadJobs} onCancelled={reloadJobs} onUsedAsReference={reloadRefs} onRefazer={handleRefazer} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReferenceCard({
  tipo,
  refs,
  onChanged,
}: {
  tipo: TipoReferencia;
  refs: CreativeRef[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [rotulo, setRotulo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cheio = refs.length >= 8;

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      await api.upload<CreativeRef>("/creative-refs", file, file.name, {
        tipo,
        ...(rotulo.trim() ? { rotulo: rotulo.trim() } : {}),
      });
      setRotulo("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await api.delete(`/creative-refs/${id}`).catch(() => {});
    onChanged();
  }

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gap: 10,
        background: "var(--color-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong style={{ fontSize: 14 }}>{t(`createVideo.creatives.card.${tipo}`)}</strong>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {refs.length}/8
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {refs.map((r) => (
          <div key={r.id} style={{ position: "relative", aspectRatio: "1/1" }}>
            <img
              src={r.arquivo_url}
              alt={r.rotulo ?? ""}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
            />
            <button
              type="button"
              onClick={() => handleDelete(r.id)}
              aria-label={t("createVideo.creatives.removeReference")}
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 20,
                height: 20,
                lineHeight: "18px",
                padding: 0,
                borderRadius: 10,
                border: "none",
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
        {Array.from({ length: Math.max(0, 8 - refs.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            style={{ aspectRatio: "1/1", borderRadius: 8, border: "1px dashed var(--color-border)" }}
          />
        ))}
      </div>
      <input
        type="text"
        value={rotulo}
        onChange={(e) => setRotulo(e.target.value)}
        maxLength={80}
        disabled={cheio || uploading}
        placeholder={t("createVideo.creatives.referenceLabelPlaceholder")}
      />
      <label className="btn btn-file" style={{ opacity: cheio ? 0.6 : 1 }}>
        {uploading ? t("createVideo.creatives.uploading") : t("createVideo.creatives.chooseFiles")}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={cheio || uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      </label>
      {error && (
        <p className="alert-error" style={{ fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function JobCard({ job, onDeleted, onCancelled, onUsedAsReference, onRefazer }: { job: CreativeJob; onDeleted: () => void; onCancelled: () => void; onUsedAsReference: () => void; onRefazer: (job: CreativeJob) => void }) {
  const { t } = useTranslation();
  const ehAudio = job.modo === "narracao" || job.modo === "musica";
  const ehVideo = !ehAudio && job.arquivo_url && ehArquivoDeVideo(job.arquivo_url);
  const [cancelando, setCancelando] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showTipoPicker, setShowTipoPicker] = useState(false);
  const [savingRef, setSavingRef] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  async function handleDelete() {
    await api.delete(`/creative-jobs/${job.id}`).catch(() => {});
    onDeleted();
  }

  async function handleCancel() {
    setCancelando(true);
    setCancelError(null);
    try {
      await api.post(`/creative-jobs/${job.id}/cancel`, {});
      onCancelled();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setCancelando(false);
    }
  }

  async function handleUseAsReference(tipo: TipoReferencia) {
    setSavingRef(true);
    setRefError(null);
    try {
      await api.post("/creative-refs/from-job", { job_id: job.id, tipo });
      setShowTipoPicker(false);
      onUsedAsReference();
    } catch (err) {
      setRefError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSavingRef(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--color-surface)",
      }}
    >
      {ehAudio ? (
        job.arquivo_url && job.estado === "pronto" && (
          <div style={{ padding: 12 }}>
            <audio controls src={job.arquivo_url} style={{ width: "100%" }} />
          </div>
        )
      ) : ehVideo ? (
        job.arquivo_url && (
          <video controls src={job.arquivo_url} style={{ width: "100%", height: 140, objectFit: "cover" }} />
        )
      ) : (
        <div
          style={{
            height: 140,
            background: job.arquivo_url ? `center / cover no-repeat url(${job.arquivo_url})` : "var(--color-surface-raised)",
          }}
        />
      )}
      <div style={{ padding: 12, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{job.titulo}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip selected">{t(`createVideo.creatives.mode.${job.modo}`)}</span>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {t(`createVideo.creatives.state.${job.estado}`)}
          </span>
          {job.simulated && (
            <span className="text-muted" style={{ fontSize: 11 }}>
              {t("createVideo.creatives.simulated")}
            </span>
          )}
        </div>
        {/* ABAS-13 — aviso, nunca bloqueio: vídeo enviado fora de 4-30s. */}
        {job.entrada?.duracao_fora_do_esperado && (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            {t("createVideo.creatives.durationOutOfRange")}
          </p>
        )}
        {job.estado === "falhou" && job.erro_fornecedor && (
          <p className="alert-error" style={{ fontSize: 12, margin: 0 }}>
            {job.erro_fornecedor}
          </p>
        )}
        {job.arquivo_url && (
          <a
            className="btn btn-outline"
            href={job.arquivo_url}
            download
            style={{ fontSize: 12, justifySelf: "start" }}
          >
            {t("createVideo.creatives.downloadJob")}
          </a>
        )}
        {job.estado === "pronto" && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onRefazer(job)}
            style={{ fontSize: 12, justifySelf: "start" }}
          >
            {t("createVideo.creatives.refazerComVariacao")}
          </button>
        )}
        {job.estado === "na_fila" && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleCancel}
            disabled={cancelando}
            style={{ fontSize: 12, justifySelf: "start" }}
          >
            {cancelando ? t("createVideo.creatives.cancelling") : t("createVideo.creatives.cancelJob")}
          </button>
        )}
        {cancelError && (
          <p className="alert-error" style={{ fontSize: 12, margin: 0 }}>
            {cancelError}
          </p>
        )}
        {!ehAudio && !ehVideo && job.arquivo_url && job.estado === "pronto" && (
          <div style={{ display: "grid", gap: 4 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowTipoPicker((v) => !v)}
              style={{ fontSize: 12, justifySelf: "start" }}
            >
              {t("createVideo.creatives.useAsReference")}
            </button>
            {showTipoPicker && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {REFERENCIAS.map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    className="chip"
                    disabled={savingRef}
                    onClick={() => handleUseAsReference(tipo)}
                  >
                    {t(`createVideo.creatives.card.${tipo}`)}
                  </button>
                ))}
              </div>
            )}
            {refError && (
              <p className="alert-error" style={{ fontSize: 12, margin: 0 }}>
                {refError}
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleDelete}
          style={{ fontSize: 12, justifySelf: "start" }}
        >
          {t("createVideo.creatives.removeJob")}
        </button>
      </div>
    </div>
  );
}
