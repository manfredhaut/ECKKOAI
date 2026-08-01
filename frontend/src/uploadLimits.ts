// Espelho, no cliente, do teto que o servidor aplica
// (backend/src/services/uploadLimits.ts). As duas pontas leem a MESMA
// variável de ambiente, repassada aos dois serviços pelo docker-compose, para
// que concordem por construção e não por coincidência.
//
// Se ainda assim divergirem, quem manda é o servidor: a checagem daqui é uma
// cortesia — evita subir 90 MB para receber um 413 no fim — e não uma
// garantia. Nunca troque a validação do servidor por esta.
declare const __MAX_REFERENCE_VIDEO_BYTES__: number;
declare const __MAX_RECORDING_SECONDS__: number;

export const MAX_REFERENCE_VIDEO_BYTES = __MAX_REFERENCE_VIDEO_BYTES__;

/**
 * Teto de duração da gravação pela câmera.
 *
 * Escolhido pelo que os fornecedores precisam para entregar qualidade, e não
 * por conforto de implementação: amostras muito curtas pioram
 * perceptivelmente a clonagem de voz, e a qualidade melhora até cerca de um a
 * dois minutos de fala limpa, estabilizando depois. Gravar muito além disso
 * não melhora o resultado e só aumenta o risco de falhar no envio.
 *
 * Ver o comentário em backend/src/services/uploadLimits.ts para a origem
 * destes números — orientação publicada dos fornecedores, não medição nossa.
 */
export const MAX_RECORDING_SECONDS = __MAX_RECORDING_SECONDS__;

/** "38,4 MB" — mesma forma da função equivalente no backend. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/** "1:23" — contador de gravação. */
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
