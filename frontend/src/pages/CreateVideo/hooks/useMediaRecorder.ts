import { useEffect, useRef, useState } from "react";
import { MAX_REFERENCE_VIDEO_BYTES, MAX_RECORDING_SECONDS } from "../../../uploadLimits";

/**
 * Gravação da amostra de referência do avatar.
 *
 * Três coisas que não existiam antes e que a falha de upload expôs:
 *
 *  1. **Teto de duração com parada automática.** Sem isso, a gravação só
 *     terminava quando alguém lembrasse de clicar, e o arquivo crescia até
 *     estourar o limite do servidor — descoberto só no envio, depois de
 *     gravar. Parar sozinho no tempo certo é melhor que avisar depois.
 *  2. **Contador visível.** Quem grava precisa saber quanto falta; um limite
 *     que só aparece no momento em que corta é indistinguível de um defeito.
 *  3. **Tamanho do resultado, sempre.** Mesmo dentro do limite: é o número
 *     que explica um envio lento, e o que permite comparar com o teto.
 *
 * O bitrate é declarado em vez de deixado a critério do navegador. Não é
 * compressão — é previsibilidade: o padrão varia muito por dispositivo, e com
 * ele variando não dá para prometer que a duração máxima cabe no teto de
 * tamanho. Nos valores abaixo, os 120 s recomendados dão cerca de 39 MB, com
 * folga confortável para os 100 MB do servidor.
 */
const VIDEO_BITS_PER_SECOND = 2_500_000;
const AUDIO_BITS_PER_SECOND = 128_000;

export function useMediaRecorderCapture() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Um recorder ainda ativo quando o componente sai de cena continuaria
  // segurando a câmera e acumulando pedaços na memória.
  useEffect(() => {
    return () => {
      clearTimer();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
  }, []);

  function start(stream: MediaStream) {
    setError(null);
    setRecordedBlob(null);
    setElapsedSeconds(0);
    chunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream, {
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearTimer();
        setRecordedBlob(new Blob(chunksRef.current, { type: recorder.mimeType }));
        setIsRecording(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => {
          const next = s + 1;
          // Para sozinho no teto. `stop()` dispara `onstop`, que já limpa o
          // timer e monta o blob — não há caminho em que a gravação continue
          // depois disso.
          if (next >= MAX_RECORDING_SECONDS && recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording");
    }
  }

  function stop() {
    clearTimer();
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  return {
    isRecording,
    recordedBlob,
    elapsedSeconds,
    remainingSeconds: Math.max(0, MAX_RECORDING_SECONDS - elapsedSeconds),
    maxSeconds: MAX_RECORDING_SECONDS,
    /** Verdadeiro quando o resultado não passaria no teto do servidor. */
    isOverSizeLimit: recordedBlob !== null && recordedBlob.size > MAX_REFERENCE_VIDEO_BYTES,
    error,
    start,
    stop,
  };
}
