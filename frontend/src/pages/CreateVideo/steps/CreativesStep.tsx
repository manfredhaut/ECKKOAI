import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../../../components/ui/Field";

/**
 * Aba "5. Gerar Vídeos & Imagens" (Higgsfield) — ABAS-2, 29/09/2026.
 *
 * ESQUELETO PURO: nenhuma chamada de rede, nenhum estado persistido, nenhum
 * dado real. O motor de jobs (migration 088, credencial, /estimate, envio,
 * sondagem) é o bloco seguinte do plano — este arquivo só prova a tela.
 * Os cartões de "Galeria" abaixo são EXEMPLOS estáticos, nunca dado do
 * servidor: não existe rota nem tabela ainda para eles virem de verdade.
 */

type Modo = "imagem" | "propaganda" | "broll" | "sobreposicao";

const REFERENCIAS = ["produto", "cenario", "personagem", "marca"] as const;
type TipoReferencia = (typeof REFERENCIAS)[number];

export function CreativesStep() {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>("broll");
  const [titulo, setTitulo] = useState("");
  const [prompt, setPrompt] = useState("");

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
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
            <Field label={t("createVideo.creatives.modelLabel")}>
              <select disabled>
                <option>Seedance 2.5</option>
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
          <button type="button" className="btn btn-primary" disabled title={t("createVideo.creatives.generateDisabledHint")}>
            {t("createVideo.creatives.generateButton")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t("createVideo.creatives.galleryTitle")}</div>
        <p className="text-muted" style={{ marginTop: 4, fontSize: 13 }}>
          {t("createVideo.creatives.galleryHint")}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 12,
          }}
        >
          <ExampleJobCard
            titulo={t("createVideo.creatives.exampleBrollTitle")}
            selo={t("createVideo.creatives.mode.broll")}
            estado={t("createVideo.creatives.jobReady")}
          />
          <ExampleJobCard
            titulo={t("createVideo.creatives.exampleImageTitle")}
            selo={t("createVideo.creatives.mode.imagem")}
            estado={t("createVideo.creatives.jobReady")}
          />
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1/1",
              borderRadius: 8,
              border: "1px dashed var(--color-border)",
            }}
          />
        ))}
      </div>
      <button type="button" className="btn btn-secondary" disabled>
        {t("createVideo.creatives.chooseFiles")}
      </button>
    </div>
  );
}

function ExampleJobCard({ titulo, selo, estado }: { titulo: string; selo: string; estado: string }) {
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
          background: "var(--color-surface-raised)",
        }}
      />
      <div style={{ padding: 12, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{titulo}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip selected">{selo}</span>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {estado}
          </span>
        </div>
      </div>
    </div>
  );
}
