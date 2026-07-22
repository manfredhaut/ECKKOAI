import { useRef, useState } from "react";

export function useMediaRecorderCapture() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  function start(stream: MediaStream) {
    setError(null);
    setRecordedBlob(null);
    chunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setRecordedBlob(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start recording");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  return { isRecording, recordedBlob, error, start, stop };
}
