// Traduz falha de fornecedor de IA em mensagem que pode ser mostrada a um
// cliente — e, em muitos casos, a um visitante anônimo na landing.
//
// O que existia antes devolvia err.message cru. Na prática isso significava
// que qualquer pessoa podia arrancar do copiloto público a resposta de erro
// do Google inteira: nome do modelo, tier da conta, valor exato da cota e
// links internos. Nada disso é da conta de quem está do outro lado, e é um
// mapa gratuito para quem quiser sondar a plataforma.
//
// A regra: o cliente recebe uma frase em pt-BR que diz o que aconteceu e o
// que fazer; o detalhe do fornecedor vai para o log do servidor, onde a
// equipe o encontra. Nunca os dois no mesmo lugar.

export type VendorKind = "script" | "voice" | "avatar";

export type VendorFailure =
  | "rate_limited" // 429 — cota ou excesso de requisições
  | "unavailable" // 5xx, timeout, rede
  | "auth" // 401/403 — chave inválida, revogada, sem permissão
  | "unknown";

const VENDOR_LABEL: Record<VendorKind, string> = {
  script: "de geração de roteiro",
  voice: "de voz",
  avatar: "de vídeo",
};

/**
 * Classifica pelo texto do erro. Os adaptadores em providers/ formatam suas
 * exceções como "<Vendor> API error (<status>): <corpo>", então o status está
 * disponível sem precisar propagar o objeto Response por toda a pilha.
 */
export function classifyVendorFailure(err: unknown): VendorFailure {
  const raw = err instanceof Error ? err.message : String(err);

  if (/\(429\)|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(raw)) return "rate_limited";
  if (/\((5\d\d)\)|unavailable|overloaded|high demand|timeout|timed out|ECONNRESET|ENOTFOUND|fetch failed|Could not reach/i.test(raw)) {
    return "unavailable";
  }
  if (/\((401|403)\)|unauthorized|invalid.?api.?key|API key not valid|missing_permissions|permission/i.test(raw)) {
    return "auth";
  }
  return "unknown";
}

/**
 * Mensagem para o usuário final, em pt-BR. Fala de "serviço", nunca do nome
 * do fornecedor: para o cliente, HeyGen e ElevenLabs são detalhe de
 * implementação nosso, e citá-los só transfere a ele um problema que não é
 * dele.
 */
export function vendorErrorMessage(kind: VendorKind, failure: VendorFailure): string {
  const what = VENDOR_LABEL[kind];
  switch (failure) {
    case "rate_limited":
      return `O serviço ${what} atingiu o limite de uso no momento. Tente novamente em alguns minutos.`;
    case "unavailable":
      return `O serviço ${what} está temporariamente indisponível. Tente novamente em alguns minutos.`;
    case "auth":
      return `O serviço ${what} não está configurado corretamente. Fale com o suporte.`;
    default:
      return `Não foi possível concluir a operação no serviço ${what}. Tente novamente em alguns minutos.`;
  }
}

/**
 * Ponto único de tradução: registra o detalhe cru no log do servidor e
 * devolve só o que pode ser exibido. `context` identifica o call site no log.
 */
export function toClientVendorError(
  kind: VendorKind,
  context: string,
  err: unknown,
): { failure: VendorFailure; message: string } {
  const failure = classifyVendorFailure(err);
  console.error(
    JSON.stringify({
      event: "vendor_error",
      context,
      kind,
      failure,
      // Detalhe do fornecedor fica AQUI, no servidor, e só aqui.
      detail: err instanceof Error ? err.message : String(err),
    }),
  );
  return { failure, message: vendorErrorMessage(kind, failure) };
}

/** Código HTTP coerente com a natureza da falha. */
export function vendorErrorStatus(failure: VendorFailure): number {
  return failure === "rate_limited" ? 429 : 502;
}
