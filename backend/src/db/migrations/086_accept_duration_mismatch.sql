-- OPCAO B — a escolha "gerar mesmo assim" (quando a fala diverge do alvo
-- escolhido em mais de 8%) precisa sobreviver da criacao ate a aprovacao,
-- que roda numa requisicao HTTP separada, minutos depois. Sem persistir,
-- a flag so valeria no POST /videos e a mesma checagem recusaria de novo
-- na aprovacao -- exatamente o bug medido (vendor_rejected, video 644797c0).
ALTER TABLE videos ADD COLUMN accept_duration_mismatch boolean NOT NULL DEFAULT false;
