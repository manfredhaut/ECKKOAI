import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import { ScriptCounter } from "../ScriptCounter";
import { DurationCostReference } from "../DurationCostReference";
import { TARGET_DURATION_MAX_SECONDS, TARGET_DURATION_OPTIONS } from "../targetDuration";

export function ScriptStep({
  script,
  onChange,
  targetDurationSeconds,
  onTargetDurationChange,
  tierVideo,
}: {
  script: string;
  onChange: (script: string) => void;
  /** `null` = sem escolha ainda — nem chip, nem "mais" preenchido. Ver `types.ts`. */
  targetDurationSeconds: number | null;
  onTargetDurationChange: (value: number | null) => void;
  /**
   * O tier ATUAL do wizard (default "normal" — `types.ts`), só para a
   * tabela de referência de custo. Escolhido de verdade no passo Gerar;
   * aqui é só "o que já está selecionado agora", e atualiza sozinho se a
   * pessoa voltar depois de trocar de nível.
   */
  tierVideo: "simples" | "normal" | "premium";
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "MAIS" TEM VALOR — antes não tinha: escolher "mais" só desligava o alvo
  // (caía no teto global, `null`), sem dar à pessoa como pedir UMA duração
  // específica fora dos 4 chips. Agora "mais" revela um campo numérico, e o
  // número digitado vira o alvo de verdade — MESMA régua de sempre
  // (`isTargetDurationSeconds` no servidor aceita qualquer inteiro até o
  // teto de dinheiro, não só os 4 chips).
  const ehChip = targetDurationSeconds != null && (TARGET_DURATION_OPTIONS as readonly number[]).includes(targetDurationSeconds);
  const temValorCustomizado = targetDurationSeconds != null && !ehChip;
  // Estado local: "a pessoa clicou em Mais NESTA visita ao passo" — some ao
  // trocar de passo e voltar (o componente desmonta), e nesse caso
  // `temValorCustomizado` já reconstrói a visibilidade certa a partir do
  // valor que sobreviveu no wizard.
  const [maisClicado, setMaisClicado] = useState(false);
  const mostrarCampoCustom = maisClicado || temValorCustomizado;

  function handleCustomDurationInput(raw: string) {
    if (raw.trim() === "") {
      // Campo esvaziado: sem alvo numérico, cai no teto global — mesmo
      // comportamento de nunca ter escolhido nada.
      onTargetDurationChange(null);
      return;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return; // entrada inválida: mantém o último valor válido
    onTargetDurationChange(Math.min(n, TARGET_DURATION_MAX_SECONDS));
  }

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

      {/* ANTES do roteiro, de propósito: a duração-alvo muda o teto que o
          contador mostra assim que a pessoa começa a digitar — pedir a
          escolha depois do campo faria o teto aparecer tarde demais para
          orientar quem já está escrevendo. */}
      <Field
        label={t("createVideo.script.durationTarget.label")}
        help={t("createVideo.script.durationTarget.help")}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TARGET_DURATION_OPTIONS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              className={`chip${ehChip && targetDurationSeconds === seconds ? " selected" : ""}`}
              aria-pressed={ehChip && targetDurationSeconds === seconds}
              onClick={() => {
                setMaisClicado(false);
                onTargetDurationChange(seconds);
              }}
            >
              {t("createVideo.script.durationTarget.seconds", { seconds })}
            </button>
          ))}
          <button
            type="button"
            className={`chip${mostrarCampoCustom ? " selected" : ""}`}
            aria-pressed={mostrarCampoCustom}
            onClick={() => {
              setMaisClicado(true);
              // Só desliga o alvo se ele NÃO for já um valor customizado —
              // reabrir "mais" com um número já digitado não pode apagá-lo.
              if (!temValorCustomizado) onTargetDurationChange(null);
            }}
          >
            {t("createVideo.script.durationTarget.more")}
          </button>
        </div>
        {mostrarCampoCustom && (
          <div style={{ marginTop: 8, maxWidth: 220 }}>
            <input
              type="number"
              min={1}
              max={TARGET_DURATION_MAX_SECONDS}
              step={1}
              value={targetDurationSeconds ?? ""}
              onChange={(e) => handleCustomDurationInput(e.target.value)}
              placeholder={t("createVideo.script.durationTarget.customPlaceholder", {
                max: TARGET_DURATION_MAX_SECONDS,
              })}
            />
          </div>
        )}
      </Field>

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
        <ScriptCounter script={script} targetDurationSeconds={targetDurationSeconds} />
        <DurationCostReference tier={tierVideo} />
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
