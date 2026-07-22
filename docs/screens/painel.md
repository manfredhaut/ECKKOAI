# Painel

Acessível pelo menu lateral (**Painel**), é a tela inicial do app (`/`).
Reúne uma visão geral rápida do uso da conta — números do mês, fila de
geração e o que foi feito recentemente.

## Números do mês

Quatro cartões no topo:

- **Créditos restantes** — hoje mostra "—", porque ainda não existe um
  provedor de cobrança conectado à conta (billing real ainda não foi
  implementado).
- **Vídeos este mês** — contagem real de vídeos gerados no mês corrente, em
  todos os avatares.
- **Custo estimado** — também "—" por enquanto; rastreamento de custo por
  geração é uma funcionalidade futura.
- **Avatares salvos** — quantidade de avatares já configurados na conta.

## Fila de geração

Lista os vídeos que estão *na fila* ou *processando* no momento. Fica vazia
("Nada sendo gerado no momento") quando não há nada em andamento.

## Vídeos recentes

Os 5 vídeos mais recentes da conta, com um trecho do roteiro, duração e
status. Se a conta ainda não tem nenhum vídeo, aparece um atalho direto para
**Criar vídeo**.

## Avatares salvos

Grade com os avatares já configurados. Se a conta ainda não tem nenhum,
aparece o mesmo tipo de atalho para configurar o primeiro em **Criar
vídeo**.

> **Nota:** o Painel só lê dados já existentes (vídeos e avatares) — não tem
> nenhuma ação de criação própria; tudo que pode ser criado a partir daqui é
> só um atalho para a tela **Criar vídeo**.
