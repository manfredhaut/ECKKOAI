import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Field } from "../../components/ui/Field";
import type { Plan } from "../../types";

function featuresToText(features: string[]): string {
  return features.join("\n");
}

function textToFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function PlanRow({ plan, onSaved }: { plan: Plan; onSaved: (updated: Plan) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(plan.name);
  const [priceCents, setPriceCents] = useState(String(plan.priceCents));
  const [videoLimitPerMonth, setVideoLimitPerMonth] = useState(String(plan.videoLimitPerMonth));
  const [scriptLimitPerMonth, setScriptLimitPerMonth] = useState(String(plan.scriptLimitPerMonth));
  const [avatarLimitPerMonth, setAvatarLimitPerMonth] = useState(String(plan.avatarLimitPerMonth));
  const [featuresText, setFeaturesText] = useState(featuresToText(plan.features));
  const [active, setActive] = useState(plan.active);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== plan.name ||
    Number(priceCents) !== plan.priceCents ||
    Number(videoLimitPerMonth) !== plan.videoLimitPerMonth ||
    Number(scriptLimitPerMonth) !== plan.scriptLimitPerMonth ||
    Number(avatarLimitPerMonth) !== plan.avatarLimitPerMonth ||
    featuresText !== featuresToText(plan.features) ||
    active !== plan.active;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.put<Plan>(`/admin/plans/${plan.id}`, {
        name,
        priceCents: Number(priceCents),
        videoLimitPerMonth: Number(videoLimitPerMonth),
        scriptLimitPerMonth: Number(scriptLimitPerMonth),
        avatarLimitPerMonth: Number(avatarLimitPerMonth),
        features: textToFeatures(featuresText),
        active,
      });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <code>{plan.id}</code>
      </td>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 120 }} />
      </td>
      <td>
        <input
          type="number"
          value={priceCents}
          onChange={(e) => setPriceCents(e.target.value)}
          style={{ width: 90 }}
        />
      </td>
      <td>
        <input
          type="number"
          value={videoLimitPerMonth}
          onChange={(e) => setVideoLimitPerMonth(e.target.value)}
          style={{ width: 70 }}
        />
      </td>
      <td>
        <input
          type="number"
          value={scriptLimitPerMonth}
          onChange={(e) => setScriptLimitPerMonth(e.target.value)}
          style={{ width: 70 }}
        />
      </td>
      <td>
        <input
          type="number"
          value={avatarLimitPerMonth}
          onChange={(e) => setAvatarLimitPerMonth(e.target.value)}
          style={{ width: 70 }}
        />
      </td>
      <td>
        <textarea
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          rows={3}
          style={{ width: 220 }}
        />
      </td>
      <td>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td>
        <button className="btn btn-outline" onClick={handleSave} disabled={saving || !dirty}>
          {t("common.save")}
        </button>
      </td>
    </tr>
  );
}

function NewPlanForm({ onCreated }: { onCreated: (created: Plan) => void }) {
  const { t } = useTranslation();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState("0");
  const [videoLimitPerMonth, setVideoLimitPerMonth] = useState("5");
  const [scriptLimitPerMonth, setScriptLimitPerMonth] = useState("10");
  const [avatarLimitPerMonth, setAvatarLimitPerMonth] = useState("1");
  const [featuresText, setFeaturesText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const created = await api.post<Plan>("/admin/plans", {
        id,
        name,
        priceCents: Number(priceCents),
        videoLimitPerMonth: Number(videoLimitPerMonth),
        scriptLimitPerMonth: Number(scriptLimitPerMonth),
        avatarLimitPerMonth: Number(avatarLimitPerMonth),
        features: textToFeatures(featuresText),
      });
      onCreated(created);
      setId("");
      setName("");
      setPriceCents("0");
      setVideoLimitPerMonth("5");
      setScriptLimitPerMonth("10");
      setAvatarLimitPerMonth("1");
      setFeaturesText("");
    } catch {
      setError(t("adminPanel.plans.createError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">{t("adminPanel.plans.newPlan")}</div>
      <div className="grid grid-cols-3">
        <Field label={t("adminPanel.plans.colId")} help={t("adminPanel.plans.idHelp")}>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="starter" />
        </Field>
        <Field label={t("adminPanel.plans.colName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("adminPanel.plans.colPrice")}>
          <input type="number" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
        </Field>
        <Field label={t("adminPanel.plans.colLimit")}>
          <input
            type="number"
            value={videoLimitPerMonth}
            onChange={(e) => setVideoLimitPerMonth(e.target.value)}
          />
        </Field>
        <Field label={t("adminPanel.plans.colScriptLimit")}>
          <input
            type="number"
            value={scriptLimitPerMonth}
            onChange={(e) => setScriptLimitPerMonth(e.target.value)}
          />
        </Field>
        <Field label={t("adminPanel.plans.colAvatarLimit")}>
          <input
            type="number"
            value={avatarLimitPerMonth}
            onChange={(e) => setAvatarLimitPerMonth(e.target.value)}
          />
        </Field>
        <Field label={t("adminPanel.plans.colFeatures")}>
          <textarea value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} rows={3} />
        </Field>
      </div>
      {error && (
        <p className="text-muted" style={{ fontSize: 13, color: "var(--color-tertiary)" }}>
          {error}
        </p>
      )}
      <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !id || !name}>
        {creating ? t("settings.saving") : t("adminPanel.plans.create")}
      </button>
    </div>
  );
}

export function AdminPlansPanel() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api.get<Plan[]>("/admin/plans").then(setPlans);
  }, []);

  function updatePlan(updated: Plan) {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function addPlan(created: Plan) {
    setPlans((prev) => [...prev, created].sort((a, b) => a.priceCents - b.priceCents));
  }

  return (
    <div>
      <div className="section-heading">
        <h2>{t("adminPanel.plans.title")}</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          {t("adminPanel.plans.subtitle")}
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("adminPanel.plans.colId")}</th>
            <th>{t("adminPanel.plans.colName")}</th>
            <th>{t("adminPanel.plans.colPrice")}</th>
            <th>{t("adminPanel.plans.colLimit")}</th>
            <th>{t("adminPanel.plans.colScriptLimit")}</th>
            <th>{t("adminPanel.plans.colAvatarLimit")}</th>
            <th>{t("adminPanel.plans.colFeatures")}</th>
            <th>{t("adminPanel.plans.colActive")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} onSaved={updatePlan} />
          ))}
        </tbody>
      </table>

      <NewPlanForm onCreated={addPlan} />
    </div>
  );
}
