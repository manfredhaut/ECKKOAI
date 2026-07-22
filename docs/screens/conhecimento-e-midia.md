# Conhecimento e mídia

Acessível pelo menu lateral (**Base de conhecimento (RAG)**), em `/rag`. É uma
página própria, separada de **Conteúdo** — não é mais uma aba de lá (mudou na
Fase 4 do roadmap). Tem duas seções independentes.

## Documentos

Upload de arquivos `.docx`, `.xlsx` ou `.pdf` pelo botão **"Enviar
documento"`**. Depois do envio, cada documento passa pelo status *processando*
→ *indexado* (ou *erro*, com uma mensagem explicando o que falhou). A lista se
atualiza automaticamente.

O que acontece por trás: o texto do arquivo é extraído, dividido em pedaços
(chunks) e transformado em embeddings para busca semântica. Esse material é
usado como contexto (RAG) pelo assistente de geração de roteiro — ou seja, é a
forma de ensinar ao app informações específicas do negócio do tenant
(produtos, tom de voz, políticas etc.) para que os roteiros gerados façam mais
sentido.

Documentos podem ser excluídos a qualquer momento pelo botão de excluir na
linha correspondente.

> **Importante:** isso é diferente da documentação do produto (a pasta
> `/docs` que você, copiloto, está lendo agora). Os documentos enviados aqui
> são dados do tenant — nunca devem ser confundidos com o conteúdo desta
> documentação nem expostos a outros tenants.

## Imagens de referência

Material de referência geral do cliente — catálogos, fotografia de marca,
referências de estilo — enviado apenas para **consulta humana**. Diferente dos
documentos acima, essas imagens **não são indexadas** para busca semântica, e
também são **separadas** das imagens de cenário/traje usadas no fluxo de
Criar vídeo.

Upload pelo botão **"Enviar imagem"**; as imagens aparecem em uma grade de
miniaturas, cada uma com um botão de exclusão (×) sobreposto.
