import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import type { Avatar } from "../../types";
// O teto de bytes vem da POLÍTICA do servidor; daqui sai só a formatação.
import { formatBytes } from "../../uploadLimits";

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
  /**
   * Teto de duração, derivado dos bytes no servidor. A tela não o calcula: os
   * 10 MiB do fornecedor e a taxa de 24 kHz vivem na política, e uma segunda
   * conta aqui divergiria dela na primeira mudança de formato.
   */
  max_seconds: number;
  /**
   * Quantos slots de voz a conta já usa, medidos no fornecedor, e o teto
   * DECLARADO por este aplicativo. `null` quando a leitura não foi possível —
   * sem credencial ou com o fornecedor fora do ar. Nesse caso a seção
   * simplesmente não mostra a contagem: inventar "0 de 10" seria pior que
   * omitir, porque um número errado aqui convida a clonar.
   */
  voice_slots: { used: number; limit: number; source?: VoiceSlotLimitSource } | null;
}

/**
 * De onde saiu o TETO — R6.5, e a tela passou a olhar em 25/08.
 *
 * `vendor` é MEDIDO (`/v1/user/subscription` respondeu 200 com `voice_limit`),
 * `env` é um freio que o operador fixou de propósito, e `default` é a
 * retaguarda declarada por este aplicativo. A ressalva de "não confirmado no
 * fornecedor" só vale nos dois últimos: dá-la a um número medido é o mesmo
 * defeito, com o sinal trocado — desconfiar do que se sabe.
 */
type VoiceSlotLimitSource = "env" | "vendor" | "default";

interface CloneResponse {
  avatar: Avatar;
  duration_seconds: number | null;
  warning: string | null;
  voice_slots: { used: number; limit: number };
  /**
   * A prévia audível da voz recém-criada. `null` quando a síntese falhou — e
   * nesse caso `preview_error` diz por quê. Os dois nunca são nulos juntos:
   * isso seria sucesso sem player e sem explicação, indistinguível de tela
   * quebrada.
   */
  preview: { url: string; phrase: string; durationSeconds: number | null } | null;
  preview_error: string | null;
}

/**
 * O resultado da clonagem, mantido na tela até a pessoa fechá-lo.
 *
 * Estado próprio, e não um `notice` de texto: o bloco tem player, contagem de
 * slots e dois botões, e some só no clique de "Pronto" — nunca no próximo
 * render. Uma clonagem que custou um slot irreversível não pode ter o
 * resultado descartado por uma re-renderização.
 */
interface CloneResult {
  slots: { used: number; limit: number };
  preview: { url: string; phrase: string; durationSeconds: number | null } | null;
  previewError: string | null;
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
  /**
   * Limpeza de ruído — R6.4, ligada à tela em 25/08.
   *
   * A rota já aceitava o campo desde 24/08; o que faltava era a tela mandá-lo,
   * então na prática ele era sempre `false`. Default `false` continua sendo o
   * certo: a limpeza é DESTRUTIVA e o próprio fornecedor documenta que ela
   * piora gravação já limpa — o algoritmo leva parte do timbre junto. Aqui o
   * "sim" errado não custa dinheiro, custa a voz que o cliente vai ouvir em
   * todos os vídeos.
   */
  const [removerRuido, setRemoverRuido] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // O bloco de resultado. Enquanto ele existe, o gravador dá lugar a ele: quem
  // acabou de gastar um slot precisa OUVIR antes de qualquer outra ação.
  const [result, setResult] = useState<CloneResult | null>(null);
  // Só aparece depois de o servidor recusar com `voice_exists`. Um checkbox de
  // "substituir" sempre visível é um convite a marcar sem ler — e o que está
  // do outro lado é irreversível.
  const [replaceOffered, setReplaceOffered] = useState(false);
  /**
   * A PORTA da voz PROTEGIDA — a que exige digitar o nome do avatar.
   *
   * A voz protegida é a do vídeo já aprovado, e até aqui a recusa era
   * definitiva: uma voz aprovada por engano ficava presa no avatar para
   * sempre, e a única saída de dentro do produto era abandonar o avatar.
   *
   * A caixa de substituir continua sendo exigida junto. São duas perguntas
   * diferentes: a caixa pergunta se a pessoa sabe que a anterior se perde, e o
   * nome digitado pergunta se ela sabe QUAL avatar está mexendo — resposta que
   * não se dá por reflexo, porque exige ler o nome na tela e copiá-lo.
   */
  const [protectedGate, setProtectedGate] = useState(false);
  const [protectedAvatarName, setProtectedAvatarName] = useState("");
  const [typedName, setTypedName] = useState("");
  /**
   * RECOLHIDO quando já existe voz, ABERTO quando falta — e o default é a
   * proteção, não a estética.
   *
   * Este bloco vive dentro do fluxo de CRIAR VÍDEO, que é percorrido muitas
   * vezes por avatar. Com ele sempre aberto, o botão "Gravar" fica no caminho
   * de quem só queria escolher um avatar e seguir — e uma amostra gravada por
   * engano, confirmada na tela seguinte, substitui a voz do avatar de forma
   * IRRECUPERÁVEL: a coluna guarda um valor só, e o id antigo não fica em
   * lugar nenhum deste sistema.
   *
   * Quando `voice_id` é nulo, o bloco abre: aí ele não é risco, é a única
   * coisa que falta.
   */
  const [expanded, setExpanded] = useState(!avatar.voice_id);

  // Trocar de avatar tem de reavaliar o default. Sem isto, abrir um avatar sem
  // voz e depois clicar num que TEM voz deixaria o bloco aberto — o estado
  // ficaria descrevendo o avatar anterior.
  useEffect(() => {
    setExpanded(!avatar.voice_id);
    setReplaceOffered(false);
  }, [avatar.id, avatar.voice_id]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  // Input nativo escondido — o texto "Escolher arquivo/Nenhum arquivo
  // selecionado" vem do NAVEGADOR (varia por idioma do SO, já visto como
  // "ficheiro" em pt-PT), não da aplicação. O botão abaixo troca esse
  // texto pelo nosso.
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      // O nome digitado só viaja quando o servidor pediu por ele — é a porta
      // da voz PROTEGIDA, e mandá-lo sempre transformaria a segunda pergunta
      // num campo qualquer do formulário.
      // A limpeza de ruído vai SEMPRE explícita, nos dois valores — nunca
      // omitida quando é `false`. É a mesma doutrina do lado do servidor
      // (`voiceProvider.cloneVoice`): o que não se declara, o default do
      // fornecedor declara por você, e um default que muda do lado dele
      // mudaria o timbre de toda clonagem nova sem uma linha de diferença
      // deste lado.
      const ruido = { remove_background_noise: removerRuido ? "true" : "false" };
      const campos: Record<string, string> = replace
        ? protectedGate
          ? { ...ruido, replace: "true", confirm_avatar_name: typedName }
          : { ...ruido, replace: "true" }
        : ruido;
      const res = await api.upload<CloneResponse>(
        `/avatars/${avatar.id}/voice-sample`,
        blob,
        "voice-sample.webm",
        campos,
      );
      onCloned(res.avatar);
      // O aviso de duração (faixa 60–90 s) continua sendo aviso; o RESULTADO
      // agora tem bloco próprio, com o player. Antes desta mudança a única
      // saída era esta frase de sucesso, e quem quisesse saber como a voz
      // ficou não tinha como — foi assim que três slots irreversíveis foram
      // gastos em 09/08, um por tentativa de "ver se agora ficou bom".
      setNotice(res.warning ?? null);
      setResult({
        slots: res.voice_slots,
        preview: res.preview,
        previewError: res.preview_error,
      });
      setReplaceOffered(false);
      setProtectedGate(false);
      setTypedName("");
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlob(null);
      setBlobUrl(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("createVideo.voiceSample.genericError"));
      // QUAL saída oferecer vem do CORPO do 409, não da mensagem. Até aqui a
      // tela decidia com `/substitui/i` e `/protegida/i` sobre a frase em
      // português — uma decisão de fluxo tomada por regex sobre prosa, que
      // quebra na primeira vez que alguém melhora a redação e não acusa nada.
      if (err instanceof ApiError && err.status === 409) {
        const corpo = (err.body ?? {}) as {
          replaceable?: boolean;
          requiresAvatarName?: boolean;
          avatarName?: string;
        };
        setReplaceOffered(corpo.replaceable === true || corpo.requiresAvatarName === true);
        setProtectedGate(corpo.requiresAvatarName === true);
        setProtectedAvatarName(corpo.avatarName ?? avatar.name);
      }
    } finally {
      setSending(false);
    }
  }

  /**
   * Os limites vêm da POLÍTICA do servidor, e não há número de duração
   * literal neste arquivo — nem como fallback.
   *
   * O defeito medido no ensaio E2E (04/08): o texto dizia "Grave de 1:00 a
   * 1:30", que se lê como faixa FECHADA, enquanto a política não tem teto —
   * uma amostra de 2:33 passou como "boa duração", sem aviso nenhum. Quem
   * grava 2:30 acha que errou.
   *
   * Um fallback `?? 60` reintroduziria o mesmo problema por outra porta: com
   * a política fora do ar, a tela afirmaria com confiança um número que não
   * veio de lugar nenhum. Sem política, ela não afirma nada.
   */
  const min = policy?.min_seconds ?? null;
  const recommended = policy?.recommended_seconds ?? null;
  const max = policy?.max_seconds ?? null;
  // Só bloqueia o que a tela SABE ser curto. Um arquivo enviado tem
  // `elapsed === 0` sem ser curto — quem mede aquele caso é o servidor, e
  // bloquear aqui por ignorância impediria o envio de um arquivo perfeitamente
  // válido.
  const gravouCurto = min !== null && elapsed > 0 && elapsed < min;
  const podeEnviar = blob !== null && !sending && !gravouCurto;

  const faixa =
    elapsed === 0 || min === null || recommended === null
      ? "none"
      : elapsed < min
        ? "short"
        : elapsed < recommended
          ? "workable"
          : "good";

  return (
    <section className="voice-sample" data-testid="voice-sample-recorder">
      <h4>{t("createVideo.voiceSample.title")}</h4>

      {/* ESCOPO, sempre visível — inclusive com o bloco recolhido.
          A voz é do AVATAR (`avatars.voice_id`), não deste vídeo: trocá-la
          muda todos os vídeos futuros daquele avatar, e os já gerados
          continuam com a voz antiga porque o áudio já foi renderizado. Sem
          esta frase, um bloco que aparece dentro de "Criar vídeo" se lê como
          escolha DAQUELE vídeo — que é a leitura errada, e a mais natural. */}
      <p className="voice-sample__scope">{t("createVideo.voiceSample.scope")}</p>

      {avatar.voice_id && (
        <p className="voice-sample__existing">{t("createVideo.voiceSample.alreadyCloned")}</p>
      )}

      {/* SLOTS, sempre visível — inclusive com o bloco recolhido, e ANTES de
          qualquer clonagem. Até aqui este número só existia na resposta da
          clonagem, ou seja, chegava depois de o slot ter sido gasto: o
          operador descobria que a conta estava cheia quando a guarda recusava.
          A ressalva do teto declarado anda junto e não é rodapé decorativo —
          o limite é palpite nosso, e o número ao lado dele é medido. */}
      {policy?.voice_slots && (
        <p className="voice-sample__slots">
          {t("createVideo.voiceSample.slotsUsed", {
            used: policy.voice_slots.used,
            limit: policy.voice_slots.limit,
          })}
          <span className="voice-sample__limit-note">
            {" "}
            {policy.voice_slots.source === "vendor"
              ? ""
              : t("createVideo.voiceSample.slotsDeclaredNote")}
          </span>
        </p>
      )}

      {/* RESULTADO DA CLONAGEM — ocupa o lugar do gravador enquanto existe.
          Não é um aviso passageiro: o slot foi gasto e é irreversível, então o
          bloco fica até um clique explícito em "Pronto". */}
      {result && (
        <div className="voice-sample__result" data-testid="voice-clone-result">
          <p className="voice-sample__result-title">
            {t("createVideo.voiceSample.result.created", {
              used: result.slots.used,
              limit: result.slots.limit,
            })}
          </p>
          <p className="voice-sample__limit-note">
            {t("createVideo.voiceSample.slotsDeclaredNote")}
          </p>

          {result.preview ? (
            <>
              {/* O texto ao lado do player não é decoração: é ele que torna
                  duas clonagens comparáveis entre si. Sem a frase à vista,
                  "ficou melhor?" vira memória, não comparação. */}
              <audio controls src={result.preview.url} data-testid="voice-preview-audio" />
              <p className="voice-sample__preview-phrase">“{result.preview.phrase}”</p>
            </>
          ) : (
            /* A prévia falhou. A voz EXISTE e o slot foi gasto — o texto do
               servidor diz as duas coisas, e diz que clonar de novo não
               conserta a prévia. Nunca tratar como erro da clonagem. */
            <p className="voice-sample__preview-missing">{result.previewError}</p>
          )}

          <div className="voice-sample__result-actions">
            {/* "Pronto", e não "Manter esta voz": não há nada a manter. O
                UPDATE já aconteceu e o slot já foi gasto quando este bloco
                apareceu. Um botão que simula uma decisão já tomada é o mesmo
                defeito que esta tela existe para consertar. */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResult(null);
                setExpanded(false);
              }}
            >
              {t("createVideo.voiceSample.result.done")}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setResult(null);
                setExpanded(true);
              }}
            >
              {t("createVideo.voiceSample.result.cloneAgain")}
            </button>
          </div>

          {/* SEMPRE visível, nunca em hover: esta informação existia só ANTES
              de clonar, e é depois — olhando um resultado morno — que a pessoa
              decide tentar de novo. Foi exatamente esse o caminho dos três
              slots gastos em 09/08. */}
          <p className="voice-sample__result-warning">
            {t("createVideo.voiceSample.result.cloneAgainWarning")}
          </p>
        </div>
      )}

      {/* Recolhido: mostra só o estado e o caminho para expandir. */}
      {!result && !expanded && (
        <button type="button" className="btn btn-outline" onClick={() => setExpanded(true)}>
          {avatar.voice_id
            ? t("createVideo.voiceSample.changeVoice")
            : t("createVideo.voiceSample.recordNow")}
        </button>
      )}

      {!result && expanded && (
        <>
      <p className="voice-sample__hint">
        {min !== null && recommended !== null && max !== null
          ? t("createVideo.voiceSample.hint", {
              min: formatDuration(min),
              recommended: formatDuration(recommended),
              max: formatDuration(max),
            })
          : t("createVideo.voiceSample.hintLoading")}
      </p>

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

        <button
          type="button"
          className="voice-sample__file"
          onClick={() => fileInputRef.current?.click()}
          disabled={recording || sending}
        >
          {t("createVideo.voiceSample.orUploadFile")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={handleFile}
          disabled={recording || sending}
        />
      </div>

      {/* O TETO DE BYTES, derivado da política — nunca um "10 MB" literal, pelo
          mesmo motivo que não há número de duração escrito neste arquivo. Ele
          governa exclusivamente o caminho de UPLOAD: um arquivo acima disso é
          recusado na porta (`takeUpload`), ANTES de qualquer guarda de duração,
          e até aqui a tela não avisava. */}
      {policy && (
        <p className="voice-sample__limit-note">
          {t("createVideo.voiceSample.fileMaxSize", { size: formatBytes(policy.max_bytes) })}
        </p>
      )}

      {/* LIMPEZA DE RUÍDO — a opção existe no servidor desde R6.4 e só agora
          chega à tela. Fica junto dos controles porque é decisão sobre ESTA
          amostra, e precisa ser tomada antes de clonar: depois do clone, mudar
          de ideia custa outro slot. */}
      <label className="voice-sample__noise">
        <input
          type="checkbox"
          checked={removerRuido}
          onChange={(e) => setRemoverRuido(e.target.checked)}
          disabled={recording || sending}
        />
        {t("createVideo.voiceSample.removeNoiseLabel")}
      </label>
      <p className="voice-sample__limit-note">{t("createVideo.voiceSample.removeNoiseHelp")}</p>

      {(recording || elapsed > 0) && (
        <p className={`voice-sample__timer voice-sample__timer--${faixa}`} role="status">
          {formatDuration(elapsed)}
          {" · "}
          {faixa === "short"
            ? t("createVideo.voiceSample.tooShort", { missing: (min ?? 0) - elapsed })
            : faixa === "workable"
              ? t("createVideo.voiceSample.workable", { missing: (recommended ?? 0) - elapsed })
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
        {gravouCurto && min !== null && (
          <span className="voice-sample__blocker">
            {t("createVideo.voiceSample.blockedShort", { min: formatDuration(min) })}
          </span>
        )}
      </div>

      {replaceOffered && (
        <div className="voice-sample__replace">
          <p>{t("createVideo.voiceSample.replaceExplain")}</p>
          {/* A PORTA da voz protegida. Só aparece quando o servidor a abre, e
              o campo vem com o nome a copiar escrito ao lado — mandar a pessoa
              procurar o nome noutra tela é convite a errar três vezes. */}
          {protectedGate && (
            <div className="voice-sample__protected">
              <p>
                {t("createVideo.voiceSample.protectedExplain", { name: protectedAvatarName })}
              </p>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={protectedAvatarName}
                aria-label={t("createVideo.voiceSample.protectedInputLabel")}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => send(true)}
            // Com a porta aberta, o botão só liga com o nome conferido AQUI
            // também. O servidor continua sendo a autoridade — esta é a mesma
            // comparação, para que o clique não vire uma ida ao servidor só
            // para voltar com "não". Aparar e ignorar caixa: a fricção
            // pretendida é ter de LER o nome, não acertar a grafia.
            disabled={
              !blob ||
              sending ||
              (protectedGate &&
                typedName.trim().toLocaleLowerCase("pt-BR") !==
                  protectedAvatarName.trim().toLocaleLowerCase("pt-BR"))
            }
          >
            {t("createVideo.voiceSample.replaceConfirm")}
          </button>
        </div>
      )}
        </>
      )}
    </section>
  );
}
