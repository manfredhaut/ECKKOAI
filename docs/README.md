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

## Quem enxerga cada arquivo

A exposição de cada arquivo desta pasta é decidida por uma **allowlist
explícita** em
[backend/src/services/docsManifest.ts](../backend/src/services/docsManifest.ts),
com três níveis cumulativos:

| Nível | Quem lê |
|---|---|
| `public` | copiloto da landing (visitante anônimo), copiloto do tenant e do admin |
| `tenant` | copiloto do tenant e do admin |
| `admin` | só o copiloto do admin |

**Um arquivo que não está no manifesto não chega a nenhum copiloto** — nem ao
do admin. Criar o arquivo não publica nada; alguém precisa classificá-lo no
manifesto. Se um `.md` desta pasta não estiver listado, o backend registra um
aviso no log ao carregar a documentação pela primeira vez.

Antes disso a regra era o inverso: varria-se `docs/**/*.md` e excluía-se
apenas `docs/admin/`. Excluir o que é secreto falha aberto para qualquer
arquivo novo — foi assim que [setup.md](setup.md), que descreve variáveis de
ambiente e o funcionamento da sessão, acabou dentro do prompt do copiloto
público. Incluir o que é público falha fechado.

## Pasta `admin/`

[admin/](admin/) é conteúdo **interno**, sobre o próprio painel
administrativo da plataforma (`/admin`) — não é sobre nenhuma tela que um
tenant vê. Todos os arquivos daqui são classificados como `admin` no
manifesto, e só o copiloto do admin
([routes/adminCopilot.ts](../backend/src/routes/adminCopilot.ts)) os recebe.

- [admin/admin-tenants.md](admin/admin-tenants.md) — lista/detalhe de tenants, credenciais, suspensão, uso e custo
- [admin/admin-taxas-de-custo.md](admin/admin-taxas-de-custo.md) — tabela de taxas usada pra estimar custo
- [admin/admin-planos.md](admin/admin-planos.md) — CRUD de planos
