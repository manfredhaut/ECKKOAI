# PRÓXIMA RODADA — a chave, e só a chave

⚠️ **Duas rodadas seguidas pararam no mesmo ponto.** Em 13/08 a chave foi dada
como já gravada, e a medição mostrou o contrário: `vendor='fal'` → **0 linhas**,
e nenhuma linha de `api_credentials` tocada **desde 09/08**. Autorização de
US$ 2,00 nas duas, gasto de **US$ 0,00** nas duas.

**Antes de mais nada, conferir se o salvamento CHEGOU AO BANCO** — o comando
está no fim do Passo 1. O sintoma é silencioso: a tela pode parecer ter salvo.

Já descartado como causa: o bundle do frontend é posterior ao BLOCO 2, então o
seletor `fal` existe na UI. Por que não gravou: **NÃO VERIFICADO**.

---

## Passo 1 — colar a chave (ação do OPERADOR, não do assistente)

**Duas opções. A primeira é a mais segura** — a chave não passa por variável de
ambiente nem por chat.

### (A) Pelo painel admin — recomendado

1. `http://localhost:8090/admin`
2. Seção de APIs → escolher o **tenant**
3. Provider **avatar** → vendor **fal** → colar a chave → salvar

O botão **Testar** fica desabilitado para a fal, e isso é deliberado: ela não
tem sonda de conexão, e inventar uma exigiria escolher um endpoint e mandar a
chave para ele. A ausência do teste **não** impede salvar.

### (B) Pelo semeador, se preferir linha de comando

```bash
docker compose exec -T -e FAL_API_KEY=<a-chave> backend npx tsx src/scripts/seedFalKey.ts --tenant <uuid>
```

Não toca o `.env`; a chave morre com o processo. Ele **recusa** sobrescrever
credencial de outro vendor sem `--forcar`.

> ⚠️ **O par é (tenant, provider): um tenant tem UMA credencial de `avatar`.**
> Semear `fal` num tenant que já tem `heygen` **apaga** a chave da HeyGen dele.
> O tenant `fd371b16-c051-4b4b-8129-2a3163d48874` (manfred) tem `heygen` — use
> outro, ou aceite a troca conscientemente.

### Conferir, sem imprimir a chave

```bash
docker compose exec -T postgres psql -U twinai -d twinai -c "SELECT tenant_id, vendor, length(encrypted_key) FROM api_credentials WHERE vendor='fal';"
```

---

## Passo 2 — a sonda, etapa a etapa

Cada linha é uma decisão de dinheiro. **Parar entre elas é o ponto.**

```bash
# 1. upload — NÃO é tarifado. Mede o contrato de storage de graça.
docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts --tenant <uuid> --foto /app/uploads/<algum>.jpg --ate upload

# 2. + composição (~US$ 0,08)
docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts --tenant <uuid> --foto <...> --ate compor --teto 0.10

# 3. + animação (~US$ 1,00) — o número frágil do plano
docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts --tenant <uuid> --foto <...> --ate narrar --teto 1.20

# 4. tudo, até o vídeo final
docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts --tenant <uuid> --foto <...> --teto 2.00
```

O `--teto` vai ao porteiro do orquestrador, que recusa **antes** de cada
submissão. O `--ate` encerra a corrida sem disparar as seguintes.

**O container precisa estar em `live`** — a sonda recusa rodar em fixture,
porque ali o `falClient` desvia antes da rede e não mediria contrato nenhum.

---

## O que conferir em cada corpo cru

Estas são as suposições que nunca foram medidas. Cada uma que bater vira
**MEDIDO**; cada divergência é conserto **antes** da etapa seguinte.

| suposição | onde vive |
|---|---|
| `file_url` e `upload_url` no `initiate` | `falClient.falUpload` |
| header `Authorization: Key <chave>` | idem |
| `request_id` e `status_url` na submissão | `falClient.falSubmit` |
| estados **`IN_QUEUE` / `IN_PROGRESS` / `COMPLETED`** em MAIÚSCULO | `normalizeFalStatus` |
| `status_url` devolvido é SEGUIDO, não montado | conferir no cru |
| `images[0].url` na composição | `runFalPipeline` |
| `video.url` na animação e na sincronia | idem |
| `sync_mode: "loop"` com áudio ~8,7 s e vídeo 10 s | ver abaixo |

### A decisão que ficou pendente: `sync_mode`

`loop` foi escolhido **por eliminação**, não por medição. Sabe-se o que
`cut_off` faria no caso inverso (cortar a fala, que é a entrada preservada).
O que `loop` faz quando o vídeo é **mais longo** que o áudio — o caso desta
fase — não está documentado nem foi observado. Se a fala **recomeçar** no
vídeo produzido, a escolha certa passa a ser `silence` (se existir) ou
`cut_off`, e a justificativa muda: com vídeo maior que áudio, `cut_off` corta
**vídeo**, não fala.

---

## Depois da sonda

1. **Guardas** para tudo que o contrato corrigir, cada uma provada reprovando.
2. **Reconciliar** o previsto com o painel da fal (Requests/Analytics) e
   registrar o cobrado real — hoje os preços estão **DOCUMENTADO**.
3. **Dívida de reconciliação já aberta:** o v6 anota ~US$ 1,14 nos testes A/B e
   o painel mostra **US$ 5,30 em 7 dias com 12 requisições**. Não há explicação
   registrada, e inventar uma seria pior que deixar aberta.
4. **BLOCO 4 parte 2** — o ramo em `avatarProvider.ts:1007`. Antes dele,
   lembrar: **o débito de crédito acontece ANTES da chamada ao fornecedor**
   (MEDIDO: `debitCredit` em `routes/videos.ts:1088`, `generateVideo` em
   `:1174`). Com crédito de avatar zerado, o clique morre no crédito sem chegar
   à fal, e o erro parece falha de pipeline.
