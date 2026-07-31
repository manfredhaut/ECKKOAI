# Painel admin — Tenants

> **Este arquivo é interno.** Só é lido pelo copiloto do admin
> ([routes/adminCopilot.ts](../../backend/src/routes/adminCopilot.ts)) —
> nunca pelo copiloto do tenant nem pelo demo público (ver
> [services/docs.ts](../../backend/src/services/docs.ts),
> `loadDocsContent()` exclui esta pasta de propósito).

Acessível só por uma sessão `admin_users` (identidade completamente
separada de `users`/tenant — ver `requireAdmin`), em `/admin`, aba
**Tenants** (a que abre por padrão).

## Lista de tenants

Tabela com todos os tenants da plataforma: nome + slug, plano atual,
status (*Ativo*/*Suspenso*), quais dos 3 provedores (Avatar, Voz, Roteiro)
têm credencial conectada, data de criação, e um botão **"Gerenciar"** que
abre o detalhe.

## Detalhe do tenant

### Status

Badge de status + botão **Suspender**/**Reativar**. Suspender um tenant
bloqueia só as 3 rotas de geração (vídeo, roteiro, treino de avatar) —
login, leitura de dados e as outras telas continuam funcionando
normalmente. Reativar volta ao comportamento normal.

### Credenciais dos provedores (Avatar, Voz, Roteiro)

Três cards, um por provedor. Diferente da tela **Configurações** do
próprio tenant (que hoje é somente leitura — "gerenciado pela
plataforma"), aqui o admin **escreve de verdade**: escolhe o vendor e cola
a chave de API em nome do tenant. É o único lugar do sistema onde uma
credencial de provedor pode ser criada/atualizada.

### Armazenamento

Chips para escolher entre **Google Drive** (do próprio tenant) ou
**hospedado pela plataforma** — mesma opção que existe na tela de
Configurações do tenant, editável aqui também.

### Uso e custo por provedor

Tabela com o consumo do tenant: provedor, vendor, tipo de unidade
(segundos, caracteres, tokens de entrada/saída), total de unidades, custo
estimado e se a taxa usada no cálculo já foi conferida.

> **Importante:** o custo mostrado é sempre uma **estimativa**, calculada a
> partir da tabela de taxas de custo (ver
> [admin-taxas-de-custo.md](admin-taxas-de-custo.md)) — nunca um valor que
> algum provedor de IA realmente cobrou. Enquanto nem toda taxa envolvida
> estiver marcada como conferida, um banner deixa isso explícito acima da
> tabela. Nunca trate esse número como cobrança real em uma decisão de
> negócio sem antes conferir as taxas.
