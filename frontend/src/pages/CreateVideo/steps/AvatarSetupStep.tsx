import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { Avatar, AvatarLooksResponse } from "../../../types";
import { useCamera } from "../hooks/useCamera";
import { useMediaRecorderCapture } from "../hooks/useMediaRecorder";
import type { AssetDefaults } from "../types";
import { Field } from "../../../components/ui/Field";
import { BACKGROUND_OPTIONS, DEFAULT_BACKGROUND_ID } from "../virtualBackground/backgroundOptions";
import { applyQualityTreatment, DEFAULT_QUALITY } from "../imageQuality/applyQualityTreatment";
import type { QualityOptions } from "../imageQuality/applyQualityTreatment";
import { useFeature } from "../../../features/FeatureFlagContext";
import {
  MAX_IMAGE_BYTES,
  MAX_RECORDING_SECONDS,
  MAX_REFERENCE_VIDEO_BYTES,
  formatBytes,
  formatDuration,
} from "../../../uploadLimits";
import { RecordingProgress } from "../RecordingProgress";
import { VoiceSampleRecorder } from "../VoiceSampleRecorder";
import { AvatarReadinessNotice } from "../AvatarReadinessNotice";

export function AvatarSetupStep({
  selectedAvatarId,
  onSelectAvatar,
  defaults,
  onDefaultsChange,
  onOutfitPreparingChange,
  nextButton,
}: {
  selectedAvatarId: string | null;
  onSelectAvatar: (id: string | null) => void;
  defaults: AssetDefaults;
  onDefaultsChange: (defaults: AssetDefaults) => void;
  /**
   * Avisa o pai de que existe traje EM PREPARO neste avatar.
   *
   * Quem monta o `Avançar` é o `CreateVideoPage`, e o estado do traje mora
   * aqui — então o dado sobe em vez de a decisão descer. O valor é derivado da
   * lista que veio do SERVIDOR (`pendentes[].status`), nunca recalculado no
   * cliente: é a mesma disciplina que o predicado único de prontidão fechou, em
   * que o botão conhecia três condições e a rota recusava por sete.
   */
  onOutfitPreparingChange?: (preparing: boolean) => void;
  // Rendered by the parent (CreateVideoPage owns goNext/canProceed) — this
  // step is the one place the wizard's "next" button moves inline instead
  // of sitting in the shared footer, so the element is built once by the
  // parent and just placed here, not reimplemented.
  nextButton?: ReactNode;
}) {
  const { t } = useTranslation();
  const PHOTO_SLOTS = [
    t("createVideo.avatarSetup.slotFront"),
    t("createVideo.avatarSetup.slotRight"),
    t("createVideo.avatarSetup.slotLeft"),
  ];
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<Avatar | null>(null);
  const [backgroundId, setBackgroundId] = useState(DEFAULT_BACKGROUND_ID);
  // Fundo removível está atrás de flag: ver services/featureFlags.ts.
  const removableBackground = useFeature("removable_background");
  const [intensity, setIntensity] = useState(1);
  const [quality, setQualityState] = useState<QualityOptions>(DEFAULT_QUALITY);
  const [targetLufsDraft, setTargetLufsDraft] = useState(-16);
  // Os três ajustes contínuos de síntese — migration 067. Rascunho local
  // enquanto o slider é arrastado; o commit vai no soltar, como o LUFS. Os
  // valores iniciais são os MEDIDOS no fornecedor em 25/08 e são substituídos
  // pelos do avatar assim que ele carrega (ver o `useEffect` do rascunho).
  const [voiceStabilityDraft, setVoiceStabilityDraft] = useState(0.5);
  const [voiceSimilarityDraft, setVoiceSimilarityDraft] = useState(0.75);
  const [voiceStyleDraft, setVoiceStyleDraft] = useState(0);
  // OS MESMOS QUATRO, para o avatar JÁ EXISTENTE — 25/08. Cópia separada, não
  // reuso das três acima: aquelas seguem `draftAvatar` (o assistente de
  // criação), estas seguem `selectedAvatar` (reabrir um avatar pronto), e os
  // dois podem — em tese — existir ao mesmo tempo (nada impede escolher um
  // avatar E clicar em "Configurar novo avatar" na mesma visita). Duas fontes
  // de estado independentes evitam que um arraste num painel invada o outro.
  const [existingVoiceStabilityDraft, setExistingVoiceStabilityDraft] = useState(0.5);
  const [existingVoiceSimilarityDraft, setExistingVoiceSimilarityDraft] = useState(0.75);
  const [existingVoiceStyleDraft, setExistingVoiceStyleDraft] = useState(0);
  // MESMO padrão dos três acima, para o bloco de Tratamento de Áudio (LUFS)
  // do avatar JÁ EXISTENTE — Item 2, fecha a lacuna de navegação (o bloco só
  // existia no assistente de criação).
  const [existingTargetLufsDraft, setExistingTargetLufsDraft] = useState(-16);
  // A CRIAÇÃO de traje por esta tela saiu em UI-PARIDADE-TRAJE (25/08) — a
  // LEITURA não: `lookInfo` continua vindo do servidor para saber se algum
  // traje já existente segue em preparo, e travar o Avançar enquanto isso
  // (`onOutfitPreparingChange` abaixo). Vídeos antigos e o que a listagem do
  // fornecedor já criou continuam precisando ser lidos.
  const [lookInfo, setLookInfo] = useState<AvatarLooksResponse | null>(null);

  const camera = useCamera();
  const recorder = useMediaRecorderCapture();
  // Derivado da lista, e não guardado num estado próprio: dois estados para a
  // mesma verdade divergem no primeiro `refreshAvatars()`, e o que divergiria
  // aqui é a voz que a tela acha que o avatar tem.
  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId) ?? null;

  /**
   * A REGRA GERAL — sem exceção — de quando "Fotos do rosto" e "Vídeo de
   * referência" aparecem: `provider_status !== "ready"`, para QUALQUER
   * avatar, novo ou existente. Antes desta rodada a visibilidade dependia de
   * `draftAvatar` (só existia durante a criação) — e um avatar que "concluía
   * configuração" sem enviar o vídeo ficava preso para sempre, porque a
   * seção some junto com `creating`/`draftAvatar`, não junto com o treino
   * real. Aconteceu 2 vezes seguidas (avatares "TESTE ZERO 26/08" e "V2").
   *
   * `avatarForTraining` é o avatar em foco nesta função — o rascunho em
   * criação, OU o avatar selecionado quando ele ainda não treinou. Os dois
   * nunca coexistem (criar um novo desmarca a seleção antes de avançar), e
   * quando nenhum dos dois se aplica o valor é `null`.
   */
  const avatarForTraining =
    draftAvatar ?? (selectedAvatar && selectedAvatar.provider_status !== "ready" ? selectedAvatar : null);
  const needsTrainingCapture = avatarForTraining !== null;

  /**
   * Atualização ÚNICA para `avatarForTraining`, que pode vir de duas fontes
   * de estado diferentes (`draftAvatar` durante a criação, ou uma linha de
   * `avatars` quando é um avatar já existente ainda sem treino) — sem isto,
   * cada handler precisaria saber de qual das duas ele está tratando.
   */
  function updateAvatarForTraining(updated: Avatar) {
    if (draftAvatar) {
      setDraftAvatar(updated);
    } else {
      setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
  }

  // Câmera liga sozinha ao entrar em modo de captura — para QUALQUER origem
  // (`avatarForTraining`), não só a criação. Antes disso só
  // `handleCreateAvatar` chamava `camera.start()`, e um avatar existente sem
  // treino não tinha como a câmera nunca ligar. Chave em `.id` (não no
  // objeto inteiro, que muda de referência a cada upload) para não reiniciar
  // a câmera a cada foto enviada — e o valor vira `undefined` quando o
  // treino termina e a seção desaparece, o que dispara a limpeza (para a
  // câmera) pela troca de dependência.
  useEffect(() => {
    if (avatarForTraining) camera.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarForTraining?.id]);

  const referenceFileInput = useRef<HTMLInputElement | null>(null);
  const photoFileInput = useRef<HTMLInputElement | null>(null);
  // Compartilhados entre o ramo "já treinado" (avatar existente) e o de
  // captura (`avatarForTraining`) — os dois nunca montam ao mesmo tempo.
  const scenarioFileInput = useRef<HTMLInputElement | null>(null);
  const outfitFileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    refreshAvatars();
  }, []);

  /**
   * O TRAJE EM PREPARO TRAVA O AVANÇAR — e `failed` não trava.
   *
   * Por que travar, se o aviso de prontidão do avatar deliberadamente NÃO trava:
   * lá a pendência é do avatar e quem explora pode legitimamente querer ver as
   * telas seguintes. Aqui o traje é transitório e já foi COBRADO. Passar
   * adiante enquanto ele está sendo preparado leva ao passo Cena com o seletor
   * ainda sem ele — e o caminho natural dali é gerar o vídeo sem o traje. São
   * dois prejuízos no mesmo clique: US$ 1,00 de traje que não chegou ao vídeo e
   * uma geração que vai precisar ser refeita.
   *
   * `failed` fica de fora de propósito: um traje que falhou não está vindo, e
   * travar por ele prenderia a pessoa no passo 1 sem saída nenhuma.
   */
  // Derivado num lugar só, e não espalhado pelo JSX: foi ali que
  // `lookCost.usd` derrubou o passo 1 no clique do card, num payload que
  // chega da rede e às vezes não traz o campo (avatar que ainda não pode
  // receber traje).
  const lookPendentes = lookInfo?.pendentes ?? [];
  const outfitPreparing = lookPendentes.some((p) => p.status === "processing");
  useEffect(() => {
    onOutfitPreparingChange?.(outfitPreparing);
  }, [outfitPreparing, onOutfitPreparingChange]);

  useEffect(() => {
    const option = BACKGROUND_OPTIONS.find((o) => o.id === backgroundId);
    camera.setBackground({ backgroundColor: option?.color ?? null, intensity });
  }, [backgroundId, intensity]);

  useEffect(() => {
    camera.setQuality(quality);
  }, [quality]);

  // Resyncs only when a different avatar becomes o alvo de captura (não a
  // cada `updateAvatarForTraining`), so it doesn't clobber an in-progress
  // LUFS slider drag. Segue `avatarForTraining` (não só `draftAvatar`) desde
  // que a mesma seção passou a atender avatar existente sem treino também.
  useEffect(() => {
    if (avatarForTraining) setTargetLufsDraft(Number(avatarForTraining.audio_treatment_target_lufs));
    // Os três de síntese seguem a MESMA regra e pelo mesmo motivo: `numeric`
    // chega como string do servidor, e ressincronizar a cada atualização
    // atropelaria um arraste em curso.
    if (avatarForTraining) {
      setVoiceStabilityDraft(Number(avatarForTraining.voice_stability));
      setVoiceSimilarityDraft(Number(avatarForTraining.voice_similarity_boost));
      setVoiceStyleDraft(Number(avatarForTraining.voice_style));
    }
  }, [avatarForTraining?.id]);

  // MESMA regra, para o painel do avatar JÁ EXISTENTE — 25/08. Resincroniza
  // só quando a SELEÇÃO muda (trocar de avatar na grade), não a cada
  // `setAvatars` disparado por outra ação da tela — senão um arraste em
  // andamento aqui seria atropelado por, por exemplo, uma foto sendo enviada
  // em paralelo.
  useEffect(() => {
    if (selectedAvatar) {
      setExistingVoiceStabilityDraft(Number(selectedAvatar.voice_stability));
      setExistingVoiceSimilarityDraft(Number(selectedAvatar.voice_similarity_boost));
      setExistingVoiceStyleDraft(Number(selectedAvatar.voice_style));
      // Item 2 — mesma regra: resincroniza só na troca de avatar selecionado.
      setExistingTargetLufsDraft(Number(selectedAvatar.audio_treatment_target_lufs));
    }
  }, [selectedAvatar?.id]);

  /**
   * CENÁRIO/TRAJE PADRÃO — relê o que está salvo no avatar ao trocar a
   * seleção. Fase A, item (a) da Seção 6 (25/08): o PUT já persistia
   * `scenario`/`scenario_prompt`/`outfit`/`outfit_prompt` desde a rodada
   * anterior, e o servidor já caía neles em `POST /videos` quando o vídeo
   * não mandava valor próprio — só faltava a TELA reler o padrão salvo ao
   * reabrir. Sem isto, o campo aparecia vazio até alguém editar de novo,
   * contradizendo o que o banco já tinha.
   *
   * MESMA regra dos ajustes de voz acima: resincroniza só na troca de
   * `selectedAvatar.id`, nunca a cada `setAvatars` disparado por outra
   * ação da tela. SOBRESCREVE sempre (não é `defaults.x || avatar.x`): ao
   * trocar de avatar dentro da mesma visita, o padrão do avatar NOVO tem
   * de vencer o que sobrou do anterior — sem isso, trocar de avatar
   * manteria na tela um cenário/traje que não é mais o daquele avatar.
   * `scenarioName` volta a `""` na troca: não há nome persistido (só a
   * URL), e manter o nome do avatar anterior rotularia a imagem errada.
   */
  useEffect(() => {
    if (!selectedAvatar) return;
    onDefaultsChange({
      ...defaults,
      scenario: selectedAvatar.scenario || "",
      scenarioName: "",
      scenarioPrompt: selectedAvatar.scenario_prompt || "",
      outfit: selectedAvatar.outfit || "",
      outfitPrompt: selectedAvatar.outfit_prompt || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAvatar?.id]);

  // O custo por traje e os trajes em preparo, do avatar selecionado. Recarrega
  // ao trocar de avatar: sem isto o bloco mostraria o andamento de outro.
  useEffect(() => {
    if (!selectedAvatarId) {
      setLookInfo(null);
      return;
    }
    let cancelado = false;
    api
      .get<AvatarLooksResponse>(`/avatars/${selectedAvatarId}/looks`)
      .then((r) => {
        if (!cancelado) setLookInfo(r);
      })
      .catch(() => {
        // Sem esta leitura o bloco de traje some, e o resto do passo 1 — avatar,
        // voz, avançar — continua utilizável. Travar tudo pelo controle menos
        // importante seria o inverso da prioridade.
        if (!cancelado) setLookInfo(null);
      });
    return () => {
      cancelado = true;
    };
  }, [selectedAvatarId]);

  function refreshAvatars() {
    api.get<Avatar[]>("/avatars").then(setAvatars);
  }

  async function handleDeleteAvatar(avatar: Avatar) {
    if (!window.confirm(t("knowledge.confirmDelete", { name: avatar.name }))) return;
    await api.delete(`/avatars/${avatar.id}`);
    if (selectedAvatarId === avatar.id) onSelectAvatar(null);
    refreshAvatars();
  }

  // Erro visível de qualquer ação que fale com o servidor. Sem isso, uma
  // falha de treino de avatar ou de clonagem de voz virava promise rejeitada
  // sem dono: o botão voltava ao normal e a tela não dizia nada.
  const [actionError, setActionError] = useState<string | null>(null);

  async function guard(action: () => Promise<void>): Promise<void> {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  async function handleCreateAvatar() {
    if (!name) return;
    await guard(async () => {
      // A câmera liga sozinha pelo `useEffect` de `avatarForTraining` — não
      // é mais chamada aqui, para valer da MESMA lógica que liga a câmera
      // quando quem precisa de captura é um avatar já existente.
      const avatar = await api.post<Avatar>("/avatars", { name });
      setDraftAvatar(avatar);
    });
  }

  async function handleCapturePhoto() {
    if (!avatarForTraining) return;
    const blob = await camera.capturePhoto();
    if (!blob) return;
    await guard(async () => {
      const updated = await api.upload<Avatar>(`/avatars/${avatarForTraining.id}/photos`, blob, "photo.jpg");
      updateAvatarForTraining(updated);
    });
  }

  // Mesmo tratamento que a câmera já aplica por frame (useCamera.ts,
  // applyQualityTreatment sobre o canvas de saída) — aqui aplicado uma vez,
  // sobre a imagem enviada por arquivo. Sem isto, o toggle Automático/Manual
  // e os sliders de Qualidade da imagem não tinham efeito nenhum neste
  // caminho: a captura por câmera lia o canvas já tratado, e o upload de
  // arquivo ia direto para `api.upload` sem passar por canvas nenhum.
  async function applyQualityToFile(file: File, options: QualityOptions): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    applyQualityTreatment(ctx, canvas.width, canvas.height, options);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.9);
    });
  }

  // Enviar foto de arquivo, em vez de capturar pela câmera.
  //
  // Sem este caminho o passo inteiro trava numa máquina sem câmera: concluir
  // exige 3 fotos, o botão "Capturar" depende de `camera.ready`, e não havia
  // alternativa nenhuma — enquanto o vídeo de referência logo abaixo sempre
  // teve o seu "ou enviar arquivo". A assimetria não era intencional.
  //
  // Aceita várias de uma vez e envia em sequência, porque o backend ANEXA ao
  // final de `photo_urls` (não grava por índice): mandar em paralelo deixaria
  // a ordem à mercê de qual requisição chega primeiro, e a ordem é o que
  // define em qual posição cada foto aparece.
  async function handlePhotoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !avatarForTraining) return;
    const remaining = PHOTO_SLOTS.length - avatarForTraining.photo_urls.length;
    const grande = files.slice(0, remaining).find((f) => f.size > MAX_IMAGE_BYTES);
    if (grande && rejectImageIfTooLarge(grande.size)) {
      e.target.value = "";
      return;
    }
    await guard(async () => {
      let latest = avatarForTraining;
      for (const file of files.slice(0, remaining)) {
        const treated = await applyQualityToFile(file, quality);
        latest = await api.upload<Avatar>(`/avatars/${latest.id}/photos`, treated, file.name);
      }
      updateAvatarForTraining(latest);
    });
    // Permite reenviar o mesmo arquivo depois de um erro: sem isto, escolher
    // o mesmo nome não dispara `change` de novo.
    e.target.value = "";
  }

  function handleStartRecording() {
    const stream = camera.getRecordingStream();
    if (stream) recorder.start(stream);
  }

  /**
   * Recusa antes de enviar. Não substitui a checagem do servidor — que
   * continua sendo a autoridade — mas evita subir dezenas de megabytes para
   * receber um 413 no fim, que numa conexão ruim é a diferença entre um aviso
   * imediato e vários minutos perdidos.
   */
  function rejectIfTooLarge(size: number): boolean {
    if (size <= MAX_REFERENCE_VIDEO_BYTES) return false;
    setActionError(
      t("createVideo.avatarSetup.fileTooLarge", {
        size: formatBytes(size),
        max: formatBytes(MAX_REFERENCE_VIDEO_BYTES),
      }),
    );
    return true;
  }

  /** Mesma cortesia do vídeo, com o teto e a orientação de IMAGEM. */
  function rejectImageIfTooLarge(size: number): boolean {
    if (size <= MAX_IMAGE_BYTES) return false;
    setActionError(
      t("createVideo.avatarSetup.imageTooLarge", {
        size: formatBytes(size),
        max: formatBytes(MAX_IMAGE_BYTES),
      }),
    );
    return true;
  }

  /**
   * Recusa antes de enviar, pela DURAÇÃO — mesma cortesia de
   * `rejectIfTooLarge`, e não substitui a checagem do servidor (que mede o
   * arquivo de verdade com `ffprobe`; ver `POST /avatars/:id/reference-video`).
   *
   * Só se aplica à gravação pela CÂMERA: `recorder.elapsedSeconds` já é
   * medido pelo próprio gravador (que também para sozinho em
   * `MAX_RECORDING_SECONDS`), então isto é defesa em profundidade, não a
   * primeira linha. Um arquivo ENVIADO não tem duração conhecida no cliente
   * sem ler metadados de vídeo — o mesmo raciocínio já registrado em
   * `VoiceSampleRecorder.tsx` — então esse caminho segue sem checagem local,
   * e quem decide de verdade é sempre o servidor.
   */
  function rejectRecordingIfTooLong(seconds: number): boolean {
    if (seconds <= MAX_RECORDING_SECONDS) return false;
    setActionError(
      t("createVideo.avatarSetup.recordingTooLong", {
        duration: formatDuration(seconds),
        max: formatDuration(MAX_RECORDING_SECONDS),
      }),
    );
    return true;
  }

  async function handleUploadRecording() {
    if (!avatarForTraining || !recorder.recordedBlob) return;
    if (rejectIfTooLarge(recorder.recordedBlob.size)) return;
    if (rejectRecordingIfTooLong(recorder.elapsedSeconds)) return;
    // Este é o passo que dispara o treino de avatar na HeyGen/D-ID. A
    // clonagem de voz saiu daqui — ver a seção "Gravar voz"
    // (`VoiceSampleRecorder`) logo abaixo, que usa `/avatars/:id/voice-sample`.
    await guard(async () => {
      const updated = await api.upload<Avatar>(
        `/avatars/${avatarForTraining.id}/reference-video`,
        recorder.recordedBlob as Blob,
        "reference.webm",
      );
      updateAvatarForTraining(updated);
    });
  }

  async function handleReferenceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !avatarForTraining) return;
    if (rejectIfTooLarge(file.size)) {
      e.target.value = "";
      return;
    }
    await guard(async () => {
      const updated = await api.upload<Avatar>(
        `/avatars/${avatarForTraining.id}/reference-video`,
        file,
        file.name,
      );
      updateAvatarForTraining(updated);
    });
  }

  async function handleFinishSetup() {
    if (!avatarForTraining) return;
    // Persistência de Cenário/Traje padrão — Fase A, item 5 (25/08). Até
    // aqui `defaults.scenario/scenarioPrompt/outfit/outfitPrompt` viviam só
    // no estado do wizard de vídeo (CreateVideoPage.tsx) e nunca
    // sobreviviam entre visitas — o rótulo "padrão" prometia uma
    // persistência que não existia. Falha aqui NÃO trava a conclusão do
    // avatar (guard() já reporta o erro): o avatar treinado é o que
    // importa nesta tela, e o pior caso de um PUT que falha é o mesmo
    // estado de hoje (nada persiste).
    await guard(async () => {
      await api.put<Avatar>(`/avatars/${avatarForTraining.id}`, {
        scenario: defaults.scenario || null,
        scenario_prompt: defaults.scenarioPrompt || null,
        outfit: defaults.outfit || null,
        outfit_prompt: defaults.outfitPrompt || null,
      });
    });
    // Só reseta o assistente de CRIAÇÃO quando foi ele quem nos trouxe aqui.
    // Chegando por um avatar EXISTENTE ainda sem treino (a correção desta
    // rodada), não há "criação" para fechar — `creating` já era falso, e a
    // seção de captura já sabe sumir sozinha assim que `provider_status`
    // virar "ready" (é `avatarForTraining` que decide, não este clique).
    if (draftAvatar) {
      camera.stop();
      onSelectAvatar(draftAvatar.id);
      setCreating(false);
      setDraftAvatar(null);
      setName("");
    }
    refreshAvatars();
  }

  function updateQuality(patch: Partial<QualityOptions>) {
    setQualityState((q) => ({ ...q, ...patch }));
  }

  async function handleAudioTreatmentToggle(enabled: boolean) {
    if (!avatarForTraining) return;
    const updated = await api.put<Avatar>(`/avatars/${avatarForTraining.id}`, {
      audio_treatment_enabled: enabled,
    });
    updateAvatarForTraining(updated);
  }

  async function commitTargetLufs(value: number) {
    if (!avatarForTraining) return;
    const updated = await api.put<Avatar>(`/avatars/${avatarForTraining.id}`, {
      audio_treatment_target_lufs: value,
    });
    updateAvatarForTraining(updated);
  }

  /**
   * Os QUATRO ajustes de síntese do ElevenLabs — migration 067, 25/08.
   *
   * Mesmo caminho de `commitTargetLufs`: `PUT /avatars/:id` com um campo só, e
   * o avatar devolvido substitui o rascunho. O commit é no `onMouseUp`/
   * `onTouchEnd`, nunca no `onChange` — arrastar um slider dispara dezenas de
   * eventos, e um PUT por evento é o que já se evitou uma vez no LUFS.
   */
  async function commitVoiceTuning(patch: Partial<Avatar>) {
    if (!avatarForTraining) return;
    const updated = await api.put<Avatar>(`/avatars/${avatarForTraining.id}`, patch);
    updateAvatarForTraining(updated);
  }

  /**
   * O MESMO `commitVoiceTuning`, para o avatar JÁ EXISTENTE — 25/08.
   *
   * Mesmo `PUT /avatars/:id`, nenhuma rota nova. A diferença é só onde o
   * resultado pousa: `draftAvatar` é local ao assistente de criação e não
   * existe fora dele, então aqui o avatar atualizado entra na lista (`
   * setAvatars`) do mesmo jeito que `VoiceSampleRecorder` já faz em
   * `onCloned` — é dali que `selectedAvatar` é derivado (`avatars.find(...)`),
   * então atualizar a lista é o que faz o slider reflectir o valor salvo.
   */
  async function commitExistingVoiceTuning(patch: Partial<Avatar>) {
    if (!selectedAvatar) return;
    const updated = await api.put<Avatar>(`/avatars/${selectedAvatar.id}`, patch);
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  /**
   * O MESMO `handleAudioTreatmentToggle`/`commitTargetLufs`, para o avatar JÁ
   * EXISTENTE — Item 2. Mesmo padrão de `commitExistingVoiceTuning`: `PUT
   * /avatars/:id`, e o resultado atualiza a lista (`setAvatars`) em vez do
   * rascunho, porque é dali que `selectedAvatar` é derivado.
   */
  async function handleExistingAudioTreatmentToggle(enabled: boolean) {
    if (!selectedAvatar) return;
    const updated = await api.put<Avatar>(`/avatars/${selectedAvatar.id}`, {
      audio_treatment_enabled: enabled,
    });
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function commitExistingTargetLufs(value: number) {
    if (!selectedAvatar) return;
    const updated = await api.put<Avatar>(`/avatars/${selectedAvatar.id}`, {
      audio_treatment_target_lufs: value,
    });
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function handleAssetUpload(kind: "scenario" | "outfit", file: File) {
    const { url } = await api.upload<{ url: string }>("/uploads", file, file.name);
    // O nome vai junto porque é a única cópia dele que sobrevive: o
    // armazenamento renomeia para `<uuid>.<ext>` (medido em `uploads/`) e o
    // `<input type="file">` volta vazio a cada remontagem do passo.
    onDefaultsChange({
      ...defaults,
      [kind]: url,
      ...(kind === "scenario" ? { scenarioName: file.name } : {}),
    });
  }

  /**
   * REMOVER a imagem de Cenário/Traje — avatar EXISTENTE.
   *
   * Chama o servidor IMEDIATAMENTE (`scenario_clear`/`outfit_clear`, o sinal
   * que força NULL apesar do COALESCE — ver o comentário em avatars.ts), e
   * não só limpa o estado local: este bloco (Cenário/Traje de avatar já
   * criado) não tem NENHUM outro ponto de salvamento — diferente do ramo de
   * avatar novo, que persiste tudo em `handleFinishSetup`. Um "remover" que
   * só mexesse em `defaults` pareceria funcionar e não mudaria o banco.
   */
  async function commitExistingAssetClear(kind: "scenario" | "outfit") {
    if (!selectedAvatar) return;
    const updated = await api.put<Avatar>(
      `/avatars/${selectedAvatar.id}`,
      kind === "scenario" ? { scenario_clear: true } : { outfit_clear: true },
    );
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    onDefaultsChange({
      ...defaults,
      ...(kind === "scenario" ? { scenario: "", scenarioName: "" } : { outfit: "" }),
    });
  }

  /** REMOVER a imagem de Cenário/Traje — avatar NOVO (ainda em criação). */
  async function commitDraftAssetClear(kind: "scenario" | "outfit") {
    if (!avatarForTraining) return;
    const updated = await api.put<Avatar>(
      `/avatars/${avatarForTraining.id}`,
      kind === "scenario" ? { scenario_clear: true } : { outfit_clear: true },
    );
    updateAvatarForTraining(updated);
    onDefaultsChange({
      ...defaults,
      ...(kind === "scenario" ? { scenario: "", scenarioName: "" } : { outfit: "" }),
    });
  }

  // A LEITURA de looks (para o gate de `outfitPreparing` acima e para o bloco
  // "Traje deste vídeo"/"Traje padrão" nada usarem daqui) vem só do
  // `useEffect` que recarrega `lookInfo` ao trocar de avatar, mais abaixo —
  // não há mais uma função dedicada de refresh, porque a única chamadora
  // dela (`handleCreateLook`) saiu em UI-PARIDADE-TRAJE (25/08).

  // `needsTrainingCapture` faz a lista/detalhe do avatar (abaixo) dar lugar
  // à captura sempre que HÁ algo para capturar — não só durante a criação.
  // É a correção desta rodada: sem isto, selecionar um avatar já existente
  // mas ainda sem treino caía direto na visão "pronto", sem seção de vídeo
  // nenhuma — o bloqueio que já aconteceu 2 vezes.
  if (!creating && !needsTrainingCapture) {
    return (
      <div className="card">
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {t("createVideo.avatarSetup.scopeNote")}
        </p>
        <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setCreating(true)}>
          {t("createVideo.avatarSetup.newAvatarButton")}
        </button>

        <div className="card-title">{t("createVideo.avatarSetup.yourAvatars")}</div>
        {avatars.length === 0 ? (
          <p className="text-muted" style={{ marginBottom: 16 }}>
            {t("createVideo.avatarSetup.noAvatarsYet")}
          </p>
        ) : (
          <div className="grid grid-cols-3" style={{ marginBottom: 16 }}>
            {avatars.map((a) => {
              // OR, e não AND: faltar UM dos dois já impede gerar. Sem
              // `voice_id` a geração morre fechada em avatarProvider (a voz
              // clonada é o que dirige a animação); sem `provider_avatar_id`
              // não há avatar para o fornecedor animar. Com AND, um card
              // meio-pronto continuaria selecionável e o erro apareceria só
              // depois do débito.
              //
              // O MOTIVO não ganha texto novo: as duas `status-pill` abaixo já
              // escrevem "avatar pendente" e "voz pendente". O que faltava era
              // a trava — o card dizia que estava pendente e deixava clicar.
              const selecionavel = Boolean(a.voice_id) && Boolean(a.provider_avatar_id);
              return (
              <div
                key={a.id}
                role={selecionavel ? "button" : undefined}
                tabIndex={selecionavel ? 0 : undefined}
                aria-disabled={selecionavel ? undefined : true}
                className={`card${selectedAvatarId === a.id ? " selected" : ""}`}
                style={{
                  textAlign: "left",
                  cursor: selecionavel ? "pointer" : "not-allowed",
                  opacity: selecionavel ? undefined : 0.6,
                  borderColor: selectedAvatarId === a.id ? "var(--color-primary)" : undefined,
                  // 1px de borda verde sobre fundo branco desaparece em
                  // projetor — MEDIDO na Fase 0 do 5D (o card renderizava com
                  // 0,8px efetivos). Três reforços independentes, porque
                  // nenhum deles sozinho sobrevive a todo equipamento: borda
                  // grossa, halo, e uma faixa lateral que não depende de
                  // fidelidade de cor.
                  borderWidth: selectedAvatarId === a.id ? 3 : undefined,
                  boxShadow:
                    selectedAvatarId === a.id ? "0 0 0 4px color-mix(in srgb, var(--color-primary) 30%, transparent)" : undefined,
                  borderLeftWidth: selectedAvatarId === a.id ? 8 : undefined,
                }}
                // Os DOIS caminhos, senão o teclado continua selecionando o que
                // o mouse já não seleciona.
                onClick={selecionavel ? () => onSelectAvatar(a.id) : undefined}
                onKeyDown={
                  selecionavel
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") onSelectAvatar(a.id);
                      }
                    : undefined
                }
              >
                <strong>{a.name}</strong>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {t("createVideo.avatarSetup.photosVoiceStatus", {
                    count: a.photo_urls.length,
                    // Lia `a.reference_video_url` (o VÍDEO, para a HeyGen) —
                    // era o mesmo campo que a clonagem de voz também setava,
                    // de volta quando as duas coisas saíam da MESMA rota. A
                    // separação de rotas (26/08) quebrou essa coincidência: um
                    // avatar pode ter voz real e nenhum vídeo (como este),
                    // e o texto dizia "voz ainda não configurada" ao lado do
                    // selo "Voz clonada" — duas fontes de verdade divergentes
                    // para a MESMA pergunta. `voice_id` é o campo certo.
                    voiceStatus: a.voice_id
                      ? t("createVideo.avatarSetup.voiceReady")
                      : t("createVideo.avatarSetup.voiceNotReady"),
                  })}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span className={`status-pill status-${a.provider_avatar_id ? "avatar-trained" : "disconnected"}`}>
                    {a.provider_avatar_id
                      ? t("createVideo.avatarSetup.avatarTrained")
                      : t("createVideo.avatarSetup.avatarPending")}
                  </span>
                  <span className={`status-pill status-${a.voice_id ? "voice-cloned" : "disconnected"}`}>
                    {a.voice_id
                      ? t("createVideo.avatarSetup.voiceCloned")
                      : t("createVideo.avatarSetup.voicePending")}
                  </span>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAvatar(a);
                  }}
                >
                  {t("knowledge.delete")}
                </button>
              </div>
              );
            })}
          </div>
        )}

        {/* Captura de voz do avatar SELECIONADO.
            Fica atrás da seleção de propósito: aparece só depois de a pessoa
            escolher um avatar, e nunca ao lado de "Novo avatar" — aquele botão
            abre o caminho que treina um avatar novo (US$ 1,00 mais 1 crédito),
            e vizinhança visual entre os dois convidaria justamente à confusão
            que este bloco existe para evitar. Aqui nada é treinado e nenhum
            crédito é debitado: o único recurso consumido é o slot de voz. */}
        {selectedAvatar && (
          <VoiceSampleRecorder
            avatar={selectedAvatar}
            onCloned={(updated) =>
              setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            }
          />
        )}

        {/* AJUSTES DA VOZ — migration 067, 25/08. O MESMO painel que já existia
            só no assistente de criação (ver mais abaixo, `draftAvatar`), agora
            também aqui: antes desta rodada, reabrir um avatar já treinado não
            dava acesso nenhum a estes quatro controles — só existiam durante a
            criação, e um avatar já pronto não tinha onde ajustá-los depois.
            Mesmo `PUT /avatars/:id`, nenhuma rota nova, nenhuma migration nova.
            NÃO leva o bloco de Tratamento de Áudio (LUFS) junto — fora do
            escopo desta rodada por decisão explícita do operador. */}
        {selectedAvatar && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">{t("createVideo.avatarSetup.voiceTuning.title")}</div>
            <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
              {t("createVideo.avatarSetup.voiceTuning.help")}
            </p>

            <Field
              label={`${t("createVideo.avatarSetup.voiceTuning.stabilityLabel")} (${existingVoiceStabilityDraft.toFixed(2)})`}
              help={t("createVideo.avatarSetup.voiceTuning.stabilityHelp")}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={existingVoiceStabilityDraft}
                onChange={(e) => setExistingVoiceStabilityDraft(Number(e.target.value))}
                onMouseUp={() =>
                  commitExistingVoiceTuning({ voice_stability: String(existingVoiceStabilityDraft) })
                }
                onTouchEnd={() =>
                  commitExistingVoiceTuning({ voice_stability: String(existingVoiceStabilityDraft) })
                }
              />
            </Field>

            <Field
              label={`${t("createVideo.avatarSetup.voiceTuning.similarityLabel")} (${existingVoiceSimilarityDraft.toFixed(2)})`}
              help={t("createVideo.avatarSetup.voiceTuning.similarityHelp")}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={existingVoiceSimilarityDraft}
                onChange={(e) => setExistingVoiceSimilarityDraft(Number(e.target.value))}
                onMouseUp={() =>
                  commitExistingVoiceTuning({
                    voice_similarity_boost: String(existingVoiceSimilarityDraft),
                  })
                }
                onTouchEnd={() =>
                  commitExistingVoiceTuning({
                    voice_similarity_boost: String(existingVoiceSimilarityDraft),
                  })
                }
              />
            </Field>

            <Field
              label={`${t("createVideo.avatarSetup.voiceTuning.styleLabel")} (${existingVoiceStyleDraft.toFixed(2)})`}
              help={t("createVideo.avatarSetup.voiceTuning.styleHelp")}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={existingVoiceStyleDraft}
                onChange={(e) => setExistingVoiceStyleDraft(Number(e.target.value))}
                onMouseUp={() =>
                  commitExistingVoiceTuning({ voice_style: String(existingVoiceStyleDraft) })
                }
                onTouchEnd={() =>
                  commitExistingVoiceTuning({ voice_style: String(existingVoiceStyleDraft) })
                }
              />
            </Field>

            <Field help={t("createVideo.avatarSetup.voiceTuning.speakerBoostHelp")}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => commitExistingVoiceTuning({ voice_speaker_boost: true })}
                  style={{
                    borderColor: selectedAvatar.voice_speaker_boost ? "var(--color-primary)" : undefined,
                  }}
                >
                  {t("createVideo.avatarSetup.voiceTuning.speakerBoostOn")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => commitExistingVoiceTuning({ voice_speaker_boost: false })}
                  style={{
                    borderColor: !selectedAvatar.voice_speaker_boost ? "var(--color-primary)" : undefined,
                  }}
                >
                  {t("createVideo.avatarSetup.voiceTuning.speakerBoostOff")}
                </button>
              </div>
            </Field>
          </div>
        )}

        {/* TRATAMENTO DE ÁUDIO (LUFS) — mesmo bloco do assistente de criação,
            agora também no avatar JÁ EXISTENTE — Item 2, 25/08. Mesmo motivo
            do painel de Ajustes da voz logo acima: só existia durante a
            criação, e reabrir um avatar pronto não dava acesso a ele. Mesmo
            `PUT /avatars/:id`, nenhuma rota nova, nenhuma migration nova. Não
            redesenha o que o bloco faz — só fecha a lacuna de navegação. */}
        {selectedAvatar && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">{t("createVideo.avatarSetup.audioTreatment.title")}</div>
            <Field help={t("createVideo.avatarSetup.audioTreatment.help")}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleExistingAudioTreatmentToggle(true)}
                  style={{
                    borderColor: selectedAvatar.audio_treatment_enabled ? "var(--color-primary)" : undefined,
                  }}
                >
                  {t("createVideo.avatarSetup.audioTreatment.enabled")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleExistingAudioTreatmentToggle(false)}
                  style={{
                    borderColor: !selectedAvatar.audio_treatment_enabled ? "var(--color-primary)" : undefined,
                  }}
                >
                  {t("createVideo.avatarSetup.audioTreatment.disabled")}
                </button>
              </div>
            </Field>

            {selectedAvatar.audio_treatment_enabled && (
              <Field
                label={`${t("createVideo.avatarSetup.audioTreatment.targetLufsLabel")} (${existingTargetLufsDraft} LUFS)`}
                help={t("createVideo.avatarSetup.audioTreatment.targetLufsHelp")}
              >
                <input
                  type="range"
                  min={-24}
                  max={-6}
                  value={existingTargetLufsDraft}
                  onChange={(e) => setExistingTargetLufsDraft(Number(e.target.value))}
                  onMouseUp={() => commitExistingTargetLufs(existingTargetLufsDraft)}
                  onTouchEnd={() => commitExistingTargetLufs(existingTargetLufsDraft)}
                />
              </Field>
            )}
          </div>
        )}

        {/* CENÁRIO E TRAJE deste vídeo — BLOCO B5c.
            Antes desta rodada, `defaults.scenario`/`scenarioPrompt` só eram
            preenchíveis dentro de "criar avatar novo" — e `defaults.outfit`/
            `outfitPrompt` não eram preenchíveis em lugar NENHUM: o campo
            antigo tinha sido removido (ver o comentário perto de
            `scenarioTitle`, mais abaixo) e nunca recolocado quando B2/B5
            passaram a ligar os dois à fal de verdade. Um avatar existente,
            que é o caminho normal de gerar um vídeo, não tinha onde preencher
            nenhum dos dois.
            Reaproveita EXATAMENTE o layout de baixo (upload + campo de texto,
            `Field`, `handleAssetUpload`): nenhum componente novo, e os dois
            escrevem nos MESMOS campos de `defaults` que `corpoDaGeracao()`
            (GenerateStep.tsx) já lê — nada mudou do lado do corpo enviado.
            `handleAssetUpload("outfit", …)` já aceitava esse `kind`; só
            nunca tinha sido chamado com ele. */}
        {selectedAvatar && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="grid grid-cols-2">
              <div>
                <div className="card-title">{t("createVideo.avatarSetup.scenarioTitle")}</div>
                <Field
                  label={t("createVideo.avatarSetup.uploadImageLabel")}
                  help={t("createVideo.avatarSetup.scenarioHelp")}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => scenarioFileInput.current?.click()}
                    >
                      {t("createVideo.avatarSetup.chooseFile")}
                    </button>
                    {defaults.scenario && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => commitExistingAssetClear("scenario")}
                      >
                        {t("createVideo.avatarSetup.removeImage")}
                      </button>
                    )}
                  </div>
                  {/* Preso ao botão, dentro do MESMO Field — não mais uma
                      margem negativa calculada para caber sob um input
                      nativo de uma linha só. Com dois botões lado a lado, a
                      margem antiga podia sobrepor o texto de ajuda do Field
                      logo abaixo. */}
                  {defaults.scenario && (
                    <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                      {defaults.scenarioName
                        ? t("createVideo.avatarSetup.imageSavedNamed", { name: defaults.scenarioName })
                        : t("createVideo.avatarSetup.imageSaved")}
                    </p>
                  )}
                  <input
                    ref={scenarioFileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => e.target.files?.[0] && handleAssetUpload("scenario", e.target.files[0])}
                  />
                </Field>
                <Field
                  label={t("createVideo.avatarSetup.generateViaAiLabel")}
                  help={t("createVideo.avatarSetup.scenarioPromptHelp")}
                  helpPrompt={t("createVideo.avatarSetup.scenarioHelpPrompt")}
                >
                  <input
                    placeholder={t("createVideo.avatarSetup.scenarioPlaceholder")}
                    value={defaults.scenarioPrompt}
                    onChange={(e) => onDefaultsChange({ ...defaults, scenarioPrompt: e.target.value })}
                  />
                </Field>
              </div>
              <div>
                <div className="card-title">{t("createVideo.avatarSetup.outfitTitle")}</div>
                <Field
                  label={t("createVideo.avatarSetup.uploadImageLabel")}
                  help={t("createVideo.avatarSetup.outfitHelp")}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => outfitFileInput.current?.click()}
                    >
                      {t("createVideo.avatarSetup.chooseFile")}
                    </button>
                    {defaults.outfit && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => commitExistingAssetClear("outfit")}
                      >
                        {t("createVideo.avatarSetup.removeImage")}
                      </button>
                    )}
                  </div>
                  {/* Sem `outfitName`: `AssetDefaults` não tem esse campo (só
                      `scenarioName`), e adicioná-lo por simetria cosmética sem
                      consumidor no backend não foi autorizado nesta rodada.
                      "Imagem salva." genérico é o estado honesto. Preso ao
                      botão, dentro do MESMO Field — mesmo ajuste do Cenário. */}
                  {defaults.outfit && (
                    <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                      {t("createVideo.avatarSetup.imageSaved")}
                    </p>
                  )}
                  <input
                    ref={outfitFileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => e.target.files?.[0] && handleAssetUpload("outfit", e.target.files[0])}
                  />
                </Field>
                <Field
                  label={t("createVideo.avatarSetup.generateViaAiLabel")}
                  help={t("createVideo.avatarSetup.outfitPromptHelp")}
                  helpPrompt={t("createVideo.avatarSetup.outfitHelpPrompt")}
                >
                  <input
                    placeholder={t("createVideo.avatarSetup.outfitPlaceholder")}
                    value={defaults.outfitPrompt}
                    onChange={(e) => onDefaultsChange({ ...defaults, outfitPrompt: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ORDEM DO PASSO 1, e ela é o ponto deste bloco.
            O `Avançar` ficava LOGO ABAIXO de "Novo avatar", antes da grade —
            então o caminho natural (ler, avançar) nunca passava pelos
            avatares nem pelo bloco de voz, que ficavam abaixo da dobra. Agora
            o botão fecha a coluna: texto → novo avatar → grade → voz →
            avançar. Quem lê de cima para baixo vê o bloco de voz por
            construção, sem precisar rolar procurando. */}
        {selectedAvatar && <AvatarReadinessNotice avatarId={selectedAvatar.id} />}

        {nextButton && <div style={{ marginTop: 20 }}>{nextButton}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.avatarSetup.newAvatarTitle")}</div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        {t("createVideo.avatarSetup.scopeNote")}
      </p>

      {/* Formulário de NOME só quando genuinamente começando um avatar do
          zero. Quando o motivo de estar aqui é `avatarForTraining` vindo de
          um avatar EXISTENTE sem treino, não há nome a pedir — o avatar já
          tem um, e a regra geral (item 1 desta correção) manda direto para
          a captura. */}
      {creating && !draftAvatar ? (
        <div style={{ maxWidth: 320 }}>
          <Field
            label={t("createVideo.avatarSetup.nameLabel")}
            help={t("createVideo.avatarSetup.nameHelp")}
            helpPrompt={t("createVideo.avatarSetup.nameHelpPrompt")}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("createVideo.avatarSetup.namePlaceholder")}
            />
          </Field>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleCreateAvatar} disabled={!name}>
            {t("createVideo.avatarSetup.startCapture")}
          </button>
          {actionError && <div className="alert alert-error">{actionError}</div>}
        </div>
      ) : avatarForTraining ? (
        <>
          <div className="grid grid-cols-2" style={{ marginBottom: 20 }}>
            <div>
              <div className="card-title">{t("createVideo.avatarSetup.cameraPreview")}</div>
              {camera.error && <p style={{ color: "var(--color-tertiary)" }}>{camera.error}</p>}
              {/* Hidden source the segmenter/canvas read frames from — the
                  canvas below is what the user actually sees and what gets
                  captured/recorded, since it already reflects the current
                  virtual background + intensity. */}
              <video ref={camera.videoRef} muted playsInline style={{ display: "none" }} />
              <canvas
                ref={camera.canvasRef}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-card)",
                  border: "1px solid var(--color-border)",
                  background: "#000",
                }}
              />

              {/* Contrato de feature flag: quando desligada, o recurso NÃO
                  some e NÃO vira um botão que dá erro — aparece inerte, com
                  o motivo que o admin cadastrou. Some sem explicação parece
                  defeito; botão que falha parece descaso. */}
              {!removableBackground.enabled ? (
                <div className="feature-unavailable">
                  <div className="feature-unavailable-title">
                    {t("createVideo.avatarSetup.background.label")} — {t("featureFlags.unavailable")}
                  </div>
                  {removableBackground.reason}
                </div>
              ) : (
              <Field
                label={t("createVideo.avatarSetup.background.label")}
                help={
                  camera.segmentationError
                    ? t("createVideo.avatarSetup.background.unavailable")
                    : t("createVideo.avatarSetup.background.help")
                }
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {BACKGROUND_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="btn btn-outline"
                      disabled={option.color !== null && !!camera.segmentationError}
                      onClick={() => setBackgroundId(option.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        borderColor: backgroundId === option.id ? "var(--color-primary)" : undefined,
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: "1px solid var(--color-border)",
                          background: option.color ? `rgb(${option.color.join(",")})` : "transparent",
                        }}
                      />
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              </Field>
              )}

              {removableBackground.enabled && backgroundId !== "none" && (
                <Field
                  label={`${t("createVideo.avatarSetup.background.intensityLabel")} (${Math.round(intensity * 100)}%)`}
                  help={t("createVideo.avatarSetup.background.intensityHelp")}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(intensity * 100)}
                    onChange={(e) => setIntensity(Number(e.target.value) / 100)}
                  />
                </Field>
              )}

              <Field
                label={t("createVideo.avatarSetup.imageQuality.label")}
                help={t("createVideo.avatarSetup.imageQuality.help")}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => updateQuality({ mode: "auto" })}
                    style={{ borderColor: quality.mode === "auto" ? "var(--color-primary)" : undefined }}
                  >
                    {t("createVideo.avatarSetup.imageQuality.auto")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => updateQuality({ mode: "manual" })}
                    style={{ borderColor: quality.mode === "manual" ? "var(--color-primary)" : undefined }}
                  >
                    {t("createVideo.avatarSetup.imageQuality.manual")}
                  </button>
                </div>
              </Field>

              {quality.mode === "manual" && (
                <>
                  <Field
                    label={`${t("createVideo.avatarSetup.imageQuality.brightness")} (${quality.brightness})`}
                  >
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={quality.brightness}
                      onChange={(e) => updateQuality({ brightness: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={`${t("createVideo.avatarSetup.imageQuality.contrast")} (${quality.contrast})`}>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={quality.contrast}
                      onChange={(e) => updateQuality({ contrast: Number(e.target.value) })}
                    />
                  </Field>
                  <Field
                    label={`${t("createVideo.avatarSetup.imageQuality.sharpness")} (${quality.sharpness}%)`}
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={quality.sharpness}
                      onChange={(e) => updateQuality({ sharpness: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={`${t("createVideo.avatarSetup.imageQuality.denoise")} (${quality.denoise}%)`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={quality.denoise}
                      onChange={(e) => updateQuality({ denoise: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
            </div>
            <div>
              {/* O erro fica NESTA coluna, e não na da câmera, porque é aqui
                  que ficam as ações que falham — enviar foto e enviar o vídeo
                  de referência. "Créditos esgotados" aparecia do outro lado da
                  tela, longe do botão que o produziu. */}
              {actionError && (
                <div className="alert alert-error" style={{ marginBottom: 12 }}>
                  {actionError}
                </div>
              )}

              <div className="card-title">
                {t("createVideo.avatarSetup.facePhotos", { count: avatarForTraining.photo_urls.length })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PHOTO_SLOTS.map((slot, i) => (
                  <div key={slot} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 90, fontSize: 13 }} className="text-muted">
                      {slot}
                    </span>
                    {avatarForTraining.photo_urls[i] ? (
                      <img
                        src={avatarForTraining.photo_urls[i]}
                        alt={slot}
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                      />
                    ) : (
                      <button className="btn btn-outline" onClick={handleCapturePhoto} disabled={!camera.ready}>
                        {t("createVideo.avatarSetup.capture")}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Fora dos slots, e não dentro de cada um, porque o backend
                  anexa ao fim da lista: um botão por slot prometeria escolher
                  a posição, e a foto cairia na primeira vaga livre de
                  qualquer jeito. */}
              {avatarForTraining.photo_urls.length < PHOTO_SLOTS.length && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost" onClick={() => photoFileInput.current?.click()}>
                    {t("createVideo.avatarSetup.orUploadPhoto")}
                  </button>
                  <input
                    ref={photoFileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={handlePhotoFileChange}
                  />
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                    {t("createVideo.avatarSetup.uploadPhotoHint")}
                  </p>
                </div>
              )}

              <div className="card-title" style={{ marginTop: 20 }}>
                {t("createVideo.avatarSetup.referenceVideoTitle")}
              </div>
              {/* O que o fornecedor espera, ANTES de gravar. É texto, não
                  validação: nada aqui bloqueia o envio. Dizer depois — na
                  recusa por tamanho, ou pior, num avatar de qualidade ruim —
                  custa uma regravação inteira. */}
              {!avatarForTraining.reference_video_url && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 8 }}>
                  {t("createVideo.avatarSetup.referenceGuidance")}
                </p>
              )}

              {avatarForTraining.reference_video_url ? (
                <p>
                  <span className="status-pill status-connected">
                    {t("createVideo.avatarSetup.referenceSaved")}
                  </span>
                </p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!recorder.isRecording ? (
                    <button className="btn btn-outline" onClick={handleStartRecording} disabled={!camera.ready}>
                      {t("createVideo.avatarSetup.recordWithCamera")}
                    </button>
                  ) : (
                    <button className="btn btn-secondary" onClick={recorder.stop}>
                      {t("createVideo.avatarSetup.stopRecording")}
                    </button>
                  )}
                  {recorder.recordedBlob && (
                    <button className="btn btn-primary" onClick={handleUploadRecording}>
                      {t("createVideo.avatarSetup.saveRecording")}
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => referenceFileInput.current?.click()}>
                    {t("createVideo.avatarSetup.orUploadFile")}
                  </button>
                  <input
                    ref={referenceFileInput}
                    type="file"
                    accept="video/*,audio/*"
                    hidden
                    onChange={handleReferenceFileChange}
                  />
                </div>
              )}

              {/* O PORTÃO DE ASSISTIR — feedback IMEDIATO de que a gravação
                  funcionou, ANTES do upload/confirmação do servidor. Mesmo
                  papel do `<audio controls>` que a voz já tinha
                  (`VoiceSampleRecorder`, `blobUrl`/`listenFirst`): até aqui só
                  havia duração e tamanho em texto — números, não a gravação
                  em si. Vem antes de "Salvar gravação" de propósito, mesmo
                  raciocínio da voz: confirmar ANTES de gastar o treino
                  (US$ 1,00 + 1 crédito). */}
              {!recorder.isRecording && recorder.previewUrl && !avatarForTraining.reference_video_url && (
                <div style={{ marginTop: 10 }}>
                  <p className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {t("createVideo.avatarSetup.watchFirst")}
                  </p>
                  <video controls src={recorder.previewUrl} style={{ maxWidth: "100%", maxHeight: 240 }} />
                </div>
              )}

              {/* Progresso em direção à META, não ao teto. O contador anterior
                  dizia "0:15 de 2:00 — para sozinho em 105s": vigiava o limite
                  superior e deixava a meta inferior invisível, que foi como um
                  clone acabou treinado com 15,37 s de amostra. */}
              {recorder.isRecording && <RecordingProgress elapsedSeconds={recorder.elapsedSeconds} />}

              {/* Depois de parar, o veredito PERMANECE: é o último momento em
                  que regravar ainda é barato. Some quando a gravação já foi
                  enviada. */}
              {!recorder.isRecording && recorder.recordedBlob && !avatarForTraining.reference_video_url && (
                <RecordingProgress elapsedSeconds={recorder.elapsedSeconds} />
              )}

              {/* Tamanho SEMPRE que houver gravação, não só quando estoura:
                  é o número que explica um envio lento e o único jeito de
                  comparar com o teto antes de tentar. */}
              {recorder.recordedBlob && !avatarForTraining.reference_video_url && (
                <p
                  className={recorder.isOverSizeLimit ? "alert-error" : "text-muted"}
                  style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
                >
                  {recorder.isOverSizeLimit
                    ? t("createVideo.avatarSetup.recordingTooLarge", {
                        size: formatBytes(recorder.recordedBlob.size),
                        max: formatBytes(MAX_REFERENCE_VIDEO_BYTES),
                      })
                    : t("createVideo.avatarSetup.recordingSize", {
                        size: formatBytes(recorder.recordedBlob.size),
                        max: formatBytes(MAX_REFERENCE_VIDEO_BYTES),
                      })}
                </p>
              )}

              {/* Seção separada da de vídeo acima, de propósito: vídeo vai
                  para a HeyGen (treino, US$ 1,00 + 1 crédito); voz vai para
                  o ElevenLabs por `/avatars/:id/voice-sample`, dedicada,
                  leve e com teto próprio — nunca mais o mesmo arquivo de
                  vídeo forçado para os dois fornecedores. */}
              <div style={{ marginTop: 20 }}>
                <VoiceSampleRecorder avatar={avatarForTraining} onCloned={updateAvatarForTraining} />
              </div>

              <div className="card-title" style={{ marginTop: 20 }}>
                {t("createVideo.avatarSetup.audioTreatment.title")}
              </div>
              <Field help={t("createVideo.avatarSetup.audioTreatment.help")}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleAudioTreatmentToggle(true)}
                    style={{
                      borderColor: avatarForTraining.audio_treatment_enabled ? "var(--color-primary)" : undefined,
                    }}
                  >
                    {t("createVideo.avatarSetup.audioTreatment.enabled")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleAudioTreatmentToggle(false)}
                    style={{
                      borderColor: !avatarForTraining.audio_treatment_enabled ? "var(--color-primary)" : undefined,
                    }}
                  >
                    {t("createVideo.avatarSetup.audioTreatment.disabled")}
                  </button>
                </div>
              </Field>

              {avatarForTraining.audio_treatment_enabled && (
                <Field
                  label={`${t("createVideo.avatarSetup.audioTreatment.targetLufsLabel")} (${targetLufsDraft} LUFS)`}
                  help={t("createVideo.avatarSetup.audioTreatment.targetLufsHelp")}
                >
                  <input
                    type="range"
                    min={-24}
                    max={-6}
                    value={targetLufsDraft}
                    onChange={(e) => setTargetLufsDraft(Number(e.target.value))}
                    onMouseUp={() => commitTargetLufs(targetLufsDraft)}
                    onTouchEnd={() => commitTargetLufs(targetLufsDraft)}
                  />
                </Field>
              )}

              {/* OS QUATRO AJUSTES DE SÍNTESE — migration 067, 25/08.
                  Mesmo padrão do tratamento de áudio logo acima: três sliders
                  com commit no soltar e um par de botões para o booleano.
                  Eles valem para TODO vídeo deste avatar, nos três níveis — a
                  voz é do avatar, não do vídeo. */}
              <div className="card-title" style={{ marginTop: 20 }}>
                {t("createVideo.avatarSetup.voiceTuning.title")}
              </div>
              <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>
                {t("createVideo.avatarSetup.voiceTuning.help")}
              </p>

              <Field
                label={`${t("createVideo.avatarSetup.voiceTuning.stabilityLabel")} (${voiceStabilityDraft.toFixed(2)})`}
                help={t("createVideo.avatarSetup.voiceTuning.stabilityHelp")}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voiceStabilityDraft}
                  onChange={(e) => setVoiceStabilityDraft(Number(e.target.value))}
                  onMouseUp={() => commitVoiceTuning({ voice_stability: String(voiceStabilityDraft) })}
                  onTouchEnd={() => commitVoiceTuning({ voice_stability: String(voiceStabilityDraft) })}
                />
              </Field>

              <Field
                label={`${t("createVideo.avatarSetup.voiceTuning.similarityLabel")} (${voiceSimilarityDraft.toFixed(2)})`}
                help={t("createVideo.avatarSetup.voiceTuning.similarityHelp")}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voiceSimilarityDraft}
                  onChange={(e) => setVoiceSimilarityDraft(Number(e.target.value))}
                  onMouseUp={() =>
                    commitVoiceTuning({ voice_similarity_boost: String(voiceSimilarityDraft) })
                  }
                  onTouchEnd={() =>
                    commitVoiceTuning({ voice_similarity_boost: String(voiceSimilarityDraft) })
                  }
                />
              </Field>

              <Field
                label={`${t("createVideo.avatarSetup.voiceTuning.styleLabel")} (${voiceStyleDraft.toFixed(2)})`}
                help={t("createVideo.avatarSetup.voiceTuning.styleHelp")}
              >
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voiceStyleDraft}
                  onChange={(e) => setVoiceStyleDraft(Number(e.target.value))}
                  onMouseUp={() => commitVoiceTuning({ voice_style: String(voiceStyleDraft) })}
                  onTouchEnd={() => commitVoiceTuning({ voice_style: String(voiceStyleDraft) })}
                />
              </Field>

              <Field help={t("createVideo.avatarSetup.voiceTuning.speakerBoostHelp")}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => commitVoiceTuning({ voice_speaker_boost: true })}
                    style={{
                      borderColor: avatarForTraining.voice_speaker_boost ? "var(--color-primary)" : undefined,
                    }}
                  >
                    {t("createVideo.avatarSetup.voiceTuning.speakerBoostOn")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => commitVoiceTuning({ voice_speaker_boost: false })}
                    style={{
                      borderColor: !avatarForTraining.voice_speaker_boost ? "var(--color-primary)" : undefined,
                    }}
                  >
                    {t("createVideo.avatarSetup.voiceTuning.speakerBoostOff")}
                  </button>
                </div>
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2" style={{ marginBottom: 20 }}>
            <div>
              <div className="card-title">{t("createVideo.avatarSetup.scenarioTitle")}</div>
              <Field
                label={t("createVideo.avatarSetup.uploadImageLabel")}
                help={t("createVideo.avatarSetup.scenarioHelp")}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => scenarioFileInput.current?.click()}
                  >
                    {t("createVideo.avatarSetup.chooseFile")}
                  </button>
                  {defaults.scenario && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => commitDraftAssetClear("scenario")}
                    >
                      {t("createVideo.avatarSetup.removeImage")}
                    </button>
                  )}
                </div>
                {defaults.scenario && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                    {defaults.scenarioName
                      ? t("createVideo.avatarSetup.imageSavedNamed", { name: defaults.scenarioName })
                      : t("createVideo.avatarSetup.imageSaved")}
                  </p>
                )}
                <input
                  ref={scenarioFileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleAssetUpload("scenario", e.target.files[0])}
                />
              </Field>
              <Field
                label={t("createVideo.avatarSetup.generateViaAiLabel")}
                help={t("createVideo.avatarSetup.scenarioPromptHelp")}
                helpPrompt={t("createVideo.avatarSetup.scenarioHelpPrompt")}
              >
                <input
                  placeholder={t("createVideo.avatarSetup.scenarioPlaceholder")}
                  value={defaults.scenarioPrompt}
                  onChange={(e) => onDefaultsChange({ ...defaults, scenarioPrompt: e.target.value })}
                />
              </Field>
            </div>
            {/* TRAJE PADRÃO — UI-PARIDADE-TRAJE, 25/08.
                Mesmo par upload+texto do Cenário padrão, ao lado, escrevendo
                nos MESMOS `defaults.outfit`/`outfitPrompt` que o ramo de
                avatar EXISTENTE já lê. Título PRÓPRIO (`outfitDefaultTitle`,
                "Traje padrão") — desde esta rodada, `outfitTitle` (usado no
                ramo de avatar existente) tem o MESMO texto: são a mesma
                gravação, e o rótulo divergente ("Traje deste vídeo") já foi
                a causa de confusão sobre se o campo persistia ou não. */}
            <div>
              <div className="card-title">{t("createVideo.avatarSetup.outfitDefaultTitle")}</div>
              <Field
                label={t("createVideo.avatarSetup.uploadImageLabel")}
                help={t("createVideo.avatarSetup.outfitHelp")}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => outfitFileInput.current?.click()}
                  >
                    {t("createVideo.avatarSetup.chooseFile")}
                  </button>
                  {defaults.outfit && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => commitDraftAssetClear("outfit")}
                    >
                      {t("createVideo.avatarSetup.removeImage")}
                    </button>
                  )}
                </div>
                {defaults.outfit && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                    {t("createVideo.avatarSetup.imageSaved")}
                  </p>
                )}
                <input
                  ref={outfitFileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleAssetUpload("outfit", e.target.files[0])}
                />
              </Field>
              <Field
                label={t("createVideo.avatarSetup.generateViaAiLabel")}
                help={t("createVideo.avatarSetup.outfitPromptHelp")}
                helpPrompt={t("createVideo.avatarSetup.outfitHelpPrompt")}
              >
                <input
                  placeholder={t("createVideo.avatarSetup.outfitPlaceholder")}
                  value={defaults.outfitPrompt}
                  onChange={(e) => onDefaultsChange({ ...defaults, outfitPrompt: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleFinishSetup}
            disabled={!avatarForTraining.reference_video_url && avatarForTraining.photo_urls.length === 0}
          >
            {t("createVideo.avatarSetup.finishSetup")}
          </button>
        </>
      ) : null}
    </div>
  );
}
