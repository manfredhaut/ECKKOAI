# Conteúdo

Acessível pelo menu lateral (**Conteúdo**), em `/content`. Reúne o histórico
da conta em duas abas — **Avatares** e **Biblioteca de vídeos**.

> **Diferente de "Base de conhecimento (RAG)":** essa é outra tela (`/rag`,
> ver [conhecimento-e-midia.md](conhecimento-e-midia.md)) — documentos e
> imagens de negócio do tenant, sem relação com avatares/vídeos. Antes da
> Fase 4 do roadmap, "Conhecimento e mídia" era uma aba desta mesma tela;
> hoje é uma página própria.

## Aba Avatares

Tabela com todos os avatares já configurados: nome, provedor (HeyGen/D-ID
etc., ou "—" se ainda não treinado), voz clonada (ou "—") e data de criação.
Cada linha tem um botão **"Retreinar"**.

Se ainda não existe nenhum avatar, aparece um atalho para configurar o
primeiro em **Criar vídeo** — esta tela não tem um fluxo próprio de criação
de avatar, só lista o que já foi configurado por lá.

## Aba Biblioteca de vídeos

Tabela com todos os vídeos já gerados: trecho do roteiro, duração, status
(*na fila* / *processando* / *pronto* / *erro*) e data de criação. Quando o
status é *pronto*, a linha tem um botão **"Baixar"**; nos outros status,
aparece só "—" no lugar do botão.

Se ainda não existe nenhum vídeo, aparece o mesmo tipo de atalho para
**Criar vídeo**.
