/**
 * QUAL das duas URLs de um vídeo é a que se entrega.
 *
 * O fornecedor devolve o vídeo limpo (`video_url`) e, quando a legenda foi
 * pedida com `caption.style`, também a versão com a legenda queimada
 * (`captioned_video_url`). As duas são guardadas — sobrescrever uma com a outra
 * apagaria uma versão de um vídeo que já foi pago.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA FUNÇÃO, E NÃO UM `??` NO HANDLER
 *
 * É a mesma lição de `lookSelection.ts`, e ela custou um mutante AMBÍGUO para
 * ser aprendida: enquanto a decisão morava dentro da rota, exercitá-la exigia
 * subir a aplicação inteira, e o arnês não conseguia dizer se uma mutação a
 * tinha quebrado. Aqui ela é uma função pura de dois campos, e a guarda a
 * chama direto.
 *
 * A decisão também aparece em DOIS lugares — o download e a listagem da
 * Biblioteca. Duas cópias de um `??` divergiriam no dia em que uma delas
 * mudasse, e o sintoma seria a tela mostrar a versão legendada enquanto o
 * download entrega a limpa.
 * ---------------------------------------------------------------------------
 */
export interface CaptionChoice {
  /** O que o usuário pediu na geração. */
  captions: boolean;
  /** A versão limpa, sempre presente num vídeo pronto. */
  outputUrl: string | null;
  /** A versão com legenda queimada, quando o fornecedor a devolveu. */
  captionedOutputUrl: string | null;
}

/**
 * A URL a servir, ou `null` quando não há vídeo pronto.
 *
 * FALHA PARA A VERSÃO LIMPA, e isso é deliberado. Se alguém pediu legenda e o
 * fornecedor não devolveu a versão legendada, o desfecho é entregar o vídeo sem
 * legenda — que é pior do que o pedido, mas é um vídeo. A alternativa seria
 * devolver nada e transformar uma legenda ausente em vídeo perdido, num
 * artefato que já foi cobrado.
 *
 * A ausência não é silenciosa: `captionsDelivered()` abaixo diz à tela que a
 * legenda pedida não veio.
 */
export function urlParaServir(video: CaptionChoice): string | null {
  if (video.captions && video.captionedOutputUrl) return video.captionedOutputUrl;
  return video.outputUrl;
}

/**
 * A legenda PEDIDA foi de fato ENTREGUE?
 *
 * `false` quando alguém pediu e a versão legendada não veio — o caso em que a
 * tela precisa dizer que o vídeo saiu sem legenda, em vez de deixar a pessoa
 * descobrir assistindo. Também `false` quando ninguém pediu, que é o normal.
 */
export function captionsDelivered(video: CaptionChoice): boolean {
  return video.captions && Boolean(video.captionedOutputUrl);
}
