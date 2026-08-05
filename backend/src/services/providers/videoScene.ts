/**
 * A CENA: fundo, interpretação e motor. O vocabulário do que o usuário escolhe
 * e que precisa chegar ao fornecedor.
 *
 * Existe separado de `videoFormat.ts` porque formato é geometria (proporção e
 * resolução, derivadas da plataforma) e cena é conteúdo (o que aparece atrás da
 * pessoa e como ela se move). Misturá-los faria a escolha de plataforma mexer
 * no fundo.
 *
 * ---------------------------------------------------------------------------
 * O QUE O FORNECEDOR ACEITA — LEVANTADO POR GET EM 05/08, SEM GERAR NADA
 *
 *   background.type   →  "color" | "image"      ← **não existe "video"**
 *   motion_prompt     →  texto livre
 *   expressiveness    →  "low" | "medium" | "high"  (avatares de FOTO)
 *   engine.type       →  "avatar_iii" | "avatar_iv" | "avatar_v"
 *
 * Fundo por VÍDEO foi pedido como requisito de produto e **não tem campo**: o
 * schema `BackgroundSetting` enumera dois valores, e a composição de cena
 * (`studio`) declara aceitar apenas cor sólida. Não há o que enviar, e inventar
 * um campo é o defeito que este projeto já pagou uma vez — cenário e traje
 * foram coletados por semanas e morriam no call site. Aqui a ausência é
 * declarada, não silenciosa.
 *
 * `avatar_v` está no vocabulário porque o fornecedor o documenta, e NÃO na
 * escolha oferecida: ele exige avatar do tipo `digital_twin`, e o avatar deste
 * produto é de FOTO (medido: aparece em `talking_photos`, nunca em `avatars`).
 * Ele também não documenta entrada por faixa de áudio — e a voz clonada do
 * ElevenLabs é justamente o que dirige a geração aqui.
 * ---------------------------------------------------------------------------
 */

/** Níveis que o fornecedor documenta. Ordem do menos ao mais expressivo. */
export const EXPRESSIVENESS_LEVELS = ["low", "medium", "high"] as const;
export type Expressiveness = (typeof EXPRESSIVENESS_LEVELS)[number];

/**
 * Default do PRÓPRIO fornecedor (`"Defaults to low"`), repetido aqui para que a
 * tela mostre selecionado o que de fato acontece quando ninguém escolhe.
 */
export const DEFAULT_EXPRESSIVENESS: Expressiveness = "low";

export type SceneBackground =
  | { type: "color"; value: string }
  /** `uploadUrl` é o caminho NOSSO (`/uploads/...`); o asset do fornecedor é resolvido na geração. */
  | { type: "image"; uploadUrl: string };

/**
 * Cor de fundo em hexadecimal de 6 dígitos, com `#`.
 *
 * Estrita de propósito: `#fff` e `red` são aceitos por navegador e recusados
 * por API, e a recusa chegaria como 4xx genérico depois de o crédito já ter
 * sido debitado — o débito acontece antes da chamada.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX.test(value);
}

/** Extensões que o fornecedor aceita como imagem de fundo. */
export const BACKGROUND_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface SceneInput {
  background?: SceneBackground | null;
  /** Texto livre de movimento. Vazio vira AUSÊNCIA, nunca string vazia. */
  motionPrompt?: string | null;
  expressiveness?: Expressiveness | null;
}

export function isExpressiveness(value: unknown): value is Expressiveness {
  return typeof value === "string" && (EXPRESSIVENESS_LEVELS as readonly string[]).includes(value);
}

/**
 * Normaliza o que veio da tela para o que pode ir ao fornecedor.
 *
 * **Campo vazio não é campo.** Um `motion_prompt: ""` é uma instrução de
 * movimento vazia, e não a ausência de instrução: o fornecedor pode interpretar
 * os dois de formas diferentes, e nós não temos como saber qual — nenhuma
 * geração nossa jamais enviou o campo. Na dúvida, não mandar é o único lado
 * reversível.
 */
export function normalizeScene(input: SceneInput): SceneInput {
  const motion = input.motionPrompt?.trim();
  const background =
    input.background && input.background.type === "color"
      ? isValidHexColor(input.background.value)
        ? input.background
        : null
      : input.background ?? null;

  return {
    background: background ?? null,
    motionPrompt: motion ? motion : null,
    expressiveness: isExpressiveness(input.expressiveness) ? input.expressiveness : null,
  };
}
