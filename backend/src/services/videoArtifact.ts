/**
 * O arquivo é mesmo um vídeo?
 *
 * A pergunta parece boba até a resposta ser "não". Existem, neste projeto,
 * `.mp4` de 16 bytes gravados como se fossem vídeos prontos — arquivos que a
 * biblioteca lista, o player abre em branco e o download entrega sem reclamar.
 * O pior desfecho não é o erro: é o cliente receber um arquivo vazio com cara
 * de sucesso, e descobrir depois, longe de qualquer log.
 *
 * Dois critérios, nesta ordem:
 *
 *  1. **Tamanho mínimo.** Um mp4 h264 com áudio não cabe embaixo de 100 KB em
 *     nenhuma configuração que o produto gere. Não é uma medida de qualidade;
 *     é o piso que separa "arquivo" de "resto de uma transferência que
 *     morreu no meio" — que é o modo de falha real, porque uma conexão
 *     interrompida produz um prefixo válido, não um arquivo corrompido.
 *  2. **Assinatura `ftyp` nos bytes 4..8.** É a caixa obrigatória de todo
 *     arquivo ISO-BMFF (mp4/mov/m4a). Ela está em 4, e não em 0, porque os
 *     quatro primeiros bytes são o tamanho da caixa. Checar o começo do
 *     arquivo pega o caso em que o servidor devolveu uma página de erro HTML
 *     com status 200 — que nenhuma checagem de tamanho pegaria, já que a
 *     página tem tamanho de sobra.
 *
 * Os dois juntos, e não um ou outro: tamanho sozinho aceita um HTML grande,
 * assinatura sozinha aceita um mp4 truncado nos primeiros quilobytes.
 */

/** Piso de bytes. Ver o raciocínio acima — é piso de integridade, não de qualidade. */
export const MIN_VIDEO_BYTES = 100 * 1024;

/** Onde a caixa `ftyp` começa num arquivo ISO-BMFF. */
export const FTYP_OFFSET = 4;
const FTYP = "ftyp";

export interface ArtifactCheck {
  ok: boolean;
  /** Motivo legível, para log e para a tela. Nunca contém material sensível. */
  reason: string | null;
}

/**
 * Valida a partir do começo do arquivo e do tamanho total.
 *
 * Recebe os dois separados de propósito: em live dá para descobrir o tamanho
 * por `Content-Range` sem baixar o arquivo inteiro, e obrigar o chamador a ter
 * o buffer completo tornaria a validação cara justamente onde ela importa.
 */
export function validateVideoArtifact(head: Buffer, totalBytes: number): ArtifactCheck {
  if (totalBytes < MIN_VIDEO_BYTES) {
    return {
      ok: false,
      reason:
        `arquivo de ${totalBytes} bytes, abaixo do mínimo de ${MIN_VIDEO_BYTES} ` +
        "— transferência incompleta ou artefato vazio",
    };
  }

  if (head.length < FTYP_OFFSET + FTYP.length) {
    return { ok: false, reason: "não foi possível ler o cabeçalho do arquivo" };
  }

  const signature = head.subarray(FTYP_OFFSET, FTYP_OFFSET + FTYP.length).toString("latin1");
  if (signature !== FTYP) {
    return {
      ok: false,
      reason: `assinatura "${signature}" nos bytes 4..8, esperado "${FTYP}" — o arquivo não é um mp4`,
    };
  }

  return { ok: true, reason: null };
}

/** Frase mostrada ao cliente. O detalhe técnico fica no log do servidor. */
export const ARTIFACT_INVALID_MESSAGE =
  "O arquivo gerado chegou incompleto e foi recusado. Nada foi entregue — gere novamente.";

export class InvalidArtifactError extends Error {
  constructor(public readonly detail: string) {
    super(ARTIFACT_INVALID_MESSAGE);
    this.name = "InvalidArtifactError";
  }
}
