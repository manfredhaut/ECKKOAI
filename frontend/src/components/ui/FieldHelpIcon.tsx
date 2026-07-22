import { useTranslation } from "react-i18next";
import { useCopilot } from "../../copilot/CopilotContext";

export function FieldHelpIcon({ prompt }: { prompt: string }) {
  const { t } = useTranslation();
  const { openWithPrompt } = useCopilot();

  return (
    <button
      type="button"
      className="field-help-icon"
      title={t("copilot.fieldHelpTooltip")}
      onClick={(e) => {
        e.preventDefault();
        openWithPrompt(prompt);
      }}
    >
      i
    </button>
  );
}
