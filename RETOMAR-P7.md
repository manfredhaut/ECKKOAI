# RETOMAR-P7 — gatilho de troca de conta

> **Como usar:** numa conta nova, digite **`RETOMAR-P7`** no Claude Code.
> Este arquivo é a resposta completa: o que foi feito, o que está medido, o
> que está bloqueado e qual é o próximo passo exato. Não é preciso reler a
> sessão anterior.

**Sessão de 23/08/2026. HEAD ao fechar: `b00b744`, árvore limpa.**
Dois commits nesta sessão: `b679ea2` (I1) e `b00b744` (L1).

Leia também, nesta ordem: [ESTADO.md](ESTADO.md) §1 e §15 · [CLAUDE.md](CLAUDE.md).

---

## 1 · O ÚNICO passo bloqueado, e é onde retomar

**A chave da fal do tenant `dev-c77a5b` está INVÁLIDA. MEDIDO em 23/08:**

```
POST https://queue.fal.run/fal-ai/nano-banana-2/edit
authorization: Key <chave do tenant>
-> 401 {"detail":"invalid key credentials"}
```

- formato da chave: **`uuid:hex`, 69 caracteres, 2 partes** — a forma
  documentada e correta; ela é bem-formada e mesmo assim recusada.
- chave de PLATAFORMA da fal: **AUSENTE** (slot vazio, medido no K0).
- consequência: **nenhuma geração pela fal funciona hoje**, nem pelo produto
  nem por script. Os tiers Normal e Premium estão inertes na prática.

**GASTO desta tentativa: US$ 0,00.** O 401 é recusa antes de qualquer
trabalho; nenhum artefato foi criado, nada foi baixado.

**AÇÃO DO OPERADOR (não do assistente):** repor a chave da fal — no painel
de plataforma (preferível: serve todos os tenants, `resolveTenantAvatarFalKey`
já lê de lá com precedência) ou no tenant. Enquanto isso não acontece, o P7.c
não roda.

---

## 2 · O que estava em execução quando parou — P7.c, Desenho A

**Autorizado pelo operador: US$ 1,20**, 3 clipes de 5 s encadeados pelo
último quadro. O executor está pronto e provado em fixture; só falta a chave.

O script vivia no scratchpad da sessão (efêmero). Para refazê-lo, o desenho
está inteiramente descrito em §3 abaixo — não é preciso recuperar o arquivo.

**Ordem aprovada pelo operador, NÃO INVERTER:** dublar CADA clipe antes de
concatenar. Nunca concatenar mudos e dublar no fim — a dublagem tem de ver
um plano contínuo.

---

## 3 · O que JÁ ESTÁ MEDIDO — não remedir

### Custo (régua real, `PRECOS_FAL`: compor 0,08 · animar 0,025/s · sync 0,05/s de áudio)

| cenário | compor | animar | sync | **total** | s/dólar |
|---|---|---|---|---|---|
| 1 clipe de 15 s | 1× $0,080 | $0,375 | $0,748 | **$1,203** | 12,47 |
| **Desenho A** (3×5 s, mesma cena) | **1× $0,080** | $0,375 | $0,748 | **$1,203** | **12,47** |
| **Desenho B** (3×5 s, cena nova) | 3× $0,240 | $0,375 | $0,748 | **$1,363** | 11,00 |

**O Desenho A custa exatamente o mesmo que um clipe único de 15 s** — o
encadeamento é grátis. B custa +US$ 0,16 (2 composições extras), 13,3% a mais.

⚠️ **NÃO VERIFICADO:** se `sync-lipsync/v2` tem **mínimo por chamada**. Se
tiver, 3 chamadas de ~5 s custam mais que 1 de ~15 s e a tabela acima muda.
**O teste pago mede isso de brinde — é o único risco de custo do desenho.**

### Contrato (MEDIDO por leitura)

- campo de imagem de entrada: **`image_url`** (Wan, string) · **`image_urls`**
  (Seedance, array). O encadeamento do Desenho A é contratualmente possível.
- extrair último quadro (ffmpeg) e `falUpload` **não são tarifados**.
- `runFalPipelineDoVideoMudo(input, videoMudoUrl, …)` **já é** "dubla um
  clipe mudo" — a unidade do desenho aprovado já existe como função.

### Régua de roteiro por bloco (execução de `maxScriptCharsFor`)

```
ritmo efetivo = 10,8900 c/s   (12,8151 × 0,85)
 5 s ->  54 caracteres     10 s -> 108     15 s -> 163
```

### Concatenação sem recodificar (ffmpeg 8.0.1, MEDIDO)

Funciona. **Vídeo: limpo, zero avisos.** **Áudio AAC: 2 avisos de DTS
não-monotônico**, um por emenda, e **+21 ms de deriva** em 3 clipes.
Causa exata: 1 frame AAC = 1024 amostras = 21,333 ms a 48 kHz; 5 s = 234,375
frames (não inteiro). **~7 ms por emenda** — imperceptível em 2 emendas,
~210 ms (dessincronia labial visível) em ~30. Forçaria recodificar: codec,
resolução, fps, pix_fmt, sample rate ou nº de canais diferentes entre clipes.

### Mecânica provada em fixture (custo zero)

Protótipo rodou os 3 casos. Ordem observada no Desenho A:
`clipe1: compor→animar→narrar→sincronizar` → `[local] último quadro` →
`clipe2: reusa quadro($0)→animar→narrar→sincronizar` → … → `concatenou`.
Final **15,021 s** (soma 15,000; deriva 21 ms). Blocos: 52/54/48 chars.

### Falha parcial — comportamento REAL, não desejado

Clipe 3 falha com 1 e 2 já pagos → **arquivo final NÃO existe; 2 clipes pagos
e sem uso**. E `decidirEstorno` (código existente) decide: artefato entregue
⇒ `saiu` ⇒ **NÃO estorna**. Somado a `debitCredit` cobrar **1 crédito por
VÍDEO** (não por clipe): hoje o comportamento seria **PERDA** — sem estorno,
sem retomada, sem arquivo. Não há caminho de retomada porque não há estado
por clipe.

---

## 4 · Os 4 obstáculos nomeados para construir o multi-clipe

| # | obstáculo | onde | gravidade |
|---|---|---|---|
| 1 | **`gastoAcumuladoUsd: 0`** — o teto de US$ 2,00 **reinicia a cada chamada** | `falPipeline.ts`, `runFalPipelineDoVideoMudo` | **alta** — N clipes gastam N× o teto sem nenhuma chamada perceber |
| 2 | `conferirRoteiro(input.script)` aplica a régua ao roteiro inteiro | mesma função | baixa — passar `{...input, script: bloco}` |
| 3 | `videos.status` não tem estado por clipe | migration | média |
| 4 | não existe extração de quadro nem concatenação | — | média (locais, custo zero) |

**Não é obstáculo:** o diário. `fal_pipeline_steps.ordem` é `integer` sem
UNIQUE em `(run_id, ordem)`, e `fal_pipeline_runs.video_id` é FK simples —
N clipes cabem.

**Guardas do P7.b NÃO foram escritas, de propósito:** o fluxo multi-clipe não
existe no produto, e guarda contra código não entregue é inerte por
construção. Elas nascem junto com a implementação (P7.d).

---

## 5 · Bloqueios herdados que continuam de pé

- **K2 / teste pago do Look:** nenhum tenant reúne chave HeyGen **e** avatar
  treinado. `manfred`/`manfredhaut-2` têm chave mas todos os avatares com
  `provider_avatar_id = NULL`; `dev-c77a5b` tem o Mário treinado mas **sem
  chave HeyGen**.
- **PVC (voz):** conta ElevenLabs é `starter`,
  `can_use_professional_voice_cloning: false`. Exige plano Creator (+US$ 16/mês).
- **Slots de voz: 9 de 10 ocupados** (medido). Resta 1.
- **Item 4 (Cenário/Traje):** dimensionado, não implementado — decisão de
  desenho é do operador.

---

## 6 · O que fazer ao retomar, em ordem

1. **Confira o desarme** — `docker compose exec -T backend sh -c 'printf "%s
   len=%s\n" "$PROVIDER_MODE" "${#PROVIDER_LIVE_CONFIRM}"'` deve dar
   `fixture len=0`.
2. **Pergunte ao operador se a chave da fal foi reposta.** Sem ela, o P7.c
   não roda — não tente contornar.
3. Com a chave: refaça o executor pelo desenho da §2/§3 e rode o Desenho A
   (US$ 1,20). Teto duro no script, resposta crua gravada antes de qualquer
   parsing, produto DESARMADO o tempo todo (o script fala com a fal direto —
   o fluxo multi-clipe não existe no produto, e a pergunta é do fornecedor).
4. **Medir as 2 emendas** pelo método do L2: diferença média por canal RGB
   entre o último quadro do clipe N e o primeiro do N+1, e descrever rosto,
   luz, enquadramento e sincronia labial.
5. Entregar os arquivos montados ao operador.
6. Só então P7.d (dimensionar a construção completa).
