-- PLANO-ABA5-FASE1-1, 03/10/2026 -- libera o modo "trocarproduto"
-- (Genjutsu Object Swap) na constraint de creative_jobs, que só tinha
-- os 6 modos originais. Sem isso, INSERT desse modo violava a check.
ALTER TABLE creative_jobs DROP CONSTRAINT creative_jobs_modo_check;
ALTER TABLE creative_jobs ADD CONSTRAINT creative_jobs_modo_check
  CHECK (modo = ANY (ARRAY['imagem','propaganda','broll','trocarproduto','sobreposicao','narracao','musica']));
