import { useTranslation } from "react-i18next";
import { useIsSimulated } from "./FeatureFlagContext";

/**
 * Marca de simulação. Aparece em TODA tela que exibe vídeo ou áudio
 * gerado, sempre que o backend estiver em PROVIDER_MODE=fixture.
 *
 * Não é decoração: sem ela, uma barra de teste de 5 segundos e um vídeo
 * real de avatar ocupam o mesmo lugar na tela, e a única diferença fica
 * sendo o conteúdo — o que basta para alguém demonstrar simulação achando
 * que está demonstrando o produto. A honestidade aqui vale mais que a
 * limpeza visual, então a marca é deliberadamente difícil de ignorar.
 *
 * Renderiza `null` em modo `live`, para não haver custo nenhum no caminho
 * normal.
 */
export function SimulatedBadge({
  compact = false,
  simulated,
}: {
  compact?: boolean;
  /**
   * Fato registrado na própria linha (`videos.simulated`). Quando presente,
   * ganha do modo atual do ambiente — um vídeo gerado de verdade continua
   * real mesmo que o servidor esteja em fixture agora, e o inverso também.
   * O modo global só serve quando não há registro por item.
   */
  simulated?: boolean;
}) {
  const { t } = useTranslation();
  const modeSimulated = useIsSimulated();
  const isSimulated = simulated ?? modeSimulated;
  if (!isSimulated) return null;

  return (
    <span className={`simulated-badge${compact ? " simulated-badge--compact" : ""}`}>
      {compact ? t("simulated.short") : t("simulated.full")}
    </span>
  );
}

/**
 * Variante em bloco, para o topo de uma área de resultado — onde há espaço
 * para dizer a frase inteira em vez da etiqueta curta.
 */
export function SimulatedNotice({ simulated }: { simulated?: boolean } = {}) {
  const { t } = useTranslation();
  const modeSimulated = useIsSimulated();
  if (!(simulated ?? modeSimulated)) return null;

  return <p className="simulated-notice">{t("simulated.notice")}</p>;
}
