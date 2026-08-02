#!/usr/bin/env node
/**
 * Carimbo de FRESCOR da imagem do frontend.
 *
 * O problema que isto resolve custou tempo real, e o sintoma é o pior possível:
 * a imagem do frontend era anterior ao commit que acrescentou
 * `__MAX_IMAGE_BYTES__` ao `vite.config.ts`. Como esse arquivo **não está no
 * bind mount** e o código que o usa **está**, o container servia um bundle que
 * referenciava um `define` inexistente — e a app inteira ficava em branco, com
 * o console limpo, o Vite anunciando `ready` e o healthcheck verde. O erro real
 * só aparecia importando `/src/main.tsx` à mão pelo console do navegador.
 *
 * Nenhum sinal do ambiente apontava para "a imagem está velha". Este arquivo
 * cria esse sinal.
 *
 * COMO FUNCIONA, e por que assim:
 *
 *  - O hash cobre exatamente os arquivos que o Dockerfile **copia** e o compose
 *    **não monta** — são os únicos que podem divergir em silêncio. Arquivo
 *    montado não precisa de carimbo: editá-lo já tem efeito imediato.
 *  - O carimbo é gravado **durante o build**, em `/app/.image-stamp`, fora do
 *    bind mount. Gravá-lo em `public/` ou `src/` seria inútil: o host
 *    sobrescreveria com a sua cópia, e o carimbo passaria a medir o repositório
 *    contra ele mesmo — sempre igual, nunca detectando nada.
 *  - O mesmo cálculo roda no gate, contra os arquivos do repositório. Divergiu,
 *    a imagem está velha.
 *
 * Ordem e normalização de fim de linha são fixas de propósito: no Windows o
 * working copy vem em CRLF e a imagem é construída a partir do mesmo conteúdo,
 * mas o `COPY` não normaliza nada. Sem a normalização, todo build no Windows
 * produziria divergência permanente — uma guarda que acusa sempre é abandonada
 * na primeira semana, e guarda abandonada não protege.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Arquivos COPIADOS para a imagem e NÃO montados pelo compose.
 *
 * Se algum deles passar a ser montado, tire-o daqui: um arquivo montado nunca
 * diverge, e mantê-lo na lista só adiciona ruído. Se um arquivo novo passar a
 * ser copiado, acrescente — o buraco desta guarda é exatamente o arquivo que
 * ninguém lembrou de listar.
 */
export const STAMPED_FILES = ["package.json", "tsconfig.json", "vite.config.ts", "Dockerfile"];

export function computeStamp(rootDir) {
  const hash = createHash("sha256");
  for (const rel of STAMPED_FILES) {
    let content;
    try {
      content = readFileSync(path.join(rootDir, rel), "utf8");
    } catch {
      // Arquivo ausente entra como marcador explícito em vez de ser pulado:
      // pular faria "o arquivo sumiu" e "o arquivo não mudou" produzirem o
      // mesmo hash, e some é justamente o caso que precisa aparecer.
      content = "<ausente>";
    }
    hash.update(rel);
    hash.update("\0");
    hash.update(content.replace(/\r\n/g, "\n"));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

// Invocado direto pelo Dockerfile durante o build.
if (process.argv[1] && process.argv[1].endsWith("image-stamp.mjs")) {
  process.stdout.write(computeStamp(process.argv[2] ?? "."));
}
