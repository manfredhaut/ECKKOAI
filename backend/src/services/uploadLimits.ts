import type { FastifyReply, FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { logEvent } from "./log/safeLog.js";

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

const DEFAULT_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Teto das rotas que recebem IMAGEM: cenário, traje, fotos do rosto e imagens
 * de referência.
 *
 * 25 MB não é generosidade — é o tamanho de uma foto de celular moderno. Um
 * iPhone em HEIC/JPEG de 48 MP passa de 10 MB sem esforço, e o padrão herdado
 * de 1 MiB recusava praticamente qualquer foto tirada na hora. Foi o defeito
 * (A) medido na primeira passada live: o DEMO-2 subiu o teto só na rota do
 * vídeo de referência, e as de imagem ficaram para trás.
 *
 * Continua MUITO abaixo do teto de vídeo (100 MB), porque imagem que passa de
 * 25 MB quase certamente não é foto de rosto — é engano ou abuso.
 */
export function imageUploadMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.IMAGE_UPLOAD_MAX_BYTES;
  if (!raw) return DEFAULT_IMAGE_MAX_BYTES;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_IMAGE_MAX_BYTES;
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
export type UploadKind = "video" | "image";

export function tooLargeMessage(
  sentBytes: number | null,
  maxBytes: number,
  kind: UploadKind = "video",
): string {
  const limite = formatBytes(maxBytes);
  const tamanho =
    sentBytes === null
      ? `O arquivo passa do limite de ${limite}.`
      : `O envio tem ${formatBytes(sentBytes)} e o limite é ${limite}.`;
  return `${tamanho} ${HOW_TO_FIT[kind]}`;
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
const HOW_TO_FIT: Record<UploadKind, string> = {
  video:
    "Grave em 1080p em vez de 4K — costuma resolver sozinho, sem encurtar o vídeo. " +
    "Se ainda passar, grave um trecho mais curto.",
  // Para imagem a alavanca é outra: não há duração a cortar, e a causa quase
  // sempre é mandar o arquivo original da câmera em resolução máxima.
  image:
    "Reduza a resolução da imagem antes de enviar, ou use uma cópia comprimida " +
    "em vez do arquivo original da câmera.",
};

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

const DEFAULT_MAX_SECONDS = 120;

/**
 * Teto REAL de duração do vídeo/áudio de referência — diferente de
 * `RECOMMENDED_RECORDING_SECONDS` acima, que nunca travou nada. Este número
 * RECUSA com 422 quando excedido, porque este envio treina o avatar E clona a
 * voz ao mesmo tempo (`POST /avatars/:id/reference-video`).
 *
 * Lê `MAX_RECORDING_SECONDS` — a MESMA variável que já controla o corte
 * automático da gravação por câmera no cliente (`frontend/vite.config.ts`,
 * `frontend/src/uploadLimits.ts`). Não é coincidência de nome: é para as duas
 * pontas concordarem por construção, o mesmo raciocínio já registrado no
 * comentário de `referenceVideoMaxBytes()`. Uma variável nova e paralela aqui
 * abriria exatamente a divergência que já aconteceu neste projeto entre
 * `checkSampleDuration` e `checkNormalizedSampleSize` (voiceSample.ts) antes
 * de as duas passarem a derivar do mesmo cálculo.
 */
export function referenceVideoMaxSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_RECORDING_SECONDS;
  if (!raw) return DEFAULT_MAX_SECONDS;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_SECONDS;
}

/** "1:15" — para ler numa tela, não para calcular. */
export function formatRecordingSeconds(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface DurationVerdict {
  ok: boolean;
  code?: "reference_video_not_readable" | "reference_video_too_long";
  message?: string;
}

/**
 * GUARDA de duração do vídeo/áudio de referência — mesmo desenho da GUARDA A
 * de `services/voice/voiceSample.ts` (`checkSampleDuration`): `null`/`NaN`
 * nunca passa (arquivo corrompido não é "sem opinião"), e o teto recusa antes
 * de qualquer chamada a fornecedor.
 */
export function checkReferenceVideoDuration(
  durationSeconds: number | null,
  maxSeconds: number = referenceVideoMaxSeconds(),
): DurationVerdict {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return {
      ok: false,
      code: "reference_video_not_readable",
      message:
        "Não foi possível medir a duração do vídeo — o arquivo pode estar corrompido ou incompleto. " +
        "Grave novamente e envie.",
    };
  }
  if (durationSeconds > maxSeconds) {
    return {
      ok: false,
      code: "reference_video_too_long",
      message:
        `O vídeo tem ${formatRecordingSeconds(durationSeconds)} e o máximo é ` +
        `${formatRecordingSeconds(maxSeconds)}. Esta gravação treina o avatar e clona a voz ao mesmo ` +
        "tempo — grave um trecho mais curto, com fala contínua, e envie de novo.",
    };
  }
  return { ok: true };
}

/**
 * Lê o arquivo de um multipart com teto próprio da rota, e responde 413 legível
 * quando estoura.
 *
 * Existe como helper para que as cinco rotas de upload NÃO tenham cinco cópias
 * do mesmo `try/catch`. A duplicação já cobrou seu preço: o DEMO-2 corrigiu a
 * rota do vídeo de referência e as outras quatro continuaram em 1 MiB sem que
 * nada acusasse — e as mensagens teriam divergido na primeira vez que alguém
 * editasse uma delas.
 *
 * Devolve `null` quando já respondeu (413 ou 400). O chamador faz
 * `if (!up) return reply;` e segue.
 */
export async function takeUpload(
  req: FastifyRequest,
  reply: FastifyReply,
  options: { maxBytes: number; route: string; kind?: UploadKind },
): Promise<{ file: MultipartFile; buffer: Buffer } | null> {
  const { maxBytes, route, kind = "video" } = options;
  try {
    // O estouro pode aparecer em DOIS lugares: ao pegar o arquivo e ao
    // materializá-lo (@fastify/multipart index.js:379 lança em toBuffer()
    // quando o stream já foi truncado). Tratar só o primeiro deixaria o caso
    // comum — arquivo grande que começa a chegar normalmente — cair como 500.
    const file = await req.file({ limits: { fileSize: maxBytes } });
    if (!file) {
      await reply.code(400).send({ error: "no_file", message: "Nenhum arquivo foi enviado." });
      return null;
    }
    const buffer = await file.toBuffer();
    return { file, buffer };
  } catch (err) {
    if ((err as { code?: string })?.code !== "FST_REQ_FILE_TOO_LARGE") throw err;

    const declared = Number(req.headers["content-length"]);
    const sent = Number.isFinite(declared) && declared > 0 ? declared : null;
    logEvent("error", "upload_too_large", { route, sent, maxBytes });
    await reply.code(413).send({
      error: "file_too_large",
      message: tooLargeMessage(sent, maxBytes, kind),
      maxBytes,
      sentBytes: sent,
    });
    return null;
  }
}
