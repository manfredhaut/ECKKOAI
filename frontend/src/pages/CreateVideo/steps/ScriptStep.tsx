import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import { ScriptCounter } from "../ScriptCounter";

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
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await api.post<{ script: string }>("/scripts/generate", { prompt });
      onChange(result.script);
    } catch (err) {
      // Sem este catch, a falha virava uma promise rejeitada sem dono: o
      // botão parava de girar e absolutamente nada aparecia na tela. A
      // mensagem já vem pronta e sanitizada do backend.
      setError(err instanceof Error ? err.message : t("errors.generic"));
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
        {/* Sob o campo, e não no passo de geração: quando o custo só aparece
            no fim, quem escreve descobre que o roteiro é caro depois de já ter
            escrito. Aqui o número muda enquanto se digita. */}
        <ScriptCounter script={script} />
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
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
