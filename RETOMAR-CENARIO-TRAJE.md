# RETOMAR-CENARIO-TRAJE — mover cenário/traje do passo 1 para o passo 3, 25/08/2026

> **Digite `RETOMAR-CENARIO-TRAJE` na conta nova.** Este arquivo é a
> resposta completa: o estado do ambiente, a decisão de produto que abriu
> esta linha, o que ela mede, a tarefa que foi PARADA e por quê, e a
> primeira ação da próxima sessão. Não é preciso reler a sessão anterior.

## Estado

- **HEAD `a64da7e`** — árvore limpa (`git status --short` vazio).
- **Frontend HEALTHY** desde o F0 desta sessão: `Status=running | Health=healthy
  | falhas=0`. O `vite.config.ts` ganhou `server.watch.usePolling` porque o
  watcher do Vite não enxerga bind mount no Windows — sem isso, `restart`
  conserta até a próxima edição e volta a divergir em silêncio. **Atenção:**
  `vite.config.ts` **não está no bind mount** (os volumes do frontend são só
  `src`, `index.html`, `public`, `tools`), então uma edição nele exige
  `docker compose up -d --build --no-deps frontend` — `restart` sozinho NÃO
  carrega a mudança.
- A regra "confira o healthcheck do frontend antes de qualquer medição de
  tela" está fixada no **topo do CLAUDE.md** (não no BACKLOG — instrução que
  precisa valer sempre não pode morar onde o contexto a leva embora).
- **BACKLOG.md**: A1–A6 (achados do percurso assistido de 24–25/08) marcados
  `INVALIDADO — MEDIDO SOBRE BUNDLE VELHO`. A3 tem causa REAL identificada
  (string literal em `GenerateStep.tsx:132`, independente do bundle) — ver
  BACKLOG.md para o detalhe.
- **Backend `PROVIDER_MODE=fixture`, `PROVIDER_LIVE_CONFIRM len=0`** —
  desarmado. Nada pago sai.
- **Ainda não percorrido na tela:** Gerar (o clique) · Refazer · Galeria.

## Decisão de produto (25/08)

**Cenário e traje são POR VÍDEO, coletados no passo 3 (Cena), sem vínculo
com o avatar.** Uma Fase 2 — o avatar ter cenário/traje PRÓPRIOS, com
estrutura nova em `avatars` — fica para depois, registrada mas não
desenhada.

### O que está MEDIDO, e sustenta a decisão

- **As 4 colunas (`scenario`, `outfit`, `scenario_prompt`, `outfit_prompt`)
  pertencem a `videos`.** `avatars` não tem nenhuma coluna de cenário/traje
  — conferido por `\d avatars` e por busca em
  `information_schema.columns` no banco inteiro.
- **A coleta está no passo 1 (`AvatarSetupStep.tsx`), mas o dado nunca foi
  do avatar** — vive só no `WizardState` em memória
  ([CreateVideoPage.tsx:56-60](frontend/src/pages/CreateVideo/CreateVideoPage.tsx:56))
  e só é persistido no clique em Gerar:
  `corpoDaGeracao` ([GenerateStep.tsx:65-68](frontend/src/pages/CreateVideo/steps/GenerateStep.tsx:65))
  → `POST /videos` → `INSERT INTO videos (...)`
  ([routes/videos.ts:1499](backend/src/routes/videos.ts:1499)).
- **Prompt de composição no pipeline fal:**
  texto em [avatarProvider.ts:1166-1167](backend/src/services/providers/avatarProvider.ts:1166)
  (`promptDaComposicao`, junta `scenarioPrompt` + `outfitPrompt`);
  imagens em [avatarProvider.ts:1242-1255](backend/src/services/providers/avatarProvider.ts:1242),
  ordem significativa `[rosto, traje?, cenário?]` em `image_urls`.
- O passo Cena (`SceneStep.tsx`) hoje **não grava cenário/traje nenhum** —
  zero ocorrências de `scenario`/`outfit` no arquivo. O que ele já tem é
  Fundo (`background_type`/`background_value`), Interpretação
  (`motion_prompt`), traje-por-LOOK (`avatar_look_id`, pago, HeyGen) e
  formato — nenhum é o cenário/traje de imagem livre do passo 1.

## TAREFA PARADA — MOVER-CENARIO-TRAJE

**Escopo:** mover os dois pares (upload de imagem + campo "Gerar via IA")
de `AvatarSetupStep.tsx` — **as duas ocorrências**, avatar novo e avatar
existente — para `SceneStep.tsx`. Rótulos novos: **"Cenário deste
vídeo"**/**"Traje deste vídeo"**, sem ambiguidade, retirando qualquer frase
de ajuda que os apresente como padrão do avatar (nunca foram). Aviso visual
quando os dois pares estiverem vazios, dizendo que a composição pode ser
recusada pelo fornecedor sem cenário nem traje — **só aviso, não bloqueia**.

**NÃO TOCAR:** "Adicionar traje" (look pago do HeyGen, `handleCreateLook`)
— fica onde está, intacto. O dropdown de traje/look e o bloco de Fundo que
já existem na Cena — ficam, intactos; conviver por ora é aceitável. Nenhuma
coluna de banco, nenhuma migration (a fiação não muda, só de onde o wizard
coleta). Nenhuma mudança em `avatarProvider.ts` nem no pipeline.

### BLOQUEIO — por que parou

Antes de editar qualquer arquivo, a busca por guardas achou **3 que
amarram os campos ao passo 1 de forma estrutural**, não coincidental. Duas
delas fariam o `npm run check` **reprovar sobre código correto**, não só
um mutante:

1. **`checkExistingAvatarAssetsPolicy.ts`** — o arquivo inteiro existe só
   para isto. Recorta `AvatarSetupStep.tsx` entre âncoras literais de
   comentário (`"CENÁRIO E TRAJE deste vídeo — BLOCO B5c."` até
   `"ORDEM DO PASSO 1"`). Sem os blocos no arquivo, as âncoras não existem
   → `inicio < 0 || fim < 0` → falha explícita da própria função de
   checagem ([checkExistingAvatarAssetsPolicy.ts:83-89](backend/src/scripts/checkExistingAvatarAssetsPolicy.ts:83)),
   mesmo com a mudança feita certo.

2. **`checkPreflightSummaryPolicy.ts:296-332`** — exige **≥ 2 ocorrências**
   de `defaults.scenarioName` alimentando `imageSavedNamed` em
   `AvatarSetupStep.tsx` (uma por ramo: avatar novo, avatar existente) e a
   literal `"scenarioName: file.name"`. Remover os blocos derruba a
   contagem a 0 → mesma falha sobre código correto.

3. **`checkOutfitPolicy.ts:499-535`** (item 7) — invariante *condicional*:
   "SE o passo 1 coleta `outfit`, ENTÃO `corpoDaGeracao()` tem de mandá-lo."
   Sem upload no passo 1, o `if` nunca dispara — não reprova o gate, mas a
   guarda fica **vazia/INERTE** (o padrão que o próprio projeto trata como
   defeito quando descoberto depois).

Nenhum código foi tocado. `git status` seguiu limpo o percurso inteiro
desta investigação.

## PRÓXIMA AÇÃO — primeira coisa da sessão seguinte

Para cada uma das 3 guardas acima, **antes de tocar em qualquer código**:
dizer o que ela **GARANTE** (a propriedade que protege, não o mecanismo de
como verifica), e se essa garantia **sobrevive** com os campos vivendo no
passo 3 em vez do passo 1. Propor, por guarda: **reapontar** para
`SceneStep.tsx` / **aposentar** com justificativa escrita / **reescrever**
sob outra forma. **Só análise — sem alterar código.** O operador decide o
destino de cada uma antes de qualquer edição em `AvatarSetupStep.tsx` ou
`SceneStep.tsx`.

Só depois disso: implementar MOVER-CENARIO-TRAJE como descrito acima, rodar
o gate (não a passada completa do arnês, salvo pedido explícito), commit
único.
