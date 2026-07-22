import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { CostRate } from "../../types";

function CostRateRow({ rate, onSaved }: { rate: CostRate; onSaved: (updated: CostRate) => void }) {
  const { t } = useTranslation();
  const [costPerUnitCents, setCostPerUnitCents] = useState(String(rate.costPerUnitCents));
  const [verified, setVerified] = useState(rate.verified);
  const [saving, setSaving] = useState(false);

  const dirty = Number(costPerUnitCents) !== rate.costPerUnitCents || verified !== rate.verified;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.put<CostRate>(`/admin/cost-rates/${rate.id}`, {
        costPerUnitCents: Number(costPerUnitCents),
        verified,
      });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{t(`adminPanel.provider.${rate.provider}`)}</td>
      <td>{rate.vendor}</td>
      <td>{t(`adminPanel.unitType.${rate.unitType}`)}</td>
      <td>
        <input
          type="number"
          step="0.001"
          value={costPerUnitCents}
          onChange={(e) => setCostPerUnitCents(e.target.value)}
          style={{ width: 100 }}
        />
      </td>
      <td>
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
      </td>
      <td>
        <button className="btn btn-outline" onClick={handleSave} disabled={saving || !dirty}>
          {t("adminPanel.costRates.save")}
        </button>
      </td>
    </tr>
  );
}

export function AdminCostRatesPanel() {
  const { t } = useTranslation();
  const [rates, setRates] = useState<CostRate[]>([]);

  useEffect(() => {
    api.get<CostRate[]>("/admin/cost-rates").then(setRates);
  }, []);

  function updateRate(updated: CostRate) {
    setRates((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <div>
      <div className="section-heading">
        <h2>{t("adminPanel.costRates.title")}</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          {t("adminPanel.costRates.subtitle")}
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("adminPanel.costRates.colProvider")}</th>
            <th>{t("adminPanel.costRates.colVendor")}</th>
            <th>{t("adminPanel.costRates.colUnitType")}</th>
            <th>{t("adminPanel.costRates.colCostPerUnit")}</th>
            <th>{t("adminPanel.costRates.colVerified")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <CostRateRow key={rate.id} rate={rate} onSaved={updateRate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
