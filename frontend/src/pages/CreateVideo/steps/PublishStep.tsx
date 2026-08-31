import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { PUBLISH_PLATFORMS } from "../publishPlatforms";

interface FormatSupport {
  vendor: string | null;
  supported: boolean;
  evidence: string;
  reason: string;
}

/**
 * Onde o vídeo vai ser publicado — e, por consequência, em que proporção ele é
 * gerado.
 *
 * A escolha oferecida é a PLATAFORMA, não a proporção: ninguém abre a
 * ferramenta querendo "9:16", quer publicar no Reels. A proporção aparece como
 * informação ao lado, porque quem já sabe o que quer precisa conferir.
 *
 * O aviso no rodapé não é ornamento nem modéstia: as únicas medições reais
 * que existem são de vídeos VERTICAIS (9:16) — Wan em 19/08
 * (`videoFormat.ts`, `VENDOR_FORMAT_SUPPORT.fal`) e HeyGen em 02/08
 * (`formatConfidenceForTier`, `CONFIANCA_SIMPLES["9:16"]`). Os outros três
 * destinos (16:9, 4:5, 1:1), em qualquer vendor, ainda não passaram por uma
 * geração de verdade. Afirmar que eles saem como pedido seria prometer o que
 * não foi verificado — o mesmo contrato das feature flags, que mostram o
 * recurso e dizem o que falta.
 *
 * ┌─ 4:5 bloqueado no tier Normal — V25, 31/08/2026 ──────────────────────────┐
 * │ MEDIDO por leitura do schema oficial (WebFetch, V24): o enum de           │
 * │ `aspect_ratio` de `wan/v2.6/reference-to-video/flash` (o motor do tier    │
 * │ Normal) é EXATAMENTE `["16:9","9:16","1:1","4:3","3:4"]` — 4:5 não está   │
 * │ nele. `nano-banana-2/edit` (o `compor`) aceita 4:5 — a composição sairia  │
 * │ cobrada e só a animação (mais cara, e a que já foi paga na composição)    │
 * │ seria recusada pelo fornecedor. Bloquear ANTES é o mesmo raciocínio de    │
 * │ Fundo/Look (SceneStep.tsx): campo escolhido que o servidor rejeitaria     │
 * │ depois de cobrar é pior que campo ausente. Escopo: só o tier NORMAL — o   │
 * │ enum do HeyGen (tier Simples) inclui 4:5, e o Premium (Seedance) não foi  │
 * │ medido nesta rodada.                                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export function PublishStep({
  platform,
  onChange,
  tierVideo,
}: {
  platform: string;
  onChange: (value: string) => void;
  tierVideo: string;
}) {
  const { t } = useTranslation();

  // O provedor conectado a este tenant honra a proporção? A resposta muda o que
  // a tela pode PROMETER, e por isso é buscada antes de desenhar os botões.
  // Enquanto não chega, `null` é tratado como "ainda não sei" e nada é
  // desabilitado — piscar os botões entre habilitado e inerte seria pior que
  // esperar um instante.
  const [support, setSupport] = useState<FormatSupport | null>(null);
  useEffect(() => {
    api
      .get<FormatSupport>("/video-format-support")
      .then(setSupport)
      .catch(() => setSupport(null));
  }, []);
  const naoHonra = support !== null && !support.supported;
  // Só o 4:5 (`instagram_feed`), só no tier Normal — ver o comentário acima.
  const feed45BloqueadoNoNormal = tierVideo === "normal";

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.publish.title")}</div>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        {t("createVideo.publish.subtitle")}
      </p>

      {/* Contrato das feature flags aplicado aqui: o recurso não SOME quando
          está indisponível — aparece inerte, com o motivo. Sumir faz parecer
          defeito; deixar clicável faz o cliente escolher um destino que o
          provedor dele vai ignorar em silêncio. */}
      {naoHonra && (
        <p className="alert-error" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          {t("createVideo.publish.notHonored")} {support?.reason}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, opacity: naoHonra ? 0.55 : 1 }}>
        {PUBLISH_PLATFORMS.map((option) => {
          const selected = platform === option.id;
          // Só o 4:5 (instagram_feed) é afetado, e só no tier Normal — ver o
          // comentário no topo do arquivo. Nenhum outro destino muda.
          const bloqueadoPeloTier = option.id === "instagram_feed" && feed45BloqueadoNoNormal;
          return (
            <button
              key={option.id}
              type="button"
              className={`chip${selected ? " selected" : ""}`}
              aria-pressed={selected}
              disabled={naoHonra || bloqueadoPeloTier}
              onClick={() => onChange(option.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: "auto",
                padding: "10px 14px",
                textAlign: "left",
                opacity: bloqueadoPeloTier ? 0.55 : 1,
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
                {/* O motivo, ANEXADO ao próprio chip — não um banner separado
                    que só se lê depois de já ter clicado. Só o 4:5 no Normal
                    ganha esta segunda linha. */}
                {bloqueadoPeloTier && (
                  <span style={{ fontSize: 11, opacity: 0.85 }}>
                    {t("createVideo.publish.instagramFeedTierNotice")}
                  </span>
                )}
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
