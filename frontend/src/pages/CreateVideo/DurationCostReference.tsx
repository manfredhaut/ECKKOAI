import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";

/**
 * Tabela orientativa de duração×custo — E3, 22/08/2026.
 *
 * A RÉGUA É A DO SERVIDOR, mesmo princípio de `ScriptCounter.tsx`: este
 * componente NÃO calcula custo nenhum. Ele chama `/video-cost-reference`,
 * que devolve `estimateVideoCost` (a MESMA função do painel de custo do
 * passo Gerar) para cada ponto fixo de segundos, já resolvido pelo VENDOR
 * do tier — nenhuma tabela fixa aqui, nenhuma cópia da tarifa.
 *
 * Existe para dar noção de PROGRESSÃO antes de escrever o roteiro: "quanto
 * custaria se eu pedisse 30s? E 300s?" — sem precisar digitar um roteiro
 * daquele tamanho só para descobrir.
 */
interface CostReferencePoint {
  seconds: number;
  costUsd: number | null;
  costUnknownReason: string | null;
  /**
   * F2, 22/08/2026: esta duração excede o que o tier consegue alcançar
   * HOJE (15s para normal/premium — o Wan não anima mais que isso; ≈459s
   * para simples — o teto de caracteres da HeyGen binda antes dos 600s
   * "de dinheiro"). Distinto de `costUsd == null` sozinho: aquele é "não
   * sabemos o preço" (poderia ficar sabido amanhã); isto é "essa duração
   * não existe neste nível" — nunca vai ficar sabido, porque não há o que
   * medir.
   */
  unavailableForTier: boolean;
}

interface CostReferenceResponse {
  tier: string;
  vendor: string;
  /** Piso da maior duração alcançável — já truncado, pronto para exibir. */
  maxReachableSeconds: number;
  points: CostReferencePoint[];
}

const usd = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;

export function DurationCostReference({ tier }: { tier: "simples" | "normal" | "premium" }) {
  const { t } = useTranslation();
  const [data, setData] = useState<CostReferenceResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CostReferenceResponse>(`/video-cost-reference?tier=${tier}`)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tier]);

  if (!data) return null;

  return (
    <details style={{ marginTop: 10 }}>
      <summary className="text-muted" style={{ fontSize: 12, cursor: "pointer" }}>
        {t("createVideo.script.costReference.toggle")}
      </summary>
      <table style={{ width: "100%", fontSize: 12, marginTop: 6, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "2px 12px 2px 0", fontWeight: 600 }}>
              {t("createVideo.script.costReference.durationHeader")}
            </th>
            <th style={{ textAlign: "left", padding: "2px 0", fontWeight: 600 }}>
              {t("createVideo.script.costReference.costHeader")}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.points.map((p) => (
            <tr key={p.seconds}>
              <td style={{ padding: "2px 12px 2px 0" }}>{p.seconds} s</td>
              <td className={p.costUsd == null ? "text-muted" : undefined} style={{ padding: "2px 0" }}>
                {p.unavailableForTier
                  ? t("createVideo.script.costReference.unavailableForTier", {
                      max: data.maxReachableSeconds,
                    })
                  : p.costUsd != null
                    ? usd(p.costUsd)
                    : t("createVideo.cost.notMeasured")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
