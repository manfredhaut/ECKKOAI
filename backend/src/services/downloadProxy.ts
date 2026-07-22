// Serves a file as a browser download (Content-Disposition: attachment)
// regardless of where the bytes actually live. Needed because a plain
// <a href download> only works same-origin — the HTML `download` attribute
// is silently ignored by browsers for cross-origin URLs, which is exactly
// what every real generated video is (HeyGen/D-ID host it on their own
// CDN). Routes call this instead of linking the raw URL directly.
import type { FastifyReply } from "fastify";
import { Readable } from "node:stream";

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

// Fetches url on the server and streams it straight through to the client,
// so the browser never navigates to (or even sees) the upstream origin.
export async function proxyRemoteAttachment(
  reply: FastifyReply,
  url: string,
  filename: string,
): Promise<void> {
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Upstream returned ${upstream.status}`);
  }
  reply.header("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) reply.header("Content-Length", contentLength);
  reply.send(Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream));
}
