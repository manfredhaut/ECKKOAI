-- A INTERPRETAÇÃO traduzida para inglês, guardada ao lado do texto do usuário.
--
-- Duas colunas, e nunca uma: `motion_prompt` continua sendo EXATAMENTE o que a
-- pessoa escreveu, e é o único dos dois que a tela mostra. Sobrescrever o fonte
-- com a tradução apagaria o texto que ela revisou e transformaria a próxima
-- edição num diálogo com uma frase que ela não escreveu.
--
-- Esta coluna existe para AUDITORIA: responder "o que exatamente foi enviado ao
-- fornecedor naquele vídeo?" sem depender de o log ainda estar na janela. Ela é
-- VELADA — ver `services/video/tenantView.ts`: nenhuma resposta HTTP destinada
-- ao cliente do tenant pode carregá-la.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS motion_prompt_en text;

-- Consulta da reutilização: antes de chamar o modelo, procura-se uma tradução
-- já feita do MESMO texto neste tenant. Sem o índice isso é varredura completa
-- de `videos` a cada geração.
CREATE INDEX IF NOT EXISTS videos_motion_prompt_traduzido_idx
  ON videos (tenant_id, motion_prompt)
  WHERE motion_prompt_en IS NOT NULL;
