/**
 * Fundo escolhido no passo Cena.
 *
 * `value` é hex quando `color` e o caminho do nosso upload quando `image` — a
 * mesma forma que o corpo de `POST /videos` aceita. Não existe `video`: o
 * fornecedor enumera exatamente estes dois tipos.
 */
export type SceneBackground = { type: "color"; value: string } | { type: "image"; value: string };

export interface WizardState {
  avatarId: string | null;
  script: string;
  /**
   * O QUE O SERVIDOR ESTIMOU a partir do roteiro, e não uma escolha da tela.
   *
   * Era `15 | 30 | 60`, um chip que nunca chegou ao fornecedor. Fica aqui só
   * para o passo Gerar saber se precisa pedir confirmação; o número que vale é
   * sempre o que o servidor derivar do roteiro na hora de gerar.
   */
  estimatedSeconds: number | null;
  /** Teto declarado pelo servidor, acima do qual o passo Gerar confirma. */
  confirmAboveSeconds: number | null;
  /**
   * DURAÇÃO-ALVO escolhida no passo Roteiro (15/30/45/60 s). `null` = "mais"
   * — sem alvo, o teto de recusa continua sendo só o global do servidor
   * (`MAX_SCRIPT_SECONDS`). Presente, ela vira o teto de recusa DE VERDADE:
   * o servidor recusa acima dela, não é só uma dica na tela.
   */
  targetDurationSeconds: number | null;
  /** CENA — os controles que o fornecedor de fato aceita. */
  background: SceneBackground | null;
  /**
   * CENÁRIO deste vídeo — POR VÍDEO desde a rodada de 27/08, não mais padrão
   * do avatar (Passo 1). O backend já aceitava os dois por vídeo desde as
   * migrations 002/010 (`videos.scenario`/`scenario_prompt`) — só a UI que
   * editava isso vivia no lugar errado (`AssetDefaults`, Passo 1, hoje
   * extinto). Imagem (upload) e texto (Gerar via IA) convivem, não são
   * mutuamente exclusivos.
   *
   * MIGRAÇÃO NÃO DESTRUTIVA: `CreateVideoPage.tsx` preenche estes dois campos
   * com o padrão salvo no AVATAR (`avatar.scenario`/`scenario_prompt`) na
   * primeira vez que um avatar é selecionado nesta visita — depois disso, são
   * só do vídeo, editáveis livremente, e nunca mais sobrescritos pelo padrão
   * do avatar enquanto a mesma visita durar.
   */
  scenario: string | null;
  scenarioPrompt: string | null;
  /**
   * TRAJE deste vídeo — POR VÍDEO desde esta rodada (28/08), seguindo
   * EXATAMENTE o modelo do Cenário acima (era a mesma correção de rumo:
   * "Traje Padrão" havia sido mantido como identidade fixa do avatar no
   * Passo 1 numa decisão que a própria sessão revogou). `POST /videos` já
   * aceitava `outfit`/`outfit_prompt` por vídeo desde antes — o servidor
   * já fazia `outfitParaGerar = outfit || avatar.outfit || null`
   * (`routes/videos.ts`) mesmo quando só o padrão do avatar era mandado; o
   * que faltava era a TELA escrever um valor por vídeo em vez de sempre
   * reenviar o padrão do avatar.
   *
   * MESMA migração não destrutiva do Cenário: `CreateVideoPage.tsx` semeia
   * com `avatar.outfit`/`outfit_prompt` na primeira seleção do avatar nesta
   * visita, pelo MESMO `handleSceneDefaultsSeed` (agora carregando os 4
   * campos, não só os 2 de Cenário).
   */
  outfit: string | null;
  outfitPrompt: string | null;
  motionPrompt: string;
  expressiveness: "low" | "medium" | "high" | null;
  /** Look do avatar. `null` = o look padrão, que é o que sempre valeu. */
  avatarLookId: string | null;
  /**
   * ENQUADRAMENTO — BB2/BB3, BLOCO HEYGEN-SIMPLES-10. `null` = usa o padrão
   * do servidor (`HEYGEN_FIT`, hoje "cover" — corta para preencher o
   * quadro). `"contain"` é a alternativa: cabe o quadro inteiro, sem
   * cortar, com barra nas laterais. Só o tier Simples (HeyGen) usa isto —
   * a fal não tem campo equivalente.
   */
  avatarFit: "cover" | "contain" | null;
  /**
   * Plataforma de publicação. É dela que sai a proporção enviada ao
   * fornecedor — ver `publishPlatforms.ts` e o catálogo do backend. Desde o
   * DEMO-2 ela é escolhida dentro do passo Cena, e não num passo próprio.
   */
  publishPlatform: string;
  /**
   * LEGENDA queimada no vídeo. Padrão `false` — é o que todos os vídeos deste
   * projeto fizeram até 10/08, e é a escolha que não muda o caminho conhecido.
   */
  captions: boolean;
  /**
   * O NÍVEL do vídeo — BLOCO A. Nomes de plataforma (HeyGen/Wan/Seedance)
   * NUNCA aparecem nesta tela nem nos textos, só nos comentários do código —
   * ver `AdminPlatformKeysSection.tsx` e `falPipeline.ts` no backend.
   *
   * Padrão `"normal"`: é o único tier do caminho da fal que já tinha motor
   * funcionando antes deste bloco, e é o que todo vídeo criado antes dele
   * teve, sem ter escolhido nada.
   */
  tierVideo: "simples" | "normal" | "premium";
}
