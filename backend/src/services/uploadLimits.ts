/**
 * Teto de tamanho do vídeo/áudio de referência do avatar.
 *
 * POR QUE ESTE ARQUIVO EXISTE: `app.register(multipart)` sobe sem opções, e
 * `@fastify/multipart` (8.3.1, index.js:52) faz
 * `fileSize: options.limits?.fileSize || fastify.initialConfig.bodyLimit`.
 * Como o `bodyLimit` do Fastify 4 é 1 MiB por padrão, TODO upload do produto
 * está limitado a 1.048.576 bytes — e uma gravação de webcam passa disso em
 * poucos segundos. Era esse o `413 request file too large`.
 *
 * O teto NÃO sobe globalmente. Subir o limite do multipart para 100 MB faria
 * valer para toda rota que aceita arquivo — inclusive as de documento e de
 * imagem de referência, que não precisam de nada perto disso. Um teto alto
 * onde ele não é necessário é superfície de ataque de graça: qualquer rota de
 * upload vira um jeito barato de encher disco e memória.
 *
 * Em vez disso, o limite viaja como argumento de `req.file({ limits })` na
 * única rota que precisa dele. O padrão de 1 MiB continua valendo em todo o
 * resto sem que nenhuma outra linha mude.
 */

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Teto desta rota. Configurável porque o valor certo depende de quanto vídeo
 * os fornecedores precisam para treinar bem (ver RECOMMENDED_RECORDING_SECONDS)
 * e da banda de quem envia — mas com um padrão que já serve.
 */
export function referenceVideoMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REFERENCE_VIDEO_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const value = Number(raw);
  // Valor inválido cai no padrão em vez de virar NaN: `bytes > NaN` é sempre
  // falso, o que desligaria o teto em silêncio — o oposto do que este arquivo
  // existe para fazer.
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_BYTES;
}

/** "38,4 MB" — para ler numa tela, não para calcular. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * A frase que o cliente lê. Diz o que foi enviado e o que cabe, porque
 * "request file too large" não permite decidir nada: não dá para saber se
 * faltou pouco ou se o arquivo tem dez vezes o tamanho aceito.
 *
 * `sentBytes` vem do `Content-Length` da requisição, e não do arquivo em si —
 * quando o teto estoura, o stream é cortado e o tamanho real do arquivo já
 * não é conhecido pelo servidor. O `Content-Length` inclui o cabeçalho
 * multipart junto, então é o tamanho do ENVIO, alguns bytes acima do arquivo.
 * A diferença é irrelevante para a decisão de quem lê, e inventar precisão
 * que não temos seria pior.
 */
export function tooLargeMessage(sentBytes: number | null, maxBytes: number): string {
  const limite = formatBytes(maxBytes);
  const tamanho =
    sentBytes === null
      ? `O arquivo passa do limite de ${limite}.`
      : `O envio tem ${formatBytes(sentBytes)} e o limite é ${limite}.`;
  return `${tamanho} ${HOW_TO_FIT}`;
}

/**
 * O que fazer a respeito — a parte que transforma uma recusa em instrução.
 *
 * Dizer só o tamanho e o limite deixa a pessoa adivinhando qual das duas
 * alavancas puxar, e a mais provável de tentarem primeiro (regravar tudo mais
 * curto) costuma ser a errada: quase sempre o problema é a câmera em 4K, e
 * baixar a resolução resolve sem sacrificar a duração — que é justamente o que
 * os fornecedores precisam para treinar bem.
 *
 * A ordem das duas frases importa: resolução primeiro, duração depois.
 */
const HOW_TO_FIT =
  "Grave em 1080p em vez de 4K — costuma resolver sozinho, sem encurtar o vídeo. " +
  "Se ainda passar, grave um trecho mais curto.";

/**
 * Duração recomendada de gravação, em segundos.
 *
 * Não é um número escolhido por conforto: é o ponto em que os dois
 * fornecedores fazem seu melhor trabalho sem que o arquivo cresça à toa.
 *
 *  - **Voz (ElevenLabs, clonagem instantânea):** amostras muito curtas
 *    produzem clone perceptivelmente pior; a qualidade melhora até cerca de
 *    um a dois minutos de fala limpa e depois estabiliza. Menos de 30 s é
 *    pouco para este caminho.
 *  - **Avatar (HeyGen):** precisa de fala contínua suficiente para cobrir
 *    variação de boca e expressão; a mesma faixa de um a dois minutos serve.
 *
 * Por isso o padrão é 120 s, e não 60 s: 60 s fica na borda inferior da faixa
 * boa para voz, e a diferença de arquivo é pequena (a ~2,6 Mbps, 120 s dão
 * cerca de 39 MB, bem dentro do teto de 100 MB). Gravar muito além disso não
 * melhora o resultado e só aumenta o risco de falhar no envio.
 *
 * ESTES NÚMEROS VÊM DA ORIENTAÇÃO PUBLICADA DOS FORNECEDORES, não de medição
 * nossa: nenhum avatar deste projeto foi treinado com durações diferentes
 * para comparar. Se algum dia isso for medido, este é o lugar de corrigir.
 */
export const RECOMMENDED_RECORDING_SECONDS = 120;
