import { useTranslation } from "react-i18next";
import {
  MAX_RECORDING_SECONDS,
  RECORDING_MINIMUM_SECONDS,
  RECORDING_RECOMMENDED_SECONDS,
  formatDuration,
  recordingQuality,
} from "../../uploadLimits";

/**
 * Quanto já foi gravado, e quanto ainda FALTA para a amostra prestar.
 *
 * Substitui um contador que só vigiava o teto: "Gravando 0:15 de 2:00 — para
 * sozinho em 105s". Aquela frase responde "quanto ainda posso gravar?" e nunca
 * "quanto preciso gravar?" — e aos 15 segundos ela parece saudável, com folga
 * larga, sem nenhum sinal de que a amostra está curta demais para clonar uma
 * voz.
 *
 * O custo disso foi medido: o clone do avatar de demonstração saiu de uma
 * amostra de 15,37 s, e o defeito só apareceu no vídeo pronto — "a voz não
 * parece a pessoa" —, quando consertar já custava uma regravação e uma
 * geração. A informação que faltava existia na tela, mas num parágrafo acima
 * que só aparece ANTES de gravar, e some da atenção no instante em que a
 * pessoa começa a falar.
 *
 * Três faixas, e a do meio importa tanto quanto as pontas: "já dá, mas melhora
 * se continuar" é a única mensagem que deixa a pessoa decidir com informação
 * em vez de adivinhar. Um indicador binário (ruim/bom) empurraria todo mundo
 * para o mínimo.
 */
export function RecordingProgress({ elapsedSeconds }: { elapsedSeconds: number }) {
  const { t } = useTranslation();
  const quality = recordingQuality(elapsedSeconds);
  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsedSeconds);

  const pct = (s: number) => `${Math.min(100, (s / MAX_RECORDING_SECONDS) * 100)}%`;

  const message =
    quality === "short"
      ? t("createVideo.avatarSetup.recordingShort", {
          elapsed: formatDuration(elapsedSeconds),
          minimum: formatDuration(RECORDING_MINIMUM_SECONDS),
          missing: RECORDING_MINIMUM_SECONDS - elapsedSeconds,
        })
      : quality === "workable"
        ? t("createVideo.avatarSetup.recordingWorkable", {
            elapsed: formatDuration(elapsedSeconds),
            recommended: formatDuration(RECORDING_RECOMMENDED_SECONDS),
            missing: RECORDING_RECOMMENDED_SECONDS - elapsedSeconds,
          })
        : t("createVideo.avatarSetup.recordingGood", {
            elapsed: formatDuration(elapsedSeconds),
            remaining,
          });

  return (
    <div className="recording-progress" style={{ marginTop: 10 }}>
      <div className={`recording-bar recording-bar--${quality}`}>
        <div className="recording-bar__fill" style={{ width: pct(elapsedSeconds) }} />
        {/* Marcas das metas, desenhadas SOBRE a barra: sem elas o preenchimento
            seria só um progresso rumo ao teto, que é a leitura errada. */}
        <span className="recording-bar__mark" style={{ left: pct(RECORDING_MINIMUM_SECONDS) }} />
        <span className="recording-bar__mark" style={{ left: pct(RECORDING_RECOMMENDED_SECONDS) }} />
      </div>

      {/* UMA legenda por vez: a da meta que ainda falta.
          As duas juntas se sobrepunham — em 25% e 50% de uma barra estreita
          elas viravam "mínimo 0:30m 1:00", medido na verificação. E mostrar as
          duas nunca foi o objetivo: quem está gravando precisa saber qual é o
          PRÓXIMO alvo, não a tabela inteira. Alcançada a faixa boa, nenhuma
          legenda sobra — não há mais alvo. */}
      <div className="recording-bar__legend">
        {quality === "short" && (
          <span style={{ left: pct(RECORDING_MINIMUM_SECONDS) }}>
            {t("createVideo.avatarSetup.recordingMarkMinimum", { at: formatDuration(RECORDING_MINIMUM_SECONDS) })}
          </span>
        )}
        {quality === "workable" && (
          <span style={{ left: pct(RECORDING_RECOMMENDED_SECONDS) }}>
            {t("createVideo.avatarSetup.recordingMarkRecommended", {
              at: formatDuration(RECORDING_RECOMMENDED_SECONDS),
            })}
          </span>
        )}
      </div>

      <p className={`recording-progress__message recording-progress__message--${quality}`}>{message}</p>
    </div>
  );
}
