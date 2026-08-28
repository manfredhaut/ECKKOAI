import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { GenerationReadiness, Video } from "../../../types";
import { StatusPill } from "../../../components/ui/StatusPill";
import type { WizardState } from "../types";
import { VideoPlayer } from "../../../features/VideoPlayer";
import { VideoCostPanel } from "../VideoCostPanel";
import { GenerationSummary } from "../GenerationSummary";

/**
 * O corpo de `POST /videos`, montado num lugar só.
 *
 * Existe como função, e não inline no clique, porque "gerar novamente" tem de
 * repetir EXATAMENTE os mesmos parâmetros — e duas montagens do mesmo corpo em
 * dois lugares divergem na primeira vez que alguém acrescenta um campo. O
 * fornecedor declara que o mesmo prompt com o mesmo áudio pode dar resultados
 * diferentes, então repetir é caminho normal, não exceção.
 *
 * **Campo vazio não vai.** Texto em branco vira `null`, nunca `""`: uma
 * instrução de movimento vazia não é a mesma coisa que não instruir, e nós não
 * sabemos como o fornecedor lê a diferença. O servidor normaliza de novo, mas
 * mandar limpo daqui é o que mantém o corpo legível no log de prova.
 */
export function corpoDaGeracao(wizard: WizardState, interfaceLocale: string) {
  return {
    avatar_id: wizard.avatarId,
    script: wizard.script,
    // O FIO QUE FALTAVA. Os quatro campos existem no banco desde as
    // migrations 002/010; o que faltava era a UI escrever neles. Cenário e
    // Traje são POR VÍDEO desde 27/08 e 28/08 respectivamente — os dois
    // direto em `wizard`, nenhum mais vindo de um "padrão do Passo 1"
    // (`AssetDefaults`, extinto).
    //
    // `|| null` e não a string vazia: no servidor a coluna é anulável, e ""
    // gravaria "o cliente mandou um cenário vazio" onde a verdade é "não
    // mandou". A distinção importa porque é ela que decide se a composição da
    // fal recebe uma imagem a mais.
    scenario: wizard.scenario || null,
    scenario_prompt: wizard.scenarioPrompt || null,
    outfit: wizard.outfit || null,
    outfit_prompt: wizard.outfitPrompt || null,
    // `duration_seconds` NÃO vai: o servidor deriva a duração do roteiro, e
    // mandar um número daqui ofereceria a ele uma segunda resposta para a
    // mesma pergunta — era a errada.
    background: wizard.background
      ? { type: wizard.background.type, value: wizard.background.value }
      : null,
    motion_prompt: wizard.motionPrompt.trim() || null,
    expressiveness: wizard.expressiveness,
    avatar_look_id: wizard.avatarLookId,
    // Vai SEMPRE. O servidor tem padrão para corpo sem este campo, mas depender
    // do padrão dele aqui reproduziria, um andar acima, a mesma omissão que o
    // bloco de formato tirou do payload do fornecedor.
    publish_platform: wizard.publishPlatform,
    // Vai SEMPRE, inclusive `false`. O servidor tem padrão, mas omitir o campo
    // quando a resposta é "não" deixaria "não pedi legenda" e "esqueci de
    // mandar a escolha" com a mesma aparência no corpo — e é justamente essa
    // ambiguidade que o log de prova precisa não ter.
    captions: wizard.captions,
    // O IDIOMA DA INTERFACE, e não uma detecção de língua sobre o texto.
    //
    // O cliente é quem sabe em que idioma a pessoa está usando o produto — ela
    // escolheu no seletor. O servidor usa isso para decidir se a Interpretação
    // passa pelo tradutor; o que ele faz com o texto depois disso não é assunto
    // desta tela, e a versão traduzida nunca volta para cá.
    interface_locale: interfaceLocale,
    // O NÍVEL — BLOCO A. Vai SEMPRE, inclusive "normal" (o padrão): omitir o
    // campo quando a escolha é o default reproduziria a mesma ambiguidade que
    // `captions` já resolveu — "escolheu normal" e "esqueceu de escolher"
    // ficariam com a mesma aparência no corpo.
    tier_video: wizard.tierVideo,
    // A DURAÇÃO-ALVO do passo Roteiro (15/30/45/60 s), ou `null` para "mais".
    // Vai SEMPRE, inclusive `null` — mesma razão de `tier_video` acima: sem
    // o campo, "escolheu mais" e "esqueceu de escolher" ficam indistinguíveis
    // no corpo, e é o servidor (`evaluateGenerationReadiness`) quem recusa de
    // verdade acima dela, não esta tela.
    target_duration_seconds: wizard.targetDurationSeconds,
  };
}

const PROGRESS_BY_STATUS: Record<Video["status"], number> = {
  queued: 15,
  processing: 65,
  // A METADE, e não 90: a composição é o primeiro dos quatro trabalhos, e é o
  // BARATO. Uma barra quase cheia num ponto em que 95% do dinheiro ainda não
  // saiu convida ao clique distraído — que é exatamente o clique que o botão
  // logo abaixo existe para não receber.
  awaiting_approval: 50,
  // Um passo adiante de `awaiting_approval`: o vídeo já foi animado (a etapa
  // mais cara de todas, Wan ou Seedance), só falta narrar+sincronizar.
  awaiting_approval_video: 75,
  ready: 100,
  error: 100,
};

export function GenerateStep({
  wizard,
  onCaptionsChange,
}: {
  wizard: WizardState;
  /** Mesma forma dos outros passos: o estado mora na página, o passo avisa. */
  onCaptionsChange: (captions: boolean) => void;
}) {
  // `i18n.language` é o gatilho da tradução da Interpretação no servidor. Sai
  // daqui, e não de uma detecção de língua sobre o texto: o idioma da interface
  // é um fato que esta tela conhece.
  const { t, i18n } = useTranslation();
  const [video, setVideo] = useState<Video | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Sem este estado (e o catch abaixo), um 403 de crédito, um 409 de avatar em
  // treino ou um 429 de teto viravam promise rejeitada sem dono: o botão
  // voltava ao normal e a tela não dizia NADA. O erro precisa aparecer ao lado
  // da ação que falhou.
  const [error, setError] = useState<string | null>(null);

  // Prontidão vem do SERVIDOR, do mesmo predicado que `POST /videos` usa para
  // recusar (services/generationReadiness.ts). A tela não reimplementa regra
  // nenhuma e não reescreve mensagem nenhuma: antes, o botão conhecia três
  // condições e a rota recusava por sete, então crédito esgotado, teto de
  // sessão e credencial ausente só apareciam DEPOIS do clique.
  //
  // `null` enquanto não se sabe — e nesse estado o botão fica desabilitado,
  // porque habilitar por otimismo é o que produz o clique que falha.
  const [readiness, setReadiness] = useState<GenerationReadiness | null>(null);
  // Reconsulta depois de uma tentativa que falhou: a tentativa pode ter mudado
  // justamente o que o predicado mede (crédito debitado, teto de sessão
  // consumido). Sem isto, o botão voltaria habilitado prometendo uma segunda
  // tentativa que já se sabe que vai ser recusada.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setReadiness(null);
    api
      .post<GenerationReadiness>("/videos/readiness", {
        avatar_id: wizard.avatarId,
        script: wizard.script,
        // O teto da Interpretação também é do servidor. O `maxLength` do
        // `<textarea>` do passo Cena continua lá como conveniência, mas quem
        // recusa é a rota — e é dela que sai o motivo escrito na tela.
        motion_prompt: wizard.motionPrompt,
        // A DURAÇÃO-ALVO do passo Roteiro. Sem ela aqui, este botão ficaria
        // habilitado para um roteiro que `POST /videos` vai recusar — a
        // mesma divergência que este predicado inteiro existe para fechar.
        target_duration_seconds: wizard.targetDurationSeconds,
        // BLOCO FRACOES-1 — o teto do tier Normal (fracionamento, 120 s) é
        // bem mais apertado que o teto global acima. Sem isto, o botão
        // ficaria habilitado para um roteiro que o tier Normal recusa.
        tier_video: wizard.tierVideo,
      })
      .then((r) => {
        if (!cancelled) setReadiness(r);
      })
      .catch(() => {
        // Falha ao consultar não pode virar botão travado para sempre: o
        // servidor continua sendo quem recusa, então liberar aqui apenas
        // devolve o comportamento de antes deste bloco — clicar e ver o erro.
        if (!cancelled) setReadiness({ ready: true, blockers: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [wizard.avatarId, wizard.script, wizard.motionPrompt, wizard.targetDurationSeconds, reloadKey]);

  const blockers = readiness?.blockers ?? [];

  /**
   * CONFIRMAÇÃO EXPLÍCITA para roteiro longo.
   *
   * Não é limite e não recusa nada: o roteiro do cliente não é truncado em
   * silêncio. É só a exigência de que alguém tenha OLHADO a duração antes de
   * gastar — o débito acontece antes da chamada ao fornecedor e só estorna
   * antes do aceite, então um roteiro colado por engano vira dinheiro perdido
   * sem nenhum ponto de arrependimento no meio.
   *
   * O teto e o veredito vêm do servidor (`/video-cost-estimate`), pelo mesmo
   * motivo do predicado de prontidão: uma tela que reimplementa a regra passa a
   * discordar do servidor no dia em que a regra mudar.
   */
  const [estimate, setEstimate] = useState<{
    estimatedSeconds: number;
    requiresConfirmation: boolean;
    confirmAboveSeconds: number;
    estimate: { costUsd: number | null; costUnknownReason: string | null };
    /** G3 — só não-`null` para "normal"/"premium". Ver o diálogo abaixo. */
    composeCostUsd: number | null;
  } | null>(null);
  const [confirmedLong, setConfirmedLong] = useState(false);
  // Roteiro novo, confirmação nova: a duração que foi confirmada não é mais a
  // que vai ser gerada.
  useEffect(() => setConfirmedLong(false), [wizard.script]);

  const needsConfirm = estimate?.requiresConfirmation === true;
  const blocked = readiness === null || !readiness.ready || (needsConfirm && !confirmedLong);

  /**
   * CONFIRMAÇÃO EXPLÍCITA antes de qualquer chamada paga — T3 (Simples,
   * 22/08/2026) estendida a Normal/Premium em G3, mesma data.
   *
   * O tier Simples dispara DIRETO no fornecedor: diferente do fal (que
   * pausa depois de UMA chamada paga, na composição, para aprovar ANTES da
   * etapa cara), o HeyGen não tem artefato intermediário nenhum para
   * mostrar — é um único `POST /v3/videos` que já anima. Inventar uma
   * "aprovação de imagem" para o HeyGen seria inventar um passo que o
   * fornecedor não tem. O que existe é ANTES de qualquer chamada: um
   * resumo do pedido, com um clique extra para confirmar.
   *
   * Normal/Premium JÁ TÊM uma pausa depois da composição
   * (`awaiting_approval`, ver o bloco mais abaixo) — mas essa pausa é DEPOIS
   * de `PRECOS_FAL.comporUsd` (US$ 0,08) já ter sido gasto. Este diálogo é
   * ANTES disso: mostra o custo FIXO da composição (o único número que dá
   * para afirmar com certeza aqui — animar e narrar+sincronizar não têm
   * preço fixo, e por isso têm aprovação própria depois) e deixa claro que
   * o resto da corrida ainda vai pedir aprovação, etapa por etapa.
   *
   * NENHUM estado novo em `videos.status`, NENHUM artefato pago além do que
   * `POST /videos` já dispara — é inteiramente do lado do cliente, antes de
   * qualquer chamada paga existir.
   */
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [lastCorrectionNote, setLastCorrectionNote] = useState("");
  // Roteiro novo: a nota da correção anterior já não fala do que está na
  // tela agora.
  useEffect(() => setLastCorrectionNote(""), [wizard.script]);

  function handleGenerateClick() {
    setCorrectionNote("");
    setShowGenerateConfirm(true);
  }

  /**
   * "Corrigir" — NUNCA dispara `POST /videos`. Só fecha o diálogo e guarda
   * o texto digitado como referência, para a pessoa ajustar manualmente os
   * campos do wizard. Nenhuma chamada de rede, nenhum estado de vídeo.
   */
  function handleConfirmDialogCorrect() {
    setLastCorrectionNote(correctionNote);
    setShowGenerateConfirm(false);
  }

  /** "Confirmar e gerar" — o único caminho que dispara `POST /videos` daqui. */
  function handleConfirmDialogGenerate() {
    setShowGenerateConfirm(false);
    void handleGenerate();
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // Aprovar e Refazer são as duas ações do passo 4 no caminho da fal, e as duas
  // são LENTAS: o Wan leva minutos, a recomposição leva dezenas de segundos. Um
  // estado só para as duas deixaria os dois botões cinzas sem dizer qual está
  // acontecendo — e "não sei o que está rodando" num botão que custa US$ 1,50 é
  // pior do que um botão desabilitado.
  const [approving, setApproving] = useState(false);
  const [recomposing, setRecomposing] = useState(false);
  // MODO B — a segunda aprovação, do vídeo mudo. Estados PRÓPRIOS, mesma
  // razão dos dois acima: aprovar e refazer são operações lentas e distintas,
  // e um botão cinza sem dizer qual delas está rodando é pior que nenhum.
  const [approvingVideo, setApprovingVideo] = useState(false);
  const [redoingVideo, setRedoingVideo] = useState(false);
  const busy = approving || recomposing || approvingVideo || redoingVideo;

  /**
   * O LIMITE DE REFAÇÕES, na tela — W3.1b, 24/08.
   *
   * ┌─ Por que desabilitar, e não só deixar o 409 chegar ─────────────────────┐
   * │ O servidor já recusa a 4ª com `refacoes_esgotadas`. Mas a recusa chega  │
   * │ DEPOIS do clique, e nesta tela o clique é a única coisa que a pessoa    │
   * │ pode fazer. Um botão que parece disponível e responde "não" ensina que  │
   * │ o produto é imprevisível — e este projeto já tem a regra: a tela        │
   * │ desabilita pelo MESMO critério que o servidor usa para recusar.         │
   * │                                                                          │
   * │ `feitas` chega do servidor a cada leitura, então o botão trava assim    │
   * │ que a 3ª refação é REGISTRADA — não no clique da 4ª.                    │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Ausência de `refacoes` (linha antiga, resposta de uma rota que ainda não
   * enriquece) NÃO trava o botão: falhar fechado aqui esconderia a ação por
   * causa de um campo faltando, e o servidor continua sendo o freio real.
   */
  const refacoesFeitas = video?.refacoes?.feitas ?? 0;
  const refacoesLimite = video?.refacoes?.limite ?? null;
  const refacoesEsgotadas = refacoesLimite !== null && refacoesFeitas >= refacoesLimite;
  const motivoRefacoes = refacoesEsgotadas
    ? t("createVideo.generate.refacoesEsgotadas", { feitas: refacoesFeitas, limite: refacoesLimite })
    : undefined;

  // O CAMPO LIVRE do "Refazer" — um estado por TELA (imagem e vídeo mudo),
  // não um só: as duas nunca aparecem juntas para o mesmo vídeo (o status só
  // permite uma de cada vez), mas manter dois evita que o texto digitado numa
  // tela apareça pré-preenchido na outra se o vídeo passar de uma pra outra
  // sem reload. SÓ CAPTURA E PERSISTE — ver a migration 061.
  const [imageFeedback, setImageFeedback] = useState("");
  const [videoFeedback, setVideoFeedback] = useState("");

  async function handleApprove() {
    if (!video) return;
    setApproving(true);
    setError(null);
    try {
      // SÍNCRONA de propósito: o pipeline da fal são três trabalhos em série e
      // não há polling deste lado. A requisição fica aberta até o vídeo existir.
      setVideo(await api.post<Video>(`/videos/${video.id}/approve`, {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setApproving(false);
    }
  }

  async function handleRecompose() {
    if (!video) return;
    setRecomposing(true);
    setError(null);
    try {
      setVideo(await api.post<Video>(`/videos/${video.id}/recompose`, { feedback: imageFeedback }));
      setImageFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setRecomposing(false);
    }
  }

  /** MODO B — aprovar o vídeo mudo: segue para narrar + sincronizar. */
  async function handleApproveVideo() {
    if (!video) return;
    setApprovingVideo(true);
    setError(null);
    try {
      setVideo(await api.post<Video>(`/videos/${video.id}/approve-video`, {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setApprovingVideo(false);
    }
  }

  /** MODO B — refazer o vídeo mudo: reanima só (não recompõe, não narra). */
  async function handleRedoVideo() {
    if (!video) return;
    setRedoingVideo(true);
    setError(null);
    try {
      setVideo(await api.post<Video>(`/videos/${video.id}/redo-video`, { feedback: videoFeedback }));
      setVideoFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setRedoingVideo(false);
    }
  }

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Video>("/videos", corpoDaGeracao(wizard, i18n.language));
      setVideo(created);
      pollRef.current = window.setInterval(async () => {
        const latest = await api.get<Video>(`/videos/${created.id}`);
        setVideo(latest);
        // `awaiting_approval` é TERMINAL para o polling, e não um estado de
        // passagem: nada do outro lado vai mudá-lo. Continuar consultando aqui
        // seria bater no servidor para sempre esperando um clique que só pode
        // acontecer nesta mesma tela.
        if (
          latest.status === "ready" ||
          latest.status === "error" ||
          latest.status === "awaiting_approval"
        ) {
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
      setReloadKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.generate.title")}</div>

      {!video ? (
        <>
          {/* ACIMA DO BOTÃO, e é o único lugar em que faz diferença.
              Dois vídeos pagos saíram com campos vazios sem que desse para
              perceber antes de clicar — o corpo era válido, o fornecedor
              respondeu 200, e a ausência só apareceu no vídeo pronto. O resumo
              é derivado do MESMO objeto que vai no POST. */}
          <GenerationSummary wizard={wizard} />

          {/* LEGENDA — a escolha fica ANTES do botão, junto do resumo, porque é
              o último campo que muda o corpo enviado. Depois do clique não há
              onde mudar: o vídeo já foi debitado.

              Os dois estados são botões, e não um checkbox, para que "Sem
              legenda" seja uma escolha visível e não a ausência de uma. */}
          <fieldset className="caption-choice" style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
            <legend style={{ fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 6 }}>
              {t("createVideo.generate.captionsLabel")}
            </legend>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={wizard.captions ? "btn btn-secondary" : "btn btn-primary"}
                aria-pressed={!wizard.captions}
                onClick={() => onCaptionsChange(false)}
              >
                {t("createVideo.generate.captionsOff")}
              </button>
              <button
                type="button"
                className={wizard.captions ? "btn btn-primary" : "btn btn-secondary"}
                aria-pressed={wizard.captions}
                onClick={() => onCaptionsChange(true)}
              >
                {t("createVideo.generate.captionsOn")}
              </button>
            </div>
            {/* IRREVERSÍVEL, e dito SEMPRE — nas duas escolhas, não só em
                "Com legenda".

                A base é medida: um vídeo gerado sem `caption` volta do
                fornecedor sem `subtitle_url` e sem `captioned_video_url`
                (medido em 10/08 no vídeo `dca10724`). Não existe versão
                legendada para ligar depois, nem arquivo de legenda para juntar:
                a única forma de mudar de ideia é gerar outro vídeo, e outro
                vídeo custa outra vez.

                Sob os dois botões porque é aqui que a decisão acontece. Um
                aviso que só aparecesse depois de escolher "Com legenda" deixaria
                quem manteve o padrão sem saber que também estava decidindo. */}
            <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              {t("createVideo.generate.captionsIrreversible")}
            </p>
            {/* O que está sendo aguardado, escrito. O campo `caption` está no
                schema do fornecedor (lido em 06/08 e relido em 10/08), mas
                nenhuma geração deste projeto o enviou — então o ACEITE é
                suposição, e a tela não finge o contrário. Só aparece na escolha
                que muda o corpo. */}
            {wizard.captions && (
              <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                {t("createVideo.generate.captionsUnverified")}
              </p>
            )}
          </fieldset>

          <button
            className="btn btn-primary"
            onClick={handleGenerateClick}
            disabled={submitting || blocked}
            style={{ marginTop: 12 }}
          >
            {submitting ? t("createVideo.generate.submitting") : t("createVideo.generate.generateButton")}
          </button>

          {/* A nota da última "Corrigir" — referência para ajustar os campos
              manualmente. Some sozinha quando o roteiro muda (o texto já não
              fala do que está na tela agora). */}
          {lastCorrectionNote && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              {t("createVideo.generate.simpleConfirm.noteHint", { note: lastCorrectionNote })}
            </p>
          )}

          {/* O motivo fica AO LADO do botão, sempre visível e sem exigir hover.
              Um botão cinza que não explica parece produto quebrado — numa
              apresentação isso é pior que deixar clicar e mostrar o erro. */}
          {blockers.length > 0 && (
            <ul className="blocked-reasons">
              {blockers.map((b) => (
                <li key={b.code}>{b.message}</li>
              ))}
            </ul>
          )}
          {readiness === null && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>
              {t("createVideo.generate.checking")}
            </p>
          )}

          {/* O portão de confirmação vem ANTES do painel de custo por acidente
              nenhum: ele fala do mesmo número que o painel detalha logo abaixo,
              e quem lê de cima para baixo encontra primeiro o aviso e depois a
              conta que o justifica. */}
          {needsConfirm && estimate && (
            <label
              style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13 }}
            >
              <input
                type="checkbox"
                checked={confirmedLong}
                onChange={(e) => setConfirmedLong(e.target.checked)}
              />
              <span>
                {t("createVideo.generate.longConfirm", {
                  seconds: estimate.estimatedSeconds.toFixed(0),
                  limit: estimate.confirmAboveSeconds,
                })}
              </span>
            </label>
          )}
          {error && (
            <p className="alert-error" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              {error}
            </p>
          )}
          {/* Custo ANTES de gastar. A estimativa aparece ao lado do botão que
              a torna real — mostrá-la só depois seria informar o preço depois
              da compra. */}
          <VideoCostPanel
            scriptChars={wizard.script.length}
            tier={wizard.tierVideo}
            onEstimate={(info) =>
              setEstimate((atual) =>
                atual &&
                atual.estimatedSeconds === info.estimatedSeconds &&
                atual.requiresConfirmation === info.requiresConfirmation &&
                atual.estimate.costUsd === info.estimate.costUsd &&
                atual.composeCostUsd === info.composeCostUsd
                  ? atual
                  : info,
              )
            }
          />

          {/* DIÁLOGO DE CONFIRMAÇÃO — os TRÊS níveis, G3 (22/08/2026)
              estendendo o T3 (só Simples). Nenhum estado novo em
              `videos.status`, nenhuma chamada de rede além da que
              `POST /videos` já faria — é inteiramente do lado do cliente,
              ANTES de qualquer chamada paga existir. Diferença registrada
              contra o Modo B da fal (o bloco `awaiting_approval` mais
              abaixo): lá a pausa é DEPOIS de uma chamada paga já ter saído
              (aprovar o que já foi gerado); aqui é ANTES de qualquer chamada
              paga existir (confirmar o que está prestes a ser gerado) — para
              Normal/Premium as duas pausas convivem, uma antes da
              composição e outra depois dela. */}
          {showGenerateConfirm && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="generate-confirm-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) handleConfirmDialogCorrect();
              }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                background: "rgba(0, 0, 0, 0.5)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 480,
                  background: "var(--color-surface, #fff)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-card)",
                  padding: 20,
                  maxHeight: "90vh",
                  overflowY: "auto",
                }}
              >
                <h3 id="generate-confirm-title" style={{ marginTop: 0, fontSize: 16 }}>
                  {t("createVideo.generate.simpleConfirm.title")}
                </h3>
                <p className="text-muted" style={{ fontSize: 13 }}>
                  {t(
                    wizard.tierVideo === "simples"
                      ? "createVideo.generate.simpleConfirm.intro"
                      : "createVideo.generate.falConfirm.intro",
                  )}
                </p>

                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <strong>{t("createVideo.generate.simpleConfirm.script")}:</strong>{" "}
                  {wizard.script.length > 160 ? `${wizard.script.slice(0, 160)}…` : wizard.script}
                </div>
                {estimate && (
                  <>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      <strong>{t("createVideo.generate.simpleConfirm.estimatedDuration")}:</strong>{" "}
                      {estimate.estimatedSeconds.toFixed(0)} s
                    </div>
                    {wizard.tierVideo === "simples" ? (
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <strong>{t("createVideo.generate.simpleConfirm.estimatedCost")}:</strong>{" "}
                        {estimate.estimate.costUsd != null
                          ? `US$ ${estimate.estimate.costUsd.toFixed(2).replace(".", ",")}`
                          : t("createVideo.cost.notMeasured")}
                      </div>
                    ) : (
                      // O CUSTO FIXO da composição — o único número certo antes
                      // do clique neste caminho. Vem PRONTO do servidor
                      // (`/video-cost-estimate`, campo `composeCostUsd`,
                      // `PRECOS_FAL.comporUsd`) — nunca escrito aqui.
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <strong>{t("createVideo.generate.falConfirm.composeCost")}:</strong>{" "}
                        {estimate.composeCostUsd != null
                          ? `US$ ${estimate.composeCostUsd.toFixed(2).replace(".", ",")}`
                          : t("createVideo.cost.notMeasured")}
                      </div>
                    )}
                  </>
                )}
                {wizard.tierVideo !== "simples" && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                    {t("createVideo.generate.falConfirm.animationNote")}
                  </p>
                )}

                {/* Resumo completo (avatar, traje, fundo, interpretação,
                    expressividade, formato) — o MESMO componente já
                    renderizado acima, derivado do MESMO corpo que vai no
                    POST. Reaproveitado, não duplicado. */}
                <GenerationSummary wizard={wizard} />

                <div className="field" style={{ marginTop: 8 }}>
                  <label>{t("createVideo.generate.simpleConfirm.correctionLabel")}</label>
                  <textarea
                    value={correctionNote}
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    placeholder={t("createVideo.generate.simpleConfirm.correctionPlaceholder")}
                    rows={2}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-outline" onClick={handleConfirmDialogCorrect}>
                    {t("createVideo.generate.simpleConfirm.correct")}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmDialogGenerate}>
                    {t("createVideo.generate.simpleConfirm.confirm")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <StatusPill status={video.status} />
            <div style={{ flex: 1, height: 8, background: "var(--color-border)", borderRadius: 999 }}>
              <div
                style={{
                  width: `${PROGRESS_BY_STATUS[video.status]}%`,
                  height: "100%",
                  background: "var(--color-primary)",
                  borderRadius: 999,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* O FREIO. Nada dispara o Wan sem este clique — é o que protege
              ~US$ 1,50 de uma composição que saiu errada, e é o único ponto do
              fluxo em que a pessoa vê o que vai ser animado ANTES de pagar por
              isso. A imagem não é prévia nem miniatura: é literalmente a
              entrada da etapa seguinte. */}
          {video.status === "awaiting_approval" && (
            <>
              <p style={{ fontSize: 14, marginTop: 0 }}>{t("createVideo.generate.approveIntro")}</p>
              {video.fal_composed_image_url && (
                <img
                  src={video.fal_composed_image_url}
                  alt={t("createVideo.generate.approveImageAlt")}
                  style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                />
              )}
              {/* SÓ CAPTURA E PERSISTE (migration 061) — como esse texto
                  retroalimenta a próxima composição não foi decidido ainda. */}
              <div className="field" style={{ marginTop: 12 }}>
                <label>{t("createVideo.generate.feedbackLabel")}</label>
                <textarea
                  value={imageFeedback}
                  onChange={(e) => setImageFeedback(e.target.value)}
                  placeholder={t("createVideo.generate.feedbackPlaceholder")}
                  rows={2}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleApprove()}
                  disabled={busy || !video.fal_composed_image_url}
                >
                  {approving ? t("createVideo.generate.approving") : t("createVideo.generate.approve")}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => void handleRecompose()}
                  disabled={busy || refacoesEsgotadas}
                  title={motivoRefacoes}
                >
                  {recomposing ? t("createVideo.generate.recomposing") : t("createVideo.generate.recompose")}
                </button>
              </div>
              {refacoesEsgotadas && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  {motivoRefacoes}
                </p>
              )}
              {/* Os dois preços, lado a lado, na hora da decisão. Escondê-los
                  aqui repetiria o defeito que o painel de custo veio corrigir um
                  passo antes: informar o preço depois da compra. */}
              <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                {t("createVideo.generate.approveCost")}
              </p>
            </>
          )}

          {/* MODO B (FASE 2) — a segunda aprovação, do vídeo MUDO. Mesma
              propriedade do bloco de imagem acima: nada dispara narrar +
              sincronizar (as duas etapas mais caras da corrida) sem este
              clique. O vídeo não é prévia: é literalmente a entrada da etapa
              seguinte, já animado, só sem voz. */}
          {video.status === "awaiting_approval_video" && (
            <>
              <p style={{ fontSize: 14, marginTop: 0 }}>{t("createVideo.generate.approveVideoIntro")}</p>
              {video.fal_muted_video_url && (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- mudo de propósito, é o que se está aprovando
                <video
                  src={video.fal_muted_video_url}
                  controls
                  muted
                  style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                />
              )}
              <div className="field" style={{ marginTop: 12 }}>
                <label>{t("createVideo.generate.feedbackLabel")}</label>
                <textarea
                  value={videoFeedback}
                  onChange={(e) => setVideoFeedback(e.target.value)}
                  placeholder={t("createVideo.generate.feedbackPlaceholder")}
                  rows={2}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleApproveVideo()}
                  disabled={busy || !video.fal_muted_video_url}
                >
                  {approvingVideo ? t("createVideo.generate.approvingVideo") : t("createVideo.generate.approveVideo")}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => void handleRedoVideo()}
                  disabled={busy || refacoesEsgotadas}
                  title={motivoRefacoes}
                >
                  {redoingVideo ? t("createVideo.generate.redoingVideo") : t("createVideo.generate.redoVideo")}
                </button>
              </div>
              {refacoesEsgotadas && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  {motivoRefacoes}
                </p>
              )}
              <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                {t("createVideo.generate.approveVideoCost")}
              </p>
            </>
          )}

          {video.status === "ready" && video.output_url && (
            <>
              {/* Mesmo componente da Biblioteca: o aviso de simulação e o
                  respeito à proporção precisam ser idênticos nos dois lugares.
                  Duas implementações divergem, e a que divergir será a que
                  mostra fixture sem aviso numa apresentação. */}
              <VideoPlayer video={video} />

              {/* GERAR NOVAMENTE — o fornecedor declara que o mesmo prompt com
                  o mesmo áudio pode produzir resultados diferentes, então
                  repetir é uso normal e não conserto de erro.

                  Repete os MESMOS parâmetros: mesmo roteiro, mesmo fundo,
                  mesma interpretação, mesmo look, mesmo formato. O roteiro não
                  é reescrito e a voz não é re-sintetizada por decisão de tela —
                  o corpo enviado é idêntico, e é o servidor que reaproveita o
                  que já existe. Cada tentativa consome do teto diário e
                  aparece na galeria. */}
              <button
                className="btn btn-outline"
                style={{ marginTop: 12 }}
                onClick={() => void handleGenerate()}
                disabled={submitting || blocked}
              >
                {submitting ? t("createVideo.generate.submitting") : t("createVideo.generate.again")}
              </button>
              <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                {t("createVideo.generate.againHelp")}
              </p>
              {/* O resultado vive em useState: sair desta tela o torna
                  inalcançável. Sem este caminho, quem fecha o wizard não tem
                  como descobrir que o vídeo continua no produto. */}
              <p style={{ fontSize: 13, marginTop: 16, marginBottom: 0 }}>
                <Link to="content">{t("createVideo.generate.openLibrary")}</Link>
              </p>
            </>
          )}

          {video.status === "error" && (
            <p style={{ color: "var(--color-tertiary)" }}>
              {video.error_message || t("createVideo.generate.failed")}
            </p>
          )}

          {/* Depois de gerar: estimativa e medição lado a lado, com a
              diferença. `refreshKey` no status porque o custo real só existe
              quando o polling registra o consumo — sem isso o painel ficaria
              preso na leitura de quando o vídeo ainda estava na fila. */}
          <VideoCostPanel videoId={video.id} refreshKey={video.status} />
        </>
      )}
    </div>
  );
}
