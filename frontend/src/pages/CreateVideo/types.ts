export interface AssetDefaults {
  scenario: string;
  /**
   * O NOME do arquivo que a pessoa escolheu, guardado à parte.
   *
   * Não dá para tirar de `scenario`: o armazenamento renomeia para
   * `<uuid>.<ext>` e o nome original não sobrevive na URL. E não dá para tirar
   * do `<input type="file">`: navegador nenhum repovoa um campo de arquivo
   * quando o componente remonta — por segurança, e não por descuido. Ao voltar
   * ao passo 1 o campo dizia "nenhum ficheiro selecionado" com a imagem salva e
   * em uso, que é a tela contradizendo o servidor.
   */
  scenarioName: string;
  outfit: string;
  scenarioPrompt: string;
  outfitPrompt: string;
}

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
  /** CENA — os controles que o fornecedor de fato aceita. */
  background: SceneBackground | null;
  motionPrompt: string;
  expressiveness: "low" | "medium" | "high" | null;
  /** Look do avatar. `null` = o look padrão, que é o que sempre valeu. */
  avatarLookId: string | null;
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
