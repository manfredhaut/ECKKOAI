-- B7, BLOCO HEYGEN-SIMPLES-1 -- dedup de entregas de webhook da HeyGen.
-- A doc publica (developers.heygen.com/docs/webhooks, WebFetch 02/09/2026)
-- documenta retry com backoff exponencial por ate 24h e recomenda dedup por
-- Heygen-Event-Id -- um mesmo evento pode chegar mais de uma vez. video_id
-- fica NULL quando o evento nao correspondeu a nenhum video conhecido (o
-- callback_id nao bateu com nenhuma linha) -- registrado mesmo assim, para
-- auditoria: um evento orfao e informacao, nao erro silencioso.
CREATE TABLE heygen_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
