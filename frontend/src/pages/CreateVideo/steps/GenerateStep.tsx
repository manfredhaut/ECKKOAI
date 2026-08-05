import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { GenerationReadiness, Video } from "../../../types";
import { StatusPill } from "../../../components/ui/StatusPill";
import type { WizardState } from "../types";
import { VideoPlayer } from "../../../features/VideoPlayer";
import { VideoCostPanel } from "../VideoCostPanel";

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
export function corpoDaGeracao(wizard: WizardState) {
  return {
    avatar_id: wizard.avatarId,
    script: wizard.script,
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
  };
}

const PROGRESS_BY_STATUS: Record<Video["status"], number> = {
  queued: 15,
  processing: 65,
  ready: 100,
  error: 100,
};

export function GenerateStep({ wizard }: { wizard: WizardState }) {
  const { t } = useTranslation();
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
  }, [wizard.avatarId, wizard.script, reloadKey]);

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
  } | null>(null);
  const [confirmedLong, setConfirmedLong] = useState(false);
  // Roteiro novo, confirmação nova: a duração que foi confirmada não é mais a
  // que vai ser gerada.
  useEffect(() => setConfirmedLong(false), [wizard.script]);

  const needsConfirm = estimate?.requiresConfirmation === true;
  const blocked = readiness === null || !readiness.ready || (needsConfirm && !confirmedLong);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Video>("/videos", corpoDaGeracao(wizard));
      setVideo(created);
      pollRef.current = window.setInterval(async () => {
        const latest = await api.get<Video>(`/videos/${created.id}`);
        setVideo(latest);
        if (latest.status === "ready" || latest.status === "error") {
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
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={submitting || blocked}
          >
            {submitting ? t("createVideo.generate.submitting") : t("createVideo.generate.generateButton")}
          </button>

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
            onEstimate={(info) =>
              setEstimate((atual) =>
                atual &&
                atual.estimatedSeconds === info.estimatedSeconds &&
                atual.requiresConfirmation === info.requiresConfirmation
                  ? atual
                  : info,
              )
            }
          />
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
                <Link to="/content">{t("createVideo.generate.openLibrary")}</Link>
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
