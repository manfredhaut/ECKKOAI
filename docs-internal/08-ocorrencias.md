# 08 · Ocorrências recorrentes — o mesmo defeito, contado

Este arquivo existe para uma coisa só: **contar repetições**. Um defeito que
volta pela terceira vez não é azar, é um processo que não tem freio — e a
única forma de isso ficar visível é alguém somar. Cada entrada diz o que
falhou, quantas vezes, e o que a repetição está pedindo que mude.

Mora em `docs-internal/` e não em `docs/` por decisão fechada (ESTADO §2):
`docs/` é a árvore que alimenta o copiloto, e isto aqui é memória de
engenharia. **O pedido original desta entrada dizia `docs/historico`** — o
desvio está declarado aqui para poder ser revertido por quem decide.

---

## Ocorrência 1 · A lista de commits do ESTADO.md §1 diverge do HEAD

**Contagem: 3ª vez** (14/08/2026, bloco EXPOSICAO-1).

**A terceira está MEDIDA.** No começo do EXPOSICAO-1 o §1 abria com
`54bb282` no topo e o repositório estava em `bfd5364` — **nove commits de
atraso**. `git log --follow -- ESTADO.md` mostra que o arquivo foi tocado sete
vezes nessa janela (`979e61d`, `22e644f`, `71e2de5`, `7b74d19`, `91dec88`,
`a8020af`, `bfd5364`): a lista não envelheceu por falta de commits no arquivo,
envelheceu porque **nenhum deles reescreveu a lista**. O bloco é o único
pedaço do ESTADO.md que precisa ser regenerado, e é o único que ninguém
regenera.

**As duas ocorrências anteriores são DECLARADAS pelo operador, não medidas
por mim** — não fui atrás delas nesta rodada, e inventar datas para fechar uma
narrativa seria pior que registrar a lacuna. O que a contagem dele sustenta é o
padrão; o que está medido aqui é a terceira instância.

### Por que ela é pior que uma nota velha qualquer

O ESTADO.md é lido **com confiança e primeiro**, por instrução própria. Uma
seção chamada "Onde o repositório está" que descreve outro ponto da história
não é informação faltando — é informação errada com aparência de certa, e ela
é internamente coerente (os commits existem, as mensagens conferem, a ordem
está certa). É o mesmo gênero de armadilha do gotcha 1 do arnês: `docker
compose logs` sem `--tail` devolve um log rotacionado, congelado e coerente.

### O que a repetição está pedindo

Não é "prestar mais atenção" — três vezes já provaram que atenção não é o
freio. As saídas, em ordem de custo:

1. **Regenerar a lista por comando** em vez de à mão (`git log -11
   --format="%h  %s"`), no mesmo passo que já atualiza o arquivo no último
   commit da sessão.
2. **Conferir a âncora como primeiro comando da sessão**, ao lado de `git
   status` — barato, e é o que pegou esta.
3. **Guarda de gate** que compare o topo da lista com `git rev-parse HEAD~1`.
   É a única que não depende de ninguém lembrar, e é também a que mais
   incomoda: ela reprovaria todo commit que não reescrevesse o bloco.

Nenhuma das três foi executada nesta rodada — o EXPOSICAO-1 era de LEITURA E
MEDIÇÃO, e a única escrita autorizada foi corrigir a lista e abrir este
arquivo. **Escolher entre as três é do operador.**
