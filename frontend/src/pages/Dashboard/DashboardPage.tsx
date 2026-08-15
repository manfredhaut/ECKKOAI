import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Avatar, DashboardSummary, Video } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

export function DashboardPage() {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Video[]>("/videos"),
      api.get<Avatar[]>("/avatars"),
      // Falha aqui não derruba o painel: os outros três cards não dependem
      // deste resumo, e um erro de billing não pode apagar a tela inteira.
      api.get<DashboardSummary>("/dashboard-summary").catch(() => null),
    ])
      .then(([v, a, s]) => {
        setVideos(v);
        setAvatars(a);
        setSummary(s);
      })
      .finally(() => setLoading(false));
  }, []);

  const videoCredits = summary?.credits.find((c) => c.creditType === "video")?.balance ?? null;

  const thisMonth = new Date();
  const videosThisMonth = videos.filter((v) => {
    const created = new Date(v.created_at);
    return (
      created.getMonth() === thisMonth.getMonth() && created.getFullYear() === thisMonth.getFullYear()
    );
  }).length;

  const queue = videos.filter((v) => v.status === "queued" || v.status === "processing");

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={
          <Link to="create" className="btn btn-primary">
            {t("dashboard.createVideo")}
          </Link>
        }
      />

      <div className="grid grid-cols-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">{t("dashboard.creditsRemaining")}</div>
          {/* Mostrava "—" com a legenda "ainda não conectado a um provedor de
              cobrança" enquanto tenant_credits tinha saldo real. */}
          <div className="stat-value">{loading ? "…" : videoCredits ?? "—"}</div>
          <div className="stat-sub">
            {loading || videoCredits === null
              ? t("dashboard.creditsUnavailable")
              : t("dashboard.creditsVideoSub")}
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t("dashboard.videosThisMonth")}</div>
          <div className="stat-value">{loading ? "…" : videosThisMonth}</div>
          <div className="stat-sub">{t("dashboard.videosThisMonthSub")}</div>
        </div>
        <div className="card">
          <div className="card-title">{t("dashboard.estimatedCost")}</div>
          {/* Ausência continua sendo ausência — mas agora a legenda diz POR QUE
              não há número, em vez de prometer um recurso que já existe. */}
          <div className="stat-value">
            {loading ? "…" : summary?.costThisMonth.usd !== null && summary
              ? `US$ ${summary.costThisMonth.usd!.toFixed(2)}`
              : "—"}
          </div>
          {/* Duas chaves em vez de um `select` aninhado na string: o i18next
              deste projeto não tem o plugin ICU, então `{{x, select, ...}}`
              não é interpolado e vai PARA A TELA como texto cru — foi o que
              aconteceu ("5 sem medição}}}" apareceu no card). A condição fica
              no componente, onde o TypeScript a enxerga. */}
          <div className="stat-sub">
            {loading
              ? ""
              : !summary || summary.costThisMonth.usd === null
                ? t("dashboard.costNoneSub")
                : summary.costThisMonth.unmeasuredLines > 0
                  ? t("dashboard.costMeasuredPartial", {
                      measured: summary.costThisMonth.measuredLines,
                      unmeasured: summary.costThisMonth.unmeasuredLines,
                    })
                  : t("dashboard.costMeasuredAll", { measured: summary.costThisMonth.measuredLines })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t("dashboard.savedAvatars")}</div>
          <div className="stat-value">{loading ? "…" : avatars.length}</div>
          <div className="stat-sub">{t("dashboard.savedAvatarsSub")}</div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <div className="card-title">{t("dashboard.generationQueue")}</div>
          {queue.length === 0 ? (
            <div className="empty-state">{t("dashboard.queueEmpty")}</div>
          ) : (
            <table>
              <tbody>
                {queue.map((v) => (
                  <tr key={v.id}>
                    <td>{v.script.slice(0, 40)}…</td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-title">{t("dashboard.recentVideos")}</div>
          {videos.length === 0 ? (
            <div className="empty-state">
              {t("dashboard.videosEmptyPrefix")} <Link to="create">{t("dashboard.videosEmptyLink")}</Link>
            </div>
          ) : (
            <table>
              <tbody>
                {videos.slice(0, 5).map((v) => (
                  <tr key={v.id}>
                    <td>{v.script.slice(0, 40)}…</td>
                    <td>{v.duration_seconds}s</td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">{t("dashboard.savedAvatars")}</div>
        {avatars.length === 0 ? (
          <div className="empty-state">
            {t("dashboard.avatarsEmptyPrefix")} <Link to="create">{t("dashboard.avatarsEmptyLink")}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-4">
            {avatars.map((a) => (
              <div key={a.id} className="card">
                {a.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
