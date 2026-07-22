import { useTranslation } from "react-i18next";

const OPTIONS: Array<15 | 30 | 60> = [15, 30, 60];

export function DurationStep({
  duration,
  onChange,
}: {
  duration: 15 | 30 | 60;
  onChange: (value: 15 | 30 | 60) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="card-title">{t("createVideo.duration.title")}</div>
      <div className="chip-group">
        {OPTIONS.map((seconds) => (
          <button
            key={seconds}
            className={`chip${duration === seconds ? " selected" : ""}`}
            onClick={() => onChange(seconds)}
          >
            {seconds}s
          </button>
        ))}
      </div>
    </div>
  );
}
