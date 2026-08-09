/**
 * TIMEOUT de toda chamada a fornecedor, num lugar só.
 *
 * ┌─ O defeito que este arquivo fecha ──────────────────────────────────────┐
 * │ MEDIDO por leitura em 08/08: nenhum `fetch` do caminho de produto usava │
 * │ `AbortSignal`. A única ocorrência de `AbortSignal` em todo o backend    │
 * │ era numa GUARDA (`checkImageFreshnessPolicy`), nunca no produto.        │
 * │                                                                         │
 * │ Sem sinal, o `fetch` do Node fica pendurado no default do runtime. No   │
 * │ caminho de criação isso é dinheiro: a requisição a `POST /v3/videos`    │
 * │ acontece DEPOIS do débito, e um socket que não responde deixa o crédito │
 * │ debitado, a linha em `queued` e ninguém sabendo se o fornecedor aceitou.│
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * DOIS tetos, e a razão de não ser um só é que eles medem coisas diferentes:
 *
 *  · CHAMADA DE API — pedir, perguntar, listar. Resposta em JSON, tamanho de
 *    kilobytes. Passar disso é o fornecedor não estar respondendo.
 *  · DOWNLOAD DE ARTEFATO — baixar o mp4 já produzido. O único medido neste
 *    projeto tem 3.441.685 B, e o tempo depende do link de quem hospeda.
 *    Aplicar aqui o teto de API transformaria download lento em falha, que é
 *    um modo de falha NOVO — criado por mim, não corrigido.
 *
 * Nenhum `fetch` aqui dentro, de propósito: a guarda de egresso reprova todo
 * arquivo com saída de rede que não consulte o modo, e este módulo não faz
 * rede — ele só fabrica o sinal que quem faz rede passa adiante.
 */

/** Teto das chamadas de API a fornecedor. Vazio = o default abaixo. */
export const VENDOR_TIMEOUT_ENV = "VENDOR_HTTP_TIMEOUT_MS";

/** Teto do download de artefato já produzido. Vazio = o default abaixo. */
export const VENDOR_DOWNLOAD_TIMEOUT_ENV = "VENDOR_DOWNLOAD_TIMEOUT_MS";

/**
 * 120 s. DEDUZIDO, não medido: nenhuma chamada de API deste projeto foi
 * cronometrada. O número é folgado o bastante para não transformar lentidão
 * normal em erro, e curto o bastante para o cliente não ficar olhando uma tela
 * parada por minutos — a geração inteira é síncrona até `POST /v3/videos`.
 */
export const DEFAULT_VENDOR_TIMEOUT_MS = 120_000;

/**
 * 600 s, o mesmo teto que `services/video/ffmpeg.ts` já usa para trabalho
 * local pesado. Igualar os dois é deliberado: são as duas operações do produto
 * que legitimamente demoram minutos, e ter dois números diferentes para a
 * mesma ordem de grandeza só cria uma pergunta sem resposta.
 */
export const DEFAULT_VENDOR_DOWNLOAD_TIMEOUT_MS = 600_000;

function leTeto(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (!bruto) return padrao;
  const n = Number(bruto);
  // Valor inválido cai no default em vez de virar NaN: um `NaN` em
  // `AbortSignal.timeout` aborta na hora, e o sintoma seria toda chamada a
  // fornecedor falhando por "timeout" de zero milissegundo — um diagnóstico
  // que manda procurar defeito na rede do fornecedor.
  if (!Number.isFinite(n) || n <= 0) return padrao;
  return Math.floor(n);
}

export function vendorTimeoutMs(): number {
  return leTeto(VENDOR_TIMEOUT_ENV, DEFAULT_VENDOR_TIMEOUT_MS);
}

export function vendorDownloadTimeoutMs(): number {
  return leTeto(VENDOR_DOWNLOAD_TIMEOUT_ENV, DEFAULT_VENDOR_DOWNLOAD_TIMEOUT_MS);
}

/**
 * O sinal para uma chamada de API a fornecedor.
 *
 * Uma instância NOVA por chamada, sempre: `AbortSignal.timeout` começa a
 * contar no instante em que é criado, então um sinal guardado em constante de
 * módulo abortaria tudo depois do primeiro uso.
 */
export function vendorSignal(): AbortSignal {
  return AbortSignal.timeout(vendorTimeoutMs());
}

/** O mesmo, com o teto de download. */
export function vendorDownloadSignal(): AbortSignal {
  return AbortSignal.timeout(vendorDownloadTimeoutMs());
}

/**
 * O erro que `AbortSignal.timeout` produz é um `TimeoutError`, e o de um
 * `abort()` manual é `AbortError`. Os dois chegam aqui como `DOMException`
 * embrulhada pelo `fetch`, e distingui-los do erro de rede comum é o que
 * permite gravar o motivo certo em `videos.failure_reason`.
 */
export function ehTimeoutDeFornecedor(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return true;
    // O `fetch` do Node embrulha a causa; o nome útil fica lá dentro.
    const causa = (err as { cause?: unknown }).cause;
    if (causa instanceof Error && (causa.name === "TimeoutError" || causa.name === "AbortError")) {
      return true;
    }
  }
  return false;
}

/** Como o teto foi resolvido, para o log e para o relatório de pré-voo. */
export function vendorTimeoutBasis(): string {
  return (
    `chamada de API ${vendorTimeoutMs()} ms (${VENDOR_TIMEOUT_ENV}, padrão ${DEFAULT_VENDOR_TIMEOUT_MS}); ` +
    `download de artefato ${vendorDownloadTimeoutMs()} ms ` +
    `(${VENDOR_DOWNLOAD_TIMEOUT_ENV}, padrão ${DEFAULT_VENDOR_DOWNLOAD_TIMEOUT_MS})`
  );
}
