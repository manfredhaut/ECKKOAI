import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import type { Avatar } from "../../types";

/**
 * Captura de voz dedicada: gravar → ouvir → regravar → enviar.
 *
 * POR QUE UMA TELA SÓ PARA ISSO. O único caminho que clonava voz neste produto
 * era `POST /avatars/:id/reference-video`, e ele TREINA O AVATAR antes de
 * clonar — US$ 1,00 de `photo_avatar` mais 1 crédito de avatar. Quem quisesse
 * apenas regravar a voz pagava um treino novo e trocava uma aparência já
 * aprovada. Aqui a clonagem acontece sozinha.
 *
 * O PORTÃO DE ESCUTA é a parte que mais importa e a que é fácil cortar por
 * pressa: a pessoa OUVE a própria gravação antes de enviar. Sem isso, o
 * primeiro momento em que alguém escuta o material é depois de o slot já ter
 * sido consumido — e o slot não volta, porque este produto não exclui vozes.
 * Um `<audio controls>` custa três linhas e é o único ponto do fluxo em que um
 * erro de captação (microfone mudo, ruído, volume) sai de graça.
 *
 * Os limites vêm do SERVIDOR (`GET /voice/sample-policy`), não de constantes
 * locais. Duas razões, e nenhuma é elegância: (a) a tela precisa desabilitar o
 * botão pelo mesmo critério com que a rota recusa — o precedente do predicado
 * de geração, em que a tela conhecia três condições e o servidor recusava por
 * sete; e (b) um `define` novo no `vite.config.ts` derruba a app inteira em
 * branco até a imagem ser reconstruída, porque aquele arquivo está fora do
 * bind mount. Já aconteceu neste projeto com `__MAX_IMAGE_BYTES__`.
 */

interface SamplePolicy {
  min_seconds: number;
  recommended_seconds: number;
  max_bytes: number;
}

interface CloneResponse {
  avatar: Avatar;
  duration_seconds: number | null;
  warning: string | null;
  voice_slots: { used: number; limit: number };
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceSampleRecorder({
  avatar,
  onCloned,
}: {
  avatar: Avatar;
  onCloned: (updated: Avatar) => void;
}) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<SamplePolicy | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Só aparece depois de o servidor recusar com `voice_exists`. Um checkbox de
  // "substituir" sempre visível é um convite a marcar sem ler — e o que está
  // do outro lado é irreversível.
  const [replaceOffered, setReplaceOffered] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    api.get<SamplePolicy>("/voice/sample-policy").then(setPolicy).catch(() => setPolicy(null));
  }, []);

  // Soltar o microfone ao desmontar. Sem isto o indicador de gravação do
  // navegador fica aceso depois de sair da tela, o que é indistinguível — para
  // quem olha — de um aplicativo que continua escutando.
  useEffect(
    () => () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );

  async function startRecording() {
    setError(null);
    setMicError(null);
    setNotice(null);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(null);
    setBlobUrl(null);
    setElapsed(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // A recusa de permissão precisa dizer o que fazer. "NotAllowedError" na
      // tela não permite decidir nada.
      setMicError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? t("createVideo.voiceSample.micDenied")
          : t("createVideo.voiceSample.micUnavailable"),
      );
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      setBlob(recorded);
      setBlobUrl(URL.createObjectURL(recorded));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);

    const startedAt = Date.now();
    tickRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  }

  function stopRecording() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(file);
    setBlobUrl(URL.createObjectURL(file));
    // A duração de um arquivo enviado só é conhecida depois de o navegador
    // carregar os metadados; quem decide de verdade é o servidor, que mede com
    // ffprobe. Aqui o contador fica zerado de propósito em vez de exibir um
    // número inventado.
    setElapsed(0);
    e.target.value = "";
  }

  async function send(replace: boolean) {
    if (!blob) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.upload<CloneResponse>(
        `/avatars/${avatar.id}/voice-sample`,
        blob,
        "voice-sample.webm",
        replace ? { replace: "true" } : undefined,
      );
      onCloned(res.avatar);
      setNotice(
        res.warning ??
          t("createVideo.voiceSample.cloned", {
            used: res.voice_slots.used,
            limit: res.voice_slots.limit,
          }),
      );
      setReplaceOffered(false);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlob(null);
      setBlobUrl(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("createVideo.voiceSample.genericError"));
      // 409 com voz já existente é o único caso em que oferecer a substituição
      // faz sentido — a voz protegida também dá 409 e NÃO deve oferecer nada,
      // porque por esta rota não existe caminho.
      if (err instanceof ApiError && err.status === 409) {
        setReplaceOffered(/substitui/i.test(err.message) && !/protegida/i.test(err.message));
      }
    } finally {
      setSending(false);
    }
  }

  const min = policy?.min_seconds ?? 60;
  const recommended = policy?.recommended_seconds ?? 90;
  // Só bloqueia o que a tela SABE ser curto. Um arquivo enviado tem
  // `elapsed === 0` sem ser curto — quem mede aquele caso é o servidor, e
  // bloquear aqui por ignorância impediria o envio de um arquivo perfeitamente
  // válido.
  const gravouCurto = elapsed > 0 && elapsed < min;
  const podeEnviar = blob !== null && !sending && !gravouCurto;

  const faixa = elapsed === 0 ? "none" : elapsed < min ? "short" : elapsed < recommended ? "workable" : "good";

  return (
    <section className="voice-sample" data-testid="voice-sample-recorder">
      <h4>{t("createVideo.voiceSample.title")}</h4>
      <p className="voice-sample__hint">
        {t("createVideo.voiceSample.hint", {
          min: formatDuration(min),
          recommended: formatDuration(recommended),
        })}
      </p>

      {avatar.voice_id && (
        <p className="voice-sample__existing">{t("createVideo.voiceSample.alreadyCloned")}</p>
      )}

      <div className="voice-sample__controls">
        {!recording ? (
          <button type="button" onClick={startRecording} disabled={sending}>
            {blob ? t("createVideo.voiceSample.recordAgain") : t("createVideo.voiceSample.record")}
          </button>
        ) : (
          <button type="button" onClick={stopRecording}>
            {t("createVideo.voiceSample.stop")}
          </button>
        )}

        <label className="voice-sample__file">
          {t("createVideo.voiceSample.orUploadFile")}
          <input type="file" accept="audio/*" onChange={handleFile} disabled={recording || sending} />
        </label>
      </div>

      {(recording || elapsed > 0) && (
        <p className={`voice-sample__timer voice-sample__timer--${faixa}`} role="status">
          {formatDuration(elapsed)}
          {" · "}
          {faixa === "short"
            ? t("createVideo.voiceSample.tooShort", { missing: min - elapsed })
            : faixa === "workable"
              ? t("createVideo.voiceSample.workable", { missing: recommended - elapsed })
              : t("createVideo.voiceSample.good")}
        </p>
      )}

      {/* O portão de escuta. Vem ANTES do botão de envio de propósito. */}
      {blobUrl && (
        <div className="voice-sample__playback">
          <p>{t("createVideo.voiceSample.listenFirst")}</p>
          <audio controls src={blobUrl} />
        </div>
      )}

      {micError && <p className="voice-sample__error">{micError}</p>}
      {error && <p className="voice-sample__error">{error}</p>}
      {notice && <p className="voice-sample__notice">{notice}</p>}

      <div className="voice-sample__actions">
        <button type="button" onClick={() => send(false)} disabled={!podeEnviar}>
          {sending ? t("createVideo.voiceSample.sending") : t("createVideo.voiceSample.send")}
        </button>
        {/* Condição ao lado do botão desabilitado, e não só na cor: o mesmo
            padrão adotado no passo 6 depois de o botão inoperante sem
            explicação ter custado uma sessão. */}
        {gravouCurto && (
          <span className="voice-sample__blocker">
            {t("createVideo.voiceSample.blockedShort", { min: formatDuration(min) })}
          </span>
        )}
      </div>

      {replaceOffered && (
        <div className="voice-sample__replace">
          <p>{t("createVideo.voiceSample.replaceExplain")}</p>
          <button type="button" onClick={() => send(true)} disabled={!blob || sending}>
            {t("createVideo.voiceSample.replaceConfirm")}
          </button>
        </div>
      )}
    </section>
  );
}
