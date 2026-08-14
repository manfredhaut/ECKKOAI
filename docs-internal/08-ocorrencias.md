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

---

## Ocorrência 2 · O autofill de dev injeta a credencial da ZONA ERRADA em `/admin/login`

**Contagem: 1ª vez** (14/08/2026, bloco COMPOR-1). **REGISTRADO, NÃO CORRIGIDO**
— por instrução explícita do operador.

**O sintoma, relatado e reproduzido por leitura:** abrir
`http://twinai.localhost:8090/admin/login` mostra o formulário já preenchido
com `demo@eckko.ai` — que é o usuário do TENANT — e o login é recusado. Quem
não conhece o código conclui "a senha do admin está errada"; o que está errado
é o e-mail, e ele foi escrito pela própria aplicação.

**A causa, MEDIDA por leitura de três arquivos:**

1. `/admin/login` e `/login` renderizam **a mesma** `LoginPage`
   ([App.tsx:53](frontend/src/App.tsx:53) — decisão deliberada, para que a URL
   não revele que existe uma zona admin separada).
2. `LoginPage` inicializa o estado com a credencial do tenant **sem olhar a
   rota**: `useState(devTenantCredential?.email ?? "")`
   ([LoginPage.tsx:17-18](frontend/src/pages/Login/LoginPage.tsx:17)).
3. Só existe UMA credencial de dev exportada —
   `devTenantCredential` ([devCredentials.ts:46](frontend/src/devCredentials.ts:46)).
   **Não há `devAdminCredential`**, então não havia o que injetar na outra zona
   nem código que soubesse distinguir as duas.

**Por que isto é defeito e não inconveniente:** o `POST /admin/login` tem
limiter próprio de **5 tentativas / 15 min por IP**
([adminAuth.ts:17-29](backend/src/routes/adminAuth.ts:17),
`LOGIN_RATE_LIMIT_DEFAULTS` em
[loginRateLimitPolicy.ts:23-25](backend/src/services/loginRateLimitPolicy.ts:23)).
Um autofill que garante a credencial errada gasta o orçamento de tentativas
contra um valor que **nunca** poderia funcionar — e o 429 resultante parece
bloqueio de segurança, não erro de preenchimento. O comentário de
[LoginPage.tsx:34-36](frontend/src/pages/Login/LoginPage.tsx:34) já registra
que este endpoint tem histórico de "o login parecia falhar" por causa de
tentativas queimadas; esta é uma segunda porta para o mesmo sintoma.

**O login em si NÃO está quebrado:** `login()` é unificado e o backend decide a
zona — `result.type === "admin"` redireciona para `/admin`
([LoginPage.tsx:28-39](frontend/src/pages/Login/LoginPage.tsx:28)). Apagar os
campos e digitar a credencial de admin funciona hoje, sem nenhuma alteração.
**Não há bug de autenticação — há um valor pré-digitado que não pertence
àquela tela.**

**Consertos possíveis, nenhum executado:**

1. **Não autopreencher em `/admin/*`** — o menor: ler a rota e cair para
   string vazia. Não expõe credencial nova em lugar nenhum.
2. **Adicionar `devAdminCredential`** e escolher pela rota. Mais confortável,
   e mais superfície: passa a existir uma segunda credencial embutida no
   bundle do frontend, exatamente o que
   `checkPolicy` já reprova quando um `DEV_*_PASSWORD` reaparece no fonte
   (ver o cabeçalho de `scripts/seedDevAccess.ts`). **Precisa ser pensado
   contra essa guarda, não contra o conforto.**
3. **Deixar como está e documentar** — é o estado de hoje, e o custo dele é
   esta entrada.
