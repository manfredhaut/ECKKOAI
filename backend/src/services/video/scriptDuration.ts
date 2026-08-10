/**
 * Quanto tempo de vídeo um ROTEIRO produz — a única resposta do sistema.
 *
 * Antes disto o produto respondia essa pergunta com o que o cliente escolhia
 * num chip de 15/30/60 s, e esse número atravessava tudo: gravava-se na linha
 * do vídeo, estimava-se o custo em cima dele, rotulava-se o player com ele.
 * Nada no caminho jamais limitou a duração de fato — `buildHeygenVideoPayload`
 * não tem campo de duração e nenhum `slice` toca o roteiro —, então o chip era
 * uma escolha que não escolhia nada.
 *
 * O dano é medido, e é em dinheiro: na passada paga de 05/08 pediu-se 15 s, o
 * fornecedor entregou 36,9876 s, e a tela mostrou US$ 0,75 estimados contra
 * US$ 1,80 cobrados — a estimativa valia 0,42× do que saiu da carteira.
 *
 * ---------------------------------------------------------------------------
 * O RITMO É MEDIDO, E VEM DE UM VÍDEO PAGO
 *
 * 474 caracteres de roteiro produziram 36,9876 s de vídeo entregue (`8e7941d1`,
 * avatar `7557957c`, voz clonada `5Yeum4QN…`, 05/08). A razão é
 * 474 ÷ 36,9876 = 12,815159… caracteres por segundo — 12,8151 c/s a quatro
 * casas.
 *
 * A constante é DERIVADA dos dois números medidos, e não digitada. Digitar
 * 12,8151 permitiria que a razão e a medição divergissem em silêncio, que é o
 * defeito que `providerCost.ts` existe para não repetir. Arredondar para 12,8
 * muda o resultado num caso real: 474 ÷ 12,8 = 37,03 s → 37 s cobrados → 111
 * unidades, e o fornecedor debitou 108.
 * ---------------------------------------------------------------------------
 *
 * ┌─ O QUE É MEDIDO ────────────────────────────────────────────────────────┐
 * │ · 474 caracteres → 36,9876 s (duração declarada pelo FORNECEDOR).       │
 * │ · A régua do fornecedor e a nossa DIVERGEM: o `ffprobe` do mesmo        │
 * │   arquivo deu 37,000000 s. Truncados, 36 e 37 — cobrar pelo nosso       │
 * │   número teria errado 3 unidades para cima. A duração que vale é a      │
 * │   dele.                                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE É DEDUZIDO ──────────────────────────────────────────────────────┐
 * │ Que o ritmo é LINEAR e vale para qualquer roteiro. É a extrapolação de  │
 * │ um ponto só, e há um segundo ponto que a contradiz: 87 caracteres do    │
 * │ mesmo dia, na mesma voz e no mesmo modelo, saíram a 13,9871 c/s — 8,4%  │
 * │ mais rápido, porque a pontuação de um roteiro longo insere pausas. Ou   │
 * │ seja: em roteiros curtos esta conta SUPERESTIMA a duração, e portanto o │
 * │ custo. Errar para cima numa estimativa é o lado seguro, e é o lado que  │
 * │ o número escolhido produz.                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE NÃO FOI VERIFICADO ──────────────────────────────────────────────┐
 * │ · Outra voz, outro modelo, outro idioma. Os dois pontos vêm da MESMA    │
 * │   voz clonada e do mesmo `eleven_multilingual_v2`.                      │
 * │ · Roteiros longos (acima de 474 caracteres). O ritmo pode continuar     │
 * │   caindo com o comprimento, e nada aqui detectaria isso.                │
 * │ · A relação entre duração do ÁUDIO e duração do VÍDEO: o fornecedor     │
 * │   pode acrescentar sobra nas pontas. Os 36,9876 s são do vídeo pronto,  │
 * │   então a sobra, se existe, já está dentro do número.                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// A velocidade da fala vem do provedor de voz, e não é redeclarada aqui: dois
// números para a mesma coisa divergiriam, e a régua passaria a estimar por uma
// velocidade que a síntese não usa.
import { VOICE_SPEED } from "../providers/voiceProvider.js";

/**
 * A medição, com os dois lados à vista. Mexer aqui muda toda duração estimada
 * e todo custo estimado do produto — que é a propriedade desejada.
 */
export const SCRIPT_PACING = {
  /** Caracteres do roteiro que produziram a medição. */
  measuredChars: 474,
  /** Segundos ENTREGUES, pela régua do fornecedor (não pelo nosso ffprobe). */
  measuredDeliveredSeconds: 36.9876,
  measuredOn: "2026-08-05",
  method:
    "um vídeo pago real (474 caracteres → 36,9876 s declarados pelo fornecedor; " +
    "o nosso ffprobe deu 37,000000 s no mesmo arquivo, e é a régua do fornecedor que cobra)",
} as const;

/**
 * Caracteres por segundo. DERIVADO da medição, nunca digitado — mesma razão
 * pela qual `USD_PER_BILLED_SECOND` não é uma constante própria.
 */
export const CHARS_PER_SECOND =
  SCRIPT_PACING.measuredChars / SCRIPT_PACING.measuredDeliveredSeconds;

/**
 * A MEDIÇÃO FOI FEITA A VELOCIDADE 1.0 — e é por isso que ela não basta
 * sozinha.
 *
 * Os 474 caracteres em 36,9876 s saíram da voz `5Yeum4QN…`, cujo
 * `GET /v1/voices/{id}/settings` mostra `speed: 1.0` (medido em 09/08). A voz
 * em uso hoje está em **0.85**, aprovada pelo operador — a 1.0 a fala saía
 * rápida demais.
 *
 * Uma fala 15% mais lenta dura mais, e a cobrança é por segundo INTEIRO
 * entregue: para os 194 caracteres da frase da demo, 15,1 s a 1.0 viram
 * 17,8 s a 0.85, e 45 unidades viram 51. Sem esta divisão a tela mostraria
 * US$ 0,75 enquanto o fornecedor debitaria US$ 0,85 — o defeito 4 (estimativa
 * que valia 0,42× do cobrado) voltando por outra porta, menor mas do mesmo
 * tipo.
 */

/**
 * Acima de quantos segundos estimados o passo 6 exige confirmação explícita.
 *
 * O teto é DECLARADO, e a escolha é de dinheiro, não de estética: a 3 unidades
 * por segundo inteiro, 60 s são 180 unidades — cerca de US$ 3,00, e um quarto
 * do saldo que a conta tinha em 05/08. Um roteiro colado sem querer pode passar
 * disso sem que ninguém repare, e o débito acontece ANTES da chamada e só
 * estorna antes do aceite.
 *
 * Não é um limite: nada é truncado e nada é recusado. Truncar o roteiro do
 * cliente em silêncio seria entregar um vídeo cortado no meio de uma frase, que
 * é pior que um vídeo caro.
 */
export const CONFIRM_ABOVE_SECONDS = 60;

/**
 * MARGEM sobre a estimativa, aplicada só ao veredito de confirmação.
 *
 * A régua de 12,8151 c/s vem de UM ponto medido, e o segundo ponto que existe a
 * contradiz: 87 caracteres do mesmo dia saíram a 13,9871 c/s. Quer dizer que a
 * dispersão real entre roteiros é da ordem de 8%, e uma estimativa de 58 s pode
 * virar 63 s entregues sem que nada esteja errado.
 *
 * Os 10% cobrem essa dispersão do lado que importa: perto do teto, é melhor
 * pedir uma confirmação desnecessária do que deixar passar sem aviso um vídeo
 * que custa mais do que se esperava. A margem NÃO entra no custo mostrado —
 * inflar o preço na tela seria mentir para o lado seguro, e a estimativa
 * continua sendo a conta pura.
 */
export const CONFIRM_MARGIN = 1.1;

/**
 * O veredito, num lugar só.
 *
 * A tela e as duas rotas de custo consomem esta função em vez de repetirem a
 * comparação: uma cópia da regra que esquecesse a margem passaria despercebida
 * justamente na faixa em que ela existe para proteger.
 */
export function requiresLongVideoConfirmation(estimatedSeconds: number): boolean {
  return estimatedSeconds * CONFIRM_MARGIN > CONFIRM_ABOVE_SECONDS;
}

/**
 * Duração estimada, em segundos FRACIONÁRIOS, a partir da CONTAGEM de
 * caracteres.
 *
 * Recebe a contagem, e não o texto, porque é isso que a tela consegue mandar
 * sem pôr o roteiro do cliente numa query string — o mesmo cuidado que fez
 * `/videos/readiness` ser POST.
 *
 * Entrada inválida devolve 0 em vez de propagar `NaN`: um `NaN` atravessaria as
 * comparações como falso e apareceria na tela como "US$ NaN".
 */
export function estimateSecondsFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  // DOIS fatores, não um. `CHARS_PER_SECOND` é o ritmo da voz a velocidade
  // 1.0 — foi assim que ele foi medido, no vídeo pago de 05/08 com a voz
  // antiga. A velocidade é o segundo fator, e dividir por ela é o que
  // converte "quanto essa voz fala por segundo" em "quanto tempo esse
  // roteiro vai durar".
  //
  // NÃO recalibrar a constante para embutir a velocidade. Misturar os dois
  // números faria a régua quebrar de novo no dia em que a velocidade mudasse,
  // e ninguém saberia qual dos dois estava errado — é o mesmo motivo pelo qual
  // a constante é a divisão medida e não o 12,8 redondo.
  return chars / CHARS_PER_SECOND / VOICE_SPEED;
}

/** O mesmo, a partir do roteiro. O servidor tem o texto; a tela, só a contagem. */
export function estimateSecondsFromScript(script: string | null | undefined): number {
  return estimateSecondsFromChars(script?.length ?? 0);
}

/**
 * Ressalva que acompanha toda duração estimada na tela — irmã de
 * `costBasisNote()`, e pelo mesmo motivo: um número sobre o qual a tela não
 * consegue dizer de onde veio é indistinguível de um palpite.
 */
export function scriptDurationBasis(): string {
  return (
    `Duração estimada a partir do roteiro, a ${CHARS_PER_SECOND.toFixed(4).replace(".", ",")} ` +
    `caracteres por segundo, medidos em ${SCRIPT_PACING.measuredOn}: ${SCRIPT_PACING.method}. ` +
    "Roteiros curtos saem mais rápidos que isto (87 caracteres do mesmo dia deram 13,99 c/s), " +
    "então a estimativa erra para CIMA neles. A duração real só é conhecida depois de gerar."
  );
}
