/**
 * Registro das chaves DA PLATAFORMA: quais existem, quem cada uma paga, e o
 * que "validar" significa para cada uma.
 *
 * O código declara o conjunto; a tabela `platform_credentials` guarda o valor.
 * Mesma divisão de `featureFlags.ts` — e pela mesma razão: uma chave que só
 * existisse como linha no banco não teria onde registrar POR QUE existe, e o
 * próximo a ler encontraria um segredo sem dono.
 *
 * Não confundir com a credencial BYOK do tenant (`api_credentials`). Aqui a
 * conta é da casa.
 */
import { config } from "../config.js";

export type PlatformCredentialId = "google" | "copilot" | "embedding" | "heygen" | "elevenlabs" | "fal";

/**
 * Como a credencial é validada. Nenhuma destas formas gera nada:
 *
 *  - `gemini_list_models`  → GET .../v1beta/models?key=…
 *  - `anthropic_list_models` → GET https://api.anthropic.com/v1/models
 *  - `heygen_quota`        → GET /v2/user/remaining_quota
 *  - `elevenlabs_voices`   → GET /v1/voices
 *
 * A escolha de ListModels para as duas chaves Google é deliberada: ele aceita
 * ou recusa a chave sem consumir a cota de `generateContent`, que no free tier
 * é de ~20 requisições por dia e é a mesma cota do suporte. Validar uma chave
 * não pode custar uma pergunta de cliente.
 */
export type PlatformValidationKind =
  | "gemini_list_models"
  | "anthropic_list_models"
  | "heygen_quota"
  | "elevenlabs_voices";

export interface PlatformCredentialDef {
  id: PlatformCredentialId;
  /** Nome da variável de ambiente equivalente — é a outra origem possível. */
  envVar: string;
  label: string;
  /** Quem consome esta chave hoje. Vazio = armazenada, ainda sem consumidor. */
  servedBy: string;
  /**
   * `null` = sem forma de validação declarada — nunca "esquecemos de
   * escrever uma", e sim "não existe leitura barata a fazer". Hoje só a
   * fal.ai: o fornecedor não expõe endpoint de saldo/cota por chave (ver
   * `providerCost.ts`, comentário de `PRECOS_FAL`), e inventar uma chamada
   * só para validar seria a mesma armadilha que `elevenlabs` já documentou
   * (transformar "sem permissão" em "chave inválida"). A tela mostra "Sem
   * sonda" em vez de um botão que promete o que não pode cumprir —
   * `checkPlatformKeyPolicy.ts` trata `null` como declaração válida, não
   * como lacuna.
   */
  validation: PlatformValidationKind | null;
  /**
   * Se a validação também lê saldo/cota. Quando não lê, `balanceUnavailable`
   * diz por quê — mesmo contrato das feature flags: recurso indisponível
   * aparece com o motivo, nunca some e nunca vira botão que dá erro.
   */
  readsBalance: boolean;
  balanceUnavailable?: string;
  /** Lê a variável de ambiente correspondente. */
  readEnv: () => string | null;
}

export const PLATFORM_CREDENTIALS: Record<PlatformCredentialId, PlatformCredentialDef> = {
  google: {
    id: "google",
    envVar: "PLATFORM_GOOGLE_API_KEY",
    label: "Google (Gemini) — copiloto do cliente",
    // Só o copiloto do tenant, apesar de CLAUDE.md dizer "roteiro e copiloto":
    // conferido nesta rodada, `routes/scripts.ts` ainda lê a credencial BYOK
    // do tenant direto, sem passar por `resolveTenantAiKey`. Corrigir o
    // caminho de roteiro é mudança de comportamento, fora deste bloco.
    servedBy: "copiloto do tenant (o roteiro ainda usa a credencial do cliente)",
    validation: "gemini_list_models",
    readsBalance: false,
    balanceUnavailable:
      "o Google não expõe saldo por chave; a cota aparece só no console de faturamento do projeto.",
    readEnv: () => config.platformGoogleApiKey,
  },
  copilot: {
    id: "copilot",
    envVar: "PLATFORM_COPILOT_API_KEY",
    label: "Anthropic — copiloto público e do admin",
    servedBy: "copiloto público (pré-cadastro) e copiloto interno do admin",
    validation: "anthropic_list_models",
    readsBalance: false,
    balanceUnavailable:
      "a Anthropic não expõe saldo por chave de API; o crédito aparece só no console da conta.",
    readEnv: () => config.platformCopilotApiKey,
  },
  embedding: {
    id: "embedding",
    envVar: "PLATFORM_EMBEDDING_API_KEY",
    label: "Google (Gemini) — embeddings",
    // Separada da de roteiro mesmo sendo o mesmo fornecedor: indexação é
    // consumo em lote com limite diário próprio, e dividir cota com o suporte
    // faria uma reindexação derrubar o copiloto.
    servedBy: "",
    validation: "gemini_list_models",
    readsBalance: false,
    balanceUnavailable: "o Google não expõe saldo por chave.",
    readEnv: () => config.platformEmbeddingApiKey,
  },
  heygen: {
    id: "heygen",
    envVar: "PLATFORM_HEYGEN_API_KEY",
    label: "HeyGen — avatar e vídeo",
    // Decisão do bloco CHAVES-2: armazenar e validar apenas. O caminho de
    // geração continua lendo a credencial BYOK do tenant. Migrar isso muda
    // quem paga a conta, e é outra decisão.
    servedBy: "",
    validation: "heygen_quota",
    readsBalance: true,
    readEnv: () => config.platformHeygenApiKey,
  },
  elevenlabs: {
    id: "elevenlabs",
    envVar: "PLATFORM_ELEVENLABS_API_KEY",
    label: "ElevenLabs — voz",
    servedBy: "",
    validation: "elevenlabs_voices",
    readsBalance: false,
    // O endpoint de cota do ElevenLabs (/v1/user/subscription) exige a
    // permissão `user_read`, que a chave em uso no projeto não tem. Usá-lo
    // para validar transformaria "sem permissão de leitura" em "chave
    // inválida" — um falso negativo — e descobrir a diferença exigiria uma
    // segunda chamada. Validamos por /v1/voices, que é o endpoint que o
    // produto já usa, e declaramos a cota como não lida.
    balanceUnavailable:
      "o endpoint de cota exige a permissão user_read na chave; validar por ele transformaria falta de permissão em chave inválida.",
    readEnv: () => config.platformElevenlabsApiKey,
  },
  fal: {
    id: "fal",
    envVar: "PLATFORM_FAL_API_KEY",
    label: "fal.ai — avatar (imagem/vídeo)",
    // DIFERENTE de heygen/elevenlabs acima: esta É consumida pela geração —
    // `resolveTenantAvatarFalKey` (providers/platformKeys.ts), chamada nos
    // 3 pontos de routes/videos.ts que hoje leem a credencial de avatar
    // (criação, aprovação, recuperação no boot). Precedência: esta chave
    // primeiro, BYOK do tenant (`api_credentials`) como retaguarda — o
    // mesmo desenho de `resolveTenantAiKey`, para o copiloto do tenant.
    servedBy: "geração de vídeo pelo caminho fal (criação, aprovação e recuperação no boot)",
    // Sem forma de validação: a fal.ai não expõe endpoint de saldo/cota por
    // chave (ver PRECOS_FAL em providerCost.ts — "a fal não expõe endpoint
    // de saldo"), e o mesmo vale no nível do tenant (`hasConnectionProbe:
    // false` em providerVendors.ts). Inventar uma chamada só para validar
    // seria medir sem ter medido — o oposto do que este projeto faz.
    validation: null,
    readsBalance: false,
    balanceUnavailable: "a fal.ai não expõe endpoint de saldo/cota por chave.",
    readEnv: () => config.platformFalApiKey,
  },
};

export const PLATFORM_CREDENTIAL_IDS = Object.keys(PLATFORM_CREDENTIALS) as PlatformCredentialId[];

export function isPlatformCredentialId(value: string): value is PlatformCredentialId {
  return (PLATFORM_CREDENTIAL_IDS as string[]).includes(value);
}

/** Os 4 últimos caracteres da chave em claro, como gravados na escrita. */
export function lastFourOf(plaintext: string): string {
  return plaintext.length <= 4 ? plaintext : plaintext.slice(-4);
}
