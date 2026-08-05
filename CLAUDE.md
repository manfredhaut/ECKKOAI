Always respond in Brazilian Portuguese.

# eckko.ai (antigo TWINAI)

SaaS multi-tenant de vídeo com avatar digital. Docker Compose: `traefik` (única porta, **8090**), `postgres`, `backend` (Fastify/TS), `frontend` (React/Vite). **HEAD `84fdae3`** + o commit deste fechamento. Há uma **demo a apresentar**.

**0 · REGRA DE ESCRITA — confira o número MEDIDO contra o número AFIRMADO antes de escrever a mensagem de commit.** Três imprecisões em três commits: `84fdae3` disse "nenhuma removida" com 3 guardas reescritas, e `5de2ed6` disse "8 mutantes novos" sendo 7. Nenhuma delas mudou o código; todas fizeram a mensagem valer menos do que o diff. Contar é barato — reler a afirmação com o número na mão custa segundos.

**Amostra de voz — a duração-limite agora é 218 s (3:38)** e é DERIVADA, não escolhida: `floor(10 MiB / (24000 Hz × 2 bytes))`. A saída da conversão passou de 48 para **24 kHz** (item 4.2 do FECHAMENTO-1), o que fez a captura de 2:33 do E2E-1 voltar a caber — 7.338.318 B contra os 14.676.558 B de 48 kHz (os **dados** são metade exata, 7.338.240 B; o arquivo difere em 39 B porque o header de 78 B não se divide). As duas réguas (recusa por tamanho e `checkSampleDuration`) saem da MESMA função, e a faixa 109–120 s em que uma aceitava e a outra recusava não existe mais. O **aceite do fornecedor está MEDIDO desde 05/08 e o risco está FECHADO**: o ElevenLabs aceitou exatamente este WAV numa clonagem real — `cloneVoice` HTTP **200**, `{"voice_id":"5Yeum4QN7o9S5Lc0XVOx","requires_verification":false}`. Era o último NÃO VERIFICADO entre o projeto e a demo. Prova em `uploads/_prova/fechamento1-24khz/` e `uploads/_prova/tiro-final/`.

**ElevenLabs, item 3 do FECHAMENTO-1 — FECHADO como NÃO VERIFICADO, não procurar mais.** O `model_id` já era enviado em **03/08** (`ed207db`, ancestral de `2640342`), então a hipótese de "faltava mandar o modelo" está descartada. Por que os 90 créditos foram cobrados à tarifa de Flash/Turbo continua sem resposta possível daqui: a resposta gravada não traz o modelo e os cabeçalhos passam por allowlist. Fica assim.

**Custo do arnês — hipótese REFUTADA.** `npm run check:mutants` custa **1.290 s = 21,5 min** (cronometrado em 04/08, 122/122 verde), **não ~52**, e não são as guardas novas: as de voz somam **540 ms** (medido nesta retomada; 609 ms na anterior) de um gate de **10.898 ms** — 5%. O tempo está no PRODUTO: **122 mutantes × 10,6 s de gate**, e cada mutante paga um gate inteiro. Dentro do gate: `tsc --noEmit` ~4,0 s + `checkPolicy` ~5,9 s + ~1,0 s de `docker compose exec`/npm. Ou seja, ~40% de cada execução é um `tsc` que quase nenhuma mutação altera. Guarda nova só move o ponteiro se custar segundos, não milissegundos.

**GUARDA B — os DOIS lados estavam sem medição; só o "usado" foi corrigido (04/08).** Ela compara `usado >= teto` e os dois números eram supostos. **Usado — CORRIGIDO:** contava `data.voices.length`, e `GET /v1/voices` traz a biblioteca `premade` do fornecedor junto com as vozes da pessoa. Numa conta de **4** vozes ele devolveu **25**, e uma clonagem legítima foi recusada com "25 de 10 vozes em uso" (nada gasto — a recusa é antes da clonagem). Agora `countOwnedVoices()` conta o que **não** é `premade`. **A categoria deixou de ser deduzida em 05/08:** o inventário real traz **26 itens = 21 `premade` + 5 `cloned`**, e os 21 batem exatamente com a aritmética 25−4 de antes. A correção está provada em produção — a clonagem que antes era recusada com "25 de 10" passou avaliando **4 de 10**. **Substituir a voz de um avatar NÃO libera o slot da antiga:** o fornecedor ficou com as duas, com o mesmo nome, e a conta foi de 4 para 5. **Teto — SEGUE SUPOSTO:** `DEFAULT_VOICE_SLOT_LIMIT = 10` é declarado, e o real vive em `/v1/user/subscription`, que responde **401** sem `user_read`. Não foi tocado. Enquanto o teto for palpite, esta guarda pode barrar cedo demais de novo — só que agora pelo lado que ainda não foi medido.

**1 · DESARME — confirme antes de tudo. Modo `live` gasta dinheiro real.** Exigido `fixture` + `len=0`, nos 5 critérios: `printenv` (o processo) · `docker compose config` (o arquivo — pode divergir, e um `up -d` transforma um no outro) · `StartedAt` · `RestartCount` · linha de boot `"billable":false`.

```bash
docker compose exec -T backend sh -c 'printf "%s len=%s\n" "$PROVIDER_MODE" "${#PROVIDER_LIVE_CONFIRM}"'
```

**Como ler os dois últimos critérios — corrigido em 04/08, os dois davam falso alarme.**
- **`RestartCount` não se compara com 0.** A linha de base é o valor **logo após o boot**, e ele pode ser >0 legitimamente: ligar a máquina sobe os 4 serviços juntos e o backend reinicia enquanto espera o Postgres. O sintoma é **incremento SEM boot** — anote o número no começo da sessão e compare com ele, não com zero. O `RestartCount=3` de 09:28 tinha **causa confirmada pelo operador** (ligou o Docker/o PC); a confirmação é do operador, não do log — o log daquele instante segue inalcançável, então a causa é **DEDUZIDA**, não medida.
- **A linha de boot sai do alcance do log.** Ela é emitida uma vez, no start (`assertLiveModeAuthorized`), e o log é dominado por healthcheck a cada 10 s: em `--tail 500` cabem ~36 minutos, então num backend de pé há horas ela **não está lá** — e o gotcha 1 proíbe concluir ausência. Nesse caso o `printenv` é evidência **mais forte**, não substituto pior: em `live` o processo **não sobe** sem `PROVIDER_LIVE_CONFIRM`, então um processo vivo dizendo `fixture` já prova o que a linha diria.

**2 · OS 3 GOTCHAS QUE CUSTARAM CONCLUSÕES ERRADAS**
1. **`docker compose logs` mente sobre o fim do log — use `--tail 500`.** Sem isso (ou com `--tail`>~1000, ou `--since`) devolve arquivo rotacionado e congelado, internamente coerente. Já fez uma requisição bem-sucedida parecer inexistente. **Nunca conclua ausência de evidência com ele.**
2. **Código novo não entra sozinho:** backend roda sem watch (`restart backend`), Vite serve bundle velho (`restart frontend`), e `vite.config.ts`/`package.json`/`Dockerfile`/entrypoint estão fora do bind mount (`build`).
3. **`restart` não recarrega `.env`** (só `up -d`); **`ps` esconde parado** (use `-a`). `running` não é saúde — `/api/health` é.
4. **Ligar ou desligar a MÁQUINA reinicia o backend** — e um reinício com geração live em andamento perde o vídeo. O polling vive em `setInterval` na memória do processo (`routes/videos.ts:37`), **fora do `withLiveBudget`**, e nada o retoma no boot: `pollJob` só é chamado pela rota de criação. Morto o processo, o vídeo fica em `queued`/`processing` **para sempre, sem estorno** — o débito já aconteceu e o estorno só vale antes do aceite. Não é só "não reinicie o container": é não desligar o PC.

**3 · DINHEIRO — não reabrir**
- Vídeo: **3 unidades por segundo INTEIRO TRUNCADO**, 60 un/dólar ⇒ **US$ 0,05/s**. 4 medições exatas. A régua é a duração do **fornecedor**, não o nosso `ffprobe`.
- Voz: **por CARACTERE**, US$ 0,018 por roteiro de 180 — **2,5%** do custo. Encurtar roteiro para economizar é esforço mal empregado. *(A TARIFA está fechada; qual MODELO a produziu, não — ver item 4.)*
- **Avatar novo custa US$ 1,00**, ~6× um vídeo de 15 s — é o botão "Novo avatar" do passo 1. **Na demo, clicar só no card.**
- Débito vem **antes** da chamada e estorna **só antes do aceite**. **Nunca reinicie com geração em andamento** — o polling roda fora do orçamento e o vídeo trava em `queued` para sempre.

**4 · ABERTO, COM DONO**

| O quê | Dono |
|---|---|
| Chaves de plataforma (Anthropic, Google, embedding) pelo painel | **usuário** |
| Rotacionar chave Google de dev e senhas de demo — passaram por chat | **usuário** |
| `user_read` no ElevenLabs; saldo HeyGen (US$ 13,85 ⇒ ~19 vídeos de 15 s) | **usuário** |
| Backup de `uploads/_prova/` — `uploads/*` é ignorado pelo git | **usuário** |
| Autostart do Docker Desktop | **usuário** |
| ~~Qual modelo o ElevenLabs faturou de fato~~ — **ENCERRADO como NÃO VERIFICADO em 04/08, não reabrir.** Mandamos `eleven_multilingual_v2` e o `model_id` **já era enviado em 03/08** (`ed207db`), então não há o que instrumentar: o painel cobrou 0,5 crédito/caractere (tarifa de Flash/Turbo), a resposta gravada não traz o modelo e os cabeçalhos passam por allowlist. Responder isto exige o fornecedor, não o nosso log | **ninguém — fechado** |
| Bloco 2B (documentação nova) · RAG bloqueado por chave de embedding | próxima sessão |

**5 · O RESTO ESTÁ EM `docs-internal/`** (na RAIZ — saiu de `docs/` em 04/08, porque `docs/` é a árvore que alimenta o copiloto e isto aqui é memória de engenharia). Nada foi apagado; cada arquivo diz de que linhas do original veio.
[00 referência](docs-internal/00-referencia-do-projeto.md) · [01 handoff e decisões](docs-internal/01-handoff-e-decisoes.md) · [02 ambiente e demo](docs-internal/02-ambiente-e-demo.md) · [03 blocos fechados](docs-internal/03-blocos-fechados.md) · [04 demos e estorno](docs-internal/04-demos-e-estorno.md) · [05 formatos e derivação](docs-internal/05-formatos-e-derivacao.md) · [06 TELA-1 e passadas live](docs-internal/06-tela1-e-passadas-live.md) · [07 voz e passo 1](docs-internal/07-voz-e-passo-1.md)

Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check` · Arnês: `npm run check:mutants` · **mutante se identifica por NOME, nunca por posição.**

---

## 6 · Bloco de retomada — cole numa sessão nova

> **eckko.ai, diretório `TWINAI`. HEAD `66e9316` + o commit deste handoff (04/08), árvore limpa, `fixture` com `PROVIDER_LIVE_CONFIRM` vazia — DESARMADO e conferido às 13:01.** Confirme os 5 critérios do desarme antes de tocar em nada: `printenv` e `docker compose config` podem divergir, e um `up -d` arma o modo pago sem nova pergunta. **`RestartCount` compara-se com o valor pós-boot, não com 0**, e a linha de boot pode estar fora da janela de `--tail 500` — nesse caso o `printenv` é a evidência mais forte, porque em `live` o processo nem sobe sem a confirmação.
>
> ## ✅ TIRO FINAL — clonagem e síntese FEITAS em 05/08. Falta só o vídeo.
>
> **A clonagem real passou pelo caminho de produção, com as guardas ativas**, no avatar `7557957c-d22f-4fba-a1e0-c19f07f47536` ("TESTE REAL 15:40 01/08"). **O Mário não foi tocado e `wAd9MJ2IK71FGs1FWjIX` está intacta.**
>
> **MEDIDO:** `cloneVoice` HTTP **200** → `voice_id` **`5Yeum4QN7o9S5Lc0XVOx`**, `requires_verification:false`, `category=cloned` · GUARDA B avaliou **4 de 10** e liberou · `voice_id_replaced` registrou `5Qfze6o4… → 5Yeum4QN…` · síntese de **87 caracteres** → **100.772 B**, **6,22 s** (`source: elevenlabs_timestamps`), md5 `560454d9…`, em 2.922 ms · **HeyGen inalterado: 831 un / US$ 13,85** — nenhum vídeo.
>
> **O único gasto foi 1 slot de voz, e ele NÃO volta.** Substituir a voz do avatar não apaga a antiga no fornecedor: a conta foi de 4 para 5, com duas vozes de mesmo nome. Liberar exige o painel.
>
> **O que sobra para fechar a demo: 1 vídeo de 15 s, ~US$ 0,75** (3 un/s inteiro truncado, 60 un/US$, régua do FORNECEDOR). Não foi autorizado até aqui.
>
> **Rearmar (o `.env` não é editado; as variáveis vão na invocação):**
> ```
> PROVIDER_MODE=live PROVIDER_LIVE_CONFIRM=eu-autorizo-gastar-cota-real PROVIDER_LIVE_MAX_GENERATIONS=2 docker compose up -d backend
> ```
> **2 é obrigatório:** `consumeLiveGeneration()` roda em `cloneVoice()` **e** em `generateVideo()` — com o default de 1 a clonagem come a única unidade e o vídeo é recusado por nós mesmos (bloco DEMO-4). **Observado e NÃO VERIFICADO:** `maxgen=2` sobrevive ao desarme; `docker compose config` também o resolve como 2, então vem do `.env` — dedução, porque o `grep` no `.env` foi negado duas vezes pela camada de permissão.
>
> **O upload é do OPERADOR, não do assistente:** `POST /avatars/:id/voice-sample` exige sessão autenticada e o assistente não faz login com a senha dele. A tela tem `<input type="file">` ([VoiceSampleRecorder.tsx:306](frontend/src/pages/CreateVideo/VoiceSampleRecorder.tsx:306)) — foi assim que esta clonagem entrou. **Confirme a substituição já na primeira vez**, senão a primeira tentativa morre em `voice_exists` (aconteceu nas duas passadas).
>
> **Três coisas que o roteiro do tiro pedia e o código NÃO faz — decididas, não reabrir:** (1) a rota clona com `name: avatar.name`, então não existe nomear a voz sem renomear um avatar — foi por isso que a voz nova nasceu chamada "TESTE REAL 15:40 01/08", igual à antiga; (2) a rota clona e grava o `voice_id` no MESMO request, então não cabe portão de aprovação entre clonar e prender; (3) os créditos do ElevenLabs **não são legíveis** (401 por falta de `user_read`), então o custo da voz só tem o lado de dentro — a régua é nossa, sem confirmação do fornecedor.
>
> **Gotchas:** (1) `docker compose logs` sem `--tail 500` devolve log rotacionado e congelado — nunca conclua ausência de evidência com ele; (2) código novo exige `restart backend`/`restart frontend`, e `vite.config.ts`/`package.json`/`Dockerfile` exigem `build`; (3) `restart` não recarrega `.env`; (4) **ligar/desligar o PC reinicia o backend**, e o polling em `setInterval` não é retomado no boot.
>
> **Dinheiro:** vídeo US$ 0,05 por segundo inteiro truncado; voz por caractere (2,5% do total); avatar novo US$ 1,00. Nunca reinicie **nem desligue a máquina** com geração em andamento — o vídeo trava em `queued` para sempre, sem estorno.
>
> **Aberto (dono: usuário):** chaves de plataforma pelo painel, rotação da chave Google e das senhas de demo, `user_read` no ElevenLabs, saldo HeyGen, backup de `uploads/_prova/`, autostart do Docker.
>
> **O NÃO VERIFICADO que bloqueia um tiro real da voz: se o ElevenLabs aceita a amostra que sai daqui.** O formato é **WAV PCM 16 bit mono a 24 kHz** — sem perda desde o HIGIENE-1, taxa fixada no FECHAMENTO-1. A conversão está provada sobre a captura real de 2:33 (webm/opus 48 kHz → wav pcm_s16le 24 kHz, 7.338.318 B, md5 `e579a890…`, 318 ms); o **aceite do fornecedor, não** — nenhuma clonagem real passou por nenhum dos três formatos já usados. Trocar de formato **não reduziu** esse risco, só o mudou de lugar. Fechá-lo consome um slot **irreversível**: este produto não exclui vozes, e liberar slot exige o painel do fornecedor.
>
> **Resolvido no FECHAMENTO-1 (era o efeito colateral do HIGIENE-1):** a 48 kHz o WAV ocupava ~5,5 MB/min, os 10 MiB cabiam ~109 s, e a captura de 2:33 do E2E-1 **deixara de passar** — enquanto `checkSampleDuration` aceitava 120 s "limpa", divergindo entre 109 e 120 s. A 24 kHz são ~2,8 MB/min, o teto é **218 s**, aquela captura passa de novo, e as duas réguas saem da mesma função — a faixa divergente não pode reabrir sem mudar a fórmula.
>
> Detalhe em `docs-internal/`. Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`.
