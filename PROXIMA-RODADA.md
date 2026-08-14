# PRÓXIMA RODADA — o BLOCO B3, e o que decidir antes de gastar

⚠️ **A chave da fal JÁ ESTÁ no banco desde 13/08** (`api_credentials`, tenant
`c77a5b8a`, provider `avatar`, vendor `fal`). O bloqueio das duas rodadas
anteriores acabou; o que sobrou não é credencial, é **decisão**.

---

## O que o B2 deixou pronto, e onde ele parou de propósito

O caminho existe do começo ao fim e **não é alcançável por usuário nenhum** —
esse é o estado desejado, não uma pendência:

```
generateVideo(vendor: "fal")  →  generateVideoFal  →  runFalPipeline
                                                          ↓
                                  publicarEntradas (ordem 0, não tarifada)
                                                          ↓
                                  autorizarGasto("compor")  ← o freio
                                                          ↓
                                  compor  →  PARA. A URL vai ao diário.
```

O porteiro de `routes/videos.ts` recusa `fal` com 403
`vendor_sem_caminho_de_geracao`, **antes do débito e antes da linha em
`videos`**. Quem alcança o ramo é a sonda.

---

## Passo 1 — ~~a DECISÃO que abre o B3: onde o débito mora~~ **RESOLVIDO**

> ✅ **FECHADO NO B3** (`c849b50`+`ff9628e`), e o texto abaixo ficou como
> registro de COMO se decidiu — não como pergunta em aberto. **A saída 1 foi a
> escolhida.** Corrigido em 14/08 (EXPOSICAO-1) junto com a referência falsa
> logo abaixo; ver ESTADO §1.4.

Não é código, é escolha, e ela é a razão de a fal estar fora de
`VENDORS_WITH_GENERATION_PATH`.

O conflito, MEDIDO por leitura **no B2**:

- `debitCredit` acontece em `routes/videos.ts`, **antes** de `generateVideo`;
- a rota **INSERE a linha em `videos`** antes disso;
- ~~`recovery.ts:211` encerra como `recovery_orphan` **qualquer** vídeo sem
  `provider_job_id`, em qualquer idade;~~ ⚠️ **FALSO DESDE O B3.** Era exato
  quando escrito. Hoje `awaiting_approval` tem ramo PRÓPRIO, avaliado **antes**
  do ramo do órfão ([recovery.ts:297](backend/src/services/video/recovery.ts:297)
  contra [:319](backend/src/services/video/recovery.ts:319)), e a linha tem
  `provider_job_id` de qualquer forma. **A linha 211 de hoje não fala de
  órfão** — não reuse esse ponteiro;
- uma corrida que para em `compor` **não tem job id de vídeo** para dar —
  também superado: o `request_id` do `compor` É gravado ali
  ([videos.ts:1298](backend/src/routes/videos.ts:1298)).

As três saídas, e nenhuma era obviamente melhor:

1. ✅ **ESCOLHIDA — estado novo em `videos`** (`awaiting_approval`), com
   `recovery.ts` ensinado a não reclamar dele. Migration 052 + as três guardas
   de aprovação.
2. **A corrida só em `fal_pipeline_runs`**, e a linha em `videos` nasce apenas
   quando a animação for aprovada. Era o que o B2 fazia; descartada.
3. **Débito no orquestrador**, com estorno próprio. Cria um SEGUNDO lugar que
   cobra — e este projeto já pagou caro por ter duas cópias de uma régua.
   Descartada.

**Nada disso deve ser escolhido escrevendo código.** Escolher primeiro — e foi
o que aconteceu.

## Passo 2 — a passada COMPLETA, com log EM ARQUIVO

**Pré-condição do B3, não desta rodada.** A última completa e válida é
**234/234 de 13/08 de manhã** (HEAD `23dce3a`); o arnês está em **237**.

```bash
npm run check:mutants
```

⚠️ Ela leva ~82 min e **trava a árvore** (gotcha 4): qualquer edição a mata no
mutante seguinte. Lance-a por último, e **nunca** com timeout de 10 minutos em
volta — foi assim que a passada afetada desta rodada morreu na primeira
tentativa, com `0xC0000142` no log.

## Passo 3 — a sonda, se e quando houver autorização de gasto

O contrato da fal está MEDIDO até a composição (ESTADO §1.3). O que segue **NÃO
VERIFICADO** e só uma corrida paga responde:

| suposição | onde vive |
|---|---|
| `video.url` na animação e na sincronia | `runFalPipeline` |
| `resolution: "720p"` aceito pelo Wan | `RESOLUCAO_VIDEO` |
| `sync_mode: "loop"` com áudio ~8,7 s e vídeo 10 s | `SYNC_MODE` |
| a régua de 10,89 car/s e a dispersão de 14,36% | `falPipeline.ts` |

```bash
# 1. upload — NÃO é tarifado.
docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts --tenant <uuid> --foto /app/uploads/<algum>.jpg --ate upload

# 2. + composição (~US$ 0,08)
docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts --tenant <uuid> --foto <...> --ate compor --teto 0.10
```

**O container precisa estar em `live`** — em fixture o `falClient` desvia antes
da rede e não mediria contrato nenhum.

⚠️ **`COMPLETED` não significa sucesso.** MEDIDO em 13/08: a submissão inválida
voltou 200/IN_QUEUE, o status foi a COMPLETED, e só o **RESULTADO** trouxe o
422 — com `inference_time: 0.058`, o tempo de não ter feito nada. Quem lê só o
status segue para a etapa seguinte, que custa 12× mais.

---

## A dívida que o B2 abriu, e que não deve ser esquecida

**A dispersão de 14,36% que deriva o teto de 95 caracteres não tem medição
registrada neste repositório.** Ela veio fixada do desenho do B0+B1. Nenhuma
tabela daqui a reproduz — as seis gerações do caminho HeyGen dispersam ~12%,
sobre outra régua e com dois fatores. Está nomeada em
`PIPELINE_RITMO_DISPERSAO` para poder ser cobrada; enquanto não for, o teto é
**derivado de um número declarado**, e isso é diferente de derivado de uma
medição.

## E a dívida herdada, que continua aberta

- **Reconciliação:** o plano v6 anota ~US$ 1,14 nos testes A/B e o painel da fal
  mostra **US$ 5,30 em 7 dias com 12 requisições**. Sem hipótese registrada —
  inventar uma seria pior que deixar aberta.
- **`voiceId: avatar.voice_id`** (`routes/videos.ts`) segue sem guarda ancorada
  no uso: trocá-lo por um id fixo passa o gate inteiro.
- **4 mutantes DEVIDOS** do congelamento de 05/08, por NOME (ESTADO §7).
