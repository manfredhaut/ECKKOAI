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
  /** Fornecedor, no vocabulário de vendorCatalog.ts. */
  vendor: "heygen" | "did" | "elevenlabs";
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
    note: "MEDIDO: US$ 0,15 por 3,372 s (LIVE-1). Caminho de geração.",
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
];

/** Caminhos que NENHUM probe de validação pode alcançar. Derivado, não escrito. */
export function billableEndpointPaths(): string[] {
  return VENDOR_ENDPOINTS.filter((e) => e.billable).map((e) => e.path);
}

/** Uma URL alcança algum endpoint tarifável? */
export function reachesBillableEndpoint(url: string): string | null {
  return billableEndpointPaths().find((p) => url.includes(p)) ?? null;
}
