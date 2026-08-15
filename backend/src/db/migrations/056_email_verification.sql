-- Confirmação por e-mail (15/08/2026): o portão de entrada deixa de ser só
-- aprovação manual no admin e passa a ser o padrão de mercado — cadastra,
-- recebe e-mail, clica no link, entra. A aprovação manual NÃO sai: vira
-- liberação de EXCEÇÃO (e-mail que falhou, cliente que não recebeu), pelo
-- mesmo botão "Aprovar"/"Suspender" que a migration 055 já ligou.
--
-- Os dois campos são NULLABLE, e ficam NULL fora da janela de verificação
-- pendente: um tenant já aprovado (por link ou por admin) não precisa mais
-- carregar token nenhum, e limpar os dois no sucesso (ver routes/
-- emailVerification.ts) é o que torna o link de UMA VEZ só — reenviar
-- (ou o admin aprovar) gera um token NOVO, nunca reaproveita o antigo.
ALTER TABLE tenants ADD COLUMN email_verification_token text;
ALTER TABLE tenants ADD COLUMN email_verification_expires_at timestamptz;

COMMENT ON COLUMN tenants.email_verification_token IS
  'Token aleatório (crypto.randomBytes) do link de confirmação por e-mail. NULL fora da janela pendente — limpo no sucesso da verificação, substituído (nunca reaproveitado) a cada reenvio.';
COMMENT ON COLUMN tenants.email_verification_expires_at IS
  'Expiração do token acima (24h do envio). Vencido, o link mostra erro claro com opção de reenviar — não é interpretado como token inválido para fins de mensagem ao usuário, mas É tratado como inválido para fins de autorização.';
