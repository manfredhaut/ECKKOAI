-- P2-8, "Ajustar este vídeo" — versionamento aditivo.
--
-- `parent_video_id`: a versão IMEDIATAMENTE anterior (a que foi "ajustada").
-- `root_video_id`: a PRIMEIRA versão da família — resolvido uma vez no
-- momento da criação (herda do pai, ou é o próprio id se o pai já é raiz) e
-- NUNCA recalculado depois. Denormalizado de propósito: sem ele, listar
-- "todas as versões" exigiria uma CTE recursiva em toda consulta; com ele, é
-- um WHERE simples (id = raiz OR root_video_id = raiz).
-- `version_number`: 1 para todo vídeo criado normalmente (default — nenhum
-- vídeo existente muda), N para a N-ésima versão de uma família.
-- `avatar_fit`: P2 (item 1 do ajuste) — o enquadramento (BB2/BB3,
-- HEYGEN-SIMPLES-10) nunca foi persistido por vídeo ("Gerar novamente"
-- sempre reenviava o estado ATUAL da tela). "Ajustar" precisa reabrir um
-- vídeo ANTIGO com o enquadramento que ele usou — sem esta coluna, a nova
-- versão nasceria sempre no padrão do servidor, silenciosamente diferente
-- do original. Vídeo sem valor (toda geração anterior a esta migration,
-- e toda geração tier Normal/Premium, que não usa este campo): `NULL`,
-- que já cai no padrão de hoje (HEYGEN_FIT) — nenhum vídeo existente muda.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS parent_video_id uuid REFERENCES videos(id) ON DELETE SET NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS root_video_id uuid REFERENCES videos(id) ON DELETE SET NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS avatar_fit text;

CREATE INDEX IF NOT EXISTS videos_root_video_id_idx ON videos (root_video_id) WHERE root_video_id IS NOT NULL;

-- NUMERAÇÃO SEGURA — item 3 do ajuste. `COALESCE(root_video_id, id)` é a
-- chave da família (a raiz aponta para si mesma via este COALESCE, já que
-- seu próprio root_video_id é NULL). Duas gerações concorrentes na MESMA
-- família NUNCA podem terminar com o mesmo version_number — o código já
-- serializa isso com um lock (SELECT ... FOR UPDATE na raiz, mesma
-- transação do INSERT), e este índice é a segunda trava, independente do
-- lock, do mesmo jeito que `credit_ledger_one_refund_per_video` (migration
-- 035) é a segunda trava do estorno.
CREATE UNIQUE INDEX IF NOT EXISTS videos_family_version_unique_idx
  ON videos (COALESCE(root_video_id, id), version_number);

COMMENT ON COLUMN videos.parent_video_id IS 'P2-8: a versão que esta "ajustou". NULL = vídeo original (não é ajuste de nada).';
COMMENT ON COLUMN videos.root_video_id IS 'P2-8: a PRIMEIRA versão da família (denormalizado, para listar todas as versões sem CTE recursiva). NULL = este É a raiz.';
COMMENT ON COLUMN videos.version_number IS 'P2-8: 1 para a versão original; N para a N-ésima versão ajustada. Calculado no INSERT sob lock (FOR UPDATE na raiz), nunca recalculado depois.';
COMMENT ON COLUMN videos.avatar_fit IS 'P2-8: enquadramento (cover/contain, só tier Simples/HeyGen) persistido por vídeo, para "Ajustar" poder reabrir com o mesmo valor. NULL = padrão do servidor (HEYGEN_FIT) — todo vídeo anterior a esta migration.';
