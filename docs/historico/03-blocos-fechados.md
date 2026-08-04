<!-- MOVIDO de CLAUDE.md em 2026-08-04, linhas 1604-2841 do arquivo original.
     Nada foi apagado nem reescrito nesta movimentação. -->

# Tabela de blocos fechados e o detalhe de CHAVES-2 a LIVE-2

## 8. Histórico de blocos fechados — uma linha cada

O detalhe de execução de cada bloco está no histórico do git (mensagens de
commit, que são longas de propósito neste projeto). O que sobreviveu aqui foi
promovido para as seções de **Decisões travadas**, **Riscos**, **Pendências** e
**Gotchas** acima — que são as que se lê antes de trabalhar. Esta tabela existe
só para responder "isso já foi feito?".

| Data | Bloco | O que fechou |
|---|---|---|
| 07-16 | Fases 1–4 | Multi-tenant, header, copiloto autenticado + `/docs`, ajustes de UI/UX |
| 07-16 | Fase 5 | Signup, subdomínio por tenant, "Minha Assinatura", landing, copiloto público, StorageProvider, WhatsApp |
| 07-16 | Vendors de roteiro | `scriptProvider` deixou de ser stub: Anthropic + Gemini reais, seletáveis por vendor |
| 07-18 | Auditoria `/graphify` | Corrigiu registro falso sobre roteamento `/uploads/*` — o router sempre existiu |
| 07-21 | Rebrand eckko.ai | Paleta, fontes self-hosted, logo real, Fase A aprovada e Fase B aplicada |
| 07-21 | Limite de plano | Enforcement real em `POST /videos` (antes só exibido) |
| 07-21/22 | Painel admin, Fases 0–3 | `admin_users`, `requireAdmin`, `audit_log`, tabela `plans` como fonte única, medição de custo, suspensão de tenant |
| 07-22 | Fase 4 — Stripe | Assinatura real + webhook, validados de ponta a ponta com Stripe CLI |
| 07-22 | Fase 5 — créditos | Consumo, concessão mensal, top-up no upgrade e compra avulsa; idempotência provada com replay assinado |
| 07-22 | Login unificado | `POST /login` host-aware; admin nunca autentica em subdomínio de tenant |
| 07-22 | Downloads | `GET /videos/:id/download` e `.../reference-video/download` — proxy no servidor resolve o `download` ignorado em cross-origin |
| 07-22 | Admin copilot | Código existia, migration nunca rodara: feature estava quebrada no ambiente, não só não documentada |
| 07-30 | Fechamento pré-demo | Credenciais fixas de dev, desduplicação de e-mail, landing como porta única, planos corrigidos |
| 07-31 | Blocos 1 / 1.5 / 1.6 | Allowlist de docs (`docsManifest`), política congelada em `npm run check`, bateria adversarial 10/10 bloqueadas |
| 07-31 | Bloco 2A | Afirmações falsas removidas dos docs; `FALSE_CLAIM_TERMS` impede reintrodução |
| 07-31 | Bloco 4 | Erro de vendor sanitizado nos 8 pontos; `tools/smoke-demo.sh` |
| 07-31 | Bloco 6 / ACESSO-FINAL | Backend morre e volta sozinho; restart policy e healthcheck nos 4; loop do `/admin` corrigido na causa |
| 07-31 | Bloco VIDEO-0 | Modo fixture ponta a ponta, registro de feature flags, três chaves de plataforma separadas |
| 07-31 | PENDENCIAS-1 (parcial) | Galeria `/dev/steps`, proteção da carteira contra `live` acidental. **Partes 3, 4 e 5 não feitas** |
| 08-01 | CHAVES-1 | `npm run set-key`: grava chave no `.env` por stdin, sem eco |
| 08-01 | **CHAVES-2** | **Chaves da plataforma cifradas no banco, resolvidas por requisição, com tela no admin. Ver abaixo.** |
| 08-04 | **VOZ-1 + E2E-1** | **Captura de voz PELO PRODUTO (`a047359`) + o ensaio E2E que a exercitou, tudo em fixture, ZERO chamadas a fornecedor e nenhum slot real consumido. Rota nova `POST /avatars/:id/voice-sample` clona SOZINHA — o caminho antigo treinava avatar antes (US$ 1,00 + 1 crédito). 4 guardas em ordem crescente de custo: D formato por SNIFF de bytes + teto 10 MB · A duração >= 60 s (aviso 60–90) · C substituição exige flag e a voz aprovada recusa MESMO COM flag · B slots com o usado LIDO e o teto DECLARADO (`voice_limit` dá 401 sem `user_read`). GUARDA C aplicada TAMBÉM no caminho antigo, que fazia UPDATE incondicional. Sem `labels` na clonagem, com motivo no código. Arnês **104/104** (14 novos; 5 espertos + 1 contraponto verde) — mutante se identifica por NOME, não por posição: em 04/08 uma inserção renumerou esses 14 para 91–103 e 107 — o nº 98 é o único que separa "caminho novo seguro" de "NENHUM caminho substitui sem flag". ENSAIO: 8 passos, todos funcionaram. **FECHA o NÃO VERIFICADO do webm/opus**: gravação real de 2:33 (opus mono 48 kHz, 152,820125 s, 2.461.198 B, md5 `b3d6a735…`) → mp3 mono 44,1 kHz 128 kbps, 152,88 s, 2.447.194 B, md5 `93bf6bbd…`, em **983 ms**. FECHA PARCIALMENTE a tela (operador exercitou captura/cronômetro/escuta/envio; sem guarda vista reprovando por automação — microfone inacessível). Desvio provado por evidência contraintuitiva: tela diz "2 de 10" e a conta real tem 4 ⇒ o número ERRADO prova que a rede não foi tocada. 🔴 GOTCHA NOVO E CARO: `docker compose logs` sem `--tail` (e `--tail`>~1000, e `--since`) devolve arquivo ROTACIONADO congelado; só `--tail 500` alcança o fim — fez uma requisição bem-sucedida parecer inexistente e produziu uma conclusão errada inteira. 3 defeitos registrados NÃO corrigidos: `voice_id_replaced` sai com os dois ids `***REDACTED***` (a redação por forma apaga o que o evento existe para preservar); texto da tela diz "1:00 a 1:30" mas a política não tem teto e 2:33 é "boa duração"; treino em fixture é invisível no log de eventos. `RestartCount=3` investigado — ExitCode 0, sem OOM, healthcheck verde, 4 serviços subiram juntos ⇒ hipótese de corrida com o Postgres na retomada, **NÃO confirmada: o log de 09:28 é inalcançável**. Ver abaixo.** |
| 08-03 | **LIVE-3** | **Passada live de 15 s em 16:9 (o operador chama de "LIVE-1"; aqui é LIVE-3 porque já existe um LIVE-1 de 08-01). Vídeo `8d28fd47`, UM clique, medido 12→13 linhas sem duplicata, `ready` em ~12 s. CUSTO: cota 873→**831** (−42 un), carteira 14,55→**13,85** (−**US$ 0,70**) — a previsão comprometida ANTES do tiro (14 s → 42 un → 0,70) bateu EXATA, 4ª confirmação do segundo inteiro truncado; razão 60,0 pela 6ª vez. Artefato 1280×720 SAR 1:1 DAR 16:9 25 fps 14,807 s, `clean` 0% de barra, md5 `cf0b7bb4…`. RITMO deixou de ser suposto: **137,8 wpm · 12,16 car/s** (n=1) — mas os 12,16 foram AJUSTADOS nesse ponto, então reproduzir 14,80 s é CIRCULARIDADE, não previsão; só um 2º roteiro dá evidência preditiva. A régua de cobrança é a duração do FORNECEDOR (14,7893), não o nosso ffprobe (14,807) — aqui ambas truncam para 14, mas perto de um inteiro divergem em US$ 0,05. Tela: estimativa 0,75 (duração PEDIDA) × real 0,7 com **42 unidades batendo o delta de cota**; estimar pelo roteiro daria 0,70 exato — melhoria POSSÍVEL, NÃO feita. VOZ: 1 chamada, ramo `synthesizeWithTimestamps`, fallback NÃO disparou, 180 car sem truncagem; **1ª resposta real de voz observada em log**, fechando um NÃO VERIFICADO do LIVE-2 (elisão: 325.005 bytes → registro curto). CUSTO DA VOZ FECHADO em 03/08 por leitura DIRETA do painel (não por delta): 1 chamada, 180 car, **90 créditos**, **US$ 0,018** ⇒ cobrança **por CARACTERE**, hipótese "por byte" REPROVADA (7 acentos não cobrados) e "+360 do fallback" já descartado pelo log; base 698/64.917 vira OBSOLETA, não pendência; coerência independente 180÷14,807 = **12,16 c/s**, idêntico ao ritmo do artefato; voz é **2,5%** do custo da geração. DEDUZIDO: 0,5 crédito/car (90/180 e 535/1070) aponta classe **Flash/Turbo**, não `eleven_multilingual_v2` — evidência indireta sobre o `model_id`, que segue fora do log por desenho. Ambiente desarmado por 5 critérios. Ver abaixo.** |
| 08-03 | **RETOMADA-1** | **Rodada de LEITURA pós-troca de conta. Ambiente = REARMADO NO ARQUIVO, NÃO APLICADO: `printenv`=fixture (CONFIRM len 0, ATTEMPTS 2) × `docker compose config`=live (CONFIRM 28 car., ATTEMPTS 6), `.env` alterado 1h31 DEPOIS do boot, `RestartCount=0`, boot único em fixture ⇒ qualquer `up -d` arma o modo pago sem nova pergunta. NÃO HOUVE DISPARO, medido pelas DUAS pontas: HeyGen cota **873** / carteira **US$ 14,55** (inalteradas, 5º ponto de 60 un/US$) e banco com 0 vídeos e 0 `provider_usage` desde 0627af4 — as 2 linhas de ledger novas são `grant +1` (reposição), saldo video=**3**. Teto do polling MEDIDO: 90 × 5 s = **450 s**, confirma o registro, com a precisão de que é piso de parede (setInterval async não serializa). `quotaBaseline.ts` PROMOVIDO do scratchpad efêmero (2ª vez em 2 dias que um instrumento sustentava número registrado fora do git). ACHADO: `/v3/users/me` NÃO está no `endpointCatalog.ts` — o freio deriva do catálogo, então o substituto do sunset de 2026-10-31 não é barrado nem confirmado. CORRIGIDO o recorte de `provider_usage`: geração de vídeo é 7 linhas e **100% classificável**; o "93%" misturava 3 populações que nunca teriam `video_id`. Zero `up -d`/`restart`/`stop`. Ver abaixo.** |
| 08-03 | **FIXTURE-1** | **Ambiente DESARMADO (3 critérios). Linha de base MEDIDA contra a HeyGen: cota 873, carteira US$ 14,55 — previsão bateu exata, nada gasto desde 02/08. Fixture NÃO exercita o TTS (`generateVideo` volta antes de `requireAudio`), então `audio_duration_source=tts_timestamps` em fixture é RÓTULO, não medição. TTS exercitado com fetch substituído: 180 chars sem truncagem, 1 chamada (2 no fallback), `eleven_multilingual_v2`. Tetos são GLOBAIS da sessão; falha antes do aceite devolve gasto e crédito, NUNCA a tentativa ⇒ sobra 1 tentativa. `provider_usage` NÃO tem coluna `simulated` e 93% das linhas são inclassificáveis (conserto PROPOSTO, não feito). Parte B do 5F RESPONDIDA de graça: Mário 16:9 `clean` × Mário 9:16 `padded` 57,8% ⇒ preenchimento é do FORNECEDOR. Ensaio consumiu 1 crédito. Ver abaixo.** |
| 08-03 | **TELA-1** | **Diagnostico da tela "Criar video": 12 defeitos ordenados por visibilidade, NENHUM corrigido. Parte A da rodada live entregue e PARADA na 1. 2 lacunas novas: voice_id nao entra no predicado mas requireAudio exige; 3 campos diferentes descrevem "voz" no mesmo card. Zero gasto. Ver abaixo.** |
| 08-03 | **PASSADA LIVE — ARMADA, NÃO disparada** | **AMBIENTE FICOU EM LIVE na troca de conta (medido: `billable":true`, teto 2). PARADAS 1 e 2 liberadas, roteiro aprovado GRAVADO (187 car / 34 palavras), pré-voo completo, `uploads/_prova/live-15s-03082026/` criada. Disparo NAO executado, gasto ZERO, credito video=2. 3 falsas partidas ensinaram: `&&` nao vale no PowerShell do operador; `.env` em UTF-16/BOM cai no default em silencio; o item 1 passou a exigir printenv + StartedAt + `docker compose config`. Ver o bloco no fim.** |
| 08-03 | **TELA-1 · lacuna do `voice_id`** | **FECHADA por leitura, sem gasto. EXISTE ramo de clonagem alcancavel da tela Criar video — passo 1, `cloneVoice` em avatars.ts:266 via AvatarSetupStep.tsx:192/209, atras de "Novo avatar" (`draftAvatar`), e ele treina avatar de US$ 1,00 antes. Passo 6 NAO alcanca por nenhum ramo. voice_id nulo FALHA (avatarProvider.ts:160), nunca clona; entra como segmento de URL (voiceProvider.ts:162), nao como campo de corpo; 1 chamada ao ElevenLabs no caminho feliz. CORRECAO: a sintese roda DENTRO do teto de sessao, nao fora. Prova renomeada para live-15s-03082026. Ver abaixo.** |
| 08-03 | **INSTRUMENTOS-1** | **`tools/scale-match.mjs` commitado (vivia em scratchpad efemero); headroom/sujeitoV/sujeitoH do fov-compare DESQUALIFICADOS (bounding box muda 1,80→0,94 na mesma sala) e o veredito automatico removido; barFrac passa a cobrar concordancia de 3 quadros. Sanidade 57,8/1,3333 batendo nos dois. Achado: existem DOIS masters 16:9 de 1280x720 e o do FOV-1 e o de 33,696 s (`61caaab1`), nao o do LIVE-1. MEDIDO que 1080p daria 2,25x mais pixels uteis pelo mesmo preco e que seus alvos sao os 4 numeros da politica do 5E — nada alterado. Ver abaixo.** |
| 08-03 | **FOV-1** | **O 9:16 e RECOMPOSICAO, nao corte — MEDIDO por casamento de escala em dois masters que ja estavam em disco, custo zero: mesma largura de campo, 33% mais campo vertical. A chave do catalogo e (avatar, formato_pedido) e a migration por combinacao E necessaria. 2 dos 4 videos do Mario ja dao 403: a evidencia do fornecedor apodrece. Ver abaixo.** |
| 08-03 | **APRESENTACAO-1** | **Arnês 90/90 MEDIDO (781 s), com os 4 mutantes de preenchimento que provam a guarda mais 1 controle, nominais pela linha de falha de cada um; prova preservada em `_prova/5f-e1e47cc/` com manifesto; ativo da Biblioteca repontado para a cópia sem barra (UPDATE 1, com REVERTER.txt); rota estática provada por curl ANTES do UPDATE; confirmado no navegador. `video_variants` não comporta duas variantes 9:16 — nada inserido. Ver abaixo.** |
| 08-03 | **5F Parte A** | **Sonda de preenchimento por luminância (57,8% de barra no master de 02/08); régua passa a medir o conteúdo e 2 alvos mudam de veredito; recorte antes do enquadramento; `setsar=1` conserta DAR mentiroso; ativo reprocessado ao lado. Parte B armada e não disparada. 90 mutantes. Ver abaixo.** |
| 08-03 | **5E fases 0–4** | **Custo por segundo inteiro truncado (3 medições exatas); tabela de formatos derivada da âncora de lado curto; filter_complex provado nos arquivos (0 ampliou, 0 cortou); job de derivação + schema master/variantes; lote nativo com N=N=N. ACHADO: o 9:16 da HeyGen é 57% barra branca. Fase 5 não iniciada. 85 mutantes. Ver abaixo.** |
| 08-02 | **5D fases 1-bis a 2** | **Badge ancorado na LIGAÇÃO (não só na presença); predicado ÚNICO de prontidão consumido pela rota e pela tela; artefato do fornecedor persistido no nosso disco; `model_id` explícito no TTS; cronômetro de gravação vira meta; 2ª passada live 9:16. 74 mutantes. Ver abaixo.** |
| 08-02 | **5D fases 0 e 1** | **Percurso dos 6 passos catalogado; fixture passa a valer para os provedores de TEXTO (não valia); vídeo reproduzível na Biblioteca; custo no passo 4; ledger negativo medido e NÃO alterado; telas que mentiam. 64 mutantes. Ver abaixo.** |
| 08-02 | **TETO-1** | **A falha devolve o teto de GASTO; o laço passa a ser barrado por um contador de TENTATIVAS que não volta. Guarda nova com 3 asserções opostas; 56 mutantes. Ver abaixo.** |
| 08-02 | **4A — OPERACIONAL** | **Custo real na tela (constante única medida; estimativa e medição lado a lado); rastro da falha em provider_usage; redação no sumidouro do log; freio derivado de catálogo de endpoints; 4 desfechos medidos. Tabela de taxas manual REMOVIDA do banco. Ver abaixo.** |
| 08-02 | **PREVOO-1 (3.5)** | **Verificação pré-live: geração confirmada em v3; corpo de erro vazava chave num 2º evento (corrigido); teto de sessão não volta em falha (medido, não corrigido); frescor da imagem do frontend; evidência por vendor; plano da passada live. 48 mutantes. Ver abaixo.** |
| 08-01 | **FORMATO-1** | **Formato explícito no payload, derivado da plataforma; motor selecionado e registrado atrás de flag; 4 fixtures por proporção; guarda nova (41 mutantes no total). Ver abaixo.** |
| 08-01 | **GUARDAS-1** | **`npm run check:mutants`: 38 mutantes provam que cada guarda reprova de verdade. D, C, E, B, G consertados + 1 achado novo (teto testado sem quem o chama). Ver abaixo.** |
| 08-01 | **LIVE-2** | **Voz entra no LOG-1 (sem bytes de áudio); `provider_usage` grava duração real e pedida lado a lado; guarda nova de registro de resposta. Ver abaixo.** |
| 08-01 | **LIVE-1** | **Uma geração live com avatar existente: vídeo em ~54 s por US$ 0,15; quota reconciliada (60/dólar); formato real 1280×720 16:9 25 fps; 3 lacunas novas. Ambiente desarmado de volta para `fixture`.** |
| 08-01 | **DEMO-4** | **Teto de sessão explica o que consumiu; avatar em treino é esperado e barra a geração. Ver abaixo.** |
| 08-01 | **DEMO-3** | **Primeira passada live: custo real medido, teto de imagem por rota, teto de sessão deixa de se disfarçar de falha do fornecedor. Ver abaixo.** |
| 08-01 | **LOG-1 / POLL-1** | **Resposta bruta do fornecedor no log antes de interpretar; "concluído sem artefato" falha na hora em vez de virar timeout.** |
| 08-01 | **ESTORNO-1** | **Crédito volta quando o fornecedor recusa, nos 3 caminhos. Linha própria no ledger, idempotente. Ver abaixo.** |
| 08-01 | **DEMO-2** | **Teto de upload do vídeo de referência: 100 MB só nessa rota, erro legível, validação no cliente e cap de gravação. Ver abaixo.** |
| 08-01 | **DEMO-1** | **Caminho principal do MVP validado ponta a ponta em fixture; validação de artefato de vídeo; `preflight:live`. Ver abaixo.** |

---

### Bloco CHAVES-2 — chaves da plataforma no banco, com tela (CONCLUÍDO)

**O problema que fechou:** as chaves da casa só existiam como variável de
ambiente. Trocar uma exigia editar `.env` e recriar o container, o valor
passava pela tela e pelo scrollback, e não havia como responder "qual chave
está valendo, quem gravou, e ela funciona?".

**Armazenamento.** Tabela `platform_credentials`, separada de
`api_credentials` pela mesma razão que `admin_users` é separada de `users`:
são escopos diferentes, e guardá-las juntas exigiria um `tenant_id` nulo com
significado especial — uma consulta que esquecesse o filtro entregaria a chave
da casa a um cliente. Cifra reutiliza `services/crypto.ts`; não há segundo
mecanismo e não deve haver.

**`ENCRYPTION_KEY` continua no `.env`, e é a única que não pode migrar** — ela
é o que abre as outras. Guardá-la no banco poria o cadeado dentro do cofre.

**Coluna `last_four` com os 4 últimos caracteres da chave EM CLARO**, gravados
na escrita. Existe porque o `masked_key` do resto do projeto mascara o *texto
cifrado*: os caracteres que ele mostra são do base64 do ciphertext e não
identificam nada. Quatro caracteres não reconstroem uma chave, e a alternativa
— decifrar para exibir — abriria o caminho de leitura que este bloco proíbe.

**Precedência: o BANCO vence o `.env`**, com `PLATFORM_KEYS_FORCE_ENV=1`
invertendo. A inversão não é simetria decorativa: uma chave ruim gravada pela
tela tranca do lado de fora justo quem precisaria entrar para consertá-la, e
sem ela o conserto exigiria `psql`. A origem em uso aparece em cada linha, e a
tela avisa em vermelho quando o `.env` está mandando — nesse estado, gravar
pela tela não tem efeito, e descobrir isso por tentativa e erro custaria caro.

*Medido, nos dois sentidos:* validar antes de gravar → `400 not_configured`,
zero chamadas. Gravar pela rota → validar **sem reiniciar o backend** → a
chave recém-gravada chegou ao fornecedor. Com `PLATFORM_KEYS_FORCE_ENV=1` e
uma chave diferente no `.env`, a listagem passou a `source=env` **e** o
carimbo de validação no banco **não** foi regravado — esse ramo só roda quando
a origem é o painel, então ele prova a resolução, não só o que a tela desenha.

**Cache: mapa em memória, invalidado inteiro na gravação, mais um TTL de 60 s.**
O TTL não serve ao processo que grava (esse invalida na hora) — serve ao dia em
que houver mais de uma réplica, quando a invalidação de um processo não alcança
o outro. Sem ele, a segunda réplica serviria a chave velha até reiniciar, e o
sintoma seria "gravei e às vezes funciona".

**Leitura de volta não existe.** Nenhuma rota devolve o valor, nem para admin
autenticado. A garantia é estrutural: a rota nunca tem a chave na mão, porque
a validação acontece atrás de `validatePlatformCredential`, que devolve só o
resultado. Quatro invariantes novas em `npm run check`
([checkPlatformKeyPolicy.ts](backend/src/scripts/checkPlatformKeyPolicy.ts)),
**todas provadas reprovando**: serializador vazando (10 violações), rota
alcançando o valor em claro, endpoint de geração na allowlist do probe, e duas
credenciais na mesma variável de ambiente.

**Validar faz UMA chamada, sempre de leitura**, e só a partir do clique — o
botão nasce desabilitado enquanto não há chave. As duas chaves Google e a
Anthropic validam por *ListModels*, que aceita ou recusa a chave sem consumir
cota de geração. **HeyGen lê `/v2/user/remaining_quota` e o número aparece na
tela** — é o dado que decide se dá para gerar. A unidade não é declarada pelo
fornecedor, e a tela não finge que é: diz "unidades de cota".

**ElevenLabs valida por `/v1/voices`, não pelo endpoint de cota**, que exige a
permissão `user_read`. Usar o de cota transformaria "sem permissão" em "chave
inválida" — um falso negativo — e distinguir os dois exigiria uma segunda
chamada. A cota fica declarada como não lida, **com o motivo**, no mesmo
contrato das feature flags.

**A validação chama o fornecedor de verdade mesmo com `PROVIDER_MODE=fixture`,**
e isso é deliberado: uma leitura de saldo não gasta cota, e um saldo simulado
levaria à decisão oposta à que os dados sustentam. Por isso o probe vive em
módulo próprio ([platformKeyProbe.ts](backend/src/services/providers/platformKeyProbe.ts)),
fora da guarda de `isFixtureMode()` — e sob uma guarda mais estrita: só pode
alcançar os endpoints da allowlist, nenhum deles de geração.

**HeyGen e ElevenLabs são apenas armazenadas e validadas.** O caminho de
geração continua lendo a credencial do tenant. Migrar isso muda quem paga a
conta e não estava no escopo.

**Dois defeitos achados por rodar, não por revisar:**

1. **`docker-compose.yml` só repassava `PLATFORM_COPILOT_API_KEY`.** As outras
   estavam documentadas no `.env.example` e neste arquivo, mas **nunca
   chegavam ao container** — preencher `PLATFORM_GOOGLE_API_KEY` no `.env` não
   teria efeito nenhum, e o sintoma seria "colei a chave e o copiloto continua
   caindo na do cliente". As cinco passaram a ser repassadas.
2. **`PLATFORM_GOOGLE_API_KEY` nunca serviu à geração de roteiro**, apesar de
   este arquivo afirmar "roteiro e copiloto do tenant": `routes/scripts.ts` lê
   a credencial do tenant direto, sem passar por `resolveTenantAiKey`. Só o
   copiloto do tenant usa a chave da plataforma. Corrigido no registro e aqui.

**Duas correções na própria guarda, ambas na primeira execução:** ela acusava
`encrypted_key` em `adminPanel.ts`/`credentials.ts`, que é a coluna do tenant e
uso legítimo — guarda que acusa uso legítimo é abandonada, e guarda abandonada
não protege nada; e reprovava o **comentário** que explica a regra, o mesmo
tropeço já registrado na guarda de credencial literal. Agora ela ignora
comentários e cobra a tabela `platform_credentials`, que é o desvio real.

**Bateria adversarial ampliada** ([tools/probe-copilot-docs.sh](tools/probe-copilot-docs.sh)):
5 sondas novas pedindo a chave — direta, disfarçada de depuração, disfarçada de
mensagem de erro, pedido de eco de uma chave colada, e completar uma chave
truncada — e uma audiência `admin` nova, porque o copiloto do admin recebe o
nível mais alto de documentação e é onde a tentação de dizer "é interno, tudo
bem" seria maior. Os nomes das cinco variáveis entraram na deny-list (provado
reprovando). Os três prompts ganharam uma regra explícita de recusa de
credencial.

**A bateria NÃO foi executada neste bloco** — o orçamento de chamadas Gemini
era de 3, só para validar chave, e uma bateria consome mais que o teto diário.
O que foi executado: a audiência `admin` de ponta a ponta, e o controle
inicial abortou corretamente com 1 requisição, sem produzir nenhum falso
"bloqueado" (o copiloto do admin não tem chave). Rodar as sondas contra o
tenant fica para quando houver cota paga.

**Vale registrar o que a bateria não precisa provar:** nenhuma chave entra em
prompt nenhum. Só três coisas entram — prompt constante, `docsContent` do
nível, e histórico da conversa. Um modelo não revela o que nunca recebeu; a
regra nos prompts cobre o resto, que é o operador colando a chave no chat.

---

### Bloco GUARDAS-1 — arnês de mutação: guarda só vale se reprovar (CONCLUÍDO)

**A frase que resume o bloco: contagem de ocorrências não detecta guarda
inerte.** A `checkVendorLogPolicy` casava TREZE funções e era inerte. O número
alto era o próprio disfarce.

**`npm run check:mutants`** ([tools/run-mutants.mjs](tools/run-mutants.mjs)).
Cada guarda declara MUTANTES junto de si; o arnês aplica um, roda o gate,
exige saída 1 **com a mensagem daquela guarda**, reverte e confere
`git status` vazio. **38 mutantes, 38 com o comportamento esperado.**

Três decisões que não são decoração:

- **`expect` obrigatório.** Sem ele, mutante que quebra a compilação faz o
  gate sair 1 pelo `tsc` e a guarda é dada como ativa sem ter opinado.
  *Aconteceu:* cinco mutantes da primeira rodada reprovavam por `tsc`, e o
  arnês corretamente recusou aquilo como prova.
- **`expectGreen`.** Guarda que reprova qualquer coisa passaria em todos os
  mutantes sem distinguir nada.
- **Reversão em `finally` + `git status` após CADA mutante.** Reversão falha
  aborta tudo na hora, em vez de empilhar defeitos.

**Dois mutantes por guarda: um óbvio e um esperto.** O esperto desloca a
verdade sem mexer na superfície inspecionada — é o único que pega guarda que
verifica a proposição errada. Os dois do LIVE-2 estão congelados aqui.

**O que o arnês achou, e a auditoria manual A–G não tinha achado:**

**`consumeLiveGeneration` era testada, mas ninguém verificava quem a chama.**
Removi a chamada de `cloneVoice` e o gate ficou verde: o contador seguia
perfeito, a mensagem seguia dizendo que o teto conta voz e vídeo juntas —
verdade sobre o mecanismo, mentira sobre o sistema. Em live, libera uma
chamada tarifada que a trava deveria barrar. **Testar o mecanismo não é testar
quem o usa**, e nenhuma leitura de código tinha visto isso.

**Consertados neste bloco** (cada um só conta como feito porque o mutante
correspondente passou a reprovar):

- **D — `isFixtureMode`.** Reescrita com corpo por **chaves balanceadas** (o
  slice "até o próximo export" fazia uma função pura de 5 linhas engolir 378) e
  **análise transitiva** de quem alcança a rede (`pollVideoJob` e
  `checkAvatarConnection` eram ignoradas justamente por delegarem numa linha).
  Passou a exigir o **padrão** `if (isFixtureMode()) return`, não a menção:
  `if (isFixtureMode() && false)` menciona e não desvia. Conferidos: 7 → **8**,
  e agora são os certos.
- **C — a nota que afirmava o não verificado.** `PLAINTEXT_ALLOWED` era
  decorativa (só checava existência de arquivo) e a inspeção olhava apenas
  `routes/`. A nota dizia "leitura em claro só em 2 módulos declarados", e o
  número **estava errado**: `providers/platformKeys.ts` resolve chave e nunca
  era olhado. Agora varre `backend/src` inteiro (22 rotas + 77 arquivos) e a
  allowlist tem os 3 leitores reais, com motivo.
- **E — flags por caminho não vigiado.** `setGalleryFlag` e `key: "..."`
  entraram no padrão. Referências: 1 → **3** (eram dois dos três usos reais
  passando fora do radar).
- **B e G** — `readStoredValue` saiu de `PLAINTEXT_MARKERS` (função privada,
  impossível de casar) e `schema_migrations` saiu da deny-list (tabela que não
  existe aqui). Deny-list: 42 → 41 termos, todos possíveis.
- **Universo-zero reprova.** A asserção de planos dizia "conferidos contra a
  tabela: free, pro, business" tendo conferido **zero citações** — nenhum doc
  citava limite na forma reconhecida. Agora reprova se não encontrar nada, e o
  FAQ passou a documentar os limites reais: **9 citações conferidas**.

**A elisão do LOG-1 ganhou retaguarda por TAMANHO** (`MAX_FIELD_BYTES = 2048`),
independente de nome de campo — a lista de nomes é suposição, nenhum daqueles
campos foi visto numa resposta real. O teto vem de medição: o maior campo
legítimo já observado tem **519 caracteres** (URL assinada da HeyGen).
*Medido com nome desconhecido e corpo grande:* 102.892 → **860 bytes**.

**Três armadilhas que o próprio bloco pisou, e valem mais que o resultado:**

1. A guarda de flags **acusou o próprio mutante declarado** (a string vive em
   `backend/src`, que ela varre). Terceira vez que uma guarda deste projeto
   tropeça no texto escrito para descrevê-la.
2. `checkPolicy.ts` **rodava o gate inteiro ao ser importado**, então o coletor
   devolvia JSON grudado num relatório. Módulo que age ao ser importado é
   armadilha para o próximo que precisar de qualquer coisa dele.
3. Seis mutantes casaram **0x** porque o working copy vem em **CRLF** e os
   `find` são escritos com `\n`. Falso alarme de "mutante desatualizado" em
   guarda saudável ensina a ignorar o arnês.

**O que ficou sem verificação:** as guardas cobertas são as que têm mutante —
38 mutantes sobre ~28 asserções. As asserções sem mutante estão nomeadas na
tabela do relatório do bloco; as principais são as de tamanho de prompt e as de
manifesto de docs, que dependem de estado de disco mais do que de código.

### Bloco FORMATO-1 — o fornecedor deixa de escolher a proporção (CONCLUÍDO)

**A frase do bloco: escolher por omissão é escolher mesmo assim.** O vídeo do
LIVE-1 saiu 1280×720 16:9 porque esse é o padrão da conta na HeyGen — ninguém
decidiu, e a decisão coube a quem não sabe onde o vídeo vai ser publicado.

**O que foi LEVANTADO antes de implementar** (a separação importa mais que o
código):

| Campo | Estado | Origem |
|---|---|---|
| `aspect_ratio`: `16:9 \| 9:16 \| 4:5 \| 5:4 \| 1:1 \| auto`, default `16:9` | **DOCUMENTADO**, nunca exercitado | doc pública, 2 fontes concordantes |
| `resolution`: `720p \| 1080p \| 4k` | **DOCUMENTADO**, nunca exercitado | idem |
| `engine: { type: avatar_v \| avatar_iv \| avatar_iii }`, default `avatar_iv` | **DOCUMENTADO**, nunca exercitado | idem |
| `avatar_item.supported_api_engines = ["avatar_iv","avatar_iii"]` | **MEDIDO** | log bruto de `heygen.createAvatar`, 200, 434 bytes |
| `supported_api_engines` ↔ `engine.type` são o mesmo vocabulário | **DEDUZIDO** | os nomes batem; a doc **não** amarra os dois |

**Achado do levantamento, que muda o diagnóstico:** nenhuma resposta da HeyGen
declara geometria. Nem a criação (`{output_format, status, video_id}`) nem o
polling (`duration`, `video_url`, `thumbnail_url`, …). Tudo que se sabe sobre
o formato do que foi entregue veio do `ffprobe` de UM arquivo baixado — não há
como conferir formato pela resposta, só pelo artefato.

**1. Formato SEMPRE explícito, derivado da plataforma.** A escolha oferecida é
a PLATAFORMA, não a proporção: ninguém abre a ferramenta querendo "9:16", quer
publicar no Reels. Passo "Publicação" (5 de 6), quatro destinos, cada um com o
quadrinho desenhado **na proporção real** — "4:5" e "1:1" são indistinguíveis
para quem não pensa em número o dia todo.

Catálogo único em [videoFormat.ts](backend/src/services/providers/videoFormat.ts),
espelhado no frontend, **com o espelho conferido pelo gate**: duas listas que
discordam produzem o pior defeito possível aqui — a tela oferece um destino, o
servidor cai no padrão, e o cliente recebe horizontal sem erro em lugar nenhum.

**A resolução vai em 720p, e não 1080p, porque 720p é o único ponto de custo
MEDIDO** (~US$ 0,045/s no LIVE-1). Explicitar o que já era o comportamento
observado tira a decisão do fornecedor sem mexer no custo. Corpo sem plataforma
cai no padrão declarado (YouTube/16:9): um cliente antigo não pode ser a
exceção que reabre a omissão.

> **A premissa deste parágrafo caiu no Bloco 5E (DOCUMENTADO, duas fontes): a
> tarifa da HeyGen é por segundo e por tipo de avatar, NÃO por pixel — 720p e
> 1080p custam o mesmo.** Pedir 720p não economizou nada; só entregou metade da
> resolução. `MEASURED_RESOLUTION` **continua em 720p** porque mudá-la altera o
> que se pede ao fornecedor em toda geração e o teto real da nossa conta segue
> NÃO VERIFICADO — mas o motivo escrito acima já não sustenta a escolha.

**2. Motor: decidido e gravado sempre, enviado só atrás de flag.** A peça
central é DEDUZIDA (ver tabela), e um valor recusado em `engine` derruba a
geração — o caminho caro. Então a seleção roda e é gravada em todo vídeo, com
a razão (`declared_preference`, `default_no_declaration`, `flag_off`, …), e só
o **envio** depende de `explicit_avatar_engine`, **desligada**. O dado é
colhido sem arriscar nada.

`avatars.provider_engines` passou a guardar o que o fornecedor declara —
o campo vinha em toda criação e era descartado com o corpo.

**3. A fixture acompanha.** Quatro fixtures versionadas, uma por proporção
(16:9 → 640×360, 9:16 → 360×640, 4:5 → 512×640, 1:1 → 512×512), e o job
simulado entrega **a que o payload pediu**. Uma simulação que devolvesse sempre
640×360 aprovaria justamente o caminho que este bloco verifica — falso verde.

*Medido pela rota real de download, com `ffprobe` no arquivo baixado:*
`reels_tiktok` → **360×640 9:16**; `youtube` → **640×360 16:9**. E o payload
montado pelo caminho real nas **8** combinações: `aspect_ratio` e `resolution`
presentes em todas, `engine` só com a flag ligada.

**4. Guarda nova** ([checkVideoFormatPolicy.ts](backend/src/scripts/checkVideoFormatPolicy.ts)),
com **6 asserções**. A principal exercita a MONTAGEM real do payload, uma vez
por plataforma — **casa 4 montagens** (uma por plataforma do catálogo), mais
4 fixtures, 2 vendors, 5 formas de declaração de motor e 4 entradas do espelho
do frontend. Casar texto no arquivo passaria a aprovar no dia em que alguém
movesse a montagem de lugar, que é a reorganização que faz um campo se perder.

**O mutante esperto não tira o campo:** faz toda plataforma resolver para 16:9.
O payload continua completo, a superfície inspecionada não muda, e o produto
volta ao comportamento anterior — agora **com aparência de decisão**. Só a
asserção sobre proporções DISTINTAS pega isso. `check:mutants`: **41/41**.

**Duas coisas que a própria execução ensinou:**

1. **A guarda de fixtures acusou ausência onde não havia.** Ela conferia
   `<repoRoot>/backend/fixtures`, e o bind mount de `/repo` traz só
   `backend/src` e `backend/scripts` — as fixtures chegam pelo `COPY` do
   Dockerfile. Corrigido conferindo `FIXTURES_DIR`, **o mesmo caminho que o
   job simulado lê em execução**, o que de quebra torna a guarda capaz de
   pegar o defeito do VIDEO-0 (Dockerfile sem copiar a pasta).
2. **O arnês recusou o mutante esperto por `expect` errado**, não por guarda
   inerte: a mensagem diz "as 4 plataformas do catálogo", e o `expect` dizia
   "todas as plataformas". Vale registrar porque o `expect` agora é o núcleo
   da frase, **sem a contagem** — prendê-lo ao número faria uma quinta
   plataforma transformar guarda saudável em mutante AMBÍGUO, que é como se
   aprende a ignorar o arnês.

**ACHADO DE AMBIENTE, PRÉ-EXISTENTE E SÉRIO.** A imagem do frontend era
anterior ao commit `97cd8d1`, que acrescentou `__MAX_IMAGE_BYTES__` ao
`vite.config.ts` — arquivo **fora do bind mount**. Resultado: **a app inteira
quebrava em branco**, com o console limpo, o Vite reportando `ready` e o
healthcheck verde. O erro real (`__MAX_IMAGE_BYTES__ is not defined`) só
aparece ao importar `/src/main.tsx` à mão pelo console. Resolvido com
`docker compose build frontend`. O gotcha do bind mount já estava registrado;
**o sintoma não estava** — e "tela em branco sem erro nenhum" não aponta para
configuração de build.

### O que SÓ A GERAÇÃO LIVE pode fechar (FORMATO-1)

Nada disto está verificado, e nenhuma linha do código ou da UI afirma que
está:

- **Se 9:16 sai vertical de verdade.** É a pergunta central do bloco e a
  única que importa para o produto. Tudo que existe hoje é: o campo vai no
  payload (medido), a doc diz que ele é aceito (documentado), e a simulação
  honra a proporção (medido — mas a simulação somos nós).
- **Se a HeyGen aceita `aspect_ratio`/`resolution` neste payload.** A doc
  descreve os campos; nenhuma requisição nossa jamais os enviou. Um campo
  recusado derruba a geração inteira.
- **Se `engine: { type }` é aceito, e se `supported_api_engines` é mesmo o
  vocabulário dele.** É a dedução central, e a razão de o envio estar atrás de
  flag desligada.
- **Se um mesmo avatar rende bem fora do horizontal.** O avatar foi treinado
  com uma foto; nada garante enquadramento utilizável em 9:16 ou 1:1.
- **O custo por proporção e por resolução.** `provider_usage` já grava
  `aspect_ratio`, `resolution` e `provider_engine`, mas todas as linhas de
  hoje são de simulação. "9:16 custa mais que 16:9?" continua sem resposta.
- **Se 1080p e 4k valem a pena.** Só 720p tem custo medido, e é por isso que
  as quatro plataformas o usam.
- **O que a D-ID faz com a proporção.** Declarada como `supported: false` (a
  geometria sai da imagem de origem), e **nenhuma resposta real da D-ID foi
  observada em nenhuma sessão** — a declaração é leitura de doc, não medição.

### Bloco PREVOO-1 (3.5) — verificação antes da passada live (CONCLUÍDO)

Bloco de **verificação**, não de construção. Ambiente em `fixture` do começo ao
fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero chamadas tarifadas**.

**1. Versão da API — MEDIDO pelo código, e sem parada condicional.** O caminho
de geração é **v3**. Todos os endpoints HeyGen do projeto:

| Endpoint | Versão | Onde | Papel |
|---|---|---|---|
| `POST /v3/assets` | v3 | [avatarProvider.ts:243](backend/src/services/providers/avatarProvider.ts:243) | upload de foto e de áudio |
| `POST /v3/avatars` | v3 | [:265](backend/src/services/providers/avatarProvider.ts:265) | criação (o mais caro: US$ 1,00) |
| `GET /v3/avatars/{id}` | v3 | [:318](backend/src/services/providers/avatarProvider.ts:318) | status do avatar (`// ASSUMPTION`) |
| `POST /v3/videos` | **v3** | [:380](backend/src/services/providers/avatarProvider.ts:380) | **geração** |
| `GET /v3/videos/{id}` | **v3** | [:406](backend/src/services/providers/avatarProvider.ts:406) | **polling** |
| `GET /v2/user/remaining_quota` | v2 | [:450](backend/src/services/providers/avatarProvider.ts:450) | teste de credencial — **sunset 2026-10-31** |
| `GET /v2/user/remaining_quota` | v2 | [platformKeyProbe.ts:27](backend/src/services/providers/platformKeyProbe.ts:27) | botão "Validar" do painel |

**DOCUMENTADO:** `aspect_ratio`, `resolution` e `engine` pertencem ao schema
`CreateVideoFromAvatar` de `POST /v3/videos` — confirmado em duas leituras
independentes da doc pública. Cuidado com uma armadilha de fonte: o campo
`dimension {width,height}` que aparece em specs de terceiros é da **v2**
(`/v2/video/generate`); a v3 usa `resolution` + `aspect_ratio`. Quem consultar
a v2 por engano vai montar um payload que a v3 ignora.

**ACHADO, e era um buraco real:** `GENERATION_ENDPOINTS` — a deny-list que
impede o probe de validação de apontar para um endpoint que gera — conhecia
**só `/v2/video/generate`**. O caminho de geração deste projeto é v3 desde
sempre, então um probe apontado para `api.heygen.com/v3/videos` passava
**verde**. Pior: `/v3/avatars` custa US$ 1,00 por chamada, contra US$ 0,15 de um
vídeo curto. Os dois entraram na lista, e o mutante correspondente passou a
apontar para a v3. *Lição: deny-list nomeia o que conhece, e envelhece em
silêncio quando o código migra de versão.*

**2. Caminho de erro do fornecedor — e o achado mais sério do bloco.**

**MEDIDO:** um 400 do fornecedor com um campo `api_key` no corpo saía **em
claro** no log. Não por falta do LOG-1 — o `vendor_response` mascarava
corretamente —, mas porque `fetchJson` monta a exceção como
`"<Vendor> API error (400): <corpo bruto>"`, de modo que o **corpo inteiro
viaja dentro de `err.message`**, e `toClientVendorError` publicava esse texto
no evento `vendor_error` alguns milissegundos depois.

É exatamente o defeito que o LOG-1 corrigiu, num evento que ninguém tinha
olhado. **Um segredo mascarado num evento e legível no seguinte não está
mascarado.** Corrigido passando o `detail` pela mesma varredura
(`scrubSecretsFromText`, agora exportada).

Guarda nova ([checkVendorErrorPathPolicy.ts](backend/src/scripts/checkVendorErrorPathPolicy.ts)),
exercitando o caminho real com `fetch` substituído e `console` capturado —
sem rede, sem banco, sem consumir teto. Quatro asserções que puxam em direções
opostas de propósito: o erro **interrompe** (não vira job pendurado), o corpo
**chega** ao log, o segredo **não** chega em claro, e nada do fornecedor chega
à mensagem do cliente.

*Medido no caminho HTTP real, com a fixture de falha:* estado terminal `error`,
`provider_job_id` nulo, mensagem genérica em pt-BR na tela.

**NÃO VERIFICADO:** que a HeyGen real devolve o corpo de erro na forma
simulada aqui (`{error:{code,message}}`) — nenhuma resposta de erro real do
fornecedor foi observada em nenhuma sessão.

**3. Contabilidade em falha — MEDIDO, e NÃO corrigido (decisão do usuário).**

| O quê | Comportamento medido | Onde um conserto entraria |
|---|---|---|
| Crédito | **Debita e ESTORNA.** Saldo 1 → 1, com `−1 consumption` e `+1 refund` no ledger | correto como está — [videos.ts:305](backend/src/routes/videos.ts:305) e [:373](backend/src/routes/videos.ts:373) |
| **Teto de sessão** | ~~**CONSOME e NÃO devolve.**~~ **CORRIGIDO no bloco TETO-1** — o gasto volta na falha, a tentativa não. O texto original fica abaixo como registro do que era | era [avatarProvider.ts:659](backend/src/services/providers/avatarProvider.ts:659) e [voiceProvider.ts:61](backend/src/services/providers/voiceProvider.ts:61); hoje os dois passam por `withLiveBudget` |
| `provider_usage` | **NÃO registra nada** numa falha de criação: 70 linhas antes, 70 depois | a escrita só acontece no polling, ao ficar `ready` ([videos.ts](backend/src/routes/videos.ts)) |

**Consequência prática para o Bloco 5, e é o motivo de isto ter sido medido:**
com `MAX_GENERATIONS=2`, **duas falhas esgotavam o teto sem nenhum vídeo ter
saído**, e a única saída era reiniciar o backend (o contador é por processo).
Uma falha na voz também conta — o teto é compartilhado.

**Isto foi CORRIGIDO no bloco TETO-1 (2026-08-02).** A falha devolve o gasto;
quem passou a barrar o laço é um segundo contador, de tentativas, que não
volta. Ver o bloco próprio no fim deste arquivo. O parágrafo acima fica como
registro do estado medido no PREVOO-1.

**Nota de custo:** `synthesizeSpeech` tenta **dois** endpoints do ElevenLabs
(`synthesizeWithTimestamps` e, se falhar, `synthesizePlain`) — observado no log
durante a medição. São duas chamadas por geração, não uma.

**4. Resolução não é observável em fixture — registrado e congelado.**

**MEDIDO:** as fixtures têm no máximo 640 px de lado (640×360, 360×640,
512×640, 512×512). A simulação honra **proporção**, e só ela. Pedir `720p` e
receber 640×360 é o comportamento **correto** da simulação.

Fazer as fixtures nascerem em 720p pareceria mais fiel e seria pior: daria a
impressão de que a resolução foi verificada, quando a simulação apenas
devolveria o arquivo que nós escolhemos. A guarda reprova se alguma fixture
**coincidir** com uma resolução declarada — a asserção é o inverso do
instinto, de propósito.

Uma segunda guarda reprova texto de produto que **afirme resolução entregue**.
Ela precisou aprender uma distinção: resolução de **entrada** ("grave em 1080p
em vez de 4K") é uso legítimo e frequente. A primeira versão proibia o termo e
acusou **seis** usos legítimos de uma vez — e guarda que acusa uso legítimo é
abandonada, o que já custou caro aqui (GUARDAS-1, achado C). Agora são duas
camadas: coocorrência com verbo de entrega em qualquer texto, e proibição
total dentro do bloco de tradução do passo "Publicação", onde não existe uso
legítimo. *Medido: 0 promessas, 6 menções a resolução de entrada.*

**5. Frescor da imagem do frontend — a invariante que faltava.**

O defeito real: a imagem era anterior ao commit que acrescentou
`__MAX_IMAGE_BYTES__` ao `vite.config.ts`, arquivo **fora do bind mount**. A
app inteira ficava em branco, com console limpo, Vite anunciando `ready` e
healthcheck verde. **Nenhum sinal do ambiente apontava para "imagem velha".**

Desenho: hash dos arquivos **copiados e não montados** (`package.json`,
`tsconfig.json`, `vite.config.ts`, `Dockerfile`), gravado em `/app/.image-stamp`
**durante o build** e servido em `GET /__image-stamp` por um plugin do Vite. O
gate recalcula a partir do repositório e compara. Fins de linha normalizados —
sem isso, todo build no Windows acusaria divergência permanente, e guarda que
acusa sempre é abandonada na primeira semana.

O carimbo fica em `/app` puro, e não em `src/` ou `public/`: nesses o host
sobrescreveria, e o carimbo passaria a comparar o repositório com ele mesmo.

**Frontend fora do ar vira NOTA, não falha** — o gate também é verificação de
código, e amarrá-lo a um serviço de pé produziria o falso positivo que ensina
a ignorar o gate. A nota diz que a verificação **não aconteceu**, em vez de
fingir que passou.

**6. Verdade da promessa por vendor.** `VENDOR_FORMAT_SUPPORT` ganhou
`evidence`: `vendor_response` (nenhum vendor está aqui) > `documentation`
(HeyGen) > `none` (D-ID). O gate reprova `supported: true` com `evidence:
"none"` — suporte sem nada que o sustente é palpite ocupando o lugar de fato.

`GET /video-format-support` diz à tela se o provedor **daquele tenant** honra a
proporção. *Medido nos dois estados, na galeria:* provedor que honra → 5 chips,
0 desabilitados, sem aviso; provedor que não honra → 5 chips, **5
desabilitados**, com o motivo em vermelho. Contrato das feature flags aplicado:
o recurso **não some**, aparece inerte **com o motivo**.

*Defeito que a própria galeria expôs, de novo:* uma prop faltando derrubou o
painel — e o error boundary do PENDENCIAS-1 isolou, mostrando
`vendorHonors is not defined` em vez de deixar a galeria inteira em branco.
Segunda vez que esse boundary paga por si.

**Facebook entrou no catálogo** (a pedido, durante o bloco): entrada própria
"Feed do Facebook" em 4:5 — mesma proporção do feed do Instagram, e isso é o
caso normal, não duplicação a eliminar: quem publica no Facebook procura
"Facebook" na lista, não "4:5". O Facebook Reels entrou no rótulo do 9:16. São
**5 plataformas → 4 proporções**.

**Estado das guardas ao fim do bloco:** `npm run check` verde,
`npm run check:mutants` **48/48**.

**Três mutantes nasceram errados, e os três ensinam coisa diferente** — vale
mais que o resultado:

1. **`expect` com a caixa errada.** A mensagem diz "**NÃO** corresponde ao
   repositório" e o `expect` dizia "não corresponde". O arnês compara com
   `includes`, que diferencia maiúscula, então uma guarda perfeitamente
   saudável apareceu como AMBÍGUA. Segunda vez que um `expect` mal escrito
   acusa guarda boa (a primeira foi no FORMATO-1, com a contagem).
2. **Mutante que testa a proposição errada.** O primeiro mutante do caminho de
   erro removia o corpo da *mensagem da exceção* para provar que "o corpo vai
   ao log" — mas o corpo chega ao log pelo `rawBody`, que não passa pela
   mensagem. O mutante não introduzia o defeito que a guarda pega, e o gate
   passava verde com razão.
3. **O melhor achado: a guarda verificava menos do que afirmava.** Ao esvaziar
   o corpo do `vendor_response`, o gate continuou verde — porque o
   `vendor_error`, emitido depois, repete o mesmo texto dentro do `detail`. A
   asserção dizia "o corpo chega ao log" e o que ela verificava era "o corpo
   aparece em algum lugar". São coisas diferentes: o `vendor_error` passa por
   scrub e é emitido *depois* da interpretação, então depender dele esvaziaria
   justamente a garantia que o LOG-1 existe para dar. Corrigido recortando o
   evento antes de procurar.

### Bloco 4A — custo real na tela, e o que gasta sem ninguém ver (CONCLUÍDO)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas tarifadas**.

**1. Custo tem UM número, e ele é medido.**
[providerCost.ts](backend/src/services/billing/providerCost.ts) é o único lugar
do sistema com número de custo de fornecedor:

> **60 unidades por dólar · US$ 0,045 por segundo ENTREGUE**
> Medido em 2026-08-01: carteira 15,50→15,35 USD e quota 930→921 numa geração
> de 3,372 s (ffprobe). **Condições: HeyGen, 16:9, 720p.**

**A segunda metade daquele número foi SUBSTITUÍDA no Bloco 5E:** as 60 unidades
por dólar continuam valendo, mas o "por segundo entregue" virou **3 unidades por
segundo INTEIRO truncado** (US$ 0,05/s). O erro era dividir pela duração
fracionária; a regra nova reproduz exatamente as três medições, e a antiga não
reproduzia nenhuma.

O que existia antes eram **dois** números, e os dois erravam ao mesmo tempo: a
taxa de `provider_cost_rates` (US$ 0,03/s, palpite) multiplicando a duração
**pedida** (15 s) em vez da entregue (3,372 s). Daí os 4,5×.

*Medido nas rotas reais, em fixture:* estimativa de 15 s → US$ 0,675; real de
5 s → **US$ 0,225**; diferença **−US$ 0,45**, fator **3×**. O painel do tenant
mostra os dois lados e a diferença; antes de gerar, mostra só a estimativa com
a ressalva das condições de medição.

**AUSÊNCIA nunca vira zero.** Consumo sem medição (voz, roteiro, D-ID) devolve
`costUsd: null` com o motivo por extenso. *Medido no painel admin:* HeyGen com
custo derivado, três linhas marcadas **AUSENTE**, total somando só o medido e
declarando quantas linhas ficaram de fora.

**O caminho antigo foi removido do BANCO, não só do código** (migration 039):
`estimated_cost_cents` e `rate_snapshot_cents_per_unit` foram dropadas, a tabela
`provider_cost_rates` foi dropada, e as rotas `/admin/cost-rates` e a tela que
as editava saíram junto. Manter um editor de taxas ao lado de uma medição real
seria manter uma segunda verdade sobre dinheiro — e é a primeira que errou.

**Achado que só apareceu rodando:** as duas colunas eram `NOT NULL` sem default.
Parar de escrevê-las sem removê-las fez **toda** escrita de consumo falhar — e
falhar **em silêncio**, porque registrar consumo nunca lança. Três gerações não
deixaram linha nenhuma. Telemetria que falha calada é pior que telemetria
nenhuma: a ausência parece "nada aconteceu".

**2. Rastro da falha.** `provider_usage` ganhou `outcome` e `failure_reason`.
Uma tentativa recusada agora deixa linha com `unit_count = 0` — zero aqui é a
verdade, nada foi entregue — e o motivo **sanitizado** (o corpo bruto continua
só no log). Cobre os quatro pontos de falha: recusa na criação, erro no
polling, artefato inválido e timeout. O do timeout só grava se o `UPDATE` de
fato marcou erro, senão um vídeo que ficou pronto no último instante ganharia
uma linha de falha ao lado da de sucesso.

**3. ElevenLabs — a perna de custo, MEDIDA e corrigida no registro.**

**O registro do PREVOO-1 estava errado.** Ele dizia que `synthesizeSpeech` faz
"duas chamadas por geração, não uma". Faz **uma** no caminho feliz. A segunda é
**fallback condicional**, e só acontece quando a primeira falha:

| Cenário | Chamadas | Fonte da duração |
|---|---|---|
| `with-timestamps` 200 com áudio | **1** | `elevenlabs_timestamps` |
| `with-timestamps` 401 (sem permissão no plano) | 2 | `bitrate_estimate` |
| `with-timestamps` 200 **sem** `audio_base64` | 2 | `bitrate_estimate` |

A medição anterior viu duas porque o `fetch` substituído devolvia 400 para
tudo. **Não é duplicação — nada a remover.**

**Correção da premissa do item:** a síntese **não** está fora do teto de
sessão. Ela é alcançada só por `requireAudio` → `generateVideoHeygen`, que roda
**depois** de `consumeLiveGeneration` em `generateVideo`. Está protegida
indiretamente, e o único caminho para ela é esse (verificado por grep).

**O cenário de cobrança dupla existe e não foi observado:** se a primeira
chamada devolver 200 **com** áudio gerado mas **sem** `audio_base64` no corpo,
o fornecedor cobrou e nós caímos no fallback, que cobra de novo. Depende de uma
forma de resposta que nunca vimos. Registrado, não tratado.

**4. Redação no SUMIDOURO.** Todo evento passa por
[safeLog.ts](backend/src/services/log/safeLog.ts) — `logEvent()` é o único
caminho de saída, e o gate reprova `console.*` direto em `backend/src` (18
módulos convertidos; a única exceção é o próprio logger, cujos dois
`console.error` de último recurso já são redigidos e roteá-los pelo `logEvent`
criaria recursão no momento em que o log está quebrado).

A redação casa por **FORMA**, não por nome de campo: `sk-…`, `AIza…`, `AQ.…`
(o formato inesperado já registrado neste projeto), `xi-…`, `hg_…`, JWT,
`Bearer …`, e o caso genérico de bloco opaco com 40+ caracteres. Percorre
qualquer profundidade, inclusive `Error` (que não é enumerável — `{...err}`
perderia justamente a `message` que carrega o corpo do fornecedor).

*Medido, exercitando a função:* redige string solta, campo de objeto, **array
dentro de objeto**, `err.message` de um `Error`, e par `chave=valor` com nome
inocente — e **não** tarja texto legítimo (`"video 3ef8da68 pronto em 3.37s,
formato 9:16, engine avatar_iv"` sai intacto). Uma redação que apaga o log
inteiro é abandonada na primeira semana.

**5. Freio DERIVADO do catálogo.**
[endpointCatalog.ts](backend/src/services/providers/endpointCatalog.ts) lista
**12 endpoints** de 3 fornecedores, cada um com `billable` e uma nota dizendo
se o custo é medido ou suposto. A deny-list do probe deixou de ser escrita à
mão: ela agora é `billableEndpointPaths()`. **8 tarifáveis.**

O defeito que isso fecha não foi esquecer uma linha — foi a lista **nomear o
que conhece**, e por isso envelhecer em silêncio a cada versão nova. O mutante
esperto aponta o probe do ElevenLabs para `/v1/voices/add` (clonagem, tarifada):
com a lista antiga isso passava, porque ela nunca teve endpoint de ElevenLabs.

**6. Falha depois do aceite — MEDIDO, não corrigido.**

| Desfecho | status | Crédito | Teto de sessão | `provider_usage` |
|---|---|---|---|---|
| **A. Aceite + sucesso** | `ready` | −1, sem estorno | gasto 1, tentativa 1 | `success`, u=5 real, pedido=15 |
| **B. Aceite + timeout** (~7,5 min) | `error` | −1, **sem estorno** | gasto 1, tentativa 1 | `failed`, u=0 — **DEDUZIDO** |
| **C. Aceite + erro no polling** | `error` | **−1, sem estorno** | gasto 1, tentativa 1 | `failed`, u=0, pedido=15 |
| **D. Recusa antes do aceite** | `error` | −1 **+1 estorno** | **gasto DEVOLVIDO**, tentativa 1 | `failed`, u=0, pedido=15 |

**A coluna do teto mudou no bloco TETO-1, e note que ela agora acompanha a do
crédito linha a linha:** A, B e C retêm as duas coisas; só D devolve as duas.
Não é coincidência — as duas usam a mesma fronteira ("o fornecedor chegou a
aceitar o trabalho?"), de propósito. Duas fronteiras diferentes para a mesma
pergunta divergiriam na primeira mudança, e a divergência só apareceria em
live.

A, C e D foram **medidos** por HTTP real em fixture. B é **DEDUZIDO** do
código: 90 tentativas × 5 s inviabilizam a medição, e o caminho é o mesmo de C
(`refundCredit()` só existe no `catch` de `generateVideo`, em
[videos.ts:373](backend/src/routes/videos.ts:373); o laço de polling nunca
estorna).

A coluna do teto é **DEDUZIDA em todas as linhas**: em fixture o teto nunca é
consumido. O comportamento em live foi medido no PREVOO-1 — consome e **não
devolve**.

**A linha que importa é a C: aceite seguido de falha NÃO estorna, e isso está
certo.** O fornecedor renderizou e cobrou; devolver crédito ali faria o ledger
divergir do dinheiro real. Um marcador de fixture novo (`-pollfail-`) tornou
esse desfecho exercitável sem live — era o único que não acontecia sozinho.

**Desfecho E, não listado porque não é falha de geração:** se o processo
reiniciar entre a criação e o polling, o `setInterval` morre junto e o vídeo
fica preso em `queued` para sempre, sem linha de falha. Registrado, não tratado.

**Estado das guardas ao fim do bloco:** `npm run check` verde,
`npm run check:mutants` **53/53**.

**Um mutante mudou de SENTIDO, e o arnês foi quem mostrou.** O do PREVOO-1 que
removia o scrub explícito de `vendorError.ts` reprovava — a chave vazava. Depois
que `logEvent` virou o sumidouro único, o mesmo defeito deixou de vazar: a
camada de baixo segura. Não é guarda ficando inerte; é a proposição deixando de
ser falsificável **por ali**, porque a defesa passou a ter duas camadas. O
mutante virou `expectGreen`, o que documenta a redundância e a **prova** a cada
execução: se o sumidouro for enfraquecido, este contraponto quebra junto com o
mutante da redação, e os dois apontam para o mesmo lugar.

**E o `expect` errou o recorte pela terceira vez** (a mensagem diz "o número de
custo 0.045 fora de providerCost.ts"; o `expect` dizia "número de custo fora
de"). Prender o `expect` a um valor que pode mudar transforma guarda saudável em
mutante AMBÍGUO — o recorte certo é a parte estável da frase.

### Bloco TETO-1 — a falha devolve o teto, e o laço ganha contador próprio (CONCLUÍDO)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia, **zero
chamadas tarifadas**. Fecha a decisão aberta nº 1 do handoff do 4A.

**A causa era um contador servindo a dois propósitos.** O teto empacotava
duas proteções diferentes: a da **carteira** (quantas chamadas produziram
trabalho pago) e a contra **laço** (quantas vezes o código disparou). Uma
chamada que falha não gasta a carteira, mas consumia o teto de carteira — daí
o defeito medido no PREVOO-1.

Um contador só não conseguia servir aos dois: devolvê-lo na falha desligaria a
proteção contra laço (dez disparos que falham dez vezes devolveriam dez vezes
e rodariam para sempre); não devolvê-lo é o defeito. **Agora são dois:**

| Variável | Conta | Volta na falha? |
|---|---|---|
| `PROVIDER_LIVE_MAX_GENERATIONS` | gasto — trabalho que o fornecedor aceitou | **sim** |
| `PROVIDER_LIVE_MAX_ATTEMPTS` | tentativas, com qualquer desfecho | **nunca** |

O default de tentativas **deriva** (3× o de gasto) em vez de ser um número
solto: quem sobe o teto para uma passada de 2 vídeos espera margem
proporcional, e um default fixo transformaria esse aumento em nada — o teto de
tentativas viraria o gargalo silencioso, que é o mesmo modo de falha que este
bloco eliminou do outro.

**A ordem das verificações importa, e não é a intuitiva:** a trava de laço é
verificada **primeiro**. Depois que as falhas passaram a devolver o gasto, o
teto de gasto pode ter folga justamente porque tudo falhou — verificá-lo antes
deixaria o laço passar no exato cenário em que ele existe para barrar.

**A fronteira é a MESMA do estorno de crédito** (ESTORNO-1), de propósito:
devolve quando a chamada **lançou**, porque lançar significa que o fornecedor
não aceitou o trabalho. Ver a tabela dos quatro desfechos do 4A, onde as
colunas de crédito e de teto agora andam juntas linha a linha.

**Consumo e devolução no mesmo lugar.** `withLiveBudget(operation, verb, fn)`
substituiu o par `consumeLiveGeneration` + `throw` nos dois caminhos
tarifados. Não é açúcar sintático: uma devolução esquecida num `catch` é
invisível — o código segue funcionando, o contador segue plausível, e o
defeito só aparece na terceira falha de uma passada live. A guarda passou a
**reprovar `consumeLiveGeneration` direto** em caminho tarifado.

**Caso de fronteira conhecido e NÃO tratado:** `generateVideoHeygen` sintetiza
a voz no ElevenLabs (tarifado) **antes** de criar o vídeo. Se a voz foi
sintetizada e a criação falhou, a devolução devolve uma unidade com custo
parcial real. Aceitável porque o teto é trava de segurança, não contabilidade
— quem mede dinheiro é `provider_usage` —, mas vai ao log para não ser
descoberto ao conciliar uma fatura.

**A mensagem de teto de tentativas diagnostica.** Atingi-lo com gasto sobrando
só é possível se as chamadas estão **falhando**. A mensagem diz isso, aponta o
evento `live_budget_released`, e manda olhar a falha antes de aumentar o
número.

**Três asserções que puxam em direções opostas.** Uma guarda que só
verificasse "a falha devolve" seria satisfeita por um código que devolve
**sempre** (desliga o teto inteiro) e por um que devolve a **tentativa** junto
(desliga a proteção contra laço). As três juntas não têm implementação trivial
que passe: falha → gasto 0 e tentativa 1; sucesso → gasto retido; e 2 falhas
com gasto folgado (10) contra tentativas 2 → a 3ª é **recusada**. Exercitado
de verdade, sem rede e sem banco.

**`npm run check` verde, `check:mutants` 56/56.** Os três mutantes novos batem
um a um nessas asserções; o esperto que devolve a tentativa junto é o que
importa — gasto volta certo, sucesso retém, superfície idêntica, e só a
proteção contra laço morre em silêncio.

**O preflight imprime os DOIS tetos**, com a margem de falhas por extenso
(*medido:* "3 por sessão — margem de 2 falha(s) antes de travar"), e reprova se
o de tentativas ficar **abaixo** do de gasto: nesse estado as tentativas acabam
antes do gasto e um dos dois números está errado.

**O achado do bloco, e é uma classe NOVA de guarda inerte.** O arnês flagrou a
guarda nova como inerte, e o diagnóstico vale mais que o conserto: ela **não**
deixava de detectar o defeito — detectava, montava a mensagem certa, e **morria
antes de devolvê-la**. Com a devolução removida, o teto ficava em 1/1 e a
asserção seguinte (o contraponto do sucesso) era recusada por
`LiveBudgetExhaustedError`; a exceção subia sem dono, o `checkPolicy` morria
com "falhou de forma inesperada", e o array de falhas acumuladas ia junto.

Saída 1, mas por um motivo que não nomeia a causa — quem lesse concluiria que
o gate está instável, não que o teto parou de voltar. **As armadilhas já
catalogadas aqui eram guardas que passavam VERDE sem inspecionar nada; esta
reprovava e ainda assim não protegia.** O `expect` obrigatório do arnês foi o
que separou os dois casos: sem ele, este mutante teria contado como prova.

### Bloco 5D — "Criar vídeo" demonstrável (FASE 0 e FASE 1 CONCLUÍDAS)

Ambiente em `fixture` do começo ao fim, `PROVIDER_LIVE_CONFIRM` vazia. Fase 0
catalogou sem consertar; Fase 1 consertou escopo fechado. **As Fases 2 a 5
(revalidação da tabela do dinheiro, preflight, geração live, conferência) NÃO
foram iniciadas.**

**O achado que invalida registro anterior: `PROVIDER_MODE=fixture` NUNCA
cobriu os provedores de texto.** `complete()` em `providerRegistry.ts` — ponto
único de saída para Anthropic, Gemini e OpenAI — não consultava
`isFixtureMode()`. Ele atende **três** caminhos: o botão "Gerar com IA" do
passo 2, o copiloto do tenant e o do admin. Toda afirmação de "zero chamadas
tarifadas" dos blocos **3.5, 4A e 5D-Fase-0** valeu porque ninguém clicou ali
— não porque houvesse trava. As afirmações continuam verdadeiras como
medição; o que era falso é a garantia.

**O defeito de FORMA é o do 4A item 5, um nível acima.** Lá a deny-list
nomeava os endpoints que conhecia. Aqui `checkProviderPolicy` verificava o
desvio a partir de `VENDOR_MODULES`, uma lista de **dois** arquivos escrita à
mão — e o backend tem **dez** com saída de rede. Uma lista incompleta tem
exatamente a mesma aparência de uma completa.

*Varredura MEDIDA:* 101 arquivos `.ts`, **10 com saída de rede**, **2**
consultavam o modo. Dos 8 restantes: 4 são ferramentas (`scripts/`), 3 são
exceção legítima e 1 era o buraco.

[checkNetworkEgressPolicy.ts](backend/src/scripts/checkNetworkEgressPolicy.ts)
**descobre** em vez de receber lista: varre `backend/src` por qualquer cliente
HTTP (fetch, axios, SDKs, `node:http`) e exige que cada arquivo ou desvie para
fixture, ou esteja em `EXCECOES` **com motivo escrito**. As três exceções são
`platformKeyProbe` (deliberado desde o CHAVES-2), `downloadProxy` (baixa
artefato já pago) e `stripeClient` (tem mecanismo de teste próprio).

O catálogo ganhou os três fornecedores de texto. **Gemini entra como
tarifável mesmo no free tier**: a cota de ~20 req/dia é compartilhada com o
copiloto, e gastá-la não tira dinheiro — tira a capacidade de demonstrar.
Agora **16 endpoints, 6 fornecedores, 11 tarifáveis**, freio derivado.

**Efeito colateral que valeu a pena registrar:** seis asserções do gate
exercitavam `complete()` com `fetch` substituído para provar retentativa,
corte e tratamento de erro. Com o desvio, elas paravam antes do `fetch`. Agora
forçam `PROVIDER_MODE=live` localmente e restauram em `finally`, conferindo que
voltou — mesmo padrão do `checkPollPolicy`.

**O vídeo passou a existir dentro do produto.** Antes, o único player era o do
passo 6, cujo estado vive em `useState`: sair de `/create` tornava o resultado
inalcançável, e a Biblioteca listava onze vídeos com uma única ação, "Baixar".
[VideoPlayer.tsx](frontend/src/features/VideoPlayer.tsx) é componente **único**
usado nos dois lugares — duas implementações divergem, e a que divergir será a
que mostra fixture sem aviso numa apresentação.

*MEDIDO no navegador:* `readyState 4`, **360×640**, `aspect-ratio` computado
**9/16**, aviso de simulação presente, download preservado, e "Ver na
Biblioteca de vídeos →" no passo 6.

**Custo no passo 4** (*MEDIDO*): 15s → US$ 0,675 · 30s → US$ 1,35 · 60s →
US$ 2,70, atualizando ao trocar. Mesmo `VideoCostPanel` do passo 6.

**O ledger negativo: medido, causa confirmada, dados NÃO alterados.**
*MEDIDO:* 15 lançamentos somam **−2** com saldo **2**. **Nenhum caminho de
código pode produzir isso** — `auth.ts` insere `balance = 0` (neutro), e
`creditGate`/`monthlyGrant` gravam ledger na mesma transação, com a invariante
declarada em comentário. A causa está documentada no próprio repositório, em
`grantDevCredits.ts`: as limpezas de teste do **DEMO-1 e do ESTORNO-1** rodaram
`UPDATE tenant_credits SET balance` sem lançamento.

Os dados **não** foram alterados: a classe é inequívoca, mas *qual dos dois
números está certo* não é — e o projeto já decidiu que isso não é decisão de
script. A guarda ficou onde pega a **próxima** (no código: todo módulo que
escreve saldo grava lançamento), e a conferência dos números foi para o
`preflight:live` como **aviso**. No gate, um banco de dev sujo deixaria o build
vermelho para sempre, e guarda que reprova sempre é abandonada.

**Telas que mentiam:** "Rastreamento de custo em breve" virou **"Custo do mês
US$ 4,50 · de 9 consumos medidos · 5 sem medição, fora do total"** — e o
título mudou junto, porque o número é medido, não estimado. "Créditos
restantes" mostra **2**. Mais: reticências antes do badge na Biblioteca, o
`voice_id` do ElevenLabs trocado por rótulo legível, borda de seleção de 1px
para 3px + faixa de 8px + halo, e a condição que falta ao lado do botão
desabilitado.

**Achado ao verificar:** a legenda do custo saiu com `5 sem medição}}}` na
tela. **O i18next deste projeto não tem o plugin ICU**, então
`{{x, select, …}}` não é interpolado e vai para a tela como texto cru. Use
duas chaves e a condição no componente.

**Guardas: `npm run check` verde, `check:mutants` 64/64** (eram 56).

**Quatro mutantes nasceram errados, e os quatro repetem lições já catalogadas:**

1. **`find: "export"` casava 4 vezes** — o arnês abortou por ambiguidade, e com
   razão: um mutante que casa em vários pontos prova outra coisa a cada
   execução.
2. **Dois `expect` recortados como paráfrase do defeito**, não como núcleo da
   frase emitida ("não desvia para fixture" contra "não consulta
   `isFixtureMode()`"). **Quarta e quinta vez** que isso faz guarda saudável
   aparecer como AMBÍGUA.
3. **A guarda do aviso de simulação nasceu INERTE** — procurava
   `SimulatedNotice` no arquivo, e removida a renderização o **import**
   continuava lá e satisfazia a busca. O gate passou **verde** com o defeito
   aplicado. Corrigida ancorando no uso em JSX (`<SimulatedNotice`). É a
   **quinta vez** que uma guarda deste projeto casa a menção em vez do uso.
4. **A guarda de egress acusou `api.cohere.ai`** — host que existe apenas
   dentro do `replace` do mutante declarado no próprio arquivo. Quarta vez que
   uma guarda tropeça no texto escrito para descrevê-la, e a primeira em que
   esse texto era a prova de que ela funciona.

### Bloco 5D — fases 1-bis a 2 (véspera da apresentação, 2026-08-02)

**A passada live nº 2 saiu, e o vertical é REAL.** `ffprobe` no arquivo
baixado: **720×1280, DAR 9:16, SAR 1:1, 25 fps, 16,96 s**, h264+aac, 1,74 MB.
A pergunta central do FORMATO-1 está respondida — **9:16 sai vertical de
verdade**, e o payload leva `aspect_ratio: "9:16"` + `resolution: "720p"`
(exercitado pelo montador real), sem `dimension` e sem `engine` (`flag_off`).

| Medida | Antes | Depois | Delta |
|---|---|---|---|
| Quota HeyGen | 921 | 873 | −48 |
| Carteira | US$ 15,35 | US$ 14,55 | **−US$ 0,80** |

**60 unidades/dólar confirmado num terceiro ponto.** Custo por segundo
ENTREGUE: 0,80 ÷ 16,972 = **US$ 0,047/s** em 9:16/720p, contra US$ 0,045/s
medido em 16:9. A diferença de 4,5% não distingue "9:16 custa mais" de
arredondamento por bloco — **não medido**.

**A estimativa errou para o OUTRO lado desta vez, e isso é o achado.** O
LIVE-1 pediu 15 s e recebeu 3,37 s (estimativa 4,5× alta). Aqui pediu 15 s e
recebeu 16,97 s (estimativa **0,88× do real**, isto é, baixa). A direção do
erro não é do sistema: é o comprimento do ROTEIRO, porque a tela estima sobre
a duração escolhida no seletor e a fatura cobra a duração falada. **Resposta
pronta para a sala:** a estimativa é do que foi pedido; a medição é do que foi
entregue; as duas aparecem lado a lado justamente porque divergem.

**1-bis — o badge podia mentir sem sumir da tela.** A guarda já estava
ancorada no USO (`<SimulatedNotice`), corrigido na Fase 1 — o registro que
pedia essa correção estava desatualizado. O defeito real era outro:
verificava **presença**, e presença não é **LIGAÇÃO**. `simulated={false}`,
`simulated={!video.simulated}` e a prop ausente no selo da Biblioteca
preservam o elemento intacto no JSX. A terceira é a que mordia: sem prop, o
selo segue o modo do AMBIENTE, e como a apresentação roda em fixture isso
carimbaria SIMULADO no único vídeo real da tela.

**1-ter — o botão conhecia três condições, a rota recusava por sete.** Ver a
tabela do diagnóstico no commit. O predicado único vive em
[generationReadiness.ts](backend/src/services/generationReadiness.ts) e é
consumido pela rota **e** pela tela (`POST /videos/readiness` — POST, não GET,
porque o roteiro é conteúdo do cliente e não pode ir em query string).
*Medido nos dois lados:* botão inoperante com o motivo em lista ao lado, e
`POST /videos` → 400 `avatar_not_trained` **com a mensagem idêntica**.

> **CORREÇÃO DE REGISTRO: o limite mensal do plano NÃO é aplicado.** A seção 3
> deste arquivo afirma que o enforcement existe em `POST /videos` desde
> 2026-07-21. **Esse código não existe mais** — foi substituído pelo sistema
> de créditos, que reaproveitou o mesmo código de erro `plan_limit_reached`, e
> é por isso que a substituição passou despercebida: o sintoma externo ficou
> idêntico. `subscription.ts` conta vídeos do mês **só para exibir**. Medido:
> `dev-c77a5b` com 7 vídeos no mês contra limite 2, e nada bloqueia. O
> "6/2 vídeos" catalogado como bug de UI é isto: **o contador mente**.

**4.5 — a Biblioteca guardava um PONTEIRO, não um vídeo.** Em live, o polling
gravava a URL assinada de `files2.heygen.ai` direto em `output_url`. *Medido,
não deduzido:* dos 6 vídeos que ainda apontavam para o fornecedor, **DOIS já
devolviam 403** — a assinatura tinha vencido. Agora o artefato é baixado,
validado e gravado no nosso armazenamento antes de virar `ready`;
`provider_output_url` (migration 040) guarda a URL do fornecedor só para
rastreio. *Aceite medido com o container recriado e o ambiente de volta em
fixture:* player 720×1280 `9/16`, download 200 com 1.742.664 bytes e
assinatura `ftyp`, os dois de `/uploads`, **zero requisições a host externo**.

**A voz: a clonagem aconteceu, e mesmo assim há dois defeitos.**
`wAd9MJ2IK71FGs1FWjIX` é `category=cloned`, `name="Mário"`, e a geração usou
essa voz (`requireAudio` lança sem `voiceId` — não há retaguarda para voz de
catálogo). Os dois defeitos:

1. **A amostra que treinou o clone tem 15,37 s** (ffprobe no wav de
   referência), contra os 30 s que a própria tela declara como piso.
2. **A síntese não declarava modelo.** Corpo `{ text }` nos dois ramos —
   mesma classe de defeito que o FORMATO-1 tirou do payload de vídeo.
   `ELEVENLABS_TTS_MODEL`, default `eleven_multilingual_v2`, **exercitado
   contra o fornecedor e ACEITO (200)**. O padrão anterior continua
   **NÃO CONFIRMADO**: `GET /v1/models` responde 401 com esta chave.

**Três medições da sonda de TTS**, que custou centavos e nenhum vídeo:
**UMA** chamada de síntese no caminho feliz (o fallback não disparou —
confirma a correção do 4A); o **teto não se moveu** (gasto 0→0, tentativas
0→0), provando que `synthesizeSpeech` está fora do contador; 17,6 s de áudio
para 206 caracteres.

**O cronômetro vigiava o teto e escondia a meta.** "Gravando 0:15 de 2:00 —
para sozinho em 105s" responde *quanto ainda posso gravar* e nunca *quanto
preciso gravar*. Foi assim que a amostra de 15,37 s aconteceu. Virou
[RecordingProgress](frontend/src/pages/CreateVideo/RecordingProgress.tsx), com
três faixas (<0:30 curto · 0:30–1:00 dá para clonar · ≥1:00 bom) e o que falta
em segundos. **Verificado na UI real montando o componente pelo módulo do
Vite** — o que o DEMO-2 não conseguiu, porque a câmera é bloqueada aqui.

**Fase 2 — tabela dos quatro desfechos revalidada, SEM divergência**
(`MAX_GENERATIONS=1`, `MAX_ATTEMPTS=2`):

| Desfecho | status | aceito | ledger | provider_usage |
|---|---|---|---|---|
| A aceite+sucesso | `ready` | sim | −1, sem estorno | `success` u=5 |
| C aceite+erro no polling | `error` | sim | **−1, sem estorno** | `failed` u=0 |
| D recusa antes do aceite | `error` | **não** | −1 **+1 estorno** | `failed` u=0 |

B (timeout, ~7,5 min) continua **DEDUZIDO** — 90 tentativas × 5 s inviabilizam
a medição.

**E a Fase 2 achou um defeito que ninguém procurava: a recusa voltava como
`HTTP 201 Created`.** Com `status: "error"` no corpo. `vendorErrorStatus` já
estava importado em `videos.ts` **e nunca era chamado** — era a única das seis
rotas que tratam erro de fornecedor sem ele. Importa porque `api/client.ts` só
levanta erro quando `!res.ok`. *Corrigido e provado nos dois sentidos:* recusa
→ **502**, sucesso → **201**.

**Guardas: `npm run check` verde, `check:mutants` 74/74** (eram 64).

**Duas guardas novas nasceram INERTES e o arnês pegou as duas** — sexta e
sétima ocorrência do mesmo padrão: uma procurava `<RecordingProgress` no
arquivo inteiro (havia um segundo uso satisfazendo a busca sozinho), a outra
procurava o nome da faixa como palavra (a união de tipos ainda o mencionava).
As duas pareciam corretas na leitura.

### O que sobrou aberto do 5D (2026-08-02)

- **A voz NÃO foi reclonada.** Depende de uma amostra de 1–2 min que o
  usuário ia gravar e não chegou nesta sessão. O critério de aprovação foi
  fixado por ele: *a voz sintetizada tem de ser IGUAL à da amostra*. **Aviso
  registrado:** `cloneVoice()` usa `/v1/voices/add`, que é **Instant Voice
  Cloning** — entrega semelhança reconhecível, não voz idêntica. Voz idêntica
  é *Professional Voice Cloning*, outro fluxo, ~30 min de áudio e horas de
  treino. Sob o critério fixado, o desfecho provável é reprovar.
- **A sequência da reclonagem está escrita e travada**, com o portão de
  escuta antes da geração: clonar → TTS → o usuário ouve → só então gerar.
  Uma reprovação custa 1 unidade do teto + centavos, e nenhum dólar de vídeo.
- **NÃO use o passo 1 do app para regravar:**
  `POST /avatars/:id/reference-video` chama `trainAvatar` ANTES de clonar —
  US$ 1,00 de `photo_avatar` novo + 1 crédito de avatar, trocando uma
  aparência já aprovada. O caminho é clonar só a voz e repontar `voice_id`.
- **Derivação de formato: a cópia B é descarte.** A HeyGen devolveu 9:16
  NATIVO, então a moldura desfocada (1080×1920) apenas **amplia 1,5×** —
  viola a regra "nada ampliado". **A cópia A, intocada, é o ativo.** As duas
  estão lado a lado em `uploads/c77a5b8a-…/` e em
  `Documents/eckko-live-2026-08-02/`.
- **Os 9 vídeos e 3 avatares de teste da Fase 2 foram removidos** — eles
  ocupavam o TOPO da Biblioteca, que é a primeira coisa que a apresentação
  mostra. A remoção zera `related_video_id` no `credit_ledger` (FK `SET
  NULL`), mas **não toca em valor nenhum**: *medido antes e depois*,
  `avatar=4 script=9 video=-2` nos dois lados. Mesmo precedente da limpeza da
  Fase 1. A divergência saldo × ledger que já existia continua **intocada** —
  decidir qual dos dois números está certo segue sendo decisão do usuário.
  *Conferido na tela ao fim:* topo da Biblioteca é o vídeo real, **sem
  badge**, tocando 720×1280 em `9/16`, download 200 com 1.742.664 bytes; as
  linhas de fixture logo abaixo, todas com SIMULADO.
- **A tela de custo conta só o vídeo.** Neste mês: US$ 5,71 medidos, e **6
  consumos sem taxa** fora do total — 256 caracteres de voz no ElevenLabs e
  669 tokens de roteiro no Gemini. A legenda do card já declara isso.

### O que a Fase 0 catalogou e a Fase 1 NÃO consertou

Fora de escopo por decisão explícita, registrado para não virar surpresa:
miniatura na Biblioteca; persistência do wizard em F5 (o estado vive em
`useState`); `/api/notifications/summary` chamado dezenas de vezes por
passada; indicador que não distingue passo preenchido de pulado; e a aba
**RAG**, que continua sem decisão tomada.

Também continua valendo, do POLL-1: **a UI exige 3 fotos e o provider usa só a
primeira**.

**Limpeza:** os dois vídeos de teste saíram do banco. As FKs são `SET NULL`, e
*MEDIDO:* a soma do ledger ficou **−3 antes e −3 depois**. **Dois `.mp4`
ficaram órfãos** em `uploads/c77a5b8a-…/` e NÃO foram apagados.

### Procedimento: ler o consumo do ElevenLabs (item 3.2)

> **ATUALIZAÇÃO 03/08/2026 — prefira o PAINEL a este procedimento de delta.**
> **Desenvolvedores → Análises → Uso** discrimina **por chamada** (contagem,
> caracteres, créditos, duração, custo em dólar) numa janela escolhida, então
> não é preciso ler antes e depois nem subtrair nada. Foi assim que o custo da
> voz foi fechado (ver LIVE-3): 180 car → 90 créditos → US$ 0,018. O método de
> delta abaixo continua válido e tem uma vantagem própria — é automatizável —,
> mas depende da permissão `user_read`, que a chave **não tem**, e é frágil
> exatamente onde o painel é forte: qualquer síntese de terceiro na janela
> entra no delta sem aparecer.

**Endpoint de leitura, NÃO tarifado:** `GET /v1/user/subscription`. Devolve
`character_count` e `character_limit`. Rode **antes e depois** da passada; a
diferença é o consumo real de voz — o número que nunca entrou em conta nenhuma.

```bash
curl -s -H "xi-api-key: $env:ELEVENLABS_KEY" https://api.elevenlabs.io/v1/user/subscription | Out-File -Encoding utf8 tts-antes.json
```

**Duas ressalvas que decidem se isso vai funcionar:**

1. **A chave em uso NÃO tem a permissão `user_read`** (registrado desde o
   DEMO-3), e sem ela este endpoint responde 401. Se responder 401, **não é
   chave inválida** — é permissão faltando, e o diagnóstico errado aqui custa
   tempo. Habilite `user_read` no painel do ElevenLabs, ou aceite que o
   consumo de voz continua não medido.
2. **`Out-File -Encoding utf8`, nunca `>`.** No PowerShell o `>` grava
   UTF-16LE e nenhuma ferramenta de texto acha nada dentro depois.

Para conferir só o essencial sem abrir o arquivo:

```bash
(Get-Content tts-antes.json | ConvertFrom-Json) | Select-Object character_count, character_limit
```

### PLANO DA PASSADA LIVE (Bloco 5) — siga na ordem, sem improvisar

Escrito antes de precisar dele, porque no meio de uma passada que gasta
dinheiro não se lê documentação.

**Antes de qualquer coisa:**

```bash
docker compose exec backend npm run preflight:live
```

**1. Teto para 2, no `.env`, e recriar o container.** O teto conta **voz e
vídeo juntas** — 1 não basta para um fluxo completo, e foi assim que a
primeira passada live morreu.

```bash
docker compose up -d backend
```

`docker compose restart` **NÃO recarrega variável de ambiente** — só `up -d`
recria o container. Recriar zera o log, e tudo bem: isto acontece **antes** da
passada. **Depois disto, só `restart`** — ele preserva o log acumulado e zera
o contador do teto, que é exatamente a combinação desejada se algo falhar no
meio.

**2. Captura de log em UTF-8.** No PowerShell, `>` e `Out-File` sem
`-Encoding` gravam **UTF-16LE**, e `grep` não acha nada dentro:

```bash
docker compose logs backend | Out-File -Encoding utf8 live-run.log
```

**3. Ordem das gerações: 9:16 PRIMEIRO.** O horizontal já foi visto funcionar;
o vertical é a pergunta aberta do Bloco 3. Se só couber uma geração, tem de ser
a que responde algo. **16:9 depois, e só se a primeira passar.**

**4. Baixe o artefato IMEDIATAMENTE, para fora do projeto.** A URL da HeyGen é
assinada e expira (`Expires=` observado no LIVE-1). Depois rode `ffprobe` no
arquivo baixado: **é a única forma de saber a geometria real**, porque nenhuma
resposta da HeyGen declara dimensão — nem a criação nem o polling.

**5. `explicit_avatar_engine` permanece DESLIGADA.** A ligação entre
`supported_api_engines` e `engine.type` é dedução, e um valor recusado derruba
a geração inteira — que é o caminho caro. A seleção continua sendo gravada com
a razão `flag_off`, então a passada colhe o dado sem arriscar nada.

**6. Se falhar, o teto de GASTO volta sozinho** (bloco TETO-1) — a falha
significa que o fornecedor não aceitou o trabalho. O que **não** volta é a
TENTATIVA: com `MAX_GENERATIONS=2` são **6 tentativas** antes de travar, ou
seja 4 falhas de margem. O crédito também é estornado sozinho.

Se as tentativas acabarem, a mensagem diz que as chamadas estão falhando e
aponta o evento `live_budget_released` no log — **leia a falha antes de
aumentar o número**, senão o aumento só produz mais falhas. Para zerar os
dois contadores: `docker compose restart backend`.

### Bloco LIVE-2 — a voz entra no log e o consumo passa a ser medido (CONCLUÍDO)

**1. `voiceProvider` registra a resposta bruta.** Ganhou `readVoiceJson()`, com
o mesmo contrato do `fetchJson()` do avatarProvider: texto → log → parse.
Cobre `cloneVoice`, `checkElevenLabsConnection` e os dois ramos de
`synthesizeSpeech`. De passagem, `checkHeygenConnection` e `checkDidConnection`
também passaram a registrar — eram as únicas do avatarProvider que ainda liam
o corpo à mão.

**O guardrail que define o desenho: áudio nunca vai para o log.**
`audio_base64`, `audio`, `alignment` e `normalized_alignment` são **elididos**
— o log guarda a forma e o tamanho, nunca o conteúdo. E o endpoint simples de
TTS devolve mp3 cru, sem envelope JSON, então existe `logVendorBinaryResponse`,
que registra status, cabeçalhos e bytes e **não** tem campo de corpo.

*Medido, com `fetch` substituído (zero rede):* corpo real de **64.403 bytes**
→ registro de **322 bytes**. A clonagem: **251 bytes**, com `api_key` saindo
como `***REDACTED***`. Sem a elisão seriam ~64 KB **por geração**, num log que
ninguém conseguiria ler.

**2. `provider_usage` mede o que foi consumido.** Ver a lacuna 1 acima para a
ordem das fontes e a migration. *Medido em fixture:* `real=5, pedida=15,
unit_source=vendor_response` — 5 s é a duração real da fixture de vídeo, 15 s é
o que foi pedido na tela.

**3. Guarda nova** ([checkVendorLogPolicy.ts](backend/src/scripts/checkVendorLogPolicy.ts)):
função que chama `fetch(` num módulo de vendor sem registrar a resposta
reprova o build. Casa **13 funções** hoje — exportadas e privadas, porque é nas
privadas que o `fetch` mora.

**Ela nasceu com o defeito que existe para impedir, e isso é o registro mais
útil deste bloco.** Ao provar que reprovava:

- **Primeira tentativa: passou verde.** A guarda exigia que quem faz `fetch`
  chamasse um helper (`readVoiceJson(`), mas não olhava o helper. Esvaziei o
  log de dentro dele e nada acusou — treze funções descobertas de uma vez, sem
  nenhuma delas mudar. Corrigido com uma checagem própria dos helpers.
- **Segunda tentativa: passou verde de novo.** A verificação do guardrail
  procurava `audio_base64` no arquivo inteiro, e a palavra continuava **no
  comentário** que explica a elisão. Guarda satisfeita por comentário é pior
  que guarda nenhuma, porque a prova de que ela funciona também passa.
  Corrigido: comentários removidos antes de procurar, e a busca ancorada na
  constante.

Só depois disso as três provas reprovaram de verdade (saída 1) e o verde
voltou ao restaurar: helper sem log, `ELIDE_KEY_PATTERN` esvaziada, e
`heygenUploadAsset` trocando `fetchJson` por `res.json()`.

**A moral, para a auditoria de guardas que continua pendente:** uma guarda só
vale depois de vista reprovando. Duas de três verificações deste bloco nasceram
inertes, e ambas *pareciam* corretas na leitura.

**O que este bloco NÃO provou:** que o ElevenLabs real produz a forma de
resposta simulada aqui (`audio_base64` + `alignment.character_end_times_seconds`)
— nenhuma resposta real de voz foi observada até hoje, porque o LOG-1 não a
cobria; e que a D-ID declara duração (`data.duration` é palpite, e quando não
vier cai na fonte (b), como projetado).

