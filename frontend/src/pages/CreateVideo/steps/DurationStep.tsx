import { useTranslation } from "react-i18next";
import { VideoCostPanel } from "../VideoCostPanel";

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
      {/* O custo aparece JUNTO da escolha que o determina, e não só no passo 6.
          Duração é a única variável do preço que o cliente controla; mostrá-la
          sem o efeito no custo é pedir uma decisão sem o dado que a decide.

          Mesmo componente do passo 6, com a mesma constante única por baixo —
          duplicar o número aqui criaria uma segunda verdade sobre dinheiro, que
          é exatamente o defeito que o bloco 4A removeu do banco. */}
      <VideoCostPanel estimateSeconds={duration} />
    </div>
  );
}
