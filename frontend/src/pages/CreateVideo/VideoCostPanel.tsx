import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";

/**
 * Custo de um vídeo: a estimativa de antes e a medição de depois.
 *
 * As duas juntas, sempre. A estimativa sozinha foi o que deixou um erro de
 * 4,5× passar despercebido por semanas — ela saía na tela com cara de fato. A
 * medição sozinha esconderia o quanto a estimativa erra, que é a única forma
 * de ela melhorar.
 *
 * Ausência de custo é escrita por extenso, nunca desenhada como 0,00: "custou
 * nada" e "não sabemos" são afirmações diferentes, e só uma delas é verdade
 * aqui.
 */
export interface CostResponse {
  /**
   * Duração ESTIMADA a partir do roteiro. Era `requestedSeconds`, o chip de
   * 15/30/60 s — que não chegava ao fornecedor e produzia uma estimativa de
   * 0,42× do cobrado (US$ 0,75 contra US$ 1,80, medido em 05/08).
   */
  estimatedSeconds: number;
  scriptChars: number;
  /** De onde vem a duração estimada, por extenso. Irmã de `basis`. */
  pacing: string;
  confirmAboveSeconds: number;
  requiresConfirmation: boolean;
  /**
   * O TETO DURO, nas duas unidades, vindo pronto do servidor.
   *
   * `maxScriptChars` é derivado da régua LÁ, e chega aqui como número: a tela
   * não multiplica ritmo por velocidade para descobrir o limite, porque essa
   * conta feita duas vezes é a segunda régua que este painel inteiro existe
   * para não ter.
   */
  maxScriptSeconds: number;
  maxScriptChars: number;
  exceedsMaxScript: boolean;
  /**
   * A DURAÇÃO-ALVO do passo Roteiro (15/30/45/60 s) — `null` sem escolha
   * ("mais") ou depois de o vídeo já existir (`/videos/:id/cost` sempre
   * devolve os três `null`; o alvo só faz sentido antes de gerar). Presente,
   * ela é o teto de RECUSA de verdade, mais estrito que `maxScriptSeconds`.
   */
  targetDurationSeconds: number | null;
  targetMaxChars: number | null;
  exceedsTarget: boolean | null;
  estimate: { costUsd: number | null; costUnknownReason: string | null };
  /**
   * O custo FIXO da composição (fal, "normal"/"premium") — `null` para
   * "simples", que não tem etapa de composição. G3, 22/08/2026: é o único
   * número que o diálogo de confirmação pode afirmar com certeza antes do
   * clique, porque animar e narrar+sincronizar têm aprovação própria depois.
   */
  composeCostUsd: number | null;
  actual: {
    seconds: number;
    unitSource: string | null;
    costUsd: number | null;
    costUnknownReason: string | null;
    vendorUnits: number | null;
  } | null;
  difference: { usd: number; factor: number | null } | null;
  failure: { reason: string | null } | null;
  basis: string;
  simulated: boolean;
}

/**
 * Dinheiro em pt-BR, com as duas casas sempre.
 *
 * Antes: `toFixed(4)` sem os zeros à direita, que escrevia "US$ 1.5" para um
 * dólar e cinquenta — ponto de milhar inglês e uma casa só, num produto em
 * português. A truncagem por segundo inteiro faz todo custo de vídeo ser
 * múltiplo de US$ 0,05, então duas casas são EXATAS aqui: nenhum valor é
 * escondido pelo arredondamento.
 */
const usd = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;

/** Segundos com duas casas, também em pt-BR: 36,99 s. */
const secs = (v: number) => v.toFixed(2).replace(".", ",");

export function VideoCostPanel({
  videoId,
  scriptChars,
  tier,
  refreshKey,
  onEstimate,
}: {
  /** Depois de gerar. Quando ausente, o painel mostra só a estimativa. */
  videoId?: string | null;
  /**
   * Antes de gerar: o COMPRIMENTO do roteiro, não o roteiro.
   *
   * A duração sai dele no servidor, onde vive a única cópia do ritmo medido.
   * Derivá-la aqui criaria uma segunda verdade sobre quanto tempo um roteiro
   * dura — o mesmo defeito que o bloco 4A tirou do banco, só que na tela.
   */
  scriptChars?: number;
  /**
   * O nível escolhido no passo Gerar — OPCIONAL, mesma razão de `tier` em
   * `/video-format-support`: este painel também é montado no passo Roteiro
   * (via `ScriptCounter`), antes de o tier existir. Sem ele, o servidor cai
   * na credencial default do tenant, o comportamento de sempre. Achado #2 do
   * ensaio de 22/08/2026: sem isto, o diálogo de confirmação do Simples
   * mostrava "sem medição" para qualquer tenant cujo vendor default não
   * fosse heygen, mesmo com "Simples" escolhido.
   */
  tier?: "simples" | "normal" | "premium";
  refreshKey?: unknown;
  /**
   * A estimativa, de volta para quem pediu o painel. Existe para o passo 6
   * poder exigir confirmação acima do teto sem consultar a mesma rota duas
   * vezes nem reimplementar a comparação.
   */
  onEstimate?: (
    info: Pick<
      CostResponse,
      "estimatedSeconds" | "requiresConfirmation" | "confirmAboveSeconds" | "estimate" | "composeCostUsd"
    >,
  ) => void;
}) {
  const { t } = useTranslation();
  const [cost, setCost] = useState<CostResponse | null>(null);

  useEffect(() => {
    // As duas rotas devolvem a MESMA forma, então há um caminho de
    // renderização só — ver o comentário de /video-cost-estimate no backend.
    const tierQuery = tier ? `&tier=${tier}` : "";
    const url = videoId
      ? `/videos/${videoId}/cost`
      : `/video-cost-estimate?chars=${scriptChars ?? 0}${tierQuery}`;
    api
      .get<CostResponse>(url)
      .then((r) => {
        setCost(r);
        onEstimate?.(r);
      })
      .catch(() => setCost(null));
    // `onEstimate` fora das dependências de propósito: é uma função nova a cada
    // render do pai, e incluí-la refaria a requisição em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, scriptChars, tier, refreshKey]);

  if (!cost) return null;

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: 12,
        marginTop: 12,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("createVideo.cost.title")}</div>

      <Linha
        rotulo={t("createVideo.cost.estimated", {
          seconds: secs(cost.estimatedSeconds),
          chars: cost.scriptChars,
        })}
        valor={
          cost.estimate.costUsd != null ? usd(cost.estimate.costUsd) : t("createVideo.cost.notMeasured")
        }
        detalhe={cost.estimate.costUnknownReason}
      />

      {cost.actual ? (
        <Linha
          rotulo={t("createVideo.cost.actual", { seconds: secs(cost.actual.seconds) })}
          valor={cost.actual.costUsd != null ? usd(cost.actual.costUsd) : t("createVideo.cost.notMeasured")}
          detalhe={
            cost.actual.costUnknownReason ??
            (cost.actual.vendorUnits != null
              ? t("createVideo.cost.vendorUnits", { units: cost.actual.vendorUnits })
              : null)
          }
          destaque
        />
      ) : (
        // Ausência POR EXTENSO. Um "—" mudo aqui seria lido como zero, e é
        // justamente a diferença que este painel existe para preservar.
        <Linha
          rotulo={t("createVideo.cost.actualLabel")}
          valor={t("createVideo.cost.noneYet")}
          detalhe={cost.failure ? t("createVideo.cost.failed", { reason: cost.failure.reason ?? "" }) : null}
        />
      )}

      {/* Sem checagem de `simulated` aqui, de propósito: quem decide se a
          diferença significa alguma coisa é `costDifference()`, no servidor, e
          em geração simulada ela devolve `null`. Repetir a condição nesta linha
          criaria duas ideias do mesmo fato, e a que ficasse para trás numa
          mudança futura seria a desta tela. Estimativa e custo real continuam
          visíveis nos dois modos. */}
      {cost.difference && (
        <Linha
          rotulo={t("createVideo.cost.difference")}
          valor={`${cost.difference.usd >= 0 ? "+" : ""}${usd(cost.difference.usd)}`}
          detalhe={
            cost.difference.factor != null
              ? t("createVideo.cost.factor", { factor: cost.difference.factor })
              : null
          }
        />
      )}

      {cost.simulated && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t("createVideo.cost.simulated")}
        </p>
      )}

      {/* Duas procedências: de onde vem a DURAÇÃO estimada e de onde vem o
          PREÇO por segundo. Foram medidas em passadas diferentes, e um número
          sem origem é indistinguível de um palpite — foi assim que a estimativa
          de 0,42× passou por fato.

          RECOLHIDAS, não removidas. Os textos citam ffprobe, a variação de
          `remaining_quota` e sob quais proporções a medição foi feita: é
          exatamente o que se quer poder abrir quando alguém pergunta de onde
          saiu o número, e exatamente o que não se quer na frente de um
          investidor lendo a tela pela primeira vez.

          O que fica SEMPRE visível é o que decide: a estimativa, o custo e o
          aviso de geração simulada logo acima. Nenhum dos três entra aqui —
          esconder o aviso de simulação atrás de um clique seria apresentar um
          vídeo simulado como real por omissão. */}
      <details style={{ marginTop: 8 }}>
        <summary className="text-muted" style={{ fontSize: 11, cursor: "pointer" }}>
          {t("createVideo.cost.detailsToggle")}
        </summary>
        <p className="text-muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
          {cost.pacing}
        </p>
        <p className="text-muted" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
          {cost.basis}
        </p>
      </details>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string | null;
  destaque?: boolean;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{rotulo}</span>
        <span style={{ fontWeight: destaque ? 700 : 500, whiteSpace: "nowrap" }}>{valor}</span>
      </div>
      {detalhe && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
          {detalhe}
        </div>
      )}
    </div>
  );
}
