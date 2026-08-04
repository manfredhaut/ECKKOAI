<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 1081-1603 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# Ambiente, gotchas, roteiro da demo, cota por fornecedor e o aviso da chave Google

### Bloco PENDENCIAS-1 — galeria e carteira (PARCIAL: partes 1 e 2)

**Galeria de passos em `/dev/steps`** ([StepGallery.tsx](frontend/src/dev/StepGallery.tsx)),
só com `DEV_GALLERY=1`; em produção a rota **não é registrada**, então cai
no 404 em vez de virar tela vazia — uma rota que responde 200 com nada
esconde que o caminho continua vivo. `npm run check` reprova a flag ligada
com `NODE_ENV=production` (provado).

A galeria monta os **componentes reais** dos 5 passos, mais Conteúdo e o
Painel admin — nenhuma cópia. Cópia envelhece sozinha e passa a mostrar uma
tela que não existe mais, o que é pior que não ter galeria.

**Inércia, com número em vez de promessa:** `installGalleryFetch()`
substitui `window.fetch` por um interceptor sem caminho de escape —
requisição desconhecida é bloqueada, nunca repassada. Os contadores ficam na
própria tela. *Medido na captura:* `served: 11, blocked: 8, escaped: 0`, e o
Chrome registrou **0 requisições a hosts externos**.

**O item que estava cego no VIDEO-0 foi fechado:** o bloco de fundo aparece
**sem câmera**, porque quem o revela é o estado `draftAvatar`, não a câmera.
*Medido:* flag desligada → bloco inerte com o motivo ("depende de teste
ainda não realizado com a HeyGen"), sem seletor; flag ligada → seletor
presente, sem bloco de indisponibilidade.

**Dois defeitos que a própria galeria expôs**, ambos de contexto faltando:
`FieldHelpIcon` exige o `CopilotProvider` e o painel admin exige o
`AdminCopilotProvider` — sem eles a árvore inteira caía. Daí saiu a correção
mais útil do bloco: um **error boundary por painel**
([GalleryBoundary.tsx](frontend/src/dev/GalleryBoundary.tsx)). Sem ele, um
passo quebrado deixava TODAS as capturas em branco, um sintoma que mente
mais que o defeito original.

**Capturas** ficam em `.gallery-shots/`, **fora do git** (screenshot no
repositório o incha e desatualiza a cada mudança de UI). Regeradas por um
script puppeteer no scratchpad — efêmero, ver seção 5 para recriar.

**Proteção da carteira (Parte 2).** A proteção só olhava para um lado:
impedia `fixture` em produção, mas nada impedia `live` em desenvolvimento —
e trocar uma palavra no `.env` liberava chamada real numa carteira que
comporta cerca de um vídeo. Agora
([liveGuard.ts](backend/src/services/providers/liveGuard.ts)):

1. **Intenção explícita.** `live` exige `PROVIDER_LIVE_CONFIRM` com valor
   exato. É uma frase, não `true`: o texto é metade da proteção, porque quem
   digita aquilo leu o que estava digitando. *Medido:* sem ela o servidor
   **não sobe** — `exit_code=1`, e o entrypoint propaga ao PID 1.
2. **Teto por sessão**, default **1**, aplicado em `generateVideo` e
   `cloneVoice`. Intenção protege do acidente de configuração; o teto
   protege do laço que dispara dez vezes, que nenhuma declaração impediria.
3. **Log inequívoco no boot**, nos dois modos — subir gastando dinheiro real
   não pode ser indistinguível de subir em simulação na leitura do log.

**O que NÃO foi feito deste bloco** (cortado no ponto que você previu):
- **Parte 3 — auditoria das guardas existentes.** Nenhuma das guardas
  antigas ganhou caso versionado de reprovação, e **não foi levantado quais
  delas passam verde sem inspecionar nada**. Esta é a mais importante das
  três que ficaram: é exatamente a classe de defeito que já apareceu duas
  vezes (a de flags no VIDEO-0, e a de credencial que só pegou por acaso).
- **Parte 4 — retaguarda BYOK visível e com remoção agendada.**
- **Parte 5 — origem dos `.mp4` de 16 bytes e validação de artefato no
  download.** Os arquivos continuam em `uploads/4bbed629/`.

### Bloco VIDEO-0 — modo fixture, feature flags e chaves (CONCLUÍDO)

**1. `PROVIDER_MODE=fixture` gera de ponta a ponta sem tocar a rede.**
Vale só para HeyGen e ElevenLabs (os caros); provedores de texto ficam de
fora de propósito. Padrão `fixture` em desenvolvimento, `live` em produção,
e valor inválido cai no seguro em vez de virar um terceiro modo silencioso
([providerMode.ts](backend/src/services/providers/providerMode.ts)).

O que dá valor ao modo é ele **não** devolver o resultado pronto: o job
simulado fica 12 s em `processing` antes de concluir. Um stub que responde
"pronto" na primeira chamada esconderia justamente os defeitos de fluxo
assíncrono. *Medido:* `queued → processing → processing → ready`, depois
download **HTTP 200** com `Content-Disposition: attachment` e 50.600 bytes
— exatamente o tamanho da fixture.

As fixtures são geradas por ffmpeg e **versionadas** em `backend/fixtures/`
(mp4 h264 640×360 5 s com áudio; mp3 3 s). Antes de gerar, procurei
artefatos aproveitáveis: os únicos mp4 do projeto tinham **16 bytes**
(placeholders vazios), e os mp3/wav existentes são de um tenant real —
versionar dado de cliente como fixture não era opção.

*Dois defeitos achados por rodar de verdade, não por revisar:* o Dockerfile
não copiava `backend/fixtures/`, então a simulação falhava **no meio do
job** (o pior momento para descobrir); e o proxy de download recebia URL
relativa e devolvia 502. O segundo foi corrigido resolvendo a URL contra o
próprio servidor, e **não** desviando para leitura em disco — desviar faria
o proxy só rodar em produção, que é onde não se quer descobrir defeito nele.

**2. Marca de simulação, por item e não por ambiente.** `SimulatedBadge`
usa o fato gravado na linha (`videos.simulated`), com o modo global só como
retaguarda. *Verificado na tela:* na Biblioteca de vídeos, os 3 vídeos de
fixture aparecem com **SIMULADO** e os 3 vídeos reais do HeyGen **não** —
mesmo com o ambiente inteiro em modo fixture. Fosse pelo modo global, os
reais teriam sido marcados como simulados, que é a mentira inversa.

**3. Ledger separado.** `credit_ledger.simulated` é coluna própria, não um
`reason` novo — simulação é ortogonal ao motivo, e codificá-la dentro de
`reason` dobraria a lista a cada modo. `GET /admin/tenants/:id/credit-usage`
devolve `real` e `simulated` em listas separadas, **nunca somadas**, e a
tela repete o aviso. *Medido:* `video real=1, video simulado=3`.

**4. Registro de feature flags** ([featureFlags.ts](backend/src/services/featureFlags.ts)):
o código define quais existem e o **motivo**; a tabela `feature_flags`
guarda o estado, alternável pelo admin sem rebuild. Primeira flag:
`removable_background`, **desligada**, motivo "depende de teste ainda não
realizado com a HeyGen". Contrato de UI: recurso atrás de flag desligada
aparece inerte **com o motivo** — nunca some, nunca vira botão que dá erro.

**5. Chaves de plataforma separadas** — ver decisão 1b acima.

**Quatro guardas novas no `npm run check`, todas provadas reprovando:**
fixture com `NODE_ENV=production`; caminho de vendor sem consultar
`isFixtureMode()`; flag fora do registro; e o caso que **deve** passar.

**Achado que vale registrar:** a guarda de flag, na primeira versão, **não
pegava nada** — a lista de helpers trazia `useFeatureFlag`, e o hook real
chama-se `useFeature`. Ela passava sem inspecionar uma linha sequer. Uma
guarda que não casa com nada é pior que guarda nenhuma, porque parece
cobertura. Só apareceu porque testei se ela reprovava de verdade.

**Não verificado visualmente:** o contrato de flag na tela de avatar. O
bloco de fundo só renderiza depois de "Iniciar captura", e a câmera é
bloqueada nesta ferramenta. Verificado por API (o motivo chega ao cliente)
e por código, não por olho.

### Bloco ACESSO-FINAL — ambiente de pé e acesso destravado (CONCLUÍDO)

**1. O backend agora morre de verdade quando o bootstrap falha.** O Bloco 6
tinha diagnosticado o modo de falha (container `running`, servidor morto,
`tsx watch` sobrevivendo ao filho); aqui ele foi corrigido na causa.

A escolha foi separar **migrar de servir** num entrypoint
([backend/docker-entrypoint.sh](backend/docker-entrypoint.sh)): `set -e` faz
a falha do migrate encerrar o PID 1 com código ≠ 0, e `exec` faz o servidor
*ser* o PID 1, de modo que a morte dele seja a morte do container. As outras
duas opções foram descartadas com evidência, não por gosto: **propagar a
saída pelo `tsx watch` é impossível** — o `--help` do tsx instalado só
oferece `--no-cache`, `--tsconfig`, `-h`, `-v`, nenhuma flag de exit code; e
**autoheal** acrescentaria um quinto container vigiando sintoma em vez de
corrigir a causa.

**Consequência deliberada: sem `watch` dentro do container.** O hot reload
já não era confiável através do bind mount (editar rota exigia restart
manual de qualquer jeito — está registrado neste arquivo), então ele cobrava
o custo de esconder crashes sem entregar o benefício. `npm run dev` continua
existindo com watch para uso local; o container usa `npm run serve`.

*Medido, não deduzido:* com o Postgres derrubado, o backend saiu de
`running` e entrou em `restarting` com `RestartCount` subindo de 2 a 9; ao
subir o Postgres de volta, **`/api/health` voltou a 200 em +20s sem nenhuma
ação humana**.

**2. Os quatro serviços têm restart policy e healthcheck.** Faltavam
healthchecks no traefik e no frontend. O do traefik usa `traefik
healthcheck`, o comando da própria imagem, o que exigiu habilitar `ping: {}`
em `traefik/traefik.yml` (vem desabilitado por padrão). Isso importa porque
traefik é a única porta exposta: de pé mas sem rotear, o endereço "existe" e
não funciona, que é o modo de falha mais confuso de diagnosticar.

**3. O loop do `/admin` foi corrigido — e a causa registrada aqui estava
errada.** Este arquivo dizia que "o `AdminAuthProvider` não revalida a
sessão". Ele revalida: tem `refreshMe()` no mount e no próprio `login()`. A
causa real é outra: `/admin/login` renderiza o **`LoginPage` unificado**,
que autentica pelo `AuthContext` do *tenant* e fazia `navigate("/admin")`
client-side. Isso não remonta o `AdminAuthProvider`, então `admin` seguia
`null`, o `AdminProtectedRoute` rejeitava e devolvia para `/admin/login` — e
cada volta queimava uma tentativa do limiter, fazendo o sintoma parecer
"senha errada". Correção: navegação **real** nesse caso, como o
`AdminLoginModal` já fazia. `refreshMe` também passou a ser exposto no
contexto, para quem adicionar um caminho client-side no futuro.

*Medido:* com o limiter zerado, o primeiro 429 cai na 6ª tentativa (limite
5). Depois de **cinco** acessos a `/admin` pela barra de endereço, o
primeiro 429 continua na 6ª — ou seja, `/admin` não consome tentativa
nenhuma. E o login pelo modal do rodapé leva ao Painel admin de primeira,
verificado com clique real.

**4. Limiter de login configurável, com o default igual ao valor de
produção** ([loginRateLimitPolicy.ts](backend/src/services/loginRateLimitPolicy.ts)).
Afrouxar é opt-in por variável de ambiente; `npm run check` **reprova o
build** se um valor folgado estiver ativo com `NODE_ENV=production`. Valor
inválido ou negativo cai no default em vez de virar `NaN` — um limiter com
`NaN` compararia sempre falso e desligaria a proteção em silêncio.

**5. Credenciais de dev preenchem os formulários, sem literal no fonte.** Os
valores entram só por `define` do Vite, lidos do `.env` (fora do git), e
falham fechado: sem `DEV_AUTOFILL=1`, e em qualquer build de produção,
chegam vazios. Há aviso visível ao lado dos campos.

**Achado no caminho, e é o mais sério deste bloco:** as senhas de dev
**estavam publicadas no repositório** — como default de um `||` em
`backend/scripts/seedDevAccess.ts`, que é versionado. Um default confortável
é exatamente como uma senha vaza: ninguém a digita, então ninguém percebe
que ela está no git. Os defaults foram removidos (o script agora exige as
variáveis) e `npm run check` passou a varrer o fonte procurando o valor das
`DEV_*_PASSWORD`. **A guarda provou seu valor imediatamente: reprovou o
build por causa de um comentário que eu mesmo escrevi citando a senha
antiga.** Como as senhas estiveram no histórico do git, continuam valendo
como comprometidas — a rotação já pendente segue pendente.

**Todas as guardas novas foram provadas falhando de verdade**, não só
escritas: limiter folgado com `NODE_ENV=production`; `DEV_AUTOFILL=1` com
`NODE_ENV=production`; serviço sem healthcheck e serviço sem restart (num
compose de teste, em diretório temporário — nunca com `git checkout` sobre
arquivo modificado, pela lição já registrada); e a de credencial literal.
Também foi verificado o caso que **deve passar**: limiter folgado fora de
produção não reprova nada.

**6. Porta de entrada única na landing.** "Começar agora"/"Começar grátis" e
"Já tenho conta" abrem o **mesmo** painel, em abas diferentes ("Criar conta"
é a padrão) — quem erra o botão troca de aba em vez de voltar. "Entrar"
continua navegando de verdade para o subdomínio do tenant, que é onde o
lookup é escopado. Os botões **dos planos** continuam indo direto para
`/signup`: ali o cliente já escolheu o plano, e interceptar com um painel
adicionaria um passo no funil de compra. **Se você quiser os planos também
passando pelo painel, é uma linha — não fiz por não ser reversível sem
decisão sua.**

### Bloco 6 — resiliência de ambiente (CONCLUÍDO, com dois achados)

Duas edições em `docker-compose.yml`, ambas commitadas: `restart:
unless-stopped` no **traefik** (era o único dos quatro sem política, e é o
único exposto ao navegador) e um `healthcheck` em `/health` no **backend**.

**Achado 1 — a política de restart funciona; o teste anterior é que estava
errado.** A sessão anterior matou os quatro containers com `docker kill`,
viu que não voltaram, e registrou como possível falha do Docker
Desktop/WSL2. Refeito um por vez, a causa ficou isolada e é outra:

- Matei **só** o frontend. Resultado: `Exited (137)`, `restartCount=0`,
  **60 s inteiros sem voltar** — e os outros três seguiram `running`. Ou
  seja, **o daemon nunca caiu**; a hipótese do kill múltiplo está descartada.
- Container descartável com a mesma política, saindo sozinho com `exit 1`:
  `restartCount` subiu para 1, depois 2. **A política reinicia.**
- O mesmo container, morto com `docker kill`: `Exited (137)`,
  `restartCount=0`, não voltou.

**Conclusão: `docker kill` não simula crash.** O daemon o trata como parada
solicitada pelo operador, igual a `docker stop`, e `unless-stopped` significa
literalmente "reinicie, a menos que tenham parado" — kill conta como parar.
Não é limitação do Docker Desktop nem do WSL2 (`LiveRestore=false` foi
verificado e não teve papel aqui). Para testar recuperação, faça o processo
morrer por conta própria.

**O `docker compose ps` "vazio" também tem explicação prosaica:** sem `-a`
ele **só lista containers em execução**. Quatro containers `exited` produzem
listagem vazia sem que nenhum tenha desaparecido. Use `docker compose ps -a`
ao diagnosticar.

**Achado 2, mais sério — o backend tem um modo de falha em que o container
mente `running`.** Testado derrubando o Postgres e recriando o backend com
`--no-deps`:

- O backend **não morre**: fica `running`, `restartCount=0`, servidor sem
  nunca fazer `listen`, e `/api/health` responde **502**.
- Causa: o container roda `npm run dev` → `tsx watch`. O
  `main().catch(→ process.exit(1))` de `index.ts` mata **só o processo
  filho**; `npm run dev` (PID 1) e `tsx watch` (PID 18) continuam vivos
  esperando mudança de arquivo. Confirmado com `ps` dentro do container.
- Como o processo principal não saiu, **a política de restart nunca
  dispara**. E o healthcheck detecta (`FailingStreak` subiu até 10) mas
  **não conserta**: no Docker standalone, healthcheck não reinicia container
  — só o Swarm faz isso.
- **O backend não se recuperou sozinho nem depois do Postgres voltar** —
  mais de 60 s em 502. Só voltou com `docker compose restart backend`
  (5 s até `healthy`).
- Na operação normal isso não aparece, porque `depends_on: condition:
  service_healthy` segura o backend. O cenário exige `--no-deps`, ou o
  Postgres caindo depois.

**Regra prática que sai daí: `running` não é sinal de saúde neste
projeto — `/api/health` é.** Se a API responder 502 com o container
`running`, o conserto é `docker compose restart backend`, não investigar
código.

Dado colateral: com o **frontend** fora do ar, a landing devolve **502** e a
API segue 200. Se a tela cair mas a API responder, o suspeito é o frontend.

**Os três caminhos foram reconfirmados após todo esse ciclo**: smoke 21/21, e
na landing real os botões apontam para `/signup`, para
`dev-c77a5b.twinai.localhost:8090/login` (navegação real ao subdomínio, não
POST do domínio raiz) e para o modal de acesso administrativo.

### Gotchas de ambiente (todos já custaram tempo)

- **Bundle velho do Vite:** editar `.tsx`/`.css` e "não aparecer" no
  navegador é o caso comum. Rode `docker compose restart frontend` **antes**
  de suspeitar do código React. O smoke detecta isso na verificação 21.
- **O container do backend não usa mais `tsx watch`** (ver bloco
  ACESSO-FINAL): editar `backend/src/**` exige `docker compose restart
  backend` para ter efeito — o que na prática já era necessário, porque o
  watch não recarregava de forma confiável através do bind mount.
- **`vite.config.ts`, `package.json`, `Dockerfile` e o entrypoint NÃO estão
  no bind mount.** Mexer em qualquer um deles exige
  `docker compose build <serviço>`; um `restart` não basta. **O sintoma pode
  ser MUITO pior que "a mudança não existir": se um `define` novo do
  `vite.config.ts` for usado pelo código do bind mount, a app inteira quebra
  em branco** — console limpo, Vite dizendo `ready`, healthcheck verde.
  Aconteceu com `__MAX_IMAGE_BYTES__` (ver FORMATO-1). Para diagnosticar,
  importe o entrypoint à mão no console: `import('/src/main.tsx').catch(e =>
  e.message)` — é onde o erro real aparece.
- **`docker compose restart` NÃO recarrega variável de ambiente.** Para
  `.env` novo é preciso `docker compose up -d <serviço>`, que recria o
  container.
- **`package.json` não está no bind mount** (só `./backend/src`): script npm
  novo só existe no container após `docker compose build backend`.
  Vale também para `backend/scripts/seedDevAccess.ts`.
- **Não teste recuperação com `docker kill`** — ver Achado 1.
- **`docker compose ps` esconde containers parados** — use `-a`.
- **🔴 `docker compose logs` MENTE sobre o fim do log — use `--tail 500`.**
  *MEDIDO em 04/08/2026, e custou uma conclusão errada inteira.* O log é
  rotacionado pelo daemon (o compose não declara `max-size`; `LogConfig` vem
  `{}`), e `docker compose logs` **sem `--tail`** — assim como `docker logs`
  direto, `--since`, e `--tail` acima de ~1000 — devolve o arquivo
  **ANTERIOR**, congelado no instante da rotação. Só `--tail 500` ou menos
  alcança o arquivo atual:

  | Comando | Último timestamp devolvido |
  |---|---|
  | `docker logs` / `docker compose logs` | 09:20:34 ← congelado |
  | `--since 09:20:00Z` | 09:20:34 ← congelado |
  | `--tail 5000` · `--tail 1500` · `--tail 1000` | 09:20:34 ← congelado |
  | **`--tail 500`** · `--tail 50` | **09:51:44** ← real |

  **Por que isso é caro e não só chato:** o log velho é internamente
  coerente — tem 17.932 linhas, começa no boot certo, e nada nele parece
  truncado. Uma requisição bem-sucedida que aconteceu depois da rotação
  simplesmente **não existe** ali. Foi assim que uma sessão concluiu que a
  tela "nunca enviou a amostra de voz, 6.956 requisições e zero POST",
  quando o POST existia, tinha respondido 201 e gravado no banco. **Nunca
  conclua ausência de evidência a partir de `docker compose logs` puro.**
  Antes de afirmar que algo não aconteceu, confira o último timestamp da
  janela contra o relógio: `--tail 500 | grep -oE '"time":[0-9]+' | tail -1`.
- O Browser pane **erra o mapeamento de clique** quando o viewport é forçado
  por `resize_window` com largura fixa; no tamanho nativo funciona.
  Digitação e Tab sempre funcionam; Enter/Espaço não ativam botão.
- **A câmera é bloqueada no Browser pane** (`NotAllowedError`) em toda
  sessão registrada. Validação de fundo virtual só o usuário consegue fazer.

---

## ROTEIRO DA DEMO (leia antes de apresentar)

**Endereço único: `http://twinai.localhost:8090`.** Não abra mais nada pela
barra de endereço — os três caminhos saem todos de lá:

| Caminho | Onde clicar | Para onde vai |
|---|---|---|
| **Cliente novo** | "Começar agora" / "Começar grátis" | painel de entrada, aba **Criar conta** (padrão) → `/signup` |
| **Cliente existente** | "Já tenho conta" | o **mesmo** painel, já na aba **Entrar** → `dev-c77a5b.twinai.localhost/login`, navegação real ao subdomínio |
| **Painel admin** | "Acesso administrativo" (rodapé, discreto) | modal próprio → `POST /admin/login` → `/admin` |

Os botões **dentro dos planos** continuam indo direto para `/signup`, sem
passar pelo painel — ali o plano já foi escolhido.

**Em desenvolvimento os formulários já vêm preenchidos** (com aviso na
tela), então na demo não é preciso digitar senha nenhuma.

**Dez minutos antes de apresentar, rode:**

```bash
./tools/smoke-demo.sh
```

21 verificações numa passada — containers, landing, os três caminhos,
credenciais fixas, avatar treinado, créditos, credenciais de provedor e se o
bundle do Vite está atualizado. **Não gasta nenhuma requisição de
fornecedor.** Sai 1 se algo que a demo usa estiver quebrado.

**Se algo cair no meio da demo, o diagnóstico é por sintoma, não por
`docker compose ps`** (que esconde container parado — use `-a`):

| Sintoma | Causa provável | Conserto |
|---|---|---|
| Tela em branco / 502 na landing, mas API responde | frontend caído ou bundle velho | `docker compose restart frontend` |
| Landing abre, mas tudo dá erro; `/api/health` = 502 | backend morto **com o container ainda `running`** (modo de falha registrado nos gotchas) | `docker compose restart backend` |
| O endereço não existe mais | traefik caído | `docker compose up -d` |

**`running` não é sinal de saúde neste projeto — `/api/health` é.** A
política `restart: unless-stopped` cobre crash de processo, mas **não** cobre
o modo de falha do backend descrito no Bloco 6, em que o `tsx watch`
sobrevive à morte do servidor. Na dúvida, `docker compose up -d` é sempre
seguro.

**Armadilha durante a demo:** `Sair` em qualquer zona chama
`session.destroy()` e **derruba admin e tenant ao mesmo tempo** — as duas
sessões vivem no mesmo cookie. Se for mostrar as duas zonas, use abas
separadas e não clique em Sair no meio; para trocar, abra uma aba anônima.
Também não entre em `/admin` pela barra de endereço: o `AdminAuthProvider`
não revalida a sessão e cada volta consome uma das 5 tentativas/15min do
rate limiter, fazendo parecer "senha errada".

**Armadilha de PALCO no passo 1, e é a mais cara do fluxo da demo:** ao lado da
grade de avatares existe o botão **"Novo avatar"**
([AvatarSetupStep.tsx:259](frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx:259)).
Em live, o caminho que ele abre dispara **treino de avatar** — **US$ 1,00** de
`photo_avatar` mais **1 crédito de avatar** ([avatars.ts:212](backend/src/routes/avatars.ts:212)
e [:193](backend/src/routes/avatars.ts:193)) — **antes** de qualquer clonagem de
voz, ou seja **~6× o custo do vídeo planejado**, e no mesmo passo que a
apresentação percorre. **Regra: no passo 1, clicar APENAS no card do Mário.**
Selecionar um avatar existente nunca alcança esse caminho (é `onSelectAvatar`, e
não preenche `draftAvatar`) — ver o aviso no topo da seção TELA-1.

### Cota de cada fornecedor — o que dá para ensaiar

| Fornecedor | Estado em 2026-08-01 | O que isso permite |
|---|---|---|
| **HeyGen** | `billing_type: wallet`, saldo **US$ 13,85**, `remaining_quota` **831** (medido em 03/08 21:29 UTC, depois da passada do LIVE-3) | ~19 vídeos de 15 s como o medido (US$ 0,70 cada), ou ~277 s de vídeo. Deixou de ser o gargalo |
| **Gemini** | Free tier, ~20 requisições/dia, compartilhado com o copiloto | Um roteiro custa 1–2 requisições. Cabem poucos ensaios por dia |
| **ElevenLabs** | Chave sem permissão `user_read` — **não dá para consultar a própria cota pela API**. *MEDIDO no LIVE-3:* `GET /v1/user/subscription` → **401** `"missing the permission user_read"`. É permissão faltando, **não** chave inválida | TTS funciona normalmente. O painel é a única fonte, e ele **discrimina por chamada**: *MEDIDO em 03/08* — 180 caracteres = **90 créditos** = **US$ 0,018**, ou seja **0,5 crédito por caractere**. O teto do plano é 64.917 créditos ⇒ ~129.800 caracteres no total, ou **~720 roteiros** do tamanho do LIVE-3 (DEDUZIDO da razão; o consumo acumulado atual não foi lido). **A voz não é gargalo de nada** |

**A unidade de `remaining_quota` deixou de ser mistério: 60 unidades por
dólar.** O registro anterior dizia que as duas leituras (quota e carteira)
"não se reconciliam com certeza". Reconciliam, e a razão fechou exata em dois
pontos medidos na mesma passada: 930 ÷ 15,50 = 60,0 antes, 921 ÷ 15,35 = 60,0
depois. **1 unidade ≈ US$ 0,0167.** Dois pontos com a mesma razão é forte, mas
é dedução a partir de duas amostras — o fornecedor não declara a unidade em
lugar nenhum da resposta.

**Custo real de vídeo, medido:** 3,372 s de vídeo custaram **US$ 0,15 / 9
unidades**.

> **CORREÇÃO (Bloco 5E, 2026-08-03): a taxa NÃO é US$ 0,045/s, e a "diferença
> por arredondamento de bloco" desta linha estava explicada errado.** Dividir o
> gasto pela duração fracionária dava um número diferente a cada medição (2,67 ·
> 2,83 · 2,94 un/s) porque a cobrança é por **segundo INTEIRO truncado**, a 3
> unidades cada. Com essa regra as três medições fecham exatas: 3,372→3×3=**9**,
> 16,972→16×3=**48**, 33,696→33×3=**99**. Ou seja **US$ 0,05 por segundo
> inteiro**, que é o que a tabela pública do fornecedor anuncia para avatar de
> foto. Ver o bloco 5E no fim deste arquivo.

**Formato real do que a HeyGen devolve, medido com `ffprobe` no arquivo
baixado:** MP4 (QuickTime/MOV), **h264 High, 1280×720, DAR 16:9, SAR 1:1,
25 fps**, áudio AAC-LC 48 kHz estéreo. É **horizontal**, e é o padrão da conta:
como `POST /v3/videos` não manda `dimension` nem `aspect_ratio`, nunca
escolhemos a proporção — ver o item 1 dos "três fatos verificados no POLL-1".

**Custo de criação de avatar continua sendo o item caro:** US$ 1,00 por
`photo_avatar` (medido no DEMO-3), contra US$ 0,15 por um vídeo curto.

**Pendência de segurança que não pode ir para operação:** a chave Gemini em
uso pelo tenant de demo foi colada em texto plano numa conversa de chat.
**Rotacione antes de qualquer billing ou uso real** — mesmo precedente das
senhas de `admin@eckkoai.com`/`demo@eckko.ai`.

---

## ⚠ CHAVE GOOGLE EM USO É DE DESENVOLVIMENTO — TROCAR ANTES DE VPS/PRODUÇÃO

A chave Google que atende o copiloto hoje é de desenvolvimento, de um projeto
em **free tier** (~20 requisições/dia), e **passou por transcrição de chat** —
ou seja, o valor esteve em texto plano no histórico de uma conversa. Isso a
torna comprometida por definição, independentemente de quem leu.

**Antes de qualquer VPS, produção, billing ou demonstração externa: gere uma
chave nova no fornecedor e grave-a pelo painel admin** (aba APIs → "Chaves da
plataforma"). Gravar pela tela evita repetir o problema — o valor não aparece
na tela, não vai para o scrollback do terminal e não passa por arquivo nenhum.

O mesmo vale, pelo mesmo motivo e desde 2026-07-30, para as senhas de
`admin@eckkoai.com` e `demo@eckko.ai`.

**Contexto de cota, que continua valendo:** já foram criados DOIS projetos
Google para a mesma frente, porque o primeiro bateu o teto diário
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`). Criar
projeto novo a cada teto batido não escala e polui a conta com projetos
órfãos — a saída é billing ativado ou chave paga da plataforma. Até lá, **toda
sessão que for rodar bateria de copiloto precisa contar requisições antes de
começar**: 15 sondas + 2 controles já ultrapassam o teto de um dia.

**Dois achados de formato/custo que continuam valendo:**

- Uma chave Google pode começar com `AQ.` e ter 53 caracteres, em vez do
  `AIza…` de ~39 que se espera do AI Studio — e ainda assim ser aceita como
  API key em query string (401 como `Bearer`). **Não descarte uma chave por
  não parecer com `AIza`.**
- `GET https://generativelanguage.googleapis.com/v1beta/models?key=…`
  (ListModels) valida a chave **sem** consumir a cota de `generateContent`. É
  o que o botão "Validar" do painel usa para as duas chaves Google.

---

**LACUNAS DEIXADAS PELO 2A — insumo direto do 2B.** O 2A removeu
afirmações falsas sem substituir nada, por escolha explícita: apagar leva
minutos, reescrever leva horas, e uma declaração comercial falsa a quem é
cobrado via Stripe não podia esperar a reescrita. O que ficou faltando,
por arquivo:

| Onde | Buraco deixado | O que o 2B precisa apurar antes de escrever |
|---|---|---|
| `faq.md` | Sumiu a pergunta "por que preciso conectar chaves de API" e a que explicava qual chave o copiloto usa | Qual é a resposta certa hoje ao cliente que pergunta "quem paga os provedores?" — depende da migração para chave-da-plataforma (seção 1), decidida e não construída |
| `faq.md` | A diferença entre "Conhecimento e mídia" e "Imagens de referência" perdeu o lado dos documentos | O que os documentos fazem **de fato** hoje: são extraídos e chunkados, e nada mais os lê. Descrever sem prometer recuperação |
| `faq.md` / `painel.md` | Sumiu a explicação do card "Créditos restantes" | A tela mostra "—" mas `tenant_credits` tem saldo real (bug de UI já catalogado). Documentar depois de decidir se conserta a tela ou o texto |
| `painel.md` | "Custo estimado" ficou sem explicação | O rastreamento existe (`provider_usage` + `provider_cost_rates`), mas só aparece no painel admin. Decidir se o tenant deve ver |
| `minha-assinatura.md` | Troca de plano, forma de pagamento e faturas ficaram sem contexto | Descrever o fluxo real do Stripe (checkout, webhook, top-up de crédito) e por que a lista de faturas ainda volta vazia mesmo com cobrança acontecendo |
| `conhecimento-e-midia.md` | Sumiu o "para que serve" dos documentos | Mesmo ponto do FAQ: hoje não serve para nada além de armazenar. É honestidade desconfortável, e é a verdade até o Bloco 3 |
| `conhecimento-e-midia.md` | Sumiu o **contraste** entre documentos e imagens de referência | Sem recuperação, os dois hoje se comportam igual — o contraste que justificava duas seções separadas deixou de existir. Decidir se as seções continuam separadas |
| `configuracoes.md` | Sumiu o modelo de negócio por trás da tela e a mensagem que o copiloto mostra quando falta credencial | Como orientar o cliente que quer trocar de provedor, e o que ele vê quando a chave não está conectada |
| `conteudo.md` | Sumiu a menção ao botão **"Retreinar"**, removida junto com a coluna "Provedor" na mesma frase | O botão existe e funciona — foi dano colateral. Redocumentar as ações da linha (Retreinar e Baixar) |
| `criar-video.md` / `configurar-avatar.md` | Sumiram as notas de "depende do provedor X conectado" | O que dizer quando a geração falha por falta de credencial, já que o cliente não pode resolver sozinho |
| `setup.md` (admin) | Sumiu a seção de modelo de negócio inteira e a citação da rota de login | Descrever de quem é a chave hoje e qual é a rota real (`POST /login` unificado) — é doc de operação interna, precisa estar certa |

**Telas que já não existem como os docs descrevem** (apontado, não reescrito):

- `conteudo.md` — não menciona o botão "Baixar" do vídeo de referência, que
  existe desde 2026-07-22. Omissão, não falsidade.
- `minha-assinatura.md` — descreve a troca de plano como ação local; hoje leva
  a um checkout do Stripe hospedado, com redirect para fora e volta com
  `?checkout=success|cancelled`.
- `painel.md` — descreve 4 cards, dos quais 2 mostram "—" por bug/decisão
  pendente, não por ausência de funcionalidade.
- `conhecimento-e-midia.md` — a tela se chama "Base de conhecimento (RAG)" no
  menu lateral, e não existe recuperação nenhuma. O nome da tela é o problema;
  renomear é decisão de produto.
- `configuracoes.md` — diz que o cartão mostra "os últimos dígitos da chave
  salva"; o `masked_key` são os últimos caracteres do **texto cifrado**. (A
  tela de chaves da plataforma já não sofre disso: ela grava os 4 últimos da
  chave real numa coluna própria.)

---

