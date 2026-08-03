/**
 * O caminho NATIVO: um vídeo por finalidade, gerado no fornecedor já naquele
 * formato — e cobrado como tal.
 *
 * ---------------------------------------------------------------------------
 * A CONTA QUE NÃO PODE ERRAR
 *
 * Derivação é grátis; geração custa. Um lote que peça quatro formatos nativos
 * são QUATRO gerações, e portanto:
 *
 *     N gerações  ⇒  N débitos de crédito
 *                 ⇒  N linhas em provider_usage
 *                 ⇒  N unidades do teto de sessão
 *
 * As três têm de andar juntas. Um lote que debitasse uma vez e gerasse quatro
 * vezes daria de graça o que custa dinheiro; um que consumisse uma unidade de
 * teto e disparasse quatro chamadas desligaria a proteção contra laço bem no
 * caminho mais caro do produto. É por isso que o planejamento fica separado da
 * execução: o número de gerações é decidido, conferido e só então gasto.
 * ---------------------------------------------------------------------------
 *
 * A FALHA PARCIAL, que é o caso interessante: se o terceiro de quatro falhar,
 * os dois primeiros JÁ FORAM aceitos pelo fornecedor e continuam cobrados. Não
 * há estorno para eles — é a mesma fronteira do ESTORNO-1, e pela mesma razão:
 * o fornecedor renderizou. O que o lote faz é PARAR (não adianta insistir com
 * o mesmo defeito) e relatar exatamente o que ficou pago e o que não saiu.
 */

/** Como cada formato pedido será atendido. */
export type VariantPath =
  /** É a proporção do master: o arquivo já existe, e nada é gerado nem derivado. */
  | "master"
  /** Sai do master por software. Custo zero. */
  | "derived"
  /** Geração própria no fornecedor. Custa uma geração. */
  | "native";

export interface PlannedVariant {
  aspectRatio: string;
  path: VariantPath;
}

export interface BatchPlan {
  variants: PlannedVariant[];
  /** Quantas chamadas ao fornecedor este lote fará. */
  generations: number;
  /** Créditos a debitar. Igual a `generations`, e a igualdade é o ponto. */
  debits: number;
  /** Unidades do teto de sessão a consumir. Idem. */
  budgetUnits: number;
}

/**
 * Decide o caminho de cada formato pedido.
 *
 * A regra que mais importa é a do master: pedir "nativo" para a proporção em
 * que o master já foi gerado NÃO é uma geração nova — o arquivo existe e é
 * nativo daquele formato por construção. Cobrar por ele seria vender duas
 * vezes a mesma renderização.
 *
 * O inverso também é regra, e é o defeito que a guarda persegue: um formato
 * marcado como nativo que silenciosamente aponte para o master seria uma
 * promessa não cumprida — o cliente pagou por uma composição feita para aquele
 * formato e recebeu a de outro.
 */
export function planNativeBatch(input: {
  /** Formatos que o cliente quer receber. */
  requested: readonly string[];
  /** Destes, quais ele pediu NATIVOS (o resto é derivado). */
  native: readonly string[];
  /** Proporção em que o master foi (ou será) gerado. */
  masterAspectRatio: string;
}): BatchPlan {
  const nativeSet = new Set(input.native);
  const variants: PlannedVariant[] = [];

  for (const aspectRatio of input.requested) {
    if (aspectRatio === input.masterAspectRatio) {
      // O master atende a própria proporção, tenha o cliente marcado "nativo"
      // ou não. Marcar não muda nada porque não há nada a mudar.
      variants.push({ aspectRatio, path: "master" });
      continue;
    }
    variants.push({ aspectRatio, path: nativeSet.has(aspectRatio) ? "native" : "derived" });
  }

  const generations = variants.filter((v) => v.path === "native").length;

  return {
    variants,
    generations,
    // Escritos como derivações do MESMO número, e não como três contas
    // parecidas. Três expressões independentes divergem na primeira mudança, e
    // a divergência só apareceria numa fatura.
    debits: generations,
    budgetUnits: generations,
  };
}

export interface BatchOutcome {
  aspectRatio: string;
  path: VariantPath;
  status: "ok" | "failed" | "skipped";
  error?: string;
}

export interface BatchResult {
  outcomes: BatchOutcome[];
  /** Gerações que o fornecedor ACEITOU — cobradas, sem estorno. */
  chargedGenerations: number;
  /** Formatos que não saíram porque o lote parou. */
  skipped: number;
  partial: boolean;
}

/**
 * Executa o lote, parando na primeira falha de geração.
 *
 * Parar em vez de continuar é deliberado: a falha do terceiro raramente é
 * específica dele. Insistir nos outros dois gastaria mais crédito para colher
 * o mesmo erro, e é exatamente o comportamento que transforma um defeito de
 * configuração numa conta alta.
 *
 * O que já foi aceito **permanece cobrado**, e o resultado diz isso em número
 * — a alternativa seria o cliente descobrir a diferença na fatura.
 */
export async function runNativeBatch(
  plan: BatchPlan,
  generateOne: (aspectRatio: string) => Promise<void>,
): Promise<BatchResult> {
  const outcomes: BatchOutcome[] = [];
  let chargedGenerations = 0;
  let parou = false;

  for (const v of plan.variants) {
    if (v.path !== "native") {
      outcomes.push({ aspectRatio: v.aspectRatio, path: v.path, status: parou ? "skipped" : "ok" });
      continue;
    }
    if (parou) {
      outcomes.push({ aspectRatio: v.aspectRatio, path: v.path, status: "skipped" });
      continue;
    }

    try {
      await generateOne(v.aspectRatio);
      // Contado DEPOIS do sucesso: uma geração que lançou não chegou a ser
      // aceita pelo fornecedor, e contá-la aqui inflaria o número que o
      // cliente vê como "o que você já pagou".
      chargedGenerations += 1;
      outcomes.push({ aspectRatio: v.aspectRatio, path: v.path, status: "ok" });
    } catch (err) {
      parou = true;
      outcomes.push({
        aspectRatio: v.aspectRatio,
        path: v.path,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  return {
    outcomes,
    chargedGenerations,
    skipped,
    partial: outcomes.some((o) => o.status === "failed"),
  };
}

/**
 * Frase para a tela quando o lote não sai inteiro.
 *
 * Existe como função para que o silêncio seja impossível: um lote que para no
 * segundo de quatro e não diz nada é indistinguível de um que terminou — e o
 * cliente só descobriria ao procurar os arquivos que não estão lá.
 */
export function batchSummaryMessage(result: BatchResult): string | null {
  if (!result.partial) return null;
  const falhou = result.outcomes.find((o) => o.status === "failed");
  return (
    `A geração de ${falhou?.aspectRatio ?? "um dos formatos"} falhou, e o lote parou aí. ` +
    `${result.chargedGenerations} formato(s) já tinham sido gerados e continuam cobrados — o fornecedor ` +
    `os produziu. ${result.skipped} formato(s) não foram gerados e não foram cobrados. ` +
    "Insistir nos demais provavelmente repetiria o mesmo erro, com custo."
  );
}
