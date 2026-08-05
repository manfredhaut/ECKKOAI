-- Crédito de ENSAIO: um balde separado para o que o modo `fixture` consome.
--
-- O DEFEITO, medido em 05/08: `debitCredit()` escolhe a linha de
-- `tenant_credits` só pelo tipo, sem olhar o modo do provedor. Ensaiar a
-- jornada em `fixture` — que não fala com fornecedor nenhum e não custa um
-- centavo — debita o MESMO saldo que paga os vídeos reais. O tenant de
-- desenvolvimento `dev-c77a5b` chegou a `video: 0` exatamente assim, e com
-- saldo zero o portão de prontidão recusa a geração ANTES do débito: ensaiar
-- de graça tornou-se impossível justamente na semana da demonstração.
--
-- A correção tem duas metades. Esta é a do banco — existir onde debitar. A
-- outra vive em `creditGate.ts`: `contaDe()` escolhe o balde pelo modo, e é
-- usada nos três lugares que decidem (débito, estorno e o retrato de
-- prontidão em `generationReadiness.ts`). Trocar o balde só no débito deixaria
-- o portão continuar lendo o saldo real e recusando com 403 — o dinheiro
-- pararia de sangrar e a tela continuaria travada, que é o pior dos dois.
--
-- POR QUE 500, e não "sem limite": um balde infinito não é balde. 500 por tipo
-- é mais do que qualquer ensaio plausível consome, e ainda assim o contador
-- continua visível — se ele começar a cair depressa, alguma coisa está em
-- laço, e é uma informação que "ilimitado" apagaria.

-- --------------------------------------------------------------------------
-- 1. Os tipos de ensaio passam a ser aceitos.
--
-- Os nomes das duas constraints foram LIDOS do banco (`pg_constraint`), não
-- deduzidos do arquivo que as criou: o Postgres nomeia sozinho quando a
-- migration não nomeia, e uma migration que derruba um nome adivinhado falha
-- no ambiente de quem já aplicou a anterior.
ALTER TABLE tenant_credits DROP CONSTRAINT IF EXISTS tenant_credits_credit_type_check;
ALTER TABLE tenant_credits ADD CONSTRAINT tenant_credits_credit_type_check
  CHECK (credit_type IN ('video', 'script', 'avatar',
                         'video_rehearsal', 'script_rehearsal', 'avatar_rehearsal'));

ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_credit_type_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_credit_type_check
  CHECK (credit_type IN ('video', 'script', 'avatar',
                         'video_rehearsal', 'script_rehearsal', 'avatar_rehearsal'));

-- --------------------------------------------------------------------------
-- 2. ANTES de semear: acertar o passado.
--
-- `tenant_credits.balance` é um CACHE do que o `credit_ledger` soma, e
-- `preflightLive.ts` compara os dois antes de toda passada paga. Hoje a
-- comparação acusa 2 divergentes em 54 linhas (MEDIDO): `dev-c77a5b` com
-- avatar 2 contra ledger 3, e video 0 contra ledger -4. As duas são herança
-- dos `UPDATE tenant_credits` manuais dos blocos DEMO-1/ESTORNO-1, feitos sem
-- lançamento correspondente.
--
-- Isto é reconciliação, não concessão: NENHUM `balance` é alterado. O que
-- entra é o lançamento que faltava, com o delta calculado por linha como
-- `balance - SUM(delta)` — a diferença exata que já existe. O saldo de
-- ninguém muda em um centavo; o histórico é que passa a somar o que o saldo
-- sempre disse.
--
-- `manual_admin_adjustment` e não `grant` de propósito: `grant` significaria
-- que alguém concedeu crédito agora, e não foi isso que aconteceu — o crédito
-- já estava no saldo. O motivo tem de descrever o fato, senão a próxima pessoa
-- a ler o ledger vai encontrar uma concessão que nunca existiu.
--
-- Idempotente por construção: rodar de novo não encontra divergência e não
-- insere nada.
INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason)
SELECT tc.tenant_id, tc.credit_type, tc.balance - COALESCE(l.soma, 0), 'manual_admin_adjustment'
  FROM tenant_credits tc
  LEFT JOIN (
    SELECT tenant_id, credit_type, SUM(delta) AS soma
      FROM credit_ledger
     GROUP BY tenant_id, credit_type
  ) l ON l.tenant_id = tc.tenant_id AND l.credit_type = tc.credit_type
 WHERE tc.balance <> COALESCE(l.soma, 0);

-- --------------------------------------------------------------------------
-- 3. Semear 500 de cada tipo de ensaio.
--
-- O critério é EXISTÊNCIA DE LINHA em `tenant_credits`, e não saldo positivo.
-- A diferença não é acadêmica: `dev-c77a5b` tem `video: 0`, e um `WHERE
-- balance > 0` deixaria de fora exatamente o tenant que motivou esta
-- migration.
--
-- O `INSERT` no ledger sai do `RETURNING` do primeiro, e não de um segundo
-- `SELECT`: assim só os tenants que REALMENTE receberam linha ganham
-- lançamento, e um `ON CONFLICT DO NOTHING` que não inseriu nada não produz um
-- lançamento fantasma. É o que mantém saldo e ledger batendo depois desta
-- migration — a mesma regra que `grantDevCredits.ts` segue, pelo mesmo motivo.
WITH semeados AS (
  INSERT INTO tenant_credits (tenant_id, credit_type, balance)
  SELECT t.tenant_id, tipo.nome, 500
    FROM (SELECT DISTINCT tenant_id FROM tenant_credits) t
    CROSS JOIN (VALUES ('video_rehearsal'), ('script_rehearsal'), ('avatar_rehearsal')) AS tipo(nome)
  ON CONFLICT (tenant_id, credit_type) DO NOTHING
  RETURNING tenant_id, credit_type, balance
)
INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason)
SELECT tenant_id, credit_type, balance, 'grant' FROM semeados;
