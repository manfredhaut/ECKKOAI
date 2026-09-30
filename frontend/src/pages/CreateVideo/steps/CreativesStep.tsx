import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import type { CreativeJob, CreativeRef } from "../../../types";

interface VoiceOption {
  voice_id: string;
  name: string;
}

/**
 * Aba "5. Gerar Vídeos & Imagens" — ABAS-2 (esqueleto) → ABAS-7 (Criar/
 * Galeria reais) → ABAS-8 (Referências reais) → ABAS-11, 30/09/2026
 * (Narração/Música por IA: prompt próprio, voz opcional, duração 3-600s).
 *
 * "Gerar referência" (origem = "gerada") ainda não existe — fica desabilitado
 * de propósito, com a mesma disciplina de aviso honesto usada nos modos
 * Propaganda/B-roll/Sobreposição.
 *
 * Upload direto de narração/música (ABAS-12, ainda não escrito) é uma rota
 * separada, com teto de tamanho proporcional à duração pedida — não existe
 * ainda; o campo "ou envie um arquivo" some até lá.
 *
 * DURAÇÃO: dois domínios distintos, nunca compartilham faixa. O controle de
 * 4-30s abaixo é do vídeo (b-roll/imagem/propaganda/sobreposição) — nada a
 * ver com áudio. Narração/música têm o PRÓPRIO controle, 3-600s (o piso é o
 * mínimo real da API de música do fornecedor; o teto é o mesmo valor "de
 * dinheiro" que MAX_SCRIPT_SECONDS já usa no pipeline principal —
 * services/video/scriptDuration.ts —, reproduzido aqui como constante
 * própria de propósito: os dois domínios não devem ficar acoplados por um
 * import cruzado entre o roteiro do avatar e o áudio independente da aba 5).
 */

type Modo = "imagem" | "propaganda" | "broll" | "sobreposicao" | "narracao" | "musica";
const MODOS_DE_AUDIO = new Set<Modo>(["narracao", "musica"]);
const AUDIO_DURATION_MIN = 3;
const AUDIO_DURATION_MAX = 600;
const AUDIO_DURATION_DEFAULT = 30;

const REFERENCIAS = ["produto", "cenario", "personagem", "marca"] as const;
type TipoReferencia = (typeof REFERENCIAS)[number];

const POLL_INTERVAL_MS = 2000;
const ESTADOS_TERMINAIS = new Set(["pronto", "falhou", "recusado", "cancelado"]);

export function CreativesStep() {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>("broll");
  const [titulo, setTitulo] = useState("");
  const [prompt, setPrompt] = useState("");
  const [audioDuration, setAudioDuration] = useState(AUDIO_DURATION_DEFAULT);
  const [voiceId, setVoiceId] = useState<string>("");
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const pollRef = useRef<number | null>(null);

  const [refs, setRefs] = useState<CreativeRef[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  function reloadRefs() {
    api
      .get<CreativeRef[]>("/creative-refs")
      .then(setRefs)
      .catch(() => {})
      .finally(() => setLoadingRefs(false));
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

  // Vozes são OPCIONAIS: quem não escolher usa a voz padrão do modelo. A
  // lista só é buscada quando a pessoa entra no modo Narração pela primeira
  // vez — nenhuma chamada extra para quem nunca abre esse modo. Falha aqui
  // NUNCA vira erro de tela: sem credencial de voz configurada, o seletor
  // simplesmente não aparece — a aba 5 nunca cita o nome do fornecedor,
  // nem mesmo no motivo de uma falha (mesma regra do card de credencial).
  useEffect(() => {
    if (modo !== "narracao" || voices !== null) return;
    api
      .get<{ voices: VoiceOption[] }>("/voice/voices")
      .then((r) => setVoices(r.voices))
      .catch(() => setVoices([]));
  }, [modo, voices]);

  function upsertJob(job: CreativeJob) {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx === -1) return [job, ...prev];
      const copy = prev.slice();
      copy[idx] = job;
      return copy;
    });
  }

  const MODOS_COM_MOTOR = new Set<Modo>(["imagem", "narracao", "musica"]);

  async function handleGenerate() {
    // ESQUELETO — Propaganda/B-roll/Sobreposição ainda não têm motor de
    // jobs. Imagem (ABAS-5/6) e Narração/Música (ABAS-10/11) têm.
    if (!MODOS_COM_MOTOR.has(modo)) return;
    if (!titulo.trim() || !prompt.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const modeloPorModo: Record<string, string> = {
        imagem: "soul-2",
        narracao: "voz-narracao",
        musica: "musica-jingle",
      };
      const created = await api.post<CreativeJob>("/creative-jobs", {
        modo,
        modelo_id: modeloPorModo[modo],
        titulo: titulo.trim(),
        prompt: prompt.trim(),
        chave_cliente: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...(MODOS_DE_AUDIO.has(modo) ? { duracao_segundos: audioDuration } : {}),
        ...(modo === "narracao" && voiceId ? { voice_id: voiceId } : {}),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  const podeGerar = MODOS_COM_MOTOR.has(modo) && titulo.trim().length > 0 && prompt.trim().length > 0 && !submitting;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card-title">{t("createVideo.creatives.referencesTitle")}</div>
        <p className="text-muted" style={{ marginTop: 4, fontSize: 13 }}>
          {t("createVideo.creatives.referencesHint")}
        </p>
        {loadingRefs && <p className="text-muted">{t("createVideo.creatives.loadingJobs")}</p>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginTop: 12,
          }}
        >
          {REFERENCIAS.map((tipo) => (
            <ReferenceCard
              key={tipo}
              tipo={tipo}
              refs={refs.filter((r) => r.tipo === tipo)}
              onChanged={reloadRefs}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>
            {t("createVideo.creatives.createTitle")}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["imagem", "propaganda", "broll", "sobreposicao", "narracao", "musica"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${modo === m ? " selected" : ""}`}
                onClick={() => setModo(m)}
              >
                {t(`createVideo.creatives.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label={t("createVideo.creatives.materialTitleLabel")} help={t("createVideo.creatives.materialTitleHelp")}>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={80}
              placeholder={t("createVideo.creatives.materialTitlePlaceholder")}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 20, marginTop: 6 }}>
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {t("createVideo.creatives.insertReferenceLabel")}
              </span>
              {REFERENCIAS.map((tipo) => (
                <button key={tipo} type="button" className="chip" disabled>
                  {t(`createVideo.creatives.card.${tipo}`)}
                </button>
              ))}
            </div>
            <Field label={t("createVideo.creatives.promptLabel")}>
              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("createVideo.creatives.promptPlaceholder")}
              />
            </Field>
            <p className="text-muted" style={{ fontSize: 12 }}>
              {t("createVideo.creatives.promptHint")}
            </p>
            {!MODOS_COM_MOTOR.has(modo) && (
              <p className="text-muted" style={{ fontSize: 12 }}>
                {t("createVideo.creatives.modeNotReadyYet")}
              </p>
            )}
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
            {MODOS_DE_AUDIO.has(modo) ? (
              <>
                <Field
                  label={t("createVideo.creatives.audioDurationLabel")}
                  help={t("createVideo.creatives.audioDurationHelp")}
                >
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
                {modo === "narracao" && voices && voices.length > 0 && (
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
              </>
            ) : (
              <>
                <Field label={t("createVideo.creatives.modelLabel")}>
                  <select disabled>
                    <option>Soul 2</option>
                  </select>
                </Field>
                <Field label={t("createVideo.creatives.durationLabel")}>
                  <input type="range" min={4} max={30} defaultValue={5} disabled />
                </Field>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="chip selected">16:9</span>
                  <span className="chip">9:16</span>
                  <span className="chip">4:5</span>
                  <span className="chip">1:1</span>
                </div>
              </>
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
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 12,
          }}
        >
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
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

function JobCard({ job }: { job: CreativeJob }) {
  const { t } = useTranslation();
  const ehAudio = job.modo === "narracao" || job.modo === "musica";
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
            {/* Player nativo do navegador já traz o controle de volume — o
                mesmo componente usado em VoiceSampleRecorder.tsx e
                AvatarSetupStep.tsx neste projeto. "Exportar" reusa o mesmo
                arquivo_url que o download da Galeria já serve. */}
            <audio controls src={job.arquivo_url} style={{ width: "100%" }} />
          </div>
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
        {job.estado === "falhou" && job.erro_fornecedor && (
          <p className="alert-error" style={{ fontSize: 12, margin: 0 }}>
            {job.erro_fornecedor}
          </p>
        )}
      </div>
    </div>
  );
}
