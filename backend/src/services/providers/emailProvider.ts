import { randomBytes } from "node:crypto";
import { config } from "../../config.js";
import { BASE_DOMAIN } from "../../domainConfig.js";
import { vendorSignal } from "./vendorTimeout.js";

// Remetente por enquanto (decisão de produto, 15/08/2026): domínio próprio de
// envio exige DNS novo (SPF/DKIM), fora de escopo desta rodada. `resend.dev`
// é o domínio de teste que a Resend já verifica por conta própria.
const FROM_ADDRESS = "eckko.ai <onboarding@resend.dev>";

const RESEND_API_URL = "https://api.resend.com/emails";

// 24h — decisão de produto (15/08/2026), sem outra medição por trás. Vencida,
// GET /verify-email mostra erro claro com opção de reenviar (que gera um
// token NOVO com uma janela NOVA); não existe extensão silenciosa do prazo.
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export function verificationTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + VERIFICATION_TOKEN_TTL_MS);
}

function verificationLink(token: string): string {
  // Aponta para a rota do FRONTEND (SPA em /verify-email — ver App.tsx),
  // não para a API. A página chama GET /api/verify-email por baixo; quem
  // clica no e-mail nunca vê JSON cru.
  return `https://${BASE_DOMAIN}/verify-email?token=${encodeURIComponent(token)}`;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

/**
 * Envia o e-mail de confirmação de cadastro pela API REST da Resend — `fetch`
 * simples, sem SDK novo como dependência (decisão de produto, 15/08/2026).
 *
 * ⚠️ NÃO desvia para simulação com base no modo do provedor — DE PROPÓSITO.
 * PROVIDER_MODE existe para
 * não gastar dinheiro com geração de vídeo/avatar/voz; e-mail de confirmação
 * não tem custo variável e é necessário para o produto funcionar mesmo em
 * fixture (sem ele, nenhum tenant sairia de 'pending' pelo caminho principal
 * em desenvolvimento). Roda em QUALQUER PROVIDER_MODE, sempre. A exceção
 * está declarada com o mesmo motivo em
 * backend/src/scripts/checkNetworkEgressPolicy.ts (EXCECOES).
 *
 * Erro de envio NÃO é lançado para dentro da transação de signup — quem
 * chama decide (auth.ts trata como best-effort: a conta existe de qualquer
 * jeito, e "reenviar" ou a aprovação manual no admin cobrem o caso em que
 * a Resend falhou ou está fora do ar).
 */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = verificationLink(token);

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: "Confirme seu cadastro no eckko.ai",
      html:
        `<p>Falta só um passo para começar a usar o eckko.ai.</p>` +
        `<p><a href="${link}">Confirme seu e-mail</a> para ativar sua conta.</p>` +
        `<p>Se você não pediu este cadastro, pode ignorar esta mensagem.</p>`,
    }),
    signal: vendorSignal(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EmailSendError(`Resend API error (${res.status}): ${body}`, res.status);
  }
}
