# Minha Assinatura

Acessível pelo menu lateral (**Minha Assinatura**). Reúne perfil da empresa,
plano, uso e pagamento.

## Completar perfil

Logo após o cadastro (`/signup`), o nome da empresa ainda não foi definido —
uma seção destacada no topo pede para completá-lo. Depois de salvo, essa
seção some (a heurística usada é: nome da empresa ainda igual ao slug gerado
no cadastro).

## Plano atual

Mostra o plano em uso e uma barra de progresso do uso do mês (vídeos gerados
vs. limite do plano).

## Comparação de planos

Grade com os planos disponíveis (Free, Pro, Business) e um botão para trocar
de plano. A troca é imediata na conta, mas ainda não envolve cobrança real —
isso chega numa fase futura com um provedor de pagamento (Stripe) integrado.

## Forma de pagamento

Mostra o cartão salvo (mascarado) e um botão para atualizar. Assim como a
troca de plano, isso ainda é um cadastro simples sem processamento de
pagamento de verdade por trás.

## Faturas

Lista do histórico de faturas — vazia por enquanto, já que nenhuma cobrança
real acontece ainda.

> **Nota:** cada tenant tem um subdomínio próprio (`<slug>.dominio`), gerado
> automaticamente no cadastro. É nele que o app roda depois do login/cadastro
> — não no domínio raiz.
