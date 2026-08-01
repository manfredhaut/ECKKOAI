import { useTranslation } from "react-i18next";
import { PUBLISH_PLATFORMS } from "../publishPlatforms";

/**
 * Onde o vídeo vai ser publicado — e, por consequência, em que proporção ele é
 * gerado.
 *
 * A escolha oferecida é a PLATAFORMA, não a proporção: ninguém abre a
 * ferramenta querendo "9:16", quer publicar no Reels. A proporção aparece como
 * informação ao lado, porque quem já sabe o que quer precisa conferir.
 *
 * O aviso no rodapé não é ornamento nem modéstia: até hoje nenhuma geração
 * enviou proporção ao fornecedor, e a única medição que existe é de um vídeo
 * horizontal. Afirmar que o vertical sai vertical seria prometer o que não foi
 * verificado — o mesmo contrato das feature flags, que mostram o recurso e
 * dizem o que falta.
 */
export function PublishStep({
  platform,
  onChange,
}: {
  platform: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.publish.title")}</div>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        {t("createVideo.publish.subtitle")}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {PUBLISH_PLATFORMS.map((option) => {
          const selected = platform === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`chip${selected ? " selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: "auto",
                padding: "10px 14px",
                textAlign: "left",
              }}
            >
              {/* A proporção desenhada, e não só escrita: "4:5" e "1:1" são
                  indistinguíveis para quem não pensa em número o dia todo. */}
              <span
                aria-hidden="true"
                style={{
                  width: option.preview.width,
                  height: option.preview.height,
                  border: "2px solid currentColor",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              />
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                <strong>{t(`createVideo.publish.platforms.${option.id}`)}</strong>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{option.aspectRatio}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 16 }}>
        {t("createVideo.publish.notVerified")}
      </p>
    </div>
  );
}
