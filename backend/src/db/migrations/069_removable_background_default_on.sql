-- Liga `removable_background` por padrão — rodada de 28/08.
--
-- Migration 033 semeou esta flag DESLIGADA, e a linha explícita na tabela
-- vence o `defaultEnabled` do registro (ver featureFlagStore.ts): mudar só o
-- código não teria efeito nenhum em nenhum ambiente já provisionado, porque
-- a linha 'removable_background' já existe com enabled=false.
--
-- Por que ligar agora: o efeito é 100% LOCAL (MediaPipe no navegador, zero
-- chamada a fornecedor) e o comparador visual das cores antes de capturar
-- não depende do teste que a manteve desligada — ver o comentário em
-- services/featureFlags.ts. Essa pergunta (fundo virtual produz avatar
-- TREINADO melhor/pior na HeyGen?) segue em aberto e não é o que este UPDATE
-- resolve; é só a razão de a flag continuar existindo em vez de o código ser
-- escrito incondicionalmente.
UPDATE feature_flags SET enabled = true, updated_at = now()
WHERE key = 'removable_background' AND enabled = false;
