<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 3308-4068 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# 5E, 5F, planos de controle, APRESENTACAO-1, FOV-1 e INSTRUMENTOS-1

### Bloco 5E — master no teto do fornecedor e derivação por software (PARCIAL)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas a fornecedor** (conferido por carimbo de tempo: os únicos 4 eventos
`vendor_error` do log são de 02/08 17:38–17:40, anteriores a esta sessão, e
`grep` por host de fornecedor no log inteiro devolve 0).

**Fases 0 a 4 concluídas. A Fase 5 (a escolha no passo 6) NÃO foi iniciada** —
ver o porquê no fim desta seção, que é mais interessante que a omissão.

---

#### O ACHADO QUE MUDA A PREMISSA DO BLOCO: o 9:16 da HeyGen é preenchimento

A política deste bloco parte de "gere o master em 9:16, derive o resto por
redução". A medição diz que, para o avatar de foto que temos, **o 9:16 do
fornecedor não é uma composição feita para vertical — é a mesma imagem com
barras brancas**.

*MEDIDO* por perfil de brilho faixa a faixa (`signalstats`, `YAVG`) no master
real de 02/08 (`5f77229e….mp4`, 720×1280):

| Faixa | YAVG | O que é |
|---|---|---|
| y = 0 … ~360 | **227 constante** | barra branca |
| y ≈ 360 … 908 | 86–132, variando | imagem |
| y ≈ 910 … 1280 | **227 constante** | barra branca |

Conteúdo útil ≈ **720×548 num quadro de 720×1280 — 43% da altura.** Os outros
57% são preenchimento que nós pagamos para gerar e que se propaga para toda
derivação feita a partir dele.

*MEDIDO, e é o contraste que fecha o argumento:* o master **16:9** do LIVE-1
(`0a0193b8….mp4`, 1280×720) **não tem barra nenhuma** — o perfil horizontal
varia continuamente de borda a borda (94 → 185 → 134), sem faixa constante.

**Consequência prática:** derivar a partir de um master 9:16 entrega menos
imagem útil do que derivar do mesmo conteúdo em 16:9, porque o vertical já
chega com 57% de barra. A política aprovada ("o master é sempre 9:16") pode
estar otimizando a favor do formato errado. **Não revertida** — é decisão de
produto, e a infraestrutura não depende dela: `MASTER_ASPECT_RATIO`
(`formatDerivation.ts`) é uma constante única, e trocá-la move a tabela inteira
junto.

**NÃO VERIFICADO, e a ressalva importa:** os dois vídeos vêm de **avatares
diferentes**, com fotos de origem diferentes. Não é comparação controlada, e
uma amostra por proporção não sustenta "a HeyGen sempre preenche em 9:16". O
que está medido é que **este** master 9:16 tem 57% de barra e **aquele** 16:9
não tem nenhuma. Fechar isso exige gerar as duas proporções do MESMO avatar —
duas gerações live, ~US$ 0,10 pelos números abaixo.

---

#### A constante de custo estava errada, e três medições provam a certa

A taxa anterior (US$ 0,045/s) dividia o dólar gasto pela duração **fracionária**
do arquivo. Isso produzia um número diferente a cada medição — 2,67 · 2,83 ·
2,94 unidades por segundo — e o 4A registrou a diferença como "arredondamento
por bloco, NÃO medido".

Não era bloco: **é truncagem**. O fornecedor cobra **3 unidades por segundo
INTEIRO**, descartando a fração. Com essa regra as três medições que já
estavam registradas fecham exatas:

| Duração entregue | Truncada | ×3 | Unidades MEDIDAS |
|---|---|---|---|
| 3,372 s | 3 | 9 | **9** ✓ |
| 16,972 s | 16 | 48 | **48** ✓ |
| 33,696 s | 33 | 99 | **99** ✓ |

Sobre a duração fracionária os mesmos pontos dariam 10,12 · 50,92 · 101,09 —
nenhum bate. Três pontos exatos, durações de ordem bem diferente, **um único
parâmetro livre**. E 3/60 = **US$ 0,05 por segundo**, que é exatamente o que a
tabela pública da HeyGen anuncia para avatar de foto.

`providerCost.ts` foi reescrito: `unitsPerBilledSecond: 3` e
`unitsPerDollar: 60` são a medição; **`USD_PER_BILLED_SECOND` é DERIVADO**, não
digitado — guardar os dois lado a lado permitiria que divergissem, que é o
defeito original um nível acima. `billedSecondsFor()` isola a truncagem.

**Efeito na tela:** a estimativa de 30 s passa de US$ 1,35 para **US$ 1,50**.

*DEDUZIDO, não medido contra fatura.* Nenhuma fatura do fornecedor foi lida em
sessão nenhuma; tudo vem de saldo e quota lidos pela API.

**Lacuna NOVA que a regra cria:** vídeo com menos de 1 s custaria **zero** pela
truncagem. As três medições têm 3 s ou mais, e isso nunca foi observado. É o
único ponto em que o caminho MEDIDO pode devolver zero — se aparecer na tela, é
caso a investigar, não cortesia do fornecedor. Está escrito ao lado da
constante.

---

#### Fase 0 — o teto do fornecedor (DOCUMENTADO, duas fontes)

- `resolution`: `720p` · `1080p` · `4k`. `aspect_ratio`: `16:9` · `9:16` ·
  `4:5` · `5:4` · `1:1` · `auto`.
- **Saída ancorada no LADO CURTO**: *"Output is short-edge anchored to the
  requested resolution (`1080p` 1:1 → 1080x1080, `1080p` 4:5 → 1080x1350)"*,
  limitada ao lado longo do plano.
- **A tarifa é por segundo e por tipo de avatar, NÃO por pixel.** 720p e 1080p
  custam igual; avatar de foto sai a US$ 0,05/s. Fontes:
  `developers.heygen.com/docs/pricing` e o artigo de preços da central de
  ajuda, concordantes.

**Consequência:** pedir 720p foi desperdício desde o começo — 1080p sai pelo
mesmo preço. `MEASURED_RESOLUTION` em `videoFormat.ts` **continua em 720p**:
mudá-la é uma linha, mas altera o que se pede ao fornecedor em toda geração, e
o teto real da NOSSA conta segue **NÃO VERIFICADO**.

**Fase 0.3 — o que a rede bloqueada impediu.** Estes comandos NÃO foram
executados. O primeiro lê o plano e a carteira; o segundo sonda se 1080p é
aceito **sem gerar nada**, usando um `avatar_id` inexistente para que a resposta
diga qual erro vem primeiro — se vier "resolução não permitida", o teto está
respondido sem custo; se vier "avatar não encontrado", nada foi gasto.

```powershell
$h = @{ "x-api-key" = $env:HEYGEN_KEY }
Invoke-RestMethod -Uri "https://api.heygen.com/v3/users/me" -Headers $h |
  ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 heygen-conta.json

$b = @{ type="avatar"; avatar_id="sonda-inexistente"; audio_asset_id="x";
        aspect_ratio="9:16"; resolution="1080p" } | ConvertTo-Json
try { Invoke-RestMethod -Uri "https://api.heygen.com/v3/videos" -Method Post `
        -Headers $h -ContentType "application/json" -Body $b }
catch { $_.ErrorDetails.Message | Out-File -Encoding utf8 heygen-sonda-1080.json }
```

`Out-File -Encoding utf8`, nunca `>` — no PowerShell o `>` grava UTF-16LE e
nenhuma ferramenta de texto acha nada dentro.

---

#### Fase 1 — a tabela é derivada de UM número, não escrita à mão

`targetForAspect(ratio, shortEdge)` aplica a âncora de lado curto do próprio
fornecedor. A consequência é que **os quatro alvos da política deixam de ser
quatro números** e passam a ser consequência de um: o lado curto.

*MEDIDO* rodando a função:

| master | 9:16 | 4:5 | 1:1 | 16:9 |
|---|---|---|---|---|
| **1080×1920** | 1080×1920 | 1080×1350 | 1080×1080 | 1920×1080 |
| **720×1280** | 720×1280 ⚠ | **1024×1280** ⚠ | 1080×1080 | 1920×1080 |

⚠ = abaixo do alvo, **com aviso trazendo os dois números**. Os quatro números
da política vivem na GUARDA, como dado observado — se estivessem no código, o
teste compararia o código consigo mesmo.

---

#### Fase 2 — a regra das duas metades, provada nos arquivos

```
[0:v]split=2[bg][fg];
[bg]scale=W:H:force_original_aspect_ratio=increase,crop=W:H,
    boxblur=luma_radius=min(h\,w)/20:luma_power=1:
    chroma_radius=min(cw\,ch)/20:chroma_power=1[bg2];
[fg]scale=W:H:force_original_aspect_ratio=decrease:flags=lanczos[fg2];
[bg2][fg2]overlay=(W-w)/2:(H-h)/2
```
com `-c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -c:a copy
-movflags +faststart`.

**As duas metades, e confundi-las é o defeito:** o **sujeito** nunca é cortado
nem ampliado (`decrease`); o **fundo** desfocado PODE ser ampliado
(`increase` + `crop` + `boxblur`). A segunda é o que torna a primeira viável.

`-c:a copy` sem exceção: o áudio é a voz clonada e sai bit a bit igual. Os `fps`
não são tocados — reamostrar inventa ou descarta quadros.

**Sem dependência nova.** `fluent-ffmpeg` foi avaliado e descartado: o que ele
oferece pronto é `pad`, que preenche com **cor sólida**, e a política preenche
com extensão desfocada do próprio quadro. **Flixier VETADO** (marca d'água e
escala manual de 218%).

**A PROVA (2.4), medida com `ffprobe` em cada arquivo — 8 derivações, 0
ampliaram, 0 cortaram:**

| insumo | formato | quadro | sujeito | h master | tempo |
|---|---|---|---|---|---|
| 5f77229e (720×1280) | 16:9 | 1920×1080 | 608×1080 | 1280 | 6,7 s |
| 5f77229e | 9:16 | 720×1280 | 720×1280 | 1280 | 3,1 s |
| 5f77229e | 4:5 | 1024×1280 | 720×1280 | 1280 | 5,3 s |
| 5f77229e | 1:1 | 1080×1080 | 608×1080 | 1280 | 3,6 s |
| 0a0193b8 (1280×720) | 16:9 | 1280×720 | 1280×720 | 720 | 1,1 s |
| 0a0193b8 | 9:16 | 1080×1920 | 1080×608 | 720 | 2,6 s |
| 0a0193b8 | 4:5 | 1080×1350 | 1080×608 | 720 | 1,7 s |
| 0a0193b8 | 1:1 | 1080×1080 | 1080×608 | 720 | 1,4 s |

Total **25,5 s** para 8 derivações de vídeos de 3 e 17 segundos (Fase 5.5).

**Como o sujeito é MEDIDO e não deduzido:** `buildSubjectProbeArgs()` aplica só
a expressão de escala do sujeito e extrai UM quadro; o `ffprobe` daquele quadro
é a altura real que o ffmpeg deu. Quem decide essa altura é a palavra
`decrease` dentro do filtro, e trocá-la por `increase` não mexe numa linha da
nossa aritmética — passaria por qualquer guarda que só conferisse números
nossos.

**Nota de precisão:** a previsão da conta e a medição divergem em até 2 px
(606 previsto × 608 medido), porque o nosso arredondamento trunca para par e o
do ffmpeg arredonda. O quadro bate exato; a fonte de verdade do sujeito é a
medição. A tela mostra o **quadro**.

**2.5 — veredito por formato: PENDENTE, e por um motivo que não é preguiça.**
A qualidade do enquadramento derivado é indistinguível da qualidade do master,
e o master está com 57% de barra branca (achado acima). Julgar "derivável" hoje
seria julgar o preenchimento da HeyGen, não a derivação. O veredito fica para
depois da decisão sobre o master. Os frames estão em `uploads/_5e-prova/`
(fora do git, `uploads/*` é ignorado).

---

#### Fase 3 — ffmpeg no backend

**3.1:** `ffmpeg` e `ffprobe` **já existem no container**, em `/usr/bin`. Nada
a instalar, custo zero, imagem não reconstruída.

**3.2:** `deriveVariants.ts` deriva do master **já persistido no nosso disco** e
**RECUSA** master que não seja nosso (`MasterNotLocalError`). Não é preferência:
dois vídeos deste projeto viraram 403 porque `output_url` apontava para
`files2.heygen.ai` e a assinatura venceu. Baixar seria conveniente e esconderia
o problema — funcionaria no desenvolvimento inteiro e falharia semanas depois.

O artefato derivado passa pela **mesma** validação do que vem do fornecedor
(piso de 100 KB + assinatura `ftyp`), e a invariante de não-ampliação é
conferida com o número **medido** antes de entregar: falhar é preferível a
entregar, porque sujeito ampliado é irreversível e passa despercebido em tela
pequena.

**3.3:** migration `041_video_variants.sql` — master + variantes, com
`origin` em `('generated','derived')`. A assimetria que o schema materializa:
**uma linha de custo por geração, N linhas de artefato.** Sem esse campo, um
artefato derivado seria indistinguível de um gerado, e "por que a fatura não
bate com a contagem de vídeos?" não teria resposta no banco.

---

#### Fase 4 — o caminho nativo, armado e NÃO disparado

`nativeBatch.ts` separa **planejar** de **executar**, e a razão é a conta:

> N gerações ⇒ N débitos ⇒ N linhas em `provider_usage` ⇒ N unidades de teto

*MEDIDO na guarda:* falha no 3º de 4 → **2 cobradas** (o fornecedor aceitou, não
há estorno depois do aceite — mesma fronteira do ESTORNO-1), **1 pulada**,
fornecedor chamado **3×** e não 4. Com teto de 2, um lote de 4 para no segundo,
mantém as 2 e **explica o que houve** — parar em silêncio é o pior desfecho,
porque o cliente vê dois arquivos onde pediu quatro.

**Regra do master:** pedir "nativo" na proporção em que o master já foi gerado
**não** gera nem cobra — seria vender duas vezes a mesma renderização.

**NÃO FEITO nesta fase:** o planejador e o executor existem e estão provados,
mas **não estão ligados a `POST /videos`**. Nenhum lote pode ser disparado pela
interface hoje, o que é coerente com "armado e não disparado", mas significa
que a integração é trabalho que resta.

---

#### O que NÃO foi feito, e por quê

- **Fase 5 (a escolha no passo 6) — NÃO INICIADA.** Ficou por último e o
  orçamento da sessão acabou antes. Vale registrar um ponto que a Fase 2
  levantou e que precisa ser resolvido ANTES de escrever aquela tela: o texto
  aprovado para a opção nativa diz *"gerado pela HeyGen já neste formato, com a
  composição feita para ele"* — e a medição do padding branco mostra que, para
  o avatar de foto atual, **isso não é verdade**. Escrever a tela com esse texto
  seria publicar uma afirmação que este bloco mediu ser falsa.
- **Fase 6.1** (percurso dos 6 passos nos dois caminhos) depende da Fase 5.
- **Veredito DERIVÁVEL/EXIGE NATIVO por formato**: PENDENTE, ver 2.5.

#### NÃO VERIFICADO (lista fechada)

- O teto de resolução da NOSSA conta. Só a sonda de rede responde.
- Se a HeyGen aceita `resolution: "1080p"` no nosso plano, e se erra ou degrada
  em silêncio ao recusar.
- Se o padding branco em 9:16 é regra do fornecedor ou consequência da foto
  daquele avatar — os dois masters são de avatares diferentes.
- O custo real em 1080p. A doc diz preço igual ao de 720p; nenhuma geração
  nossa saiu fora de 720p.
- A constante de custo contra FATURA (só contra saldo e quota da API).
- Comportamento de cobrança abaixo de 1 segundo.

### Bloco 5F — preenchimento não é conteúdo (Parte A concluída; Parte B ARMADA)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas a fornecedor**. A Parte B está pronta e **NÃO foi disparada**.

#### O que a sonda mede, e por que não é `cropdetect`

`cropdetect` procura borda **preta**; a nossa é branca, e foi por isso que ele
devolveu "sem preenchimento" quando tentado no 5E — um falso negativo que teria
encerrado a investigação. O que funciona é o perfil de luminância, e em
[paddingProbe.ts](backend/src/services/video/paddingProbe.ts) ele é feito de uma
vez: o quadro sai do ffmpeg como luminância crua (`-pix_fmt gray -f rawvideo`) e
a varredura acontece em memória — uma chamada de ffmpeg por quadro amostrado, em
vez de uma por faixa.

Três quadros são amostrados e precisam **concordar**: preenchimento é estático,
e fronteira que se move entre quadros é imagem sendo confundida com barra.

**O veredito tem três valores, e o terceiro é o que protege.** `clean` (sem
barra), `padded` (barra sólida e estável — recortável) e **`pending`**, que
significa "há borda, mas não confio na fronteira": gradiente, textura, ou
medição que falhou. **`pending` NÃO recorta.** Falhar fechado aqui entrega o
vídeo como estava antes deste bloco, em vez de arriscar um recorte sobre
fronteira inventada — recortar a mais come rosto, e isso não tem volta.

*MEDIDO:*

| Arquivo | Veredito | Quadro | Conteúdo | Barra |
|---|---|---|---|---|
| master 9:16 de 02/08 | `padded` | 720×1280 | **720×540** (4:3 exato) | **57,8%** |
| master 16:9 do LIVE-1 | `clean` | 1280×720 | 1280×720 | 0% |
| fixture 9:16 | `clean` | 360×640 | 360×640 | 0% |

A proporção do conteúdo do master 9:16 é **1,3333 — exatamente 4:3**, o que
confirma a leitura do 5E: a HeyGen recebeu uma imagem 4:3 e completou o vertical
com barras.

#### A régua trocou de referência, e dois alvos mudaram de veredito

Os alvos passaram a ser calculados sobre a resolução **útil**. *MEDIDO no master
de 02/08:*

| Formato | Régua antiga (quadro 720×1280) | Régua nova (conteúdo 720×540) |
|---|---|---|
| 16:9 | 1920×1080 — **atende** | 960×540 — **NÃO** ← mudou |
| 9:16 | 720×1280 — não | 720×1280 — não |
| 4:5 | 1024×1280 — não | 720×900 — **NÃO** ← mudou |
| 1:1 | 1080×1080 — **atende** | 720×720 — **NÃO** ← mudou |

**Dois alvos eram dados como atendidos com base em pixels de barra branca.** O
aviso "abaixo da especificação" estava medindo a moldura.

#### A ordem da cadeia: sonda → recorte → decrease → fundo → overlay

O recorte vem **primeiro**, e a ordem é o ponto: tudo depois dele trabalha só
sobre imagem. O fundo desfocado passa a ser feito do conteúdo, e não de uma
barra branca esticada. Sem recorte a cadeia fica idêntica à anterior — um vídeo
limpo não paga nada por esta mudança, e a guarda verifica isso.

**`setsar=1` fecha a cadeia, e não é cosmético.** *MEDIDO:* uma derivação
720×1280 saiu com SAR **5120:5121** e DAR **320:569** em vez de 9:16 — o `scale`
com `force_original_aspect_ratio` compensa o arredondamento das dimensões
mexendo no SAR. O arquivo tem os pixels certos e **mente sobre a proporção**,
então o player estica de leve. Depois da correção: SAR 1:1, DAR 9:16.

#### O ativo de 02/08 reprocessado

Guardado **ao lado**, sem substituir nada e sem tocar em `output_url`:
`uploads/c77a5b8a…/5f77229e-…-5f-recortado-9x16.mp4`. Mesma duração (16,983 s),
mesmo áudio (aac 48 kHz estéreo, `-c:a copy`), mesmo quadro 720×1280 — e as
barras brancas viraram extensão desfocada do próprio conteúdo, com o sujeito
idêntico (720×540, sem ampliar e sem cortar). Frames comparativos em
`uploads/_5e-prova/` (fora do git).

#### Defeito de arredondamento achado ao verificar

O ajuste para dimensão par estava **encolhendo pelo lado do conteúdo**. Com o
conteúdo em 271 linhas (ímpar), o recorte entregava 270 e **comia a última linha
de imagem**. Agora `evenSpan()` cresce para fora: o pior caso passa a ser um
pixel a mais de barra, que o enquadramento cobre. Os dois erros não são
simétricos — um perde imagem, o outro não perde nada.

#### Guardas (5 mutantes, todos provados)

[checkPaddingPolicy.ts](backend/src/scripts/checkPaddingPolicy.ts), sobre uma
fixture versionada com preenchimento conhecido
(`simulated-video-padded-9x16.mp4`, quadro 360×640 e imagem 360×270). Os quatro
defeitos, cada um com mutante: sonda cega; régua medindo o quadro; recorte
avançando sobre o conteúdo; e cadeia enquadrando sem passar pela sonda. Mais o
contraponto (amostrar em outros instantes segue verde — a medida é de uma
propriedade estática).

**Os números da fixture são MEDIDOS por leitura direta da luminância, não pelo
que o comando de geração pediu:** o `pad` foi pedido em y=185 e o arquivo
codificado tem conteúdo a partir de **y=184**, por sangramento de croma do
`yuv420p`. Conferir a sonda contra a intenção, e não contra o arquivo, teria
produzido um falso erro de 1 px.

**A fixture nova exigiu `docker compose build backend`** — `backend/fixtures/`
entra pelo `COPY` do Dockerfile, não pelo bind mount. Gotcha já registrado, que
custou uma execução.

**Sexta ocorrência do `expect` mal recortado:** a mensagem diz "o filtro de
derivação **NÃO** leva o recorte" e o `expect` dizia "não leva o recorte" — o
arnês compara diferenciando maiúscula, e a guarda saudável apareceu como
AMBÍGUA.

#### Parte B — rodada de controle, ARMADA e NÃO DISPARADA

Tudo em [controlRun.ts](backend/src/scripts/controlRun.ts), que **não chama
fornecedor nenhum**: `--payloads` imprime o que sairia, `--measure` mede o que
voltou. Ver a seção "PLANO DA RODADA DE CONTROLE" logo abaixo.

#### A lacuna entre a Fase 4 do 5E e o produto

O lote nativo (`nativeBatch.ts`) está **provado e não ligado**: o planejador e o
executor têm guarda e mutantes, mas nada em `POST /videos` os chama. Nenhum lote
pode ser disparado pela interface hoje. É trabalho a agendar, não um defeito.

#### NÃO VERIFICADO ao fim do 5F

- Se o preenchimento em 9:16 é regra do fornecedor. **É o que a Parte B
  responde** — os dois masters comparados até aqui são de avatares diferentes.
- Se a HeyGen aceita `resolution: "1080p"` na nossa conta.
- Se a sonda se comporta bem com preenchimento **não** branco (barra preta,
  cinza) ou com cena clara encostando na borda. O caminho `pending` existe para
  isso e **nunca foi exercitado contra um caso real** — só contra a fixture.
- O quarto ponto do truncamento.

### PLANO DA RODADA DE CONTROLE (5F Parte B) — ARMADO, NÃO DISPARADO

Escrito antes de precisar dele. **Nada aqui foi executado.** Uma rodada
responde três perguntas de uma vez, e todas as três só têm resposta em live.

**Desenho:** mesmo avatar (Mário, o de 02/08), mesmo roteiro, duas gerações —
`9:16` e `16:9` —, ambas em `1080p`. A única variável é a proporção; foi a
falta desse controle que impediu o 5F de concluir de quem é o preenchimento.

**Roteiro (idêntico nas duas), 32 caracteres:**

```
Olá. Este é um teste de formato.
```

Curto porque a cobrança trunca em segundo inteiro: ~2,7 s pela taxa observada
no 5D (206 caracteres → 17,6 s). Custo esperado **US$ 0,20 a 0,30 no total**.

**Os dois payloads exatos, montados pelo montador REAL** (`buildHeygenVideoPayload`):

```json
{ "type": "avatar", "avatar_id": "45528bb8bf914899b12403e6d50cb780",
  "audio_asset_id": "<devolvido pelo upload do TTS>",
  "aspect_ratio": "9:16", "resolution": "1080p" }

{ "type": "avatar", "avatar_id": "45528bb8bf914899b12403e6d50cb780",
  "audio_asset_id": "<devolvido pelo upload do TTS>",
  "aspect_ratio": "16:9", "resolution": "1080p" }
```

Sem `engine`: a flag `explicit_avatar_engine` continua desligada, porque a
ligação entre `supported_api_engines` e `engine.type` é dedução e um valor
recusado derruba a geração.

**Se 1080p for recusado, a recusa é a resposta.** Registre e **pare** — não caia
para 720p sem aval.

**Sequência (só com aval explícito):**

```bash
docker compose exec backend npm run preflight:live
```

1. No `.env`: `PROVIDER_MODE=live`, `PROVIDER_LIVE_CONFIRM=<a frase exata>`,
   `PROVIDER_LIVE_MAX_GENERATIONS=2`. Margem zero, de propósito.
2. `docker compose up -d backend` — **`restart` NÃO recarrega variável de
   ambiente**, só `up -d` recria o container.
3. Ler a quota ANTES (guardar o número).
4. Gerar **9:16 primeiro** — é a que responde a pergunta central.
5. Baixar o artefato **imediatamente**: a URL da HeyGen é assinada e expira.
6. Gerar 16:9. Baixar.
7. Ler a quota DEPOIS.

```bash
docker compose logs backend | Out-File -Encoding utf8 controle-5f.log
```

`Out-File -Encoding utf8`, nunca `>` — no PowerShell o `>` grava UTF-16LE e
`grep` não acha nada dentro.

**Medição (script pronto e exercitado em fixture):**

```bash
docker compose exec backend npx tsx src/scripts/controlRun.ts --measure /app/uploads/<tenant>/<9x16>.mp4 /app/uploads/<tenant>/<16x9>.mp4
```

Ele imprime, por arquivo: veredito de preenchimento e percentual, quadro,
conteúdo útil, e os segundos cobrados contra os entregues — mais a previsão de
unidades para conferir contra a quota lida.

**O que cada resultado significa:**

| 9:16 | 16:9 | Conclusão |
|---|---|---|
| com barra | limpo | O preenchimento é do FORNECEDOR. A política do master 9:16 precisa ser revista |
| limpo | limpo | O master de 02/08 era atípico; a política se sustenta |
| com barra | com barra | O preenchimento vem da foto do avatar, não da proporção |

**Se uma falhar:** `docker compose restart backend` devolve o contador do teto
sem sair do modo live (é variável de módulo, por processo). O crédito é
estornado sozinho e o teto de gasto volta — só a tentativa não volta.

**Desarme, ao terminar:**

```bash
docker compose up -d backend
```

com `PROVIDER_MODE=fixture` e `PROVIDER_LIVE_CONFIRM` vazia no `.env`. Conferir
no log: `{"event":"provider_mode","mode":"fixture","billable":false,...}`.

### Bloco APRESENTACAO-1 — arnês provado e ativo repontado (2026-08-03)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas a fornecedor**. Nada foi construído: este bloco fecha provas e reponta
um registro.

**O arnês: 90/90 MEDIDO, não esperado.** Saída 0, **781 s** de parede
(10:02:38 → 10:15:39 UTC). Os 5 mutantes de preenchimento estão nas posições
**86–90** — no fim da lista, então qualquer interrupção antes disso produz um
resultado que **não** exercita a guarda do 5F. Vale como regra ao ler um log
truncado deste arnês: contagem parcial não diz nada sobre o 5F.

**4 PROVAS + 1 CONTROLE, todos NOMINAIS.** A distinção não é preciosismo:
quem PROVA a guarda é o mutante que a faz reprovar (86–89, cada um com a linha
de falha citando a asserção de preenchimento, nenhum vindo do `tsc`). O 90 é
**controle de robustez** — ele passa verde de propósito, e o que demonstra é
que a guarda não reprova qualquer coisa. Chamar controle de prova infla a
contagem e esconde quantas asserções de fato têm defeito exercitado.

| Mutante | Linha de falha (recorte) |
|---|---|
| sonda devolve o quadro inteiro | "a sonda **não enxergou o preenchimento** … 58% é barra branca" |
| alvo volta a derivar do quadro | "a régua **mediu o QUADRO em vez do conteúdo** — 16:9 saiu 1136×640; sobre a imagem real é 480×270" |
| recorte come duas linhas | "o recorte **avançou sobre o conteúdo** — pediu y=186 360×268, a imagem ocupa y=184 360×270" |
| enquadramento sem recorte | "o filtro de derivação **NÃO leva o recorte**, mesmo com a sonda acusando barra" |
| outros instantes (contraponto) | gate **verde** com "preenchimento: sonda conferida" presente |

O `expect` obrigatório é o que separa isto de "reprovou de algum jeito": o
arnês classifica como AMBÍGUO todo mutante que reprova sem a mensagem da
guarda. **O que ele NÃO faz é imprimir essa linha quando o veredito é `ok`** —
foi preciso um script à parte para colhê-la, e ele foi **descartado** em vez de
mantido: um segundo aplicador de mutações ao lado do arnês diverge com o tempo,
e o que divergir é o que vai mentir. Se a capacidade valer, o lugar dela é uma
flag `--why` dentro de `run-mutants.mjs`, reusando `applyMutation`/`runGate`.

**(a) Prova é write-once, nomeada por bloco E commit.** Vive em
`uploads/_prova/<bloco>-<sha>/`, com `MANIFESTO.txt` (md5 + bytes + ffprobe de
cada arquivo, mais o que foi medido e o que não foi). **Nenhum bloco novo
escreve em diretório de prova de bloco fechado.** O deste bloco é
`uploads/_prova/5f-e1e47cc/`. `uploads/*` é ignorado pelo git, então prova só
existe **neste disco** — copiar para fora é parte de fechar um bloco, não
zelo opcional.

**(b) O schema do 5E não comporta o resultado do 5F.**
`video_variants_video_aspect_uniq (video_id, aspect_ratio)` assume **uma
variante por proporção**. O produto do 5F é a **mesma** proporção com conteúdo
diferente — 9:16 com barra e 9:16 recortado, ambos 720×1280. Por isso o par de
linhas (`generated` + `derived`) não cabe, e **nada foi inserido**: uma variante
apontando o original com barra, ao lado de um `output_url` apontando o
reprocessado, criaria duas fontes de verdade que se contradizem, que é pior que
não ter registro. Chave provável: `(video_id, aspect_ratio, origin)`. **Tratar
DEPOIS da apresentação** — é migration, não ajuste.

**(c) `uploads/_5e-prova/` já não guarda a prova do 5E.** Os 4 derivados lá
estão na **régua nova** (16:9 → 960×540, 4:5 → 720×900, 1:1 → 720×720), e os do
master 16:9 do LIVE-1 não estão mais lá. A prova do 5E (85/85) **não é mais
reconferível em disco**. O nome do diretório engana quem for reconferir a tabela
daquele bloco — foi este caso que originou a regra (a).

**(d) O ativo da apresentação foi repontado.** `videos.output_url` do registro
`9d39c5ef-c8cf-4d54-b42c-79788c823250` (tenant `dev-c77a5b`, 9:16,
`simulated=f`) passou a apontar `…-5f-recortado-9x16.mp4`. **`UPDATE 1`, um
registro só**; nada mais tocado. O SQL exato que desfaz está em
`uploads/_prova/5f-e1e47cc/REVERTER.txt`, e o valor anterior em
`output_url-original.txt`.

*Verificado ANTES do UPDATE, porque banco correto com rota que não serve o
arquivo dá 404 com healthcheck verde:* a rota estática entrega o nome **com
sufixo** — HTTP 200, `video/mp4`, `Accept-Ranges: bytes`,
`Content-Length: 2716141` — nos dois hosts, inclusive
`dev-c77a5b.twinai.localhost`, que é onde a Biblioteca roda. A rota serve
`output_url` cru, sem validar contra padrão de UUID.

*Verificado DEPOIS, no navegador e não no banco:* player com `readyState 4`,
**720×1280**, `aspect-ratio` computado **9/16**, `seekable 0–16.983`,
**159.076 bytes de áudio decodificados**, console sem erros, e — com os olhos —
fundo desfocado no lugar da barra branca, sem badge SIMULADO.

**Não existe miniatura no produto, e isto foi medido em três lugares:** a
tabela `videos` não tem coluna de poster; o `<video>` do `VideoPlayer` não tem
atributo `poster` (confirmado em execução: `poster === null`); e a Biblioteca é
uma **tabela textual**, não uma grade — o player só aparece ao clicar em "Ver".
Logo, não há imagem que possa ficar apontando para o arquivo antigo. Por
precaução foi medido também o **primeiro quadro** (t=0) do reprocessado: **0% de
barra**.

**Nenhuma coluna derivada do arquivo ficou desatualizada.** `videos` não tem
`size`/`bytes` nem `width`/`height`; `aspect_ratio` e `resolution` valem para os
dois (mesmo quadro); as durações são idênticas (16,983 s). `duration_seconds=15`
é o valor **pedido na tela** e já divergia antes deste bloco. E o rastro do
fornecedor não dependia do `output_url`: `provider_output_url` guarda a URL
assinada da HeyGen desde a migration 040 — ela **expira**, então serve como
identificação, não como acesso.

**(e) `GET /v2/user/remaining_quota` tem sunset em 2026-10-31** — quebra com
data marcada, já detalhada na lacuna 3 do LIVE-1. Depois dessa data os dois
caminhos vivos (`checkHeygenConnection` e o probe do painel) passam a falhar, e
o sintoma será "chave inválida", que é o diagnóstico errado. Substituto:
`GET /v3/users/me`, já exercitado com sucesso.

**Continua NÃO VERIFICADO:** se a HeyGen aceita `1080p` na nossa conta; e como
a sonda se comporta com preenchimento não branco ou cena clara encostando na
borda — o caminho `pending` existe para isso e nunca foi exercitado contra um
caso real.

### FOV-1 — o 9:16 é RECOMPOSIÇÃO, não corte (2026-08-03, custo zero)

**A pergunta que a Parte B ia responder foi respondida sem gastar nada**, e o
insumo já estava em disco: o avatar Mário tem dois masters do fornecedor em
proporções diferentes — 31/07 sem `aspect_ratio` (16:9, 1280×720, `clean`) e
02/08 em 9:16 (720×1280, conteúdo 4:3, 57,8% de barra). Mesmo
`provider_avatar_id`, mesma sala.

**VEREDITO: RECOMPOSIÇÃO.** *MEDIDO por casamento de escala:* o conteúdo 4:3 do
9:16 equivale a **exatamente 1280 px** de largura no mundo do 16:9 (escala
1,000×, mínimo bem definido — erro 4,14 contra 4,82 e 6,00 nos vizinhos), com
deslocamento vertical de **120 px**, que é exatamente metade de (960 − 720).
Ou seja: **mesma largura de campo, 33% mais campo vertical**, distribuído
simetricamente. Prova visual alinhada em `uploads/_prova/fov/`.

**Consequência para o Estágio 1, em uma linha:** a chave do catálogo é
`(avatar, formato_pedido) → conteúdo entregue`, e a migration por combinação **é
necessária** — medir "conteúdo nativo por avatar" mediria a coisa errada.

E há uma consequência de produto: **derivar 9:16 do master 16:9 é pior do que
pedir 9:16 ao fornecedor** — daria 68,4% de tarja contra 57,8%, e com menos
imagem real, porque o fornecedor entrega campo vertical que a derivação local
não tem de onde tirar.

**O instrumento errou antes de acertar, e isso vale registrar.** O `headroom` do
`tools/fov-compare.mjs` deu veredito "anômalo" e **não foi aceito**: ele mede o
primeiro ponto com variação de luminância, que aqui é mobília e parede, não a
cabeça — o bounding box que ele chama de sujeito muda de proporção entre os dois
masters (1,80 contra 0,94), sinal de que não isola pessoa nenhuma. O limiar
**não** foi ajustado para produzir veredito; entrou um segundo instrumento,
independente, cuja premissa é a cena ser a mesma.

**A evidência do fornecedor APODRECE — requisito do Estágio 1, não conserto
agora.** *MEDIDO:* 2 dos 4 vídeos reais do Mário têm `output_url` apontando
`files2.heygen.ai` com assinatura vencida, e já devolvem 403. Esta comparação
só foi possível porque os outros dois haviam sido baixados para o nosso disco.
**Se o master não for baixado na ingestão, a medição de hoje é irreproduzível
amanhã** — e o que se perde não é o arquivo, é a possibilidade de reabrir a
pergunta.

**Ressalvas (NÃO VERIFICADO):** os dois masters têm roteiros e durações
diferentes (33,7 s e 17,0 s), então a pose do sujeito não é idêntica — o
casamento de escala mede a sala, que é estática, e não a pessoa; se a
recomposição vale para 4:5 e 1:1, nunca pedidos em live; e `avatars` não tem
`updated_at`, então a ausência de retreino entre as duas datas é DEDUZIDA de
existir um único `provider_avatar_id`.

### INSTRUMENTOS-1 — o rastro do veredito FOV-1 (2026-08-03, custo zero)

**O instrumento do veredito é `tools/scale-match.mjs`, agora COMMITADO.** Ele
vivia no scratchpad de uma sessão — diretório efêmero —, então o veredito
RECOMPOSIÇÃO estava sustentado por código que ia desaparecer, enquanto o único
instrumento no repositório dizia o contrário.

**`headroom`, `sujeitoV` e `sujeitoH` do `tools/fov-compare.mjs` são
INVÁLIDOS** e passaram a se chamar `*_NAO_CONFIAVEL` na tabela, com o veredito
automático removido. Eles derivam de `edges()`, que marca o primeiro ponto com
desvio-padrão acima de um limiar — nestes masters, mobília e parede. A prova de
que não isolam sujeito nenhum está na própria saída: o bounding box muda de
proporção **1,80 → 0,94** entre dois vídeos da MESMA sala. O `EDGE_K` **não foi
tocado**: a métrica foi desqualificada, não recalibrada.

**O que continua VÁLIDO no `fov-compare`:** `barFrac`, `conteudo` e
`razaoConteudo`. Ele passou a cobrar concordância entre os três quadros do
`barFrac`, que é o critério da sonda do 5F. *Sanidade MEDIDA nos dois
instrumentos sobre o mesmo par:* **57,8%** de barra (3 quadros concordam) e
razão de conteúdo **1,3333**.

**Reprodução do veredito, MEDIDA direto dos `.mp4` (sem depender dos PNGs de
prova):** barra 57,8% · razão 1,3333 · **1280 px · 1,000× · dx=0 dy=120** ·
erro 4,09 contra 4,78 no vizinho. O `dy=120` é metade de (960−720), como
registrado. Sobre os PNGs o erro é 4,14 — a diferença é recompressão.

**DOIS ARMADILHAS que custaram tempo e estão no cabeçalho do script:**

1. **Existem DOIS masters 16:9 de 1280×720 no mesmo tenant, e a dimensão não os
   distingue.** O do FOV-1 é o de **33,696 s (`61caaab1`)**; o de 3,372 s
   (`0a0193b8`, do LIVE-1, que é o master do 5E) é de **outra cena**. Com o
   arquivo errado o erro fica em 39 num platô sem mínimo e o veredito sai
   "campo AMPLIADO" — espúrio. Nenhum registro anterior nomeava o arquivo do
   FOV-1; *MEDIDO:* o PNG de referência casa com `61caaab1` (MAE 3,11) e não
   com `0a0193b8` (MAE 51–54).
2. **O instante importa.** Em `t=0` nem o par correto casa, porque um dos
   masters ainda está entrando na fala. Daí a flag `--ss`; amostre o meio. Um
   casamento que não se destaca dos vizinhos é resultado a **descartar**, não a
   interpretar.

#### 1080p no vertical: 2,25× mais pixels úteis pelo MESMO preço

*MEDIDO exercitando a régua real (`masterResolutionFor`/`targetForAspect`), não
aritmética à mão:*

| pedido | master 9:16 | conteúdo útil | alvos derivados |
|---|---|---|---|
| **720p** (o que enviamos hoje) | 720×1280 | **720×540 = 389k px** | 9:16 720×1280 · 4:5 720×900 · 1:1 720×720 · 16:9 1280×720 |
| **1080p** | 1080×1920 | **1080×810 = 875k px** | 9:16 1080×1920 · 4:5 1080×1350 · 1:1 1080×1080 · 16:9 1920×1080 |

**Razão de pixels úteis: 2,2500 exata.** É DEDUZIDO, e a premissa está nomeada:
que a fração de barra (57,8%) se mantenha em 1080p. Se mantiver, a razão é
geometricamente forçada — (1080/720)².

**O achado que decide a discussão: os alvos em 1080p são EXATAMENTE os quatro
números da política aprovada do 5E** (9:16 1080×1920 · 4:5 1080×1350 · 1:1
1080×1080 · 16:9 1920×1080). Em 720p, os quatro ficam **abaixo do alvo** — é o
próprio 720p que faz a régua emitir o aviso "abaixo da especificação". Passar a
pedir 1080p **alinha** o pedido com a política já aprovada; não quebra nada.

**Estado da checagem da Tarefa 2, item por item:**

- **(a) O que enviamos hoje — MEDIDO: `720p`, FIXO, não escolhível.**
  `MEASURED_RESOLUTION` em [videoFormat.ts:54](backend/src/services/providers/videoFormat.ts:54)
  é constante única, aplicada às 5 plataformas; o payload leva
  `resolution: input.format.resolution` em
  [avatarProvider.ts:356](backend/src/services/providers/avatarProvider.ts:356).
  A UI escolhe PLATAFORMA (que determina a proporção); a resolução é a mesma
  para todas. **`1080p` aparece só em guardas e no `controlRun.ts` da Parte B
  (armada, não disparada)** — nenhum caminho de produção o envia.
- **(b) Registro de geração em 1080p — NÃO EXISTE.** *MEDIDO:* `provider_usage`
  tem 13 linhas com resolução, **todas 720p** (1× 16:9 sucesso, 8× 9:16
  sucesso, 4× 9:16 falha) e 69 com `NULL` (voz e roteiro, que não têm
  resolução); **zero** em 1080p. Log do backend: **zero** ocorrências de
  "1080p". Fixtures: nenhuma coincide com resolução declarada (maior lado 640
  px), **por desenho** — a guarda `checkResolutionIsNotSimulated` reprova se
  coincidirem, para que a simulação não pareça verificar resolução.
  **Portanto: 1080p nunca foi aceito NEM recusado — nunca foi pedido.**
- **(c) O que assume 720p — quase nada, e nada que quebre.** A régua do 5E é
  **parametrizada**: `RESOLUTION_SHORT_EDGE` mapeia os três rótulos e
  `targetForAspect(ratio, shortEdge)` recebe o lado curto como argumento. Três
  pontos precisariam de ajuste, e são de **proveniência, não de cálculo**:
  1. **[videoFormat.ts:42-52](backend/src/services/providers/videoFormat.ts:42)
     está DESATUALIZADO** — justifica 720p dizendo que "subir para 1080p mudaria
     o custo por um fator que ninguém mediu". O 5E derrubou isso: a tarifa é por
     **segundo e por tipo de avatar, não por pixel** (DOCUMENTADO, duas fontes).
     A justificativa escrita ali já não sustenta a escolha.
  2. `measuredUnder.resolution = "720p"` em
     [providerCost.ts:90](backend/src/services/billing/providerCost.ts:90) é o
     registro das **condições** da medição. O cálculo não muda (é por segundo),
     mas o rótulo deixaria de descrever o que se gera.
  3. O teto real da NOSSA conta continua **NÃO VERIFICADO** — só a sonda de rede
     responde, e ela é a pergunta 2 da Parte B.

**NADA FOI ALTERADO.** `MEASURED_RESOLUTION` continua em `720p`, aguardando
decisão — mudá-la altera o que se pede ao fornecedor em toda geração.

#### Pendência de dono: backup da prova

**`uploads/_prova/` só existe NESTE disco** (`uploads/*` é ignorado pelo git).
Copiá-lo para fora da máquina é **responsabilidade do usuário** e continua
**PENDENTE**. Precedente que mostra o custo: `uploads/_5e-prova/` foi
sobrescrito e a prova do 5E já **não é reconferível em disco**.

