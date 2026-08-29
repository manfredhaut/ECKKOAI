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
 * A frase de INTERPRETAÇÃO que representa cada nível de Expressividade, para
 * motores que não têm campo estruturado `expressiveness` — Wan e Seedance
 * (tier Normal/Premium). BLOCO EXPRESSIVIDADE-FAL, 28/08/2026.
 *
 * ┌─ Por que isto precisa existir, em uma frase ─────────────────────────────┐
 * │ `expressiveness` só é lido pelo caminho HeyGen                          │
 * │ (`buildHeygenVideoPayload`, avatarProvider.ts), condicional a           │
 * │ `motorEfetivo === "avatar_iv"`. O Wan e o Seedance não têm esse campo no │
 * │ schema — a única forma de o nível chegar até eles é como TEXTO dentro   │
 * │ do prompt de direção, o mesmo canal que já carrega câmera/gesto/mão.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Em INGLÊS — o mesmo idioma de `promptDeDirecao` (`comDefaultsDeDirecao`,
 * falPipeline.ts), que chega já traduzido pela rota.
 *
 * `null`/inválido devolve string vazia: um vídeo sem expressividade
 * escolhida não ganha uma frase inventada — mesma regra de "campo vazio não
 * é campo" já usada para `motion_prompt` acima.
 */
export function expressividadeParaDirecao(nivel: string | null | undefined): string {
  if (nivel === "low") return "subtle, restrained facial expressiveness, minimal emotion in delivery";
  if (nivel === "medium") return "natural, moderate facial expressiveness";
  if (nivel === "high") return "highly expressive, animated facial expressions and emotive delivery";
  return "";
}

/**
 * A DIREÇÃO completa que vai ao Wan/Seedance — Interpretação da pessoa +
 * Expressividade, juntas. Extraída como função PURA e exportada
 * separadamente de `routes/videos.ts` (onde é o único chamador de produto)
 * justamente para poder ser exercitada por EXECUÇÃO direta numa guarda, sem
 * precisar subir o Fastify — mesma razão de `expressividadeParaDirecao`
 * viver aqui e não inline na rota.
 */
export function direcaoComExpressividade(motionPrompt: string, expressiveness: string | null | undefined): string {
  return [motionPrompt.trim(), expressividadeParaDirecao(expressiveness)].filter(Boolean).join(". ");
}

/**
 * O prompt de COMPOSIÇÃO (cenário + traje) enviado a `fal-ai/nano-banana-2/edit`
 * no "Refazer", com o feedback da pessoa incorporado — PRIORIDADE 2,
 * 28/08/2026.
 *
 * ┌─ O defeito que isto fecha ────────────────────────────────────────────────┐
 * │ `POST /videos/:id/recompose` já capturava e PERSISTIA o texto de          │
 * │ feedback (`refazer_feedback`, migration 061) — mas só isso: o prompt      │
 * │ enviado à fal continuava sendo `promptDaComposicaoDaLinha(video)` puro,   │
 * │ o MESMO de sempre. A pessoa escrevia "tire os óculos" e a imagem nova     │
 * │ saía idêntica à rejeitada, porque o pedido nunca chegou ao fornecedor —   │
 * │ só ao banco.                                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO recria o prompt do zero: incorpora o feedback como uma instrução
 * ADICIONAL sobre o cenário/traje já existente — "tire os óculos" faz
 * sentido como ajuste de "consultório claro. jaleco branco", não como
 * substituto dele. Sem feedback (recomposição sem texto, ou primeira
 * composição), o comportamento é EXATAMENTE o de antes: só a base.
 */
export function promptDeComposicaoComFeedback(
  promptBase: string,
  feedback: string | null | undefined,
): string {
  const feedbackLimpo = feedback?.trim();
  if (!feedbackLimpo) return promptBase;
  return [promptBase, `Ajuste solicitado pela pessoa: ${feedbackLimpo}`].filter(Boolean).join(". ");
}

/**
 * O prompt de COMPOSIÇÃO amarrado por POSIÇÃO — 29/08/2026.
 *
 * ┌─ Por que isto precisa existir ────────────────────────────────────────────┐
 * │ `fal-ai/nano-banana-2/edit` recebe `image_urls` como LISTA SIMPLES, sem   │
 * │ campo de papel/peso por imagem (documentação oficial da fal, confirmada   │
 * │ nesta rodada) — a única forma de o modelo saber o que cada imagem         │
 * │ REPRESENTA é o texto do prompt dizer explicitamente "a primeira imagem é  │
 * │ X, a segunda é Y". Antes desta função, `promptDaComposicao`/              │
 * │ `promptDaComposicaoDaLinha` mandavam só o texto LIVRE de Cenário/Traje    │
 * │ (`scenarioPrompt`/`outfitPrompt`), sem NENHUMA menção a imagem nenhuma.   │
 * │                                                                            │
 * │ MEDIDO em 29/08, duas composições reais independentes (US$ 0,16): sem     │
 * │ a amarração por posição, cenário (corredor neon) e traje (jaqueta jeans   │
 * │ com echarpe) foram IGNORADOS por completo — a saída reproduziu só a       │
 * │ própria foto de rosto/lateral do avatar, com o fundo e a roupa dela.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A ORDEM aqui tem de bater EXATAMENTE com `publicarEntradas()`
 * (falPipeline.ts): `[rosto, cenario?, traje?, lado_direito|lado_esquerdo?]`.
 * Um item presente aqui e ausente lá (ou vice-versa) numera errado, e "a
 * segunda imagem" do prompt deixa de ser a segunda de verdade — por isso os
 * três `tem*` são booleanos EXPLÍCITOS, nunca deduzidos de outra coisa: quem
 * chama já sabe, no mesmo lugar, se vai publicar aquela entrada ou não.
 */
export function promptDeComposicaoPosicional(input: {
  temCenario: boolean;
  cenarioTexto: string | null | undefined;
  temTraje: boolean;
  trajeTexto: string | null | undefined;
  temLateral: boolean;
}): string {
  const numeral = (n: number) => (n === 2 ? "segunda" : n === 3 ? "terceira" : "quarta");
  const partes: string[] = [
    "A primeira imagem mostra o ROSTO da pessoa — preserve a identidade dela na composição.",
  ];
  let posicao = 2;

  if (input.temCenario) {
    const texto = input.cenarioTexto?.trim();
    partes.push(
      `A ${numeral(posicao)} imagem mostra o CENÁRIO${texto ? ` (${texto})` : ""} — coloque a pessoa da ` +
        "primeira imagem nesse ambiente, usando-o como fundo real da cena, não como decoração ao fundo.",
    );
    posicao += 1;
  }
  if (input.temTraje) {
    const texto = input.trajeTexto?.trim();
    partes.push(
      `A ${numeral(posicao)} imagem mostra a ROUPA${texto ? ` (${texto})` : ""} — vista a pessoa da ` +
        "primeira imagem com essa roupa, substituindo por completo a que ela está usando.",
    );
    posicao += 1;
  }
  if (input.temLateral) {
    partes.push(
      `A ${numeral(posicao)} imagem é só OUTRO ÂNGULO do MESMO rosto da primeira imagem — use-a apenas ` +
        "como referência extra de identidade, nunca como cenário nem como roupa.",
    );
  }
  return partes.join(" ");
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
/**
 * Teto da INTERPRETAÇÃO, em caracteres do texto que o usuário escreveu.
 *
 * ---------------------------------------------------------------------------
 * ELE JÁ EXISTIA — SÓ QUE SÓ NA TELA, E ISSO NÃO É UM TETO
 *
 * `MOTION_PROMPT_MAX = 600` vive em `SceneStep.tsx` como `maxLength` de um
 * `<textarea>`. Atributo de HTML é sugestão ao navegador: um `curl`, um cliente
 * antigo, uma extensão ou um colar programático passam por cima dele sem
 * esforço. Do lado do servidor, `normalizeScene` fazia `trim()` e mais nada —
 * ou seja, o teto tinha exatamente a força de um comentário.
 *
 * O número **600 é o mesmo da tela**, de propósito: dois tetos diferentes para
 * o mesmo campo produziriam o pior dos dois mundos — a tela deixando digitar o
 * que o servidor recusa, ou o contrário.
 * ---------------------------------------------------------------------------
 *
 * ┌─ O TETO VALE SOBRE O TEXTO FONTE, E O CASO DA TRADUÇÃO É DECLARADO ──────┐
 * │ Quem é medido é o que a PESSOA escreveu, nunca a tradução. Inglês pode   │
 * │ crescer sobre o português (medido em 10/08: 74 → 89 e 74 → 99 caracteres,│
 * │ de 20% a 34% a mais), e recusar por causa disso seria cobrar de alguém   │
 * │ por um passo que ela não sabe que existe — o modelo do produto é que ela │
 * │ nunca vê a versão inglesa.                                              │
 * │                                                                          │
 * │ COMPORTAMENTO DECLARADO: uma tradução que ultrapasse 600 caracteres é    │
 * │ ENVIADA assim mesmo. O fornecedor não publica limite para                │
 * │ `motion_prompt`, então não há nada do lado dele que este teto proteja;   │
 * │ ele existe para que uma direção de cena não vire um segundo roteiro.     │
 * │ Uma direção de 600 caracteres traduzida com folga de 40% dá ~840, o que  │
 * │ continua sendo direção de cena.                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Anotado como `number`: sem a anotação o TypeScript estreita para o literal
 * `600`, e a guarda que compara o teto com outro número passaria a reprovar por
 * não compilar em vez de por regra — INERTE, o mesmo defeito já medido em
 * `VOICE_SPEED` e já custado uma vez em `MAX_SCRIPT_SECONDS`.
 */
export const MOTION_PROMPT_MAX_CHARS: number = 600;

/**
 * A Interpretação passou do teto?
 *
 * Mede o texto FONTE, e mede depois do `trim()` — espaço em branco no fim não é
 * conteúdo, e recusar por causa dele seria recusar por invisível.
 */
export function exceedsMotionPromptLimit(motionPrompt: string | null | undefined): boolean {
  return (motionPrompt?.trim().length ?? 0) > MOTION_PROMPT_MAX_CHARS;
}

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
