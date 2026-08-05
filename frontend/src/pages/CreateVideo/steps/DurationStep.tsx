import { useTranslation } from "react-i18next";
import { VideoCostPanel } from "../VideoCostPanel";

/**
 * Duração: DERIVADA do roteiro, e somente leitura.
 *
 * Este passo oferecia três chips — 15, 30 e 60 s — e nenhum deles limitava
 * coisa alguma. O número escolhido era gravado na linha do vídeo, estimava o
 * custo e rotulava o player, mas nunca chegava ao fornecedor:
 * `buildHeygenVideoPayload` não tem campo de duração e nada corta o roteiro. Na
 * passada paga de 05/08 pediu-se 15 s e vieram 36,9876 s.
 *
 * As duas saídas possíveis eram truncar o roteiro para caber no chip, ou parar
 * de fingir que há escolha. Truncar entrega um vídeo cortado no meio de uma
 * frase — pago, e irrecuperável, porque o débito acontece antes da chamada. Por
 * isso o passo passa a MOSTRAR o que o roteiro produz, com o custo ao lado, e
 * quem quiser um vídeo mais curto volta um passo e encurta o texto.
 */
export function DurationStep({
  script,
  onEstimate,
}: {
  script: string;
  onEstimate?: (info: { estimatedSeconds: number; requiresConfirmation: boolean; confirmAboveSeconds: number }) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="card-title">{t("createVideo.duration.title")}</div>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
        {t("createVideo.duration.derived")}
      </p>
      {/* O custo aparece JUNTO da duração que o determina, e não só no passo 6.
          Aqui ele deixou de ser resposta a uma escolha e passou a ser
          consequência do roteiro — que é o que sempre foi de fato.

          O painel é o mesmo componente do passo 6, com a mesma constante única
          por baixo: duplicar o ritmo ou o preço aqui criaria uma segunda
          verdade sobre dinheiro, o defeito que o bloco 4A removeu do banco. */}
      <VideoCostPanel scriptChars={script.length} onEstimate={onEstimate} />
    </div>
  );
}
