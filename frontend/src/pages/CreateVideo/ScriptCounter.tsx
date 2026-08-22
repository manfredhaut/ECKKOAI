import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { CostResponse } from "./VideoCostPanel";

/**
 * Contador ao vivo sob o campo Roteiro: caracteres, duração estimada e custo.
 *
 * ---------------------------------------------------------------------------
 * A RÉGUA É A DO SERVIDOR — este componente NÃO calcula nada.
 *
 * Ele chama `/video-cost-estimate?chars=N`, a MESMA rota que o painel de custo
 * do passo de geração consome, e apenas formata o que volta. Nenhuma
 * multiplicação de ritmo por velocidade acontece aqui.
 *
 * A tentação é grande e o atalho é curto: `chars / 12.8151 / 0.85` cabe numa
 * linha e evita uma requisição. O que ele cria é uma segunda verdade sobre
 * quanto tempo um roteiro dura — e o histórico deste projeto tem o preço dessa
 * classe de defeito medido em dinheiro: enquanto a duração vinha de um lugar e
 * o custo de outro, a tela mostrou US$ 0,75 num vídeo que a carteira pagou a
 * US$ 1,80. Contador e portão de recusa têm de concordar sempre, e a única
 * forma barata de garantir isso é os dois lerem o mesmo número.
 * ---------------------------------------------------------------------------
 *
 * O DEBOUNCE existe porque este componente vive sob um `textarea`: sem ele,
 * cada tecla vira uma requisição. 400 ms é o intervalo em que a digitação
 * comum ainda não parou, então o contador atualiza nas pausas naturais em vez
 * de a cada caractere.
 */
const DEBOUNCE_MS = 400;

/** Dinheiro em pt-BR, com as duas casas sempre — igual ao painel de custo. */
const usd = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;

/** Segundos com uma casa: num contador que muda enquanto se digita, duas casas
 *  piscam sem acrescentar nada que ajude a decidir. */
const secs = (v: number) => v.toFixed(1).replace(".", ",");

export function ScriptCounter({
  script,
  targetDurationSeconds,
}: {
  script: string;
  /**
   * A duração-alvo do passo Roteiro (15/30/45/60 s), ou `null` para "mais" —
   * mesmo valor de `WizardState.targetDurationSeconds`. Vai na query para o
   * SERVIDOR calcular o teto correspondente; este componente nunca calcula.
   */
  targetDurationSeconds?: number | null;
}) {
  const { t } = useTranslation();
  const [cost, setCost] = useState<CostResponse | null>(null);
  const chars = script.length;

  useEffect(() => {
    // Sem roteiro E sem duração-alvo, não há nada que a rota possa dizer:
    // nem caracteres digitados, nem limite (o limite só existe quando uma
    // duração foi escolhida). COM duração-alvo, consulta mesmo vazio — é o
    // teto que precisa aparecer assim que a duração é clicada, antes de
    // qualquer letra ser digitada, não só depois.
    if (chars === 0 && targetDurationSeconds == null) {
      setCost(null);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(() => {
      const alvo = targetDurationSeconds != null ? `&targetSeconds=${targetDurationSeconds}` : "";
      api
        .get<CostResponse>(`/video-cost-estimate?chars=${chars}${alvo}`)
        .then((r) => {
          if (!cancelado) setCost(r);
        })
        // Falha de rede deixa o contador SEM número, e não com o número velho:
        // um custo desatualizado ao lado de um roteiro novo é pior que nenhum.
        .catch(() => {
          if (!cancelado) setCost(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [chars, targetDurationSeconds]);

  if (chars === 0 && targetDurationSeconds == null) return null;

  // Roteiro VAZIO com duração-alvo escolhida: só o limite, nunca "0
  // caracteres · ~0 s · sem medição" — isso pareceria a estimativa real de
  // um vídeo vazio, que não existe. `cost.targetDurationSeconds` (não
  // `targetDurationSeconds` da prop) porque é a resposta do SERVIDOR que
  // decide se o alvo é válido, mesma régua de sempre.
  if (chars === 0) {
    if (!cost || cost.targetDurationSeconds == null) return null;
    return (
      <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
        {t("createVideo.script.durationTarget.limit", {
          targetSeconds: cost.targetDurationSeconds,
          targetChars: cost.targetMaxChars,
        })}
      </p>
    );
  }

  // Enquanto a primeira resposta não chega, o contador ainda diz o que sabe
  // sem ajuda de ninguém: quantos caracteres foram digitados. Duração e custo
  // ficam de fora porque dependem da régua.
  if (!cost) {
    return (
      <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
        {t("createVideo.script.counterChars", { chars })}
      </p>
    );
  }

  // Com duração-alvo escolhida, o teto ATIVO é o dela — sempre menor que o
  // global, e é ele quem decide a recusa de verdade (ver
  // `evaluateGenerationReadiness` no servidor). Sem alvo ("mais"), nada muda:
  // o teto continua sendo só o global, como sempre foi.
  const alvoAtivo = cost.targetDurationSeconds != null;
  const excedeu = alvoAtivo ? Boolean(cost.exceedsTarget) : cost.exceedsMaxScript;

  return (
    <div style={{ marginTop: 6 }}>
      <p
        className={excedeu ? undefined : "text-muted"}
        style={{
          fontSize: 12,
          marginTop: 0,
          marginBottom: 0,
          color: excedeu ? "var(--color-danger, #b42318)" : undefined,
          fontWeight: excedeu ? 600 : undefined,
        }}
      >
        {t("createVideo.script.counter", {
          chars: cost.scriptChars,
          seconds: secs(cost.estimatedSeconds),
          // Custo desconhecido é dito por extenso, nunca desenhado como 0,00 —
          // mesma regra do painel de custo.
          cost: cost.estimate.costUsd != null ? usd(cost.estimate.costUsd) : t("createVideo.cost.notMeasured"),
        })}
      </p>
      {/* Com alvo escolhido e AINDA dentro dele, o teto de caracteres aparece
          como referência neutra — é o pedido original: mostrar o teto assim
          que a duração é escolhida, antes de qualquer coisa dar errado. */}
      {alvoAtivo && !excedeu && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
          {t("createVideo.script.durationTarget.limit", {
            targetSeconds: cost.targetDurationSeconds,
            targetChars: cost.targetMaxChars,
          })}
        </p>
      )}
      {excedeu && (
        // O texto diz o limite E diz que nada é cortado. Um aviso que só
        // mostrasse o excesso deixaria em aberto a pergunta que importa — o
        // que acontece com o resto do texto —, e a resposta é: nada, porque a
        // geração é recusada inteira.
        <p style={{ fontSize: 12, marginTop: 4, marginBottom: 0, color: "var(--color-danger, #b42318)" }}>
          {alvoAtivo
            ? t("createVideo.script.durationTarget.tooLong", {
                targetSeconds: cost.targetDurationSeconds,
                targetChars: cost.targetMaxChars,
              })
            : t("createVideo.script.tooLong", {
                maxSeconds: cost.maxScriptSeconds,
                maxChars: cost.maxScriptChars,
              })}
        </p>
      )}
    </div>
  );
}
