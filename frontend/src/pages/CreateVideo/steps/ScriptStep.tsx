import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { Field } from "../../../components/ui/Field";

export function ScriptStep({
  script,
  onChange,
}: {
  script: string;
  onChange: (script: string) => void;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!prompt) return;
    setGenerating(true);
    try {
      const result = await api.post<{ script: string }>("/scripts/generate", { prompt });
      onChange(result.script);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.script.title")}</div>
      <Field
        label={t("createVideo.script.scriptLabel")}
        help={t("createVideo.script.scriptHelp")}
        helpPrompt={t("createVideo.script.scriptHelpPrompt")}
      >
        <textarea
          value={script}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("createVideo.script.scriptPlaceholder")}
        />
      </Field>

      <div style={{ maxWidth: 480 }}>
        <Field
          label={t("createVideo.script.promptLabel")}
          help={t("createVideo.script.promptHelp")}
          helpPrompt={t("createVideo.script.promptHelpPrompt")}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("createVideo.script.promptPlaceholder")}
          />
        </Field>
      </div>
      <button className="btn btn-secondary" onClick={handleGenerate} disabled={!prompt || generating}>
        {generating ? t("createVideo.script.generating") : t("createVideo.script.generate")}
      </button>
    </div>
  );
}
