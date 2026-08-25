import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { MAX_IMAGE_BYTES, formatBytes } from "../../../uploadLimits";
import { Field } from "../../../components/ui/Field";
import { PublishStep } from "./PublishStep";
import type { SceneBackground, WizardState } from "../types";
import type { Avatar, AvatarLooksResponse, Credential } from "../../../types";

/** Espelho de `formatConfidenceForTier` (`backend/src/services/providers/videoFormat.ts`). */
type FormatConfidenceLevel = "vendor_response" | "documentation" | "unverified";

/** Resposta de `GET /video-format-support?tier=…`. */
interface FormatSupport {
  vendor: string | null;
  supported: boolean;
  evidence: string;
  reason: string;
  /** `null` sem `?tier=` — nunca o caso aqui, que sempre manda o tier. */
  perPlatformConfidence: Record<string, FormatConfidenceLevel> | null;
}

/**
 * O passo CENA: fundo, interpretação, traje e formato.
 *
 * Substitui o passo 3 antigo, que coletava cenário e traje como imagens, os
 * gravava no banco e nunca os mandava a lugar nenhum — o call site de
 * `generateVideo()` simplesmente não os passava. Ele também tinha um seletor de
 * avatar redundante com o passo 1, que some aqui.
 *
 * Cada controle desta tela existe porque o FORNECEDOR tem campo para ele, e
 * nenhum existe além disso:
 *
 *   fundo          →  background.type "color" | "image"   (não há vídeo)
 *   interpretação  →  motion_prompt + expressiveness
 *   traje          →  qual look entra em avatar_id
 *   formato        →  aspect_ratio + resolution
 */

const EXPRESSIVENESS = ["low", "medium", "high"] as const;

/**
 * Os TRÊS níveis — BLOCO A. Nomes de plataforma nunca aparecem aqui, só nos
 * comentários do código: o rótulo, a faixa de custo e a chave de tradução.
 * A faixa é a mesma da tabela decidida na sessão do sistema de tiers (30 s de
 * referência); custo REAL varia com a duração escolhida pelo roteiro.
 */
const TIER_OPTIONS: { value: "simples" | "normal" | "premium"; range: string }[] = [
  { value: "simples", range: "US$ 0,50–2,00" },
  { value: "normal", range: "US$ 1,50–3,00" },
  { value: "premium", range: "US$ 14,19" },
];

/**
 * Teto do texto de interpretação.
 *
 * NOSSO, não do fornecedor: a documentação dele não declara limite nenhum para
 * `motion_prompt`, e o único exemplo publicado tem cinco palavras. O contador
 * existe para dar noção de tamanho, e o número é redondo justamente porque não
 * está medindo nada do outro lado.
 */
const MOTION_PROMPT_MAX = 600;

/**
 * O contrato mora em `types.ts`, compartilhado com o passo 1 — que é quem CRIA
 * traje. Manter uma cópia local aqui faria as duas telas discordarem sobre o
 * que é escolhível na primeira vez que o contrato mudasse, e foi o que
 * aconteceu quando o passo 1 passou a devolver `pendentes`.
 */
type LooksResponse = AvatarLooksResponse;

export function SceneStep({
  avatarId,
  background,
  onBackgroundChange,
  motionPrompt,
  onMotionPromptChange,
  expressiveness,
  onExpressivenessChange,
  avatarLookId,
  onAvatarLookChange,
  publishPlatform,
  onPublishPlatformChange,
  tierVideo,
  onTierVideoChange,
}: {
  avatarId: string | null;
  background: SceneBackground | null;
  onBackgroundChange: (value: SceneBackground | null) => void;
  motionPrompt: string;
  onMotionPromptChange: (value: string) => void;
  expressiveness: WizardState["expressiveness"];
  onExpressivenessChange: (value: WizardState["expressiveness"]) => void;
  avatarLookId: string | null;
  onAvatarLookChange: (value: string | null) => void;
  publishPlatform: string;
  onPublishPlatformChange: (value: string) => void;
  /** Mesmo padrão de `onCaptionsChange` — BLOCO A. Movido de GenerateStep.tsx: o nível é escolhido AQUI, na Cena, antes do resumo final. */
  tierVideo: WizardState["tierVideo"];
  onTierVideoChange: (tierVideo: WizardState["tierVideo"]) => void;
}) {
  const { t } = useTranslation();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [looks, setLooks] = useState<LooksResponse | null>(null);

  /**
   * FASE C (multi-vendor de avatar) — "Simples" exige heygen; "Normal" e
   * "Premium" exigem fal (`vendorRequiredByTier`, `falPipeline.ts`). Bloco
   * movido de `GenerateStep.tsx` junto com os cartões — ver o comentário
   * completo no histórico do commit que fez a mudança.
   *
   * `[]` enquanto não se sabe (`credentials === null`) — os cartões nascem
   * DESABILITADOS até a resposta chegar.
   */
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<Credential[]>("/credentials")
      .then((r) => {
        if (!cancelled) setCredentials(r);
      })
      .catch(() => {
        if (!cancelled) setCredentials([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * A DISPONIBILIDADE vem do SERVIDOR — W4, 24/08. `null` enquanto não se
   * sabe: os cartões nascem DESABILITADOS até a resposta chegar, porque
   * habilitar por otimismo é o que produz o clique que o servidor recusa.
   */
  const [tiersDisponiveis, setTiersDisponiveis] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<Record<string, boolean>>("/videos/tier-availability")
      .then((r) => {
        if (!cancelled) setTiersDisponiveis(r);
      })
      .catch(() => {
        if (!cancelled) setTiersDisponiveis({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const podeEscolherSimples = tiersDisponiveis?.simples === true;
  const podeEscolherFal = tiersDisponiveis?.normal === true || tiersDisponiveis?.premium === true;

  // Se o tier selecionado deixou de estar disponível (ou nunca esteve, e o
  // wizard nasceu com "normal" por padrão — `CreateVideoPage.tsx`), o
  // próprio wizard troca para um nível que a conta REALMENTE tem, assim que
  // as credenciais chegam. Nunca silencioso: o botão destacado na tela muda
  // junto, então quem olha vê exatamente o que vai ser gerado.
  useEffect(() => {
    if (credentials === null) return;
    const atualDisponivel = tierVideo === "simples" ? podeEscolherSimples : podeEscolherFal;
    if (atualDisponivel) return;
    if (podeEscolherFal) onTierVideoChange("normal");
    else if (podeEscolherSimples) onTierVideoChange("simples");
  }, [credentials, podeEscolherSimples, podeEscolherFal, tierVideo, onTierVideoChange]);

  /**
   * A CONFIANÇA do formato escolhido nesta mesma tela, NO TIER escolhido
   * aqui do lado. Refeita a cada troca de tier, porque é exatamente o que
   * muda a resposta (`?tier=`, Fase C).
   */
  const [formatSupport, setFormatSupport] = useState<FormatSupport | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<FormatSupport>(`/video-format-support?tier=${tierVideo}`)
      .then((r) => {
        if (!cancelled) setFormatSupport(r);
      })
      .catch(() => {
        if (!cancelled) setFormatSupport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tierVideo]);
  const confiancaDoFormato = formatSupport?.perPlatformConfidence?.[publishPlatform] ?? null;

  /**
   * AVATAR DESTE VÍDEO — bloco independente do Passo 1, EM PREPARAÇÃO.
   *
   * Não lê nem escreve `AvatarSetupStep.tsx`/`wizard.avatarId`: estado,
   * fonte de dados e handlers são próprios deste bloco. A lista de avatares
   * reaproveita a MESMA fonte que o Passo 1 usa (`GET /avatars`) — mas em
   * leitura própria, não o componente. A seleção (Simples) e o upload
   * (Normal/Premium) não persistem e não entram no corpo de `POST /videos`:
   * não há hoje, em nenhum dos dois caminhos (HeyGen ou fal), uma segunda
   * forma de resolver "qual avatar" fora do Passo 1 — ver a investigação
   * registrada no ponto de retomada desta linha de trabalho. Sem guarda
   * nova de propósito: sem destino real, não há o que a guarda testasse.
   */
  const [avatarsDoVideo, setAvatarsDoVideo] = useState<Avatar[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get<Avatar[]>("/avatars")
      .then((r) => {
        if (!cancelled) setAvatarsDoVideo(r);
      })
      .catch(() => {
        if (!cancelled) setAvatarsDoVideo([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [avatarDesteVideoId, setAvatarDesteVideoId] = useState<string | null>(null);
  const [personagemImagemNome, setPersonagemImagemNome] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarId) {
      setLooks(null);
      return;
    }
    let cancelled = false;
    api
      .get<LooksResponse>(`/avatars/${avatarId}/looks`)
      .then((r) => {
        if (!cancelled) setLooks(r);
      })
      // Falha de leitura vira "um look só", que é o mesmo estado de quem não
      // tem trajes: o passo inteiro não pode travar pelo controle menos
      // importante dele.
      .catch(() => {
        if (!cancelled)
          setLooks({ looks: [], pendentes: [], canChoose: false, simulated: false, lookCost: { units: 0, usd: 0 } });
      });
    return () => {
      cancelled = true;
    };
  }, [avatarId]);

  async function handleImageUpload(file: File) {
    setUploadError(null);
    // Validação LOCAL antes de qualquer rede: tipo e tamanho. O servidor
    // continua sendo quem recusa de verdade (ele confere os bytes), mas
    // mandar 40 MB para receber um 413 gasta a banda de quem está numa
    // conexão ruim, que é justamente quem menos pode pagar por isso.
    if (!file.type.startsWith("image/")) {
      setUploadError(t("createVideo.scene.backgroundNotImage"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(
        t("createVideo.avatarSetup.imageTooLarge", {
          size: formatBytes(file.size),
          max: formatBytes(MAX_IMAGE_BYTES),
        }),
      );
      return;
    }
    try {
      const { url } = await api.upload<{ url: string }>("/uploads", file, file.name);
      onBackgroundChange({ type: "image", value: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  const listaLooks = looks?.looks ?? [];
  const podeEscolherLook = looks?.canChoose === true;

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.scene.title")}</div>

      {/* O NÍVEL — BLOCO A, movido de GenerateStep.tsx para a Cena: o
          usuário escolhe o tipo de vídeo antes do resto da tela, porque é
          o campo que mais muda o custo e o bloco "avatar deste vídeo" logo
          abaixo depende dele. Três cartões, sem nome de plataforma nenhum. */}
      <fieldset className="tier-choice" style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend style={{ fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 6 }}>
          {t("createVideo.generate.tierLabel")}
        </legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TIER_OPTIONS.map((opt) => {
            // "simples" exige heygen; "normal"/"premium" exigem fal —
            // Fase C. Os dois sentidos importam: um tenant fal-only não
            // vê "Simples" clicável, e um heygen-only não vê
            // "Normal"/"Premium" clicáveis.
            const indisponivel = opt.value === "simples" ? !podeEscolherSimples : !podeEscolherFal;
            return (
              <button
                key={opt.value}
                type="button"
                className={tierVideo === opt.value ? "btn btn-primary" : "btn btn-outline"}
                aria-pressed={tierVideo === opt.value}
                onClick={() => onTierVideoChange(opt.value)}
                disabled={indisponivel}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 120 }}
              >
                <span>{t(`createVideo.generate.tier.${opt.value}`)}</span>
                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{opt.range}</span>
              </button>
            );
          })}
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
          {t(`createVideo.generate.tierHint.${tierVideo}`)}
        </p>
        {(!podeEscolherSimples || !podeEscolherFal) && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
            {t("createVideo.generate.tierUnavailable")}
          </p>
        )}
        {/* A confiança do FORMATO (escolhido logo abaixo) NESTE tier —
            nunca bloqueia a escolha, só informa o que sustenta a afirmação
            de que ele funciona. */}
        {confiancaDoFormato && (
          <p
            className="text-muted"
            style={{
              fontSize: 12,
              marginTop: 4,
              marginBottom: 0,
              color: confiancaDoFormato === "unverified" ? "var(--color-danger, #b42318)" : undefined,
            }}
          >
            {t(`createVideo.generate.formatConfidence.${confiancaDoFormato}`)}
          </p>
        )}
      </fieldset>

      {/* ------------------------------------------- AVATAR DESTE VÍDEO */}
      <Field label={t("createVideo.scene.videoAvatarLabel")} help={t("createVideo.scene.videoAvatarHelp")}>
        {tierVideo === "simples" ? (
          <select
            value={avatarDesteVideoId ?? ""}
            onChange={(e) => setAvatarDesteVideoId(e.target.value || null)}
          >
            <option value="">{t("createVideo.scene.videoAvatarDefault")}</option>
            {avatarsDoVideo.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPersonagemImagemNome(e.target.files?.[0]?.name ?? null)}
          />
        )}
        {personagemImagemNome && tierVideo !== "simples" && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            {personagemImagemNome}
          </p>
        )}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
          {t("createVideo.scene.videoAvatarPreparing")}
        </p>
      </Field>

      {/* ---------------------------------------------------------- FUNDO */}
      <Field label={t("createVideo.scene.backgroundLabel")} help={t("createVideo.scene.backgroundHelp")}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`chip${background === null ? " selected" : ""}`}
            onClick={() => onBackgroundChange(null)}
          >
            {t("createVideo.scene.backgroundNone")}
          </button>
          <button
            type="button"
            className={`chip${background?.type === "color" ? " selected" : ""}`}
            onClick={() => onBackgroundChange({ type: "color", value: background?.type === "color" ? background.value : "#1B2A4A" })}
          >
            {t("createVideo.scene.backgroundColor")}
          </button>
          <label className={`chip${background?.type === "image" ? " selected" : ""}`}>
            {t("createVideo.scene.backgroundImage")}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file);
              }}
            />
          </label>
        </div>

        {background?.type === "color" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <input
              type="color"
              value={background.value}
              onChange={(e) => onBackgroundChange({ type: "color", value: e.target.value })}
              aria-label={t("createVideo.scene.backgroundColor")}
            />
            <code style={{ fontSize: 13 }}>{background.value}</code>
          </div>
        )}

        {/* PRÉVIA do que foi escolhido. Um fundo escolhido e não mostrado é
            indistinguível de nenhum fundo — e foi assim que a escolha anterior
            passou semanas sem que ninguém notasse que ela não chegava. */}
        {background?.type === "image" && (
          <div style={{ marginTop: 10 }}>
            <img
              src={background.value}
              alt={t("createVideo.scene.backgroundPreview")}
              style={{ maxWidth: 220, borderRadius: "var(--radius-card)", display: "block" }}
            />
          </div>
        )}

        {uploadError && (
          <p className="alert-error" style={{ fontSize: 13, marginTop: 8 }}>
            {uploadError}
          </p>
        )}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t("createVideo.scene.backgroundNoVideo")}
        </p>
      </Field>

      {/* -------------------------------------------------- INTERPRETAÇÃO */}
      <Field
        label={t("createVideo.scene.motionLabel")}
        help={t("createVideo.scene.motionHelp")}
        helpPrompt={t("createVideo.scene.motionHelpPrompt")}
      >
        <textarea
          rows={4}
          value={motionPrompt}
          maxLength={MOTION_PROMPT_MAX}
          placeholder={t("createVideo.scene.motionPlaceholder")}
          onChange={(e) => onMotionPromptChange(e.target.value)}
        />
        <div className="text-muted" style={{ fontSize: 12, textAlign: "right" }}>
          {t("createVideo.scene.motionCounter", { used: motionPrompt.length, max: MOTION_PROMPT_MAX })}
        </div>
        {/* A procedência do conselho, escrita. O fornecedor publica UM exemplo
            de cinco palavras e nenhuma regra de escrita; tudo o que está no
            texto de ajuda é recomendação nossa, e dizer isso é o que impede a
            tela de emprestar autoridade que ela não tem. */}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
          {t("createVideo.scene.motionOurAdvice")}
        </p>
      </Field>

      <Field label={t("createVideo.scene.expressivenessLabel")} help={t("createVideo.scene.expressivenessHelp")}>
        {/* Clicar SEMPRE fixa o nível clicado, e reclicar o que já está
            selecionado deixa o valor onde estava. A forma anterior
            (`expressiveness === nivel ? null : nivel`) devolvia o estado a
            `null` — o mesmo defeito do Gap 1 entrando pela porta da interação:
            `avatarProvider.ts:632` só inclui `expressiveness` quando há valor,
            e o fornecedor aplica "low" em silêncio. Sem ramo não há como
            produzir `null`. */}
        <div className="chip-group">
          {EXPRESSIVENESS.map((nivel) => (
            <button
              key={nivel}
              type="button"
              className={`chip${expressiveness === nivel ? " selected" : ""}`}
              onClick={() => onExpressivenessChange(nivel)}
            >
              {t(`createVideo.scene.expressiveness_${nivel}`)}
            </button>
          ))}
        </div>
      </Field>

      {/* ---------------------------------------------------------- TRAJE */}
      <Field label={t("createVideo.scene.lookLabel")} help={t("createVideo.scene.lookHelp")}>
        <select
          value={avatarLookId ?? ""}
          disabled={!podeEscolherLook}
          onChange={(e) => onAvatarLookChange(e.target.value || null)}
        >
          <option value="">{t("createVideo.scene.lookDefault")}</option>
          {listaLooks.map((look) => (
            <option key={look.id} value={look.id}>
              {look.name}
            </option>
          ))}
        </select>
        {!podeEscolherLook && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            {t("createVideo.scene.lookSingle")}
          </p>
        )}
      </Field>

      {/* -------------------------------------------------------- FORMATO */}
      <PublishStep platform={publishPlatform} onChange={onPublishPlatformChange} />
    </div>
  );
}
