# RETOMAR-TESTE — percurso assistido pela tela, 24–25/08/2026

> **Digite `RETOMAR-TESTE` na conta nova.** Este arquivo é a resposta
> completa: o modo de trabalho, o que já foi percorrido, os seis achados com
> a causa medida de cada um, e o bloqueio que precisa ser resolvido antes de
> continuar. Não é preciso reler a sessão anterior.
>
> Leia junto: [ESTADO.md](ESTADO.md) §1 e §20 · [BACKLOG.md](BACKLOG.md).

## Estado

- **HEAD `81f185a`** — ESTADO.md §20 (botão de Refazer, cartões destravados).
- **Árvore limpa** (`git status --short` vazio) antes deste arquivo.
- **Backend `PROVIDER_MODE=fixture`, `PROVIDER_LIVE_CONFIRM len=0`** —
  desarmado. Nada pago sai.
- **397 mutantes**, última passada afetada 69/69.

## ⚠️ O MODO — não é sessão de execução

Decisão do operador (24/08), depois de ficar provado que a automação de
navegador **não clica nos controles React deste projeto** (cliques não
disparam `onClick`/submit; medido: o login falhou pelo botão e ENTROU por
`form.requestSubmit()` com os mesmos valores, e o backend responde 200):

> **O OPERADOR clica. O ASSISTENTE rastreia o log.**

Enquanto este modo valer, o assistente **NÃO**:

- edita nenhum arquivo,
- roda passada de mutantes,
- commita (a exceção foi este arquivo, por ordem explícita),
- abre melhoria nova.

O que ele faz: `docker compose logs -f --tail 5 backend` aberto, e a cada
passo narrado responde **rota, status, erro e tempo**. Se o operador disser
"funcionou" e o log mostrar erro, avisa na hora.

Achado que quebrar vai para a LISTA, sem conserto. O operador manda
consertar tudo de uma vez no fim, e aí sim um commit único.

## 🚨 BLOQUEIO — a tela está servindo código VELHO

**MEDIDO em 24/08, e é o que invalida parte do percurso:**

```
twinai-frontend-1   Up 35 hours (unhealthy)   falhas consecutivas = 1172
```

O healthcheck (o `viteServeFreshness` do bloco L1) repete a cada 10 s:

> *frescor do Vite: o módulo SERVIDO de `GenerateStep.tsx` não é o que está
> em disco. 5 de 71 sinais do arquivo atual não aparecem no que o Vite
> devolveu: `["createVideo.generate.refacoesEsgotadas","refacoesFeitas",
> "refacoesLimite","refacoesEsgotadas","motivoRefacoes"]`. O watcher do Vite
> não viu a edição (bind mount no Windows).*

Confirmado buscando o módulo servido pelo próprio navegador:

```
bundleTemARotaNova: false
predicado servido: podeEscolherSimples = (credentials ?? []).some(… vendor === "heygen")
```

**É o código de ANTES do conserto do W4.1.** O navegador do operador nunca
executou aquele conserto.

**Conserto:**

```bash
docker compose restart frontend
```

**⚠️ NÃO foi executado** — por ordem do operador, que estava no meio do
percurso e não quis o chão mudando. É o primeiro passo ao retomar.

**O erro foi do assistente, e é de processo:** ele editou o frontend, mediu
o conserto pela ROTA (backend, que estava certa) e **não olhou o
healthcheck**, que estava vermelho o tempo todo com a mensagem e o comando
exatos. Quando reportou "verificado na tela", tinha verificado a rota.

## Conta de teste, pronta

| campo | valor |
|---|---|
| e-mail | `passada-zerada@exemplo.invalido` |
| senha | `passada-de-verificacao-24-08` |
| tenant | `passada-zerada` |

Ativa, com avatar treinado e voz clonada (em fixture) e 500 créditos. Criada
pelo cadastro real, com verificação de e-mail concluída pelo link.

## Onde o percurso parou

| passo | estado |
|---|---|
| login · painel | **feito** — 500 créditos, tudo zerado, sem erro no log |
| 1 · avatar | **feito** — avatar criado, voz clonada (2 recusas por `voice_exists` antes, corretas) |
| 2 · roteiro | **feito** — geração por IA em fixture funcionou |
| 3 · cena | **feito** — achados A4 e A5 |
| 4 · gerar | **feito até a escolha de nível** — achados A1, A2, A3 |
| **Gerar (o clique)** | **FALTA** |
| **Refazer** | **FALTA** — é a primeira prova humana do teto de 3 refações |
| **Galeria** | **FALTA** |

## O que o LOG registrou nos passos 1–4

**Nenhum erro. Nenhum 4xx/5xx.** Quatro eventos:

| evento | conteúdo |
|---|---|
| `voice_sample_rejected` ×2 | `reason: voice_exists` — recusa correta e de graça |
| `voice_sample_normalized` | 8.447.054 B, `pcm_s16le`, mono, 24 kHz; `input == output` |
| `voice_id_replaced` | substituição concluída |
| `script_duration` | 40 palavras → 17,1 s estimados, alvo 30 s, `attempts: 2`, `truncated: false` |

## OS SEIS ACHADOS — anotados, nenhum consertado

### 🔴 A1 — cartões de nível bloqueados na tela

Passo 4, tenant `passada-zerada`, sessão real: **Normal e Premium cinzas.**
A rota devolve `{"simples":true,"normal":true,"premium":true}`.

**CAUSA MEDIDA: bundle velho** (ver o bloqueio acima). **Não é defeito novo
do produto** — o conserto do W4.1 está no disco e correto; o navegador
executa o código anterior, que lê `/credentials` e testa
`vendor === "heygen"`.

**Ao retomar:** reiniciar o frontend e reconferir. **Se continuar cinza
depois do restart, aí é defeito de verdade** e precisa ser investigado do
zero.

### 🔴 A2 — mensagem de bloqueio errada em dois pontos

Texto: *"Um dos níveis acima ainda não está disponível para esta conta."*

**CAUSA MEDIDA**, lendo `GenerateStep.tsx`:

```
const indisponivel = opt.value === "simples" ? !podeEscolherSimples : !podeEscolherFal;
{(!podeEscolherSimples || !podeEscolherFal) && <p>tierUnavailable</p>}
```

- **Zero checagem de duração.** A hipótese de que o motivo real fosse o teto
  de 15 s está **REFUTADA pela leitura**: o motivo é
  credencial/disponibilidade.
- *"para esta conta"* está **certo** quanto à natureza do bloqueio.
- *"UM dos níveis"* é **texto fixo que não conta** — com dois bloqueados,
  mente. **Defeito real, independente do bundle.**

### 🔴 A3 — Premium precifica o impossível

Premium mostra **US$ 14,19 para um vídeo de 28,5 s**, num nível cujo teto é
**15 s**. Precifica duração que aquele nível não entrega; deveria mostrar o
limite, não um valor.

**NÃO investigado** (é independente do bundle; fica para a rodada de
conserto).

### 🟡 A4 — interpretação truncada em silêncio

Passo 3: texto longo colado para em **600/600**, cortado no meio da palavra
(`"...Leg"`), **sem nenhum aviso de truncamento**.

### 🟡 A5 — traje/cenário em quatro lugares

Passo 1: "Adicionar traje" (Look) + "Cenário padrão" + "Traje deste vídeo".
Passo 3: "Fundo" + dropdown "Traje". Contradiz a decisão registrada de
pacote visual único — e a própria tela do passo 3 admite que *"Fundo por
vídeo não está disponível"*.

**Pedido do operador: levantar só o MAPA** de qual campo alimenta o quê e o
que é redundante. **Não redesenhar.**

### 🟢 A6 — campo "Gerar com IA" pequeno demais

Passo 2: o campo corta o texto digitado.

## O QUE FUNCIONOU (registro do operador)

- geração de roteiro por IA em fixture;
- custo coerente: 310 chars → 28,46 s → US$ 1,40;
- o rótulo *"custo real: ainda não medido"*;
- o aviso honesto de que só 9:16 foi conferido;
- o limite de caracteres mudando certo com a duração-alvo.

## Ao retomar, nesta ordem

1. `docker compose restart frontend` — sem isso, tudo que aparecer na tela é
   código velho e o percurso não vale.
2. Conferir que o healthcheck do frontend voltou a `healthy`.
3. Reconferir o **A1**: os três cartões devem ficar habilitados para
   `passada-zerada`.
4. Reabrir `docker compose logs -f --tail 5 backend` e retomar o modo
   observador.
5. Continuar o percurso: **Gerar → Refazer → Galeria**.
6. Só então, sob ordem do operador, consertar A1–A6 de uma vez e commitar
   **uma** vez.
