import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { Field } from "../../../components/ui/Field";
import { PublishStep } from "./PublishStep";
import type { WizardState } from "../types";
import type { Credential } from "../../../types";

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
 * O passo CENA: nível do vídeo, cenário/traje deste vídeo, interpretação e
 * formato.
 *
 * "Fundo" (background.type) e o dropdown "Traje" (avatar_look_id, o LOOK
 * pago do HeyGen) saíram em 25/08 — são conceitos de CONFIGURAÇÃO DO
 * AVATAR (Passo 1), não do vídeo, e nenhum dos dois é obrigatório no
 * payload do tier Simples (`buildHeygenVideoPayload`,
 * `providerAvatarIdParaGeracao`, confirmado por leitura antes da remoção).
 * "Cenário" e "Traje" (novos) são blocos EM PREPARAÇÃO, independentes do
 * Passo 1, sem persistência e sem entrar no corpo de `POST /videos` —
 * decisão registrada, aguardando o operador decidir a ligação funcional
 * depois de ver na tela.
 *
 * "AVATAR DESTE VÍDEO" saiu em 25/08 — não tinha razão de existir em
 * NENHUM nível: o avatar já é escolhido/criado no Passo 1, e este bloco (só
 * decorativo, "Em preparação: esta escolha ainda não entra no vídeo
 * gerado") não tinha consumidor em lugar nenhum — confirmado por grep no
 * repositório inteiro antes da remoção (`avatarDesteVideoId`,
 * `personagemImagemNome`, `avatarsDoVideo`: zero ocorrência fora deste
 * arquivo, e zero em `backend/src`).
 *
 * O que continua indo ao fornecedor:
 *
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
  motionPrompt,
  onMotionPromptChange,
  expressiveness,
  onExpressivenessChange,
  publishPlatform,
  onPublishPlatformChange,
  tierVideo,
  onTierVideoChange,
  targetDurationSeconds,
}: {
  motionPrompt: string;
  onMotionPromptChange: (value: string) => void;
  expressiveness: WizardState["expressiveness"];
  onExpressivenessChange: (value: WizardState["expressiveness"]) => void;
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
   * CENÁRIO e TRAJE deste vídeo — estado local, próprio, sem persistência e
   * sem entrar em `corpoDaGeracao`. Upload OU descrição por texto — os dois
   * convivem, não são mutuamente exclusivos, porque nenhum dos dois faz
   * nada ainda.
   */
  const [cenarioImagemNome, setCenarioImagemNome] = useState<string | null>(null);
  const [cenarioPrompt, setCenarioPrompt] = useState("");
  const [trajeImagemNome, setTrajeImagemNome] = useState<string | null>(null);
  const [trajePrompt, setTrajePrompt] = useState("");

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

      {/* -------------------------------------------------------- CENÁRIO */}
      <Field label={t("createVideo.scene.scenarioLabel")} help={t("createVideo.scene.scenarioHelp")}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setCenarioImagemNome(e.target.files?.[0]?.name ?? null)}
        />
        {cenarioImagemNome && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            {cenarioImagemNome}
          </p>
        )}
        <div style={{ marginTop: 10 }}>
          <label className="text-muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            {t("createVideo.scene.scenarioPromptLabel")}
          </label>
          <textarea
            rows={3}
            value={cenarioPrompt}
            placeholder={t("createVideo.scene.scenarioPromptPlaceholder")}
            onChange={(e) => setCenarioPrompt(e.target.value)}
          />
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t("createVideo.scene.scenarioPreparing")}
        </p>
      </Field>

      {/* ---------------------------------------------------------- TRAJE */}
      <Field label={t("createVideo.scene.outfitLabel")} help={t("createVideo.scene.outfitHelp")}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setTrajeImagemNome(e.target.files?.[0]?.name ?? null)}
        />
        {trajeImagemNome && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            {trajeImagemNome}
          </p>
        )}
        <div style={{ marginTop: 10 }}>
          <label className="text-muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            {t("createVideo.scene.outfitPromptLabel")}
          </label>
          <textarea
            rows={3}
            value={trajePrompt}
            placeholder={t("createVideo.scene.outfitPromptPlaceholder")}
            onChange={(e) => setTrajePrompt(e.target.value)}
          />
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t("createVideo.scene.outfitPreparing")}
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

      {/* -------------------------------------------------------- FORMATO */}
      <PublishStep platform={publishPlatform} onChange={onPublishPlatformChange} />
    </div>
  );
}
