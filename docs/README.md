# Documentação do eckko.ai

Esta pasta é a documentação **do próprio produto** — como configurar, como usar
cada tela, e perguntas frequentes. Ela é a base de conhecimento usada pelo
copiloto de IA embutido no app (o balão de chat acessível em qualquer tela,
pelo header).

Isso é diferente da aba **Base de conhecimento (RAG)**, que é onde cada
cliente (tenant) sobe os *próprios* documentos de negócio para dar contexto aos
roteiros gerados. Os arquivos aqui não têm relação com dados de nenhum tenant —
são conhecimento operacional sobre o app em si.

## Índice

- [setup.md](setup.md) — instalação, variáveis de ambiente, domínio/subdomínios, criação de tenants
- [screens/painel.md](screens/painel.md) — tela inicial, visão geral de uso e atalhos
- [screens/criar-video.md](screens/criar-video.md) — o assistente de 5 passos para gerar um vídeo
- [screens/configurar-avatar.md](screens/configurar-avatar.md) — como treinar um avatar (fotos, vídeo de referência, voz)
- [screens/conteudo.md](screens/conteudo.md) — histórico de avatares e vídeos já gerados
- [screens/conhecimento-e-midia.md](screens/conhecimento-e-midia.md) — documentos indexados e imagens de referência (página "Base de conhecimento (RAG)")
- [screens/configuracoes.md](screens/configuracoes.md) — conectar os provedores de IA (BYOK)
- [screens/minha-assinatura.md](screens/minha-assinatura.md) — perfil da empresa, plano, uso e pagamento
- [faq.md](faq.md) — perguntas frequentes

## Pasta `admin/`

[admin/](admin/) é conteúdo **interno**, sobre o próprio painel
administrativo da plataforma (`/admin`) — não é sobre nenhuma tela que um
tenant vê. `loadDocsContent()` ([services/docs.ts](../backend/src/services/docs.ts))
exclui essa pasta de propósito: o copiloto do tenant e o demo público
**nunca** recebem esse conteúdo. Só o copiloto do admin
([routes/adminCopilot.ts](../backend/src/routes/adminCopilot.ts)), via
`loadAdminDocsContent()`, lê os arquivos daqui (além de todo o resto desta
pasta). Ao adicionar um novo arquivo aqui, ele já fica automaticamente
restrito — não precisa registrar em nenhuma lista separada.

- [admin/admin-tenants.md](admin/admin-tenants.md) — lista/detalhe de tenants, credenciais, suspensão, uso e custo
- [admin/admin-taxas-de-custo.md](admin/admin-taxas-de-custo.md) — tabela de taxas usada pra estimar custo
- [admin/admin-planos.md](admin/admin-planos.md) — CRUD de planos
