import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";

/**
 * Custo de um vídeo: a estimativa de antes e a medição de depois.
 *
 * As duas juntas, sempre. A estimativa sozinha foi o que deixou um erro de
 * 4,5× passar despercebido por semanas — ela saía na tela com cara de fato. A
 * medição sozinha esconderia o quanto a estimativa erra, que é a única forma
 * de ela melhorar.
 *
 * Ausência de custo é escrita por extenso, nunca desenhada como 0,00: "custou
 * nada" e "não sabemos" são afirmações diferentes, e só uma delas é verdade
 * aqui.
 */
interface CostResponse {
  requestedSeconds: number;
  estimate: { costUsd: number | null; costUnknownReason: string | null };
  actual: {
    seconds: number;
    unitSource: string | null;
    costUsd: number | null;
    costUnknownReason: string | null;
    vendorUnits: number | null;
  } | null;
  difference: { usd: number; factor: number | null } | null;
  failure: { reason: string | null } | null;
  basis: string;
  simulated: boolean;
}

const usd = (v: number) => `US$ ${v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;

export function VideoCostPanel({
  videoId,
  estimateSeconds,
  refreshKey,
}: {
  /** Depois de gerar. Quando ausente, o painel mostra só a estimativa. */
  videoId?: string | null;
  /** Antes de gerar: a duração escolhida na tela. */
  estimateSeconds?: number;
  refreshKey?: unknown;
}) {
  const { t } = useTranslation();
  const [cost, setCost] = useState<CostResponse | null>(null);

  useEffect(() => {
    // As duas rotas devolvem a MESMA forma, então há um caminho de
    // renderização só — ver o comentário de /video-cost-estimate no backend.
    const url = videoId ? `/videos/${videoId}/cost` : `/video-cost-estimate?seconds=${estimateSeconds ?? 0}`;
    api
      .get<CostResponse>(url)
      .then(setCost)
      .catch(() => setCost(null));
  }, [videoId, estimateSeconds, refreshKey]);

  if (!cost) return null;

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: 12,
        marginTop: 12,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("createVideo.cost.title")}</div>

      <Linha
        rotulo={t("createVideo.cost.estimated", { seconds: cost.requestedSeconds })}
        valor={
          cost.estimate.costUsd != null ? usd(cost.estimate.costUsd) : t("createVideo.cost.notMeasured")
        }
        detalhe={cost.estimate.costUnknownReason}
      />

      {cost.actual ? (
        <Linha
          rotulo={t("createVideo.cost.actual", { seconds: cost.actual.seconds })}
          valor={cost.actual.costUsd != null ? usd(cost.actual.costUsd) : t("createVideo.cost.notMeasured")}
          detalhe={
            cost.actual.costUnknownReason ??
            (cost.actual.vendorUnits != null
              ? t("createVideo.cost.vendorUnits", { units: cost.actual.vendorUnits })
              : null)
          }
          destaque
        />
      ) : (
        // Ausência POR EXTENSO. Um "—" mudo aqui seria lido como zero, e é
        // justamente a diferença que este painel existe para preservar.
        <Linha
          rotulo={t("createVideo.cost.actualLabel")}
          valor={t("createVideo.cost.noneYet")}
          detalhe={cost.failure ? t("createVideo.cost.failed", { reason: cost.failure.reason ?? "" }) : null}
        />
      )}

      {cost.difference && (
        <Linha
          rotulo={t("createVideo.cost.difference")}
          valor={`${cost.difference.usd >= 0 ? "+" : ""}${usd(cost.difference.usd)}`}
          detalhe={
            cost.difference.factor != null
              ? t("createVideo.cost.factor", { factor: cost.difference.factor })
              : null
          }
        />
      )}

      {cost.simulated && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t("createVideo.cost.simulated")}
        </p>
      )}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        {cost.basis}
      </p>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string | null;
  destaque?: boolean;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{rotulo}</span>
        <span style={{ fontWeight: destaque ? 700 : 500, whiteSpace: "nowrap" }}>{valor}</span>
      </div>
      {detalhe && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
          {detalhe}
        </div>
      )}
    </div>
  );
}
