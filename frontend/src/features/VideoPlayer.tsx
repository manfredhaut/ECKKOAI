import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Video } from "../types";
import { SimulatedNotice } from "./SimulatedBadge";

/**
 * Player de vídeo do produto — o mesmo no passo 6 e na Biblioteca.
 *
 * Existe porque, até o bloco 5D, o único lugar que reproduzia um vídeo era o
 * passo 6 do wizard, e o estado dele vive em `useState`: sair de /create ou dar
 * F5 tornava o resultado inalcançável. A Biblioteca listava onze vídeos com
 * uma única ação — "Baixar" —, então VER o que se acabou de gerar exigia sair
 * do produto e abrir o arquivo num player externo.
 *
 * Componente único, e não uma cópia em cada tela, por causa do item 2.3: o
 * aviso de SIMULADO precisa estar em TODO player. Duas implementações
 * divergem, e a que divergir será justamente a que mostra um vídeo de fixture
 * sem aviso numa apresentação.
 */

/**
 * Proporções que o produto oferece (espelho de videoFormat.ts, lado servidor).
 *
 * O mapa é explícito em vez de `aspectRatio: ratio.replace(":", "/")` porque
 * um valor desconhecido vindo do banco viraria CSS inválido e o navegador o
 * ignoraria em silêncio — o vídeo voltaria a ser esticado, que é exatamente o
 * defeito que este componente existe para impedir, e sem nenhum sintoma.
 */
const CSS_ASPECT: Record<string, string> = {
  "16:9": "16 / 9",
  "9:16": "9 / 16",
  "4:5": "4 / 5",
  "1:1": "1 / 1",
};

/** Largura máxima por proporção: um 9:16 com 480px de largura não cabe na tela. */
const MAX_WIDTH: Record<string, number> = {
  "16:9": 560,
  "9:16": 280,
  "4:5": 360,
  "1:1": 420,
};

/**
 * A duração que o rótulo mostra, e de onde ela veio.
 *
 * A ordem não é arbitrária e repete a do registro de consumo (videos.ts):
 *
 *  (a) o que o FORNECEDOR mediu no vídeo pronto. É a única fonte que não é
 *      nossa, e é a que cobra: em 05/08 ele declarou 36,9876 s onde o nosso
 *      `ffprobe` deu 37,000000 — truncados, 36 e 37, três unidades de
 *      diferença. Por isso a régua dele ganha da nossa.
 *  (b) a estimativa derivada do roteiro, EXPLICITAMENTE rotulada como
 *      estimativa enquanto a medição não existe.
 *
 * O que NÃO entra aqui é a duração pedida. Era o que este rótulo mostrava, e
 * ela dizia "15s" num arquivo de 37 s — o número com menos relação possível com
 * o que estava tocando na tela logo acima.
 */
// EXPORTADA (P2-7) para a janela de Detalhes reaproveitar — a mesma
// lógica de "medida vs. estimada" não pode existir em dois lugares que
// podem divergir.
export function durationLabel(video: Video): { seconds: number; estimated: boolean } | null {
  if (video.delivered_seconds != null) return { seconds: video.delivered_seconds, estimated: false };
  if (video.estimated_seconds != null) return { seconds: video.estimated_seconds, estimated: true };
  return null;
}

export function VideoPlayer({ video }: { video: Video }) {
  const { t } = useTranslation();
  if (!video.output_url) return null;

  const ratio = video.aspect_ratio ?? "16:9";
  const duration = durationLabel(video);
  const cssRatio = CSS_ASPECT[ratio];
  const maxWidth = MAX_WIDTH[ratio] ?? 480;

  return (
    <div>
      {/* Acima do player, nunca abaixo: quem olha o vídeo tem de ler isto
          antes de julgar o que está vendo. */}
      <SimulatedNotice simulated={video.simulated} />
      {/* Legenda PEDIDA e não entregue. O aviso fica acima do player pelo mesmo
          motivo do aviso de simulação: quem vai assistir precisa saber o que
          está vendo antes de julgar o resultado — e este é o caso em que o
          vídeo foi cobrado por inteiro sem a legenda que alguém escolheu. */}
      {video.captions === true && video.captions_delivered === false && (
        <div className="alert alert-warning">{t("createVideo.generate.captionsMissing")}</div>
      )}
      <video
        // A URL vem escolhida do servidor; `output_url` é o fallback para
        // respostas antigas, de antes de este campo existir.
        src={video.playback_url ?? video.output_url}
        controls
        style={{
          width: "100%",
          maxWidth,
          // `aspectRatio` só é aplicado quando a proporção é conhecida. Com
          // `undefined`, o elemento cai no tamanho natural do arquivo — que
          // continua correto, só não reserva espaço antes de carregar.
          aspectRatio: cssRatio,
          background: "#000",
          borderRadius: "var(--radius-card)",
          display: "block",
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <a className="btn btn-outline" href={`/api/videos/${video.id}/download`} download>
          {t("content.download")}
        </a>
        {/* P2-8 — "Ajustar este vídeo". Este componente é usado tanto em
            ContentPage.tsx (montada em `/:slug/content`) quanto em
            GenerateStep.tsx (`/:slug/create`) — um "to" relativo resolve
            relativo ao PRÓPRIO caminho da rota que renderizou o link, não
            ao pai comum (MEDIDO no navegador em 22/09/2026: sem "../", o
            mesmo link virava `/:slug/content/create`, path inexistente).
            "../create" sobe um nível e desce para "create", chegando em
            `/:slug/create` nos dois contextos — de dentro de "/create" isso
            resolve para a própria rota (só troca o `adjustFrom` na URL,
            sem remontar nada de errado). */}
        <Link className="btn btn-outline" to={`../create?adjustFrom=${video.id}`}>
          {t("content.adjust")}
        </Link>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {duration
            ? duration.estimated
              ? t("content.durationEstimated", { seconds: Math.floor(duration.seconds) })
              : t("content.durationDelivered", { seconds: duration.seconds.toFixed(2).replace(".", ",") })
            : t("content.durationUnknown")}
          {" · "}
          {ratio}
        </span>
      </div>
    </div>
  );
}
