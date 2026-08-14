/**
 * Catálogo de TODO endpoint de fornecedor que este projeto alcança, com um
 * campo dizendo se ele custa dinheiro.
 *
 * ┌─ Por que um catálogo, e não uma deny-list ──────────────────────────────┐
 * │ A deny-list que impede o probe de validação de tocar um endpoint que    │
 * │ gera conhecia exatamente uma entrada: `/v2/video/generate`. O caminho   │
 * │ de geração deste projeto é **v3** desde sempre, então um probe apontado │
 * │ para `/v3/videos` passava verde — e `/v3/avatars`, o endpoint mais caro │
 * │ do projeto (US$ 1,00 por chamada, medido), também.                      │
 * │                                                                         │
 * │ O defeito não foi esquecer de escrever uma linha. Foi a lista NOMEAR o  │
 * │ que conhece: ela envelhece sozinha toda vez que o código migra de       │
 * │ versão ou ganha um fornecedor, e envelhece em silêncio, porque uma      │
 * │ lista incompleta tem exatamente a mesma aparência de uma completa.      │
 * │                                                                         │
 * │ Aqui a relação se inverte: o catálogo é a fonte, e o freio DERIVA dele. │
 * │ Acrescentar um endpoint tarifável sem tocar no freio deixa de ser       │
 * │ possível — o freio já o conhece no instante em que ele entra na lista.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A tabela do CLAUDE.md espelha isto, e `npm run check` cobra os dois lados.
 */

export interface VendorEndpoint {
  /**
   * Fornecedor, no vocabulário de vendorCatalog.ts.
   *
   * Os três de TEXTO entraram no bloco 5D-1, e a razão é o mesmo defeito de
   * FORMA descrito acima, um nível acima: o catálogo tinha virado a fonte do
   * freio, mas ele próprio era uma lista de FORNECEDORES escrita à mão — e
   * nela não havia nenhum provedor de texto. Resultado: `POST /v1/messages`
   * da Anthropic e o `generateContent` do Gemini eram, para toda trava deste
   * projeto, endpoints que não existiam.
   */
  vendor: "heygen" | "did" | "elevenlabs" | "anthropic" | "gemini" | "openai" | "fal";
  /** Caminho, com a versão. É o que o freio compara. */
  path: string;
  method: "GET" | "POST";
  /**
   * Chamar isto custa dinheiro?
   *
   * `true` para qualquer endpoint que produza trabalho tarifado — geração,
   * criação de avatar, síntese, clonagem. `false` só para leitura pura.
   *
   * Na dúvida, `true`: o custo de tratar leitura como tarifável é um botão de
   * validação a menos; o de tratar geração como leitura é uma carteira vazia.
   */
  billable: boolean;
  /** Onde é chamado, e o que se sabe do custo. */
  note: string;
}

export const VENDOR_ENDPOINTS: VendorEndpoint[] = [
  // ---------------------------------------------------------------- HeyGen
  {
    vendor: "heygen",
    path: "/v3/assets",
    method: "POST",
    // Upload de foto e de áudio. Não há preço declarado por upload, e nenhuma
    // variação de carteira foi observada em torno dele — mas ele só existe
    // como insumo de criação/geração, então tratá-lo como tarifável não custa
    // nada e evita que um probe o use como "endpoint inofensivo".
    billable: true,
    note: "upload de asset; insumo de criação e de geração",
  },
  {
    vendor: "heygen",
    path: "/v3/avatars",
    method: "POST",
    billable: true,
    note: "MEDIDO: US$ 1,00 por avatar (carteira 16,50→15,50, DEMO-3). O mais caro do projeto.",
  },
  {
    vendor: "heygen",
    path: "/v3/videos",
    method: "POST",
    billable: true,
    note:
      "MEDIDO: US$ 0,15 por 3,372 s (LIVE-1). Caminho de geração. A medição vale para o motor " +
      "DEFAULT do fornecedor (avatar_iv, que é o que sai quando `engine` não é enviado — e nenhuma " +
      "geração nossa enviou). Para avatar_iii e avatar_v a tarifação é NÃO MEDIDA: nenhum vídeo " +
      "saiu por eles, e o fornecedor não declara preço por motor em nenhuma resposta.",
  },
  {
    vendor: "heygen",
    path: "/v2/user/remaining_quota",
    method: "GET",
    billable: false,
    note: "leitura de cota; usada pelo teste de credencial. SUNSET declarado para 2026-10-31.",
  },
  // ---------------------------------------------------------------- D-ID
  {
    vendor: "did",
    path: "/images",
    method: "POST",
    billable: true,
    note: "upload da imagem que É o avatar na D-ID; custo NÃO medido.",
  },
  {
    vendor: "did",
    path: "/audios",
    method: "POST",
    billable: true,
    note: "upload de áudio; custo NÃO medido.",
  },
  {
    vendor: "did",
    path: "/talks",
    method: "POST",
    billable: true,
    note: "geração na D-ID; custo NÃO medido — nenhuma resposta real observada.",
  },
  {
    vendor: "did",
    path: "/credits",
    method: "GET",
    billable: false,
    note: "leitura de saldo; usada pelo teste de credencial.",
  },
  // ------------------------------------------------------------ ElevenLabs
  {
    vendor: "elevenlabs",
    path: "/v1/voices/add",
    method: "POST",
    billable: true,
    note: "clonagem de voz; consome um slot de voz da conta. Custo NÃO medido.",
  },
  {
    vendor: "elevenlabs",
    path: "/v1/text-to-speech",
    method: "POST",
    billable: true,
    note:
      "síntese. Cobre os dois caminhos (`/with-timestamps` e o simples): o segundo é FALLBACK " +
      "condicional, não duplicação — MEDIDO, uma chamada no caminho feliz. Custo NÃO medido.",
  },
  {
    vendor: "elevenlabs",
    path: "/v1/voices",
    method: "GET",
    billable: false,
    note: "lista de vozes; usada pelo teste de credencial em vez do endpoint de cota, que exige user_read.",
  },
  {
    vendor: "elevenlabs",
    path: "/v1/user/subscription",
    method: "GET",
    billable: false,
    note:
      "leitura de consumo (character_count / character_limit). NÃO tarifado. Exige a permissão " +
      "`user_read`, que a chave em uso NÃO tem — ver o procedimento no CLAUDE.md.",
  },
  // ------------------------------------------------------------------- fal.ai
  //
  // Alcançados por `providers/falClient.ts`. Entram no catálogo ANTES de
  // existir chamador — é o freio: `assertFalEndpointNoCatalogo()` recusa todo
  // endpoint que não esteja aqui, e recusa antes do `fetch`.
  //
  // ⚠️ Os três ids de modelo são NÃO VERIFICADOS: vieram por escrito do
  // operador e nenhuma chamada real da fal.ai saiu deste projeto — o
  // repositório não tem uma linha sobre as gerações que ele aprovou lá. Um id
  // errado aqui vira 404 no fornecedor, não cobrança; o que ele NÃO pode virar
  // é endpoint fora do catálogo, e por isso a lista existe antes do uso.
  {
    vendor: "fal",
    path: "/storage/upload/initiate",
    method: "POST",
    // Guardar arquivo não é trabalho tarifado em nenhuma tabela lida, mas vale
    // a mesma doutrina do `/v3/assets` da HeyGen: ele só existe como insumo de
    // geração, e tratá-lo como tarifável custa um endpoint a menos para o probe
    // de validação usar como "inofensivo". Custo NÃO medido.
    billable: true,
    note: "upload de insumo (rest.fal.ai); dois passos, initiate + PUT no CDN. Custo NÃO medido.",
  },
  {
    vendor: "fal",
    path: "/fal-ai/nano-banana-2/edit",
    method: "POST",
    billable: true,
    note:
      "edição de imagem — a camada APARÊNCIA (rosto + traje + cenário → imagem-base, uma vez por " +
      "look). Preço DECLARADO na auditoria de 11/08 como imagem-base 0,03–0,24 por imagem, " +
      "reutilizável; NÃO MEDIDO por este projeto.",
  },
  {
    vendor: "fal",
    // SEM prefixo `fal-ai/` — MEDIDO por fusível em 14/08 (ENDPOINTS-3). Wan
    // 2.6 é Partner e mora direto em `wan/`; ver o comentário de
    // `ENDPOINT_ANIMAR` em falPipeline.ts para a causa raiz dos dois 404
    // anteriores.
    path: "/wan/v2.6/image-to-video/flash",
    method: "POST",
    billable: true,
    note:
      "animação a partir de imagem — a camada ANIMAÇÃO. Tarifação por segundo gerado, e a régua " +
      "única de 3 unidades/s do providerCost.ts NÃO vale aqui: as três medições que a sustentam " +
      "são todas de photo avatar 720p na HeyGen. Preço DOCUMENTADO (não medido) em PRECOS_FAL.",
  },
  {
    vendor: "fal",
    path: "/fal-ai/sync-lipsync/v2",
    method: "POST",
    billable: true,
    note:
      "sincronia labial sobre vídeo + áudio já existentes. É o passo que preserva a VOZ como " +
      "entrada, e por isso a duração do resultado é a do áudio — custo exato antes de gerar. " +
      "NÃO MEDIDO.",
  },
  // ------------------------------------------------------- TEXTO (bloco 5D-1)
  // Alcançados por `complete()` em providerRegistry.ts, que atende TRÊS
  // caminhos: geração de roteiro (passo 2 do wizard), copiloto do tenant e
  // copiloto público/admin. Antes deste bloco, nenhum deles passava por
  // `isFixtureMode()` nem aparecia em trava alguma.
  {
    vendor: "anthropic",
    path: "/v1/messages",
    method: "POST",
    billable: true,
    note: "geração de texto; cobrada por token. Custo NÃO medido neste projeto.",
  },
  {
    vendor: "gemini",
    path: ":generateContent",
    method: "POST",
    // Tarifável mesmo no free tier, e é justamente ali que dói: a cota é de
    // ~20 requisições/dia POR PROJETO, compartilhada com o copiloto. Gastar
    // não tira dinheiro, tira a capacidade de demonstrar — e já custou a
    // criação de um segundo projeto Google quando o teto foi batido.
    billable: true,
    note: "geração de texto. Free tier: ~20 req/dia por projeto, COMPARTILHADA com o copiloto.",
  },
  {
    vendor: "gemini",
    path: "/v1beta/models",
    method: "GET",
    billable: false,
    note: "ListModels; valida a chave SEM consumir a cota de generateContent. É o que o painel usa.",
  },
  {
    vendor: "openai",
    path: "/chat/completions",
    method: "POST",
    billable: true,
    note: "geração de texto; cobrada por token. Nenhuma chave OpenAI foi usada neste projeto até hoje.",
  },
];

/** Caminhos que NENHUM probe de validação pode alcançar. Derivado, não escrito. */
export function billableEndpointPaths(): string[] {
  return VENDOR_ENDPOINTS.filter((e) => e.billable).map((e) => e.path);
}

/** Uma URL alcança algum endpoint tarifável? */
export function reachesBillableEndpoint(url: string): string | null {
  return billableEndpointPaths().find((p) => url.includes(p)) ?? null;
}
