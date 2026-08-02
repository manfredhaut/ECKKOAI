// Serves a file as a browser download (Content-Disposition: attachment)
// regardless of where the bytes actually live. Needed because a plain
// <a href download> only works same-origin — the HTML `download` attribute
// is silently ignored by browsers for cross-origin URLs, which is exactly
// what every real generated video is (HeyGen/D-ID host it on their own
// CDN). Routes call this instead of linking the raw URL directly.
import type { FastifyReply } from "fastify";
import { Readable } from "node:stream";
import { config } from "../config.js";
import { InvalidArtifactError, validateVideoArtifact } from "./videoArtifact.js";

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

export function contentTypeForExtension(ext: string): string {
  return EXTENSION_CONTENT_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}

export function sendAttachment(
  reply: FastifyReply,
  buffer: Buffer,
  filename: string,
  contentType: string,
): void {
  reply.header("Content-Type", contentType);
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  reply.send(buffer);
}

/**
 * Resolve uma URL relativa contra o próprio servidor.
 *
 * O `output_url` de um vídeo real é absoluto (CDN do vendor). O de um vídeo
 * gerado em modo fixture é relativo (`/uploads/<tenant>/<arquivo>`), porque
 * é servido pela nossa própria origem — e `fetch()` recusa URL relativa.
 *
 * Resolver aqui, em vez de desviar para leitura em disco, é deliberado: o
 * ponto do modo fixture é exercitar o caminho INTEIRO. Se a simulação
 * pulasse o proxy, o proxy só rodaria em produção, que é exatamente onde
 * não se quer descobrir um defeito nele.
 */
function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, `http://127.0.0.1:${config.port}`).toString();
}

// Fetches url on the server and hands it to the client, so the browser never
// navigates to (or even sees) the upstream origin.
//
// `validate` liga a checagem de integridade (services/videoArtifact.ts) e, com
// ela, o arquivo passa a ser BUFERIZADO antes de sair. A troca é deliberada:
// em streaming só dá para inspecionar o começo, e o modo de falha que importa
// — transferência que morre no meio — produz justamente um começo válido com
// um fim faltando. A única forma de garantir "os bytes que entrego são os
// bytes que validei" é ter o arquivo inteiro antes de mandar o primeiro.
//
// O custo é memória proporcional ao arquivo. Aceitável na escala deste
// produto (o maior vídeo real medido tem 2,6 MB) e pago só no download, que
// não é caminho quente. Se um dia houver vídeo de centenas de MB, isto precisa
// virar validação em disco, não voltar a ser streaming cego.
export async function proxyRemoteAttachment(
  reply: FastifyReply,
  url: string,
  filename: string,
  options: { validate?: boolean } = {},
): Promise<void> {
  const upstream = await fetch(absoluteUrl(url));
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Upstream returned ${upstream.status}`);
  }
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  if (options.validate) {
    const body = Buffer.from(await upstream.arrayBuffer());
    const check = validateVideoArtifact(body, body.length);
    if (!check.ok) throw new InvalidArtifactError(check.reason ?? "artefato inválido");
    sendAttachment(reply, body, filename, contentType);
    return;
  }

  reply.header("Content-Type", contentType);
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) reply.header("Content-Length", contentLength);
  reply.send(Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream));
}

/**
 * Baixa um artefato do fornecedor e o guarda no NOSSO armazenamento.
 *
 * Existe porque `videos.output_url` recebia a URL assinada do fornecedor tal
 * como veio — `files2.heygen.ai/.../avatar_tmp/...?Expires=...`. A Biblioteca
 * passava a guardar um ponteiro para um host de terceiro, e o vídeo que o
 * cliente pagou deixava de existir quando a assinatura vencesse. Baixar uma
 * cópia para a máquina de quem gerou não resolve: a tela continuaria
 * dependendo daquela URL.
 *
 * Mora neste módulo, e não em `routes/videos.ts`, de propósito: este é o
 * arquivo já declarado como exceção da guarda de saída de rede, com o motivo
 * "baixa artefato já pago". Buscar o próprio artefato para arquivá-lo é
 * exatamente esse motivo — e pôr um `fetch` na rota criaria um cliente HTTP
 * novo num arquivo que não deve ter nenhum.
 *
 * URL já nossa (o caso da simulação, que grava em `/uploads/...`) é devolvida
 * intacta: rebaixar e regravar o próprio arquivo só produziria uma segunda
 * cópia idêntica com nome diferente.
 */
export async function persistRemoteArtifact(
  tenantId: string,
  url: string,
  filename: string,
): Promise<{ localUrl: string; bytes: number } | null> {
  if (!/^https?:\/\//i.test(url)) return null;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());

  // Valida ANTES de gravar. Guardar um artefato inválido criaria uma cópia
  // permanente do defeito, e a validação seguinte passaria a inspecionar o
  // nosso arquivo ruim em vez do original — perdendo a chance de saber que o
  // problema veio de fora.
  const check = validateVideoArtifact(body, body.length);
  if (!check.ok) throw new InvalidArtifactError(check.reason ?? "artefato inválido");

  const { saveUpload } = await import("./storage.js");
  const localUrl = await saveUpload(tenantId, body, filename);
  return { localUrl, bytes: body.length };
}

/**
 * Lê só o suficiente para validar um artefato remoto, sem baixá-lo inteiro.
 *
 * Usa `Range` para pedir os primeiros quilobytes: a resposta 206 traz o
 * tamanho total em `Content-Range`, então uma requisição responde às duas
 * perguntas. Servidor que ignora `Range` devolve 200 com o corpo completo, e
 * aí o tamanho vem do próprio buffer — o caminho continua correto, só deixa
 * de ser barato.
 */
export async function probeArtifact(url: string): Promise<{ head: Buffer; totalBytes: number }> {
  const res = await fetch(absoluteUrl(url), { headers: { Range: "bytes=0-65535" } });
  if (!res.ok) throw new Error(`Upstream returned ${res.status}`);

  const head = Buffer.from(await res.arrayBuffer());

  if (res.status === 206) {
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    if (Number.isFinite(total) && total > 0) return { head, totalBytes: total };
  }
  return { head, totalBytes: head.length };
}
