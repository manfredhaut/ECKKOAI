import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { MAX_IMAGE_BYTES, formatBytes } from "../../../uploadLimits";
import { Field } from "../../../components/ui/Field";
import { PublishStep } from "./PublishStep";
import type { SceneBackground, WizardState } from "../types";
import type { AvatarLooksResponse, Credential } from "../../../types";

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
 * O passo CENA: nível do vídeo, fundo/traje NATIVOS do HeyGen, cenário deste
 * vídeo (fal), traje deste vídeo (decorativo, fal), interpretação e formato.
 *
 * "Fundo" (background.type) e o dropdown "Traje" (avatar_look_id, o LOOK
 * pago do HeyGen) saíram em 25/08 e VOLTAM em EXECUÇÃO (27/08) — o backend
 * nunca deixou de suportar os dois (`buildHeygenVideoPayload`,
 * `providerAvatarIdParaGeracao`, confirmados por leitura nesta rodada); o que
 * faltava era só a UI que escreve `wizard.background`/`wizard.avatarLookId`,
 * já consumidos por `corpoDaGeracao()` em GenerateStep.tsx.
 *
 * OS DOIS SÓ VALEM NO TIER SIMPLES (HeyGen) — decisão desta rodada, não do
 * texto antigo. `providerAvatarId`/`background` não são lidos em NENHUM
 * lugar de `generateVideoFal` (confirmado por leitura); mostrá-los sempre
 * repetiria a classe de defeito que este projeto já pagou várias vezes —
 * campo preenchido na tela, descartado em silêncio pelo servidor. Nos
 * outros tiers, um aviso explica onde cenário/traje realmente entram.
 *
 * CENÁRIO virou campo REAL em 27/08 — deixou de ser decorativo e saiu do
 * Passo 1 (onde era "padrão do avatar", editável só lá). TRAJE seguiu o
 * MESMO caminho em 28/08 — era decorativo aqui (texto "Em preparação"), e o
 * Passo 1 tinha voltado a mantê-lo como identidade fixa do avatar numa
 * decisão que a própria sessão revogou na mesma rodada que tirou Cenário de
 * lá. Os dois campos aceitam imagem (upload) e texto (Gerar via IA) desde
 * as migrations 002/010 (`videos.scenario`/`scenario_prompt`/`outfit`/
 * `outfit_prompt`); só a UI vivia no lugar errado. O valor salvo no avatar
 * migra para cá como semente inicial — ver `WizardState.scenario`/`outfit`
 * em `types.ts` e `handleSceneDefaultsSeed` em `CreateVideoPage.tsx`.
 *
 * "AVATAR DESTE VÍDEO" saiu em 25/08 e CONTINUA fora — não tinha razão de
 * existir em NENHUM nível: o avatar já é escolhido/criado no Passo 1.
 *
 * O que vai ao fornecedor, hoje:
 *
 *   fundo          →  background.type "color" | "image"     (só tier Simples)
 *   traje (look)   →  qual look entra em avatar_id            (só tier Simples)
 *   cenário        →  scenario (imagem) + scenario_prompt (texto)
 *   traje          →  outfit (imagem) + outfit_prompt (texto)
 *   interpretação  →  motion_prompt + expressiveness
 *   formato        →  aspect_ratio + resolution
 */

const EXPRESSIVENESS = ["low", "medium", "high"] as const;

/**
 * Os TRÊS níveis — BLOCO A. Nomes de plataforma nunca aparecem aqui, só nos
 * comentários do código: o rótulo e a chave de tradução.
 *
 * O PREÇO ao lado de cada nível NÃO é literal — Fase A, item 2 (25/08),
 * fecha o defeito A3 do BACKLOG: era `range: "US$ 14,19"`, uma string fixa
 * que citava "30s de referência" enquanto o teto real do Premium é 15s, e
 * não reagia a nada. Agora vem de `GET /video-cost-reference?tier=…`
 * (`tierCosts`, abaixo) — a duração-alvo escolhida no Roteiro quando
 * existe, ou o teto real do tier quando ainda não há uma, resolvido pela
 * MESMA `estimateVideoCost` do resto do produto.
 */
const TIER_OPTIONS: { value: "simples" | "normal" | "premium" }[] = [
  { value: "simples" },
  { value: "normal" },
  { value: "premium" },
];

/** Resposta de `GET /video-cost-reference?tier=…[&targetSeconds=…]`. */
interface CostReferenceResponse {
  maxReachableSeconds: number;
  target: {
    seconds: number;
    costUsd: number | null;
    costUnknownReason: string | null;
    unavailableForTier: boolean;
  };
}

/**
 * Teto do texto de interpretação.
 *
 * NOSSO, não do fornecedor: a documentação dele não declara limite nenhum para
 * `motion_prompt`, e o único exemplo publicado tem cinco palavras. O contador
 * existe para dar noção de tamanho, e o número é redondo justamente porque não
 * está medindo nada do outro lado.
 */
const MOTION_PROMPT_MAX = 600;

export function SceneStep({
  avatarId,
  background,
  onBackgroundChange,
  scenario,
  onScenarioChange,
  scenarioPrompt,
  onScenarioPromptChange,
  outfit,
  onOutfitChange,
  outfitPrompt,
  onOutfitPromptChange,
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
  targetDurationSeconds,
}: {
  /** O avatar do Passo 1 — usado só para buscar os looks dele (`/avatars/:id/looks`). */
  avatarId: string | null;
  background: SceneBackground | null;
  onBackgroundChange: (value: SceneBackground | null) => void;
  /** URL da imagem de cenário deste vídeo (upload), ou `null` sem escolha. */
  scenario: string | null;
  onScenarioChange: (value: string | null) => void;
  scenarioPrompt: string | null;
  onScenarioPromptChange: (value: string | null) => void;
  /** URL da imagem de traje deste vídeo (upload), ou `null` sem escolha. */
  outfit: string | null;
  onOutfitChange: (value: string | null) => void;
  outfitPrompt: string | null;
  onOutfitPromptChange: (value: string | null) => void;
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
  /**
   * A duração-alvo do passo Roteiro (15/30/45/60 s, ou `null` para "mais"
   * sem número digitado). Fase A, item 2: alimenta o preço de cada cartão
   * de nível via `GET /video-cost-reference?targetSeconds=…` — nunca
   * recalculado aqui, só repassado.
   */
  targetDurationSeconds: number | null;
}) {
  const { t } = useTranslation();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [looks, setLooks] = useState<AvatarLooksResponse | null>(null);

  useEffect(() => {
    if (!avatarId) {
      setLooks(null);
      return;
    }
    let cancelado = false;
    api
      .get<AvatarLooksResponse>(`/avatars/${avatarId}/looks`)
      .then((r) => {
        if (!cancelado) setLooks(r);
      })
      // Falha de leitura vira "um look só", que é o mesmo estado de quem não
      // tem trajes: o passo inteiro não pode travar pelo controle menos
      // importante dele.
      .catch(() => {
        if (!cancelado)
          setLooks({ looks: [], pendentes: [], canChoose: false, simulated: false, lookCost: { units: 0, usd: 0 } });
      });
    return () => {
      cancelado = true;
    };
  }, [avatarId]);

  async function handleBackgroundImageUpload(file: File) {
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
  const podeEscolherLookExistente = looks?.canChoose === true;

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

  /**
   * QUANTOS grupos de vendor estão bloqueados — Fase A, item 1 (25/08),
   * fecha o defeito A2 do BACKLOG (movido de GenerateStep.tsx para cá no
   * mesmo commit que moveu os cartões de nível). Antes disto a legenda só
   * sabia SE havia bloqueio (um OR), e dizia sempre "Um dos níveis..." mesmo
   * quando os DOIS grupos (heygen e fal) estavam indisponíveis — o que
   * bloqueia os 3 cartões inteiros, não um.
   */
  const gruposIndisponiveisCount = [!podeEscolherSimples, !podeEscolherFal].filter(Boolean).length;

  /**
   * O PREÇO de cada cartão de nível — Fase A, item 2 (25/08), fecha o
   * defeito A3. Uma chamada por tier a `GET /video-cost-reference`, a MESMA
   * rota que `DurationCostReference.tsx` já usa no passo Roteiro — nenhum
   * estimador novo. Refeita quando a duração-alvo muda, porque é ela que
   * decide o ponto: com alvo, o preço É o daquela duração; sem alvo, é o
   * preço no teto REAL do tier (nunca um número inventado).
   */
  const [tierCosts, setTierCosts] = useState<Partial<Record<"simples" | "normal" | "premium", CostReferenceResponse>>>(
    {},
  );
  useEffect(() => {
    let cancelled = false;
    const alvo = targetDurationSeconds != null ? `&targetSeconds=${targetDurationSeconds}` : "";
    Promise.all(
      TIER_OPTIONS.map((opt) =>
        api
          .get<CostReferenceResponse>(`/video-cost-reference?tier=${opt.value}${alvo}`)
          .then((r) => [opt.value, r] as const)
          .catch(() => [opt.value, null] as const),
      ),
    ).then((entradas) => {
      if (cancelled) return;
      const proximo: Partial<Record<"simples" | "normal" | "premium", CostReferenceResponse>> = {};
      for (const [tier, resposta] of entradas) {
        if (resposta) proximo[tier] = resposta;
      }
      setTierCosts(proximo);
    });
    return () => {
      cancelled = true;
    };
  }, [targetDurationSeconds]);

  /** Texto do preço no cartão — "sem medição" ou "não alcança este nível" nunca viram um número mudo. */
  function precoDoCartao(tier: "simples" | "normal" | "premium"): string {
    const info = tierCosts[tier];
    if (!info) return "";
    const { target } = info;
    if (target.unavailableForTier) {
      return t("createVideo.script.costReference.unavailableForTier", { max: info.maxReachableSeconds });
    }
    if (target.costUsd == null) return t("createVideo.cost.notMeasured");
    return `US$ ${target.costUsd.toFixed(2).replace(".", ",")} (${target.seconds.toFixed(0)} s)`;
  }

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
   * O 4:5 (`instagram_feed`) não existe no enum de `aspect_ratio` do Wan
   * (`wan/v2.6/reference-to-video/flash`, MEDIDO por leitura do schema no
   * V24) — V25, 31/08/2026. Se alguém escolheu 4:5 num tier onde ele era
   * válido (Simples/Premium) e depois troca para Normal, a seleção velha não
   * pode sobreviver: sem isto, o PublishStep bloqueia o CLIQUE no chip, mas
   * o valor já escolhido continuaria no `wizard` e chegaria a `POST /videos`
   * do mesmo jeito — o mesmo defeito de "campo escolhido, não gateado no
   * envio" que este projeto já pagou (Fundo/Look, antes de ganharem gate).
   * Troca para "9:16" (o único formato com medição real neste tier, ver
   * `VENDOR_FORMAT_SUPPORT.fal` em videoFormat.ts) — nunca silencioso: o chip
   * destacado na tela muda junto.
   */
  useEffect(() => {
    if (tierVideo === "normal" && publishPlatform === "instagram_feed") {
      onPublishPlatformChange("reels_tiktok");
    }
  }, [tierVideo, publishPlatform, onPublishPlatformChange]);

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

  const scenarioFileInput = useRef<HTMLInputElement | null>(null);
  const [scenarioUploadError, setScenarioUploadError] = useState<string | null>(null);

  async function handleScenarioImageUpload(file: File) {
    setScenarioUploadError(null);
    if (!file.type.startsWith("image/")) {
      setScenarioUploadError(t("createVideo.scene.backgroundNotImage"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setScenarioUploadError(
        t("createVideo.avatarSetup.imageTooLarge", {
          size: formatBytes(file.size),
          max: formatBytes(MAX_IMAGE_BYTES),
        }),
      );
      return;
    }
    try {
      const { url } = await api.upload<{ url: string }>("/uploads", file, file.name);
      onScenarioChange(url);
    } catch (err) {
      setScenarioUploadError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  // TRAJE deste vídeo — MESMO mecanismo do Cenário acima, campo por campo.
  // Virou real nesta rodada (28/08), seguindo Cenário (27/08) à risca.
  const outfitFileInput = useRef<HTMLInputElement | null>(null);
  const [outfitUploadError, setOutfitUploadError] = useState<string | null>(null);

  async function handleOutfitImageUpload(file: File) {
    setOutfitUploadError(null);
    if (!file.type.startsWith("image/")) {
      setOutfitUploadError(t("createVideo.scene.backgroundNotImage"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setOutfitUploadError(
        t("createVideo.avatarSetup.imageTooLarge", {
          size: formatBytes(file.size),
          max: formatBytes(MAX_IMAGE_BYTES),
        }),
      );
      return;
    }
    try {
      const { url } = await api.upload<{ url: string }>("/uploads", file, file.name);
      onOutfitChange(url);
    } catch (err) {
      setOutfitUploadError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.scene.title")}</div>

      {/* O NÍVEL — BLOCO A, movido de GenerateStep.tsx para a Cena: o
          usuário escolhe o tipo de vídeo antes do resto da tela, porque é
          o campo que mais muda o custo. Três cartões, sem nome de
          plataforma nenhum. */}
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
                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{precoDoCartao(opt.value)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
          {t(`createVideo.generate.tierHint.${tierVideo}`)}
        </p>
        {gruposIndisponiveisCount > 0 && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
            {t(
              gruposIndisponiveisCount > 1
                ? "createVideo.generate.tierAllUnavailable"
                : "createVideo.generate.tierUnavailable",
            )}
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

      {/* ---------------------------------------------------------- FUNDO */}
      {/* NATIVO do HeyGen — só vale no tier Simples (ver o comentário do
          topo do arquivo). Nos outros tiers, um aviso substitui o controle
          em vez de deixá-lo visível e inerte: campo preenchido que o
          servidor descarta em silêncio é a classe de defeito que este
          projeto já pagou várias vezes. */}
      {tierVideo === "simples" ? (
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
              onClick={() =>
                onBackgroundChange({ type: "color", value: background?.type === "color" ? background.value : "#1B2A4A" })
              }
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
                  if (file) void handleBackgroundImageUpload(file);
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
              indistinguível de nenhum fundo. */}
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
        </Field>
      ) : (
        <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {t("createVideo.scene.backgroundTierNotice")}
        </p>
      )}

      {/* ---------------------------------------------------------- TRAJE (LOOK) */}
      {/* Mesma regra do Fundo: só vale no tier Simples. `providerAvatarId`
          nunca é lido em `generateVideoFal` — confirmado por leitura. */}
      {tierVideo === "simples" ? (
        <Field label={t("createVideo.scene.lookLabel")} help={t("createVideo.scene.lookHelp")}>
          <select
            value={avatarLookId ?? ""}
            disabled={!podeEscolherLookExistente}
            onChange={(e) => onAvatarLookChange(e.target.value || null)}
          >
            <option value="">{t("createVideo.scene.lookDefault")}</option>
            {listaLooks.map((look) => (
              <option key={look.id} value={look.id}>
                {look.name}
              </option>
            ))}
          </select>
          {!podeEscolherLookExistente && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              {t("createVideo.scene.lookSingle")}
            </p>
          )}
        </Field>
      ) : (
        <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {t("createVideo.scene.lookTierNotice")}
        </p>
      )}

      {/* -------------------------------------------------------- CENÁRIO */}
      {/* REAL desde esta rodada — deixou de ser decorativo e saiu do Passo 1
          (onde era "Cenário padrão" do avatar, editável só lá). Upload OU
          texto (Gerar via IA), os dois convivem — vão como `scenario`
          (imagem) e `scenario_prompt` (texto) no corpo de `POST /videos`,
          que já aceita os dois desde as migrations 002/010. */}
      <Field label={t("createVideo.scene.scenarioLabel")} help={t("createVideo.scene.scenarioHelp")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={() => scenarioFileInput.current?.click()}>
            {t("createVideo.avatarSetup.chooseFile")}
          </button>
          {scenario && (
            <button type="button" className="btn btn-outline" onClick={() => onScenarioChange(null)}>
              {t("createVideo.avatarSetup.removeImage")}
            </button>
          )}
          <input
            ref={scenarioFileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleScenarioImageUpload(file);
            }}
          />
        </div>
        {scenario && (
          <div style={{ marginTop: 10 }}>
            <img
              src={scenario}
              alt={t("createVideo.scene.scenarioLabel")}
              style={{ maxWidth: 220, borderRadius: "var(--radius-card)", display: "block" }}
            />
          </div>
        )}
        {scenarioUploadError && (
          <p className="alert-error" style={{ fontSize: 13, marginTop: 8 }}>
            {scenarioUploadError}
          </p>
        )}
        <div style={{ marginTop: 10 }}>
          <label className="text-muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            {t("createVideo.scene.scenarioPromptLabel")}
          </label>
          <textarea
            rows={3}
            value={scenarioPrompt ?? ""}
            placeholder={t("createVideo.scene.scenarioPromptPlaceholder")}
            onChange={(e) => onScenarioPromptChange(e.target.value || null)}
          />
        </div>
      </Field>

      {/* ---------------------------------------------------------- TRAJE */}
      {/* REAL desde esta rodada (28/08) — seguiu Cenário à risca, saindo do
          Passo 1 (onde tinha voltado a ser "Traje padrão", identidade fixa
          do avatar — decisão revogada). Upload OU texto (Gerar via IA), os
          dois convivem — vão como `outfit` (imagem) e `outfit_prompt`
          (texto) no corpo de `POST /videos`, que já aceita os dois desde as
          migrations 002/010. */}
      <Field label={t("createVideo.scene.outfitLabel")} help={t("createVideo.scene.outfitHelp")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={() => outfitFileInput.current?.click()}>
            {t("createVideo.avatarSetup.chooseFile")}
          </button>
          {outfit && (
            <button type="button" className="btn btn-outline" onClick={() => onOutfitChange(null)}>
              {t("createVideo.avatarSetup.removeImage")}
            </button>
          )}
          <input
            ref={outfitFileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleOutfitImageUpload(file);
            }}
          />
        </div>
        {outfit && (
          <div style={{ marginTop: 10 }}>
            <img
              src={outfit}
              alt={t("createVideo.scene.outfitLabel")}
              style={{ maxWidth: 220, borderRadius: "var(--radius-card)", display: "block" }}
            />
          </div>
        )}
        {outfitUploadError && (
          <p className="alert-error" style={{ fontSize: 13, marginTop: 8 }}>
            {outfitUploadError}
          </p>
        )}
        <div style={{ marginTop: 10 }}>
          <label className="text-muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            {t("createVideo.scene.outfitPromptLabel")}
          </label>
          <textarea
            rows={3}
            value={outfitPrompt ?? ""}
            placeholder={t("createVideo.scene.outfitPromptPlaceholder")}
            onChange={(e) => onOutfitPromptChange(e.target.value || null)}
          />
        </div>
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

      {/* -------------------------------------------------------- FORMATO */}
      <PublishStep platform={publishPlatform} onChange={onPublishPlatformChange} tierVideo={tierVideo} />
    </div>
  );
}
