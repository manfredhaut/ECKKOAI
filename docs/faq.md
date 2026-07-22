# Perguntas frequentes

**Como crio meu primeiro vídeo?**
Vá em **Criar vídeo** no menu lateral e siga os 5 passos: configurar (ou
escolher) um avatar, escrever o roteiro, confirmar os recursos (avatar/cenário/
traje), escolher a duração e gerar. Veja
[screens/criar-video.md](screens/criar-video.md).

**Preciso treinar um avatar novo toda vez que crio um vídeo?**
Não. Um avatar é configurado uma vez (fotos + vídeo de referência + voz) e
fica salvo para reuso em quantos vídeos você quiser. Veja
[screens/configurar-avatar.md](screens/configurar-avatar.md).

**Qual a diferença entre "Conhecimento e mídia" e "Imagens de referência"?**
Documentos em "Conhecimento e mídia" são indexados (extraídos, divididos em
chunks e vetorizados) e usados como contexto para a geração de roteiro.
Imagens de referência são só para consulta humana — catálogos, fotos de
marca — e não entram em nenhuma busca. Veja
[screens/conhecimento-e-midia.md](screens/conhecimento-e-midia.md).

**Por que preciso conectar chaves de API em Configurações?**
O app funciona no modelo BYOK (bring your own key): cada tenant usa e paga sua
própria conta nos provedores de avatar/vídeo, voz e IA de roteiro. Sem a chave
conectada, o recurso correspondente não funciona com um provedor real. Veja
[screens/configuracoes.md](screens/configuracoes.md).

**O copiloto (este assistente) usa qual chave de API?**
A mesma chave do **"Provedor de IA para geração de roteiro"** cadastrada em
Configurações — não existe uma chave separada para o copiloto. Se essa chave
não estiver conectada, o copiloto avisa que é preciso configurá-la antes de
conversar.

**O copiloto tem acesso aos documentos que eu subo em "Base de conhecimento
(RAG)"?**
Não. O copiloto responde com base nesta documentação do produto (como usar o
app), não com base nos documentos de negócio que um tenant sobe na aba "Base
de conhecimento (RAG)". São duas bases de conhecimento separadas por design.

**O que aparece no Dashboard?**
Uma visão geral: créditos restantes (quando um provedor de cobrança estiver
conectado), quantidade de vídeos gerados no mês, fila de geração em andamento,
vídeos recentes e avatares salvos — com atalhos para criar um vídeo ou
configurar um avatar.

**Como crio uma conta/tenant nova?**
Pela tela de cadastro (`/signup`), só com email e senha — isso cria
automaticamente sua empresa (tenant), com um subdomínio próprio. Depois do
cadastro é só completar o nome da empresa em "Minha Assinatura". Veja
[screens/minha-assinatura.md](screens/minha-assinatura.md) e [setup.md](setup.md).

**Em quais idiomas o app funciona?**
Português (pt-BR) e inglês (en), alternáveis pelos botões no topo de qualquer
tela.
