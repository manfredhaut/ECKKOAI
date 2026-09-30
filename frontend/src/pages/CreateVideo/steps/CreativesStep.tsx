import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import type { CreativeJob } from "../../../types";

/**
 * Aba "5. Gerar Vídeos & Imagens" — ABAS-2 (esqueleto) → ABAS-7 (ligada à
 * rota real, 29/09/2026). Só o modo "imagem", só em fixture: a rota
 * (creativeJobs.ts) recusa qualquer outro modo e qualquer PROVIDER_MODE
 * diferente de fixture com 400/501 — ver os comentários lá.
 *
 * Referências (Produto/Cenário/Personagem/Marca) continuam ESQUELETO puro
 * nesta rodada: sem creative_refs ligado ainda. Só "Criar" e "Galeria" são
 * reais.
 */

type Modo = "imagem" | "propaganda" | "broll" | "sobreposicao";

const REFERENCIAS = ["produto", "cenario", "personagem", "marca"] as const;
type TipoReferencia = (typeof REFERENCIAS)[number];

const POLL_INTERVAL_MS = 2000;
const ESTADOS_TERMINAIS = new Set(["pronto", "falhou", "recusado", "cancelado"]);

export function CreativesStep() {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>("broll");
  const [titulo, setTitulo] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const pollRef = useRef<number | null>(null);

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
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

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
    // ESQUELETO — só o modo "imagem" tem motor de jobs nesta rodada
    // (ABAS-5/6). Os outros três continuam sem POST real.
    if (modo !== "imagem") return;
    if (!titulo.trim() || !prompt.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<CreativeJob>("/creative-jobs", {
        modo: "imagem",
        modelo_id: "soul-2",
        titulo: titulo.trim(),
        prompt: prompt.trim(),
        chave_cliente: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
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

  const podeGerar = modo === "imagem" && titulo.trim().length > 0 && prompt.trim().length > 0 && !submitting;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div className="card-title">{t("createVideo.creatives.referencesTitle")}</div>
        <p className="text-muted" style={{ marginTop: 4, fontSize: 13 }}>
          {t("createVideo.creatives.referencesHint")}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginTop: 12,
          }}
        >
          {REFERENCIAS.map((tipo) => (
            <ReferenceCard key={tipo} tipo={tipo} />
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>
            {t("createVideo.creatives.createTitle")}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["imagem", "propaganda", "broll", "sobreposicao"] as const).map((m) => (
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
            {modo !== "imagem" && (
              <p className="text-muted" style={{ fontSize: 12 }}>
                {t("createVideo.creatives.modeNotReadyYet")}
              </p>
            )}
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
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

function ReferenceCard({ tipo }: { tipo: TipoReferencia }) {
  const { t } = useTranslation();
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
          0/8
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: "1/1", borderRadius: 8, border: "1px dashed var(--color-border)" }} />
        ))}
      </div>
      <button type="button" className="btn btn-secondary" disabled>
        {t("createVideo.creatives.chooseFiles")}
      </button>
    </div>
  );
}

function JobCard({ job }: { job: CreativeJob }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--color-surface)",
      }}
    >
      <div
        style={{
          height: 140,
          background: job.arquivo_url ? `center / cover no-repeat url(${job.arquivo_url})` : "var(--color-surface-raised)",
        }}
      />
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
