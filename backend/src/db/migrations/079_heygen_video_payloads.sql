-- CC1, BLOCO HEYGEN-SIMPLES-10 -- o payload real enviado a POST /v3/videos
-- passa a sobreviver independente do buffer de log ao vivo, que ja girou 2x
-- (SIMPLES-9, item Y) antes de dar tempo de alguem copiar a linha. video_id e
-- PK: um payload por video, e ON DELETE CASCADE porque o payload nao tem
-- sentido guardado sem o video que ele descreve. Sem teto de retencao por
-- tempo/contagem -- o volume e um jsonb por video pago, desprezivel na escala
-- atual (dezenas de videos), e um mecanismo de poda seria complexidade sem
-- problema real por tras dela agora.
CREATE TABLE heygen_video_payloads (
  video_id uuid PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
