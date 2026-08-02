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
declare const __MAX_IMAGE_BYTES__: number;

export const MAX_REFERENCE_VIDEO_BYTES = __MAX_REFERENCE_VIDEO_BYTES__;

/**
 * Teto das rotas de IMAGEM (cenário, traje, fotos do rosto, imagens de
 * referência). Bem menor que o de vídeo: 25 MB cobre foto de celular moderno,
 * e o que passa disso quase certamente não é foto de rosto.
 */
export const MAX_IMAGE_BYTES = __MAX_IMAGE_BYTES__;

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

/**
 * METAS de duração da gravação — diferentes do TETO acima, e a distinção é o
 * ponto deste bloco.
 *
 * O contador antigo dizia "Gravando 0:15 de 2:00 — para sozinho em 105s".
 * Isso responde "quanto ainda posso gravar?" e nunca "quanto preciso
 * gravar?". Aos 15 segundos ele parece saudável, com folga larga, e nada
 * sinaliza que a amostra está curta demais para clonar uma voz.
 *
 * Não é hipótese: o clone do avatar de demonstração foi treinado com uma
 * amostra de **15,37 s** (medido com ffprobe no wav de referência), e o
 * sintoma apareceu só no vídeo pronto — "a voz não parece a pessoa" —, longe
 * do momento em que ainda dava para consertar de graça. Um limite superior
 * vigiado e uma meta inferior invisível produzem exatamente esse desfecho.
 *
 * Constantes simples, e NÃO `define` do Vite como os tetos acima. Dois
 * motivos: (a) são orientação de qualidade, não limite que o servidor aplica,
 * então não há segunda ponta com que concordar; e (b) `vite.config.ts` está
 * fora do bind mount, e um `define` novo consumido por código montado derruba
 * a app inteira em branco até alguém reconstruir a imagem — já aconteceu neste
 * projeto com `__MAX_IMAGE_BYTES__` (ver o bloco FORMATO-1 no CLAUDE.md).
 *
 * Os números vêm da orientação publicada dos fornecedores, a mesma que já
 * estava no texto da tela — DOCUMENTADO, não medido por nós.
 */
export const RECORDING_MINIMUM_SECONDS = 30;
export const RECORDING_RECOMMENDED_SECONDS = 60;

export type RecordingQuality = "short" | "workable" | "good";

/** Em que faixa de qualidade a gravação está, agora. */
export function recordingQuality(elapsedSeconds: number): RecordingQuality {
  if (elapsedSeconds < RECORDING_MINIMUM_SECONDS) return "short";
  if (elapsedSeconds < RECORDING_RECOMMENDED_SECONDS) return "workable";
  return "good";
}

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
