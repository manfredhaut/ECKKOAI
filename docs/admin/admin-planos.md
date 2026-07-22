# Painel admin — Planos

> **Este arquivo é interno.** Só é lido pelo copiloto do admin — ver a nota
> em [admin-tenants.md](admin-tenants.md).

Acessível pela aba **"Planos"** do painel admin (`/admin`). A tabela
`plans` no banco é a fonte de verdade — o que está aqui é exatamente o que
um tenant vê na tela "Minha Assinatura" ao comparar planos.

## Lista de planos

Tabela editável linha a linha: ID (fixo, não editável depois de criado),
nome, preço em centavos, limite de vídeos/roteiros/avatares por mês,
recursos (uma lista em texto, uma linha por item) e se o plano está
**ativo**. Cada linha tem seu próprio botão **Salvar**, habilitado só
quando algo naquela linha muda.

As mudanças são **em tempo real** — o tenant vê o resultado assim que
recarrega a tela de Minha Assinatura, sem precisar de deploy.

## Desativar um plano

Não existe exclusão de verdade. Desmarcar **"Ativo"** só tira o plano da
lista de opções para quem ainda vai escolher um plano — um tenant que já
está naquele plano continua nele normalmente, sem nenhuma mudança
("efeito avô"). É a forma correta de aposentar um plano antigo sem quebrar
quem já o usa.

## Criar um plano novo

Formulário próprio abaixo da tabela. O **ID** é a única decisão
irreversível: precisa ser minúsculo, só letras/números/hífen, e não pode
ser alterado depois de criado — é o valor persistido em
`tenants.plan_id` para qualquer tenant que vier a escolher esse plano.
