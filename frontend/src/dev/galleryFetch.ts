/**
 * Rede falsa da galeria de passos.
 *
 * A galeria monta os componentes REAIS, e esses componentes chamam a API
 * por dentro (`api.get("/avatars")`, `api.post("/videos")`, …). Sem
 * interceptação, abrir a galeria criaria avatar, debitaria crédito e — em
 * modo live — chamaria fornecedor. A galeria precisa desenhar, não
 * executar.
 *
 * Por que interceptar `window.fetch` em vez de injetar um cliente falso por
 * props: injetar exigiria mudar a assinatura dos cinco passos só para
 * poder olhá-los, e um componente que precisa ser adaptado para caber na
 * galeria deixa de ser o componente que roda em produção. O objetivo é o
 * contrário — se o passo mudar, a galeria muda junto.
 *
 * O interceptor NÃO tem caminho de escape: qualquer requisição que não
 * case com uma resposta conhecida é **bloqueada** e contabilizada, nunca
 * repassada adiante. É isso que permite afirmar "a galeria não fez nenhuma
 * chamada" com um número em vez de uma promessa.
 */
import type { Avatar, Video } from "../types";

export interface InterceptStats {
  /** Requisições atendidas com dado falso. */
  served: number;
  /** Requisições sem resposta conhecida — bloqueadas, não repassadas. */
  blocked: number;
  /** Nenhuma requisição jamais sai daqui; existe para o relatório ser verificável. */
  escaped: number;
  log: { method: string; url: string; outcome: "served" | "blocked" }[];
}

export const interceptStats: InterceptStats = { served: 0, blocked: 0, escaped: 0, log: [] };

const FAKE_AVATAR: Avatar = {
  id: "gallery-avatar-1",
  name: "Mário (exemplo)",
  provider: "heygen",
  photo_urls: [],
  reference_video_url: "/uploads/exemplo/referencia.mp4",
  voice_id: "gallery-voice-1",
  // `null` — a galeria exercita o caminho ElevenLabs (sem voz HeyGen), o
  // mesmo estado de todo avatar hoje sem credencial HeyGen conectada.
  heygen_voice_id: null,
  provider_avatar_id: "gallery-provider-avatar-1",
  provider_status: "ready",
  audio_treatment_enabled: true,
  audio_treatment_target_lufs: "-16",
  // Os quatro ajustes de síntese — migration 067. Como STRING nos três
  // `numeric`, que é como o servidor os entrega: a galeria existe para
  // exercitar a tela com a forma REAL da resposta, e um number aqui esconderia
  // exatamente o caso que obriga o `Number()` do outro lado.
  voice_stability: "0.5",
  voice_similarity_boost: "0.75",
  voice_style: "0.0",
  voice_speaker_boost: true,
  // Os quatro ajustes HeyGen — migration 077, B6. Defaults do fornecedor
  // (mesmos da coluna): a galeria não exercita o caminho HeyGen aqui
  // (heygen_voice_id é null acima), então estes valores nunca aparecem na tela.
  heygen_voice_speed: "1",
  heygen_voice_pitch: "0",
  heygen_voice_volume: "1",
  heygen_voice_locale: null,
  // Cenário/traje padrão — migration 068. `null` nos quatro: a galeria já
  // exercita o caminho preenchido via `FILLED_DEFAULTS` (estado do wizard),
  // e um avatar de exemplo SEM padrão persistido é o estado mais comum hoje
  // (nenhum avatar real passou pelo "Concluir configuração" novo ainda).
  scenario: null,
  scenario_prompt: null,
  outfit: null,
  outfit_prompt: null,
  simulated: true,
  created_at: new Date().toISOString(),
};

const FAKE_VIDEOS: Video[] = [
  {
    id: "gallery-video-1",
    avatar_id: FAKE_AVATAR.id,
    script: "Roteiro de exemplo para a galeria de passos.",
    scenario: null,
    outfit: null,
    scenario_prompt: null,
    outfit_prompt: null,
    duration_seconds: 36,
    // MEDIDA pelo fornecedor, e é ela que o player mostra. O número é o do
    // vídeo pago de 05/08 (36,9876 s), onde o nosso ffprobe dava 37,000000 —
    // a galeria expõe justamente o caso em que as duas réguas discordam.
    delivered_seconds: 36.9876,
    delivered_source: "vendor_response",
    estimated_seconds: 36.9876,
    status: "ready",
    output_url: "/uploads/exemplo/video.mp4",
    error_message: null,
    // 9:16, e não 16:9: a galeria existe para expor o que a tela faz, e um
    // vídeo horizontal desenharia certo mesmo se o player ignorasse a
    // proporção. O vertical é o caso que falha visivelmente quando ela é
    // esquecida.
    aspect_ratio: "9:16",
    simulated: true,
    created_at: new Date().toISOString(),
  },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Respostas conhecidas, por método + caminho. */
function respond(method: string, path: string): Response | null {
  if (method === "GET" && path.endsWith("/avatars")) return json([FAKE_AVATAR]);
  if (method === "GET" && path.endsWith("/videos")) return json(FAKE_VIDEOS);
  if (method === "GET" && path.includes("/feature-flags")) {
    return json({ flags: currentFlags, providerMode: "fixture" });
  }
  if (method === "GET" && path.includes("/notifications")) return json({ unread: 0, items: [] });
  if (method === "GET" && path.includes("/jobs")) return json([]);
  if (method === "GET" && path.includes("/documents")) return json([]);
  if (method === "GET" && path.includes("/reference-images")) return json([]);
  // Admin: a galeria monta o painel real, então precisa responder o que ele
  // pede. Nada disso toca o servidor.
  if (method === "GET" && path.includes("/admin/me")) {
    return json({ id: "gallery-admin", email: "admin@exemplo", name: "Admin (galeria)" });
  }
  if (method === "GET" && path.endsWith("/admin/tenants")) {
    // Shape de AdminTenantSummary (camelCase) — a primeira versão deste
    // mock usava snake_case e derrubava o painel com "reading 'length'".
    return json([
      {
        id: "t1",
        name: "Acme",
        slug: "acme",
        planId: "free",
        status: "active",
        createdAt: new Date().toISOString(),
        connectedProviders: ["avatar", "voice"],
      },
    ]);
  }
  if (method === "GET" && path.includes("/admin/feature-flags")) {
    return json({ flags: currentFlags, providerMode: "fixture" });
  }
  if (method === "GET" && path.includes("/credit-usage")) {
    return json({
      real: [{ creditType: "script", consumed: 3, entries: 3 }, { creditType: "video", consumed: 1, entries: 1 }],
      simulated: [{ creditType: "video", consumed: 3, entries: 3 }],
      providerMode: "fixture",
    });
  }
  if (method === "GET" && path.includes("/admin/plans")) return json([]);

  if (method === "GET" && path.includes("/auth/me")) {
    return json({ user: { id: "gallery-user", email: "galeria@exemplo" }, tenant: { id: "t", name: "Galeria", slug: "galeria" } });
  }

  // POST /avatars — usado pelo passo 1 para entrar no modo de captura, que
  // é o que expõe o bloco de fundo virtual sem precisar de câmera.
  if (method === "POST" && path.endsWith("/avatars")) return json(FAKE_AVATAR, 201);

  // Looks do avatar. TRÊS, como o fixture do backend devolve: a galeria
  // precisa exercitar o seletor de traje HABILITADO, que é o estado que a
  // conta real não produz (ela tem um look só).
  if (method === "GET" && /\/avatars\/[^/]+\/looks$/.test(path)) {
    return json({
      looks: [
        { id: "gallery-look-1", name: "Traje atual", previewImageUrl: null },
        { id: "gallery-look-2", name: "Formal", previewImageUrl: null },
        { id: "gallery-look-3", name: "Casual", previewImageUrl: null },
      ],
      // Um traje EM PREPARO junto dos prontos: é o estado que o passo 1 mostra
      // depois de criar, e sem ele a galeria não exercitaria o andamento — nem
      // a regra de que pendente não entra no seletor.
      pendentes: [{ id: "gallery-look-4", name: "Esportivo", status: "processing" as const }],
      canChoose: true,
      simulated: true,
      // O custo MEDIDO em 06/08 na conta real, para o aviso de preço aparecer
      // na galeria com o mesmo número que a tela real mostra.
      lookCost: { units: 60, usd: 1.0 },
    });
  }

  // Custo: estimativa (antes de gerar) e medição (depois). Os dois com a
  // MESMA forma, como no backend — a galeria precisa exercitar o painel real,
  // e um formato próprio aqui esconderia justamente o caminho de renderização.
  if (method === "GET" && path.includes("/video-cost-estimate")) {
    return json({
      // 474 caracteres → 36,9876 s → 36 s cobrados → 108 unidades → US$ 1,80.
      // Os números do vídeo pago de 05/08, para a galeria exercitar o painel
      // com o caso que a régua real produziu.
      estimatedSeconds: 36.9876,
      scriptChars: 474,
      pacing: "Duração estimada a partir do roteiro, a 12,8151 caracteres por segundo, medidos em 2026-08-05.",
      confirmAboveSeconds: 60,
      // `false` porque 36,99 s ficam abaixo do teto de 60 s. O estado oposto foi
      // exercitado aqui em 05/08 com 900 caracteres (70,23 s → US$ 3,50): o
      // aviso aparece e o botão "Gerar vídeo" só habilita depois de marcado.
      requiresConfirmation: false,
      estimate: { costUsd: 1.8, costUnknownReason: null },
      actual: null,
      difference: null,
      failure: null,
      basis: "Estimativa baseada em uma única medição real (2026-08-01), em 16:9 / 720p.",
      simulated: true,
    });
  }
  if (method === "GET" && /\/videos\/[^/]+\/cost$/.test(path)) {
    return json({
      estimatedSeconds: 6.788863,
      scriptChars: 87,
      pacing: "Duração estimada a partir do roteiro, a 12,8151 caracteres por segundo, medidos em 2026-08-05.",
      confirmAboveSeconds: 60,
      requiresConfirmation: false,
      estimate: { costUsd: 0.3, costUnknownReason: null },
      actual: { seconds: 5, unitSource: "vendor_response", costUsd: 0.25, costUnknownReason: null, vendorUnits: 15 },
      // real − estimado = 0,25 − 0,30. Negativo: a estimativa errou para CIMA,
      // que é o lado esperado em roteiro curto (ver scriptDuration.ts).
      difference: { usd: -0.05, factor: 1.2 },
      failure: null,
      basis: "Estimativa baseada em uma única medição real (2026-08-01), em 16:9 / 720p.",
      simulated: true,
    });
  }

  // Suporte a formato do provedor conectado. Alternável pelo mesmo controle de
  // flags da galeria: é o único jeito de VER o passo "Publicação" no estado em
  // que o vendor não honra a proporção sem trocar a credencial do tenant no
  // banco. Esse estado é justamente o que não pode ser conferido por leitura
  // de código — é uma tela desabilitada com um motivo escrito.
  if (method === "GET" && path.includes("/video-format-support")) {
    return json(
      galleryVendorHonorsFormat
        ? {
            vendor: "heygen",
            supported: true,
            evidence: "documentation",
            reason: "POST /v3/videos documenta aspect_ratio e resolution.",
          }
        : {
            vendor: "did",
            supported: false,
            evidence: "none",
            reason:
              "Não há campo de proporção documentado em POST /talks: a geometria da D-ID sai da imagem de origem.",
          },
    );
  }

  return null;
}

/**
 * Estado das flags que a galeria devolve. Trocável em tempo de execução
 * para que o mesmo componente possa ser visto com a flag ligada e
 * desligada, sem rebuild — que é justamente a verificação que ficou cega
 * no bloco anterior.
 */
export let currentFlags: { key: string; label: string; enabled: boolean; reason: string }[] = [
  {
    key: "removable_background",
    label: "Fundo removível",
    enabled: false,
    reason: "depende de teste ainda não realizado com a HeyGen",
  },
];

export function setGalleryFlag(key: string, enabled: boolean): void {
  currentFlags = currentFlags.map((f) => (f.key === key ? { ...f, enabled } : f));
}

/** O provedor simulado honra a proporção escolhida? Ver `respond()` acima. */
export let galleryVendorHonorsFormat = true;

export function setGalleryVendorHonorsFormat(value: boolean): void {
  galleryVendorHonorsFormat = value;
}

let installed = false;

export function installGalleryFetch(): void {
  if (installed) return;
  installed = true;

  const realFetch = window.fetch.bind(window);
  // `realFetch` fica capturado mas deliberadamente NUNCA é chamado. Está
  // aqui só para deixar explícito, na leitura, que a escolha de não
  // repassar é intencional e não um esquecimento.
  void realFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    const path = url.startsWith("http") ? new URL(url).pathname : url;
    const known = respond(method, path);

    if (known) {
      interceptStats.served += 1;
      interceptStats.log.push({ method, url: path, outcome: "served" });
      return known;
    }

    interceptStats.blocked += 1;
    interceptStats.log.push({ method, url: path, outcome: "blocked" });
    // 503 em vez de deixar passar: o componente exibe seu estado de erro,
    // que também é algo que se quer poder olhar na galeria.
    return json({ error: "gallery_blocked", message: "A galeria não executa chamadas." }, 503);
  };

  // Exposto para inspeção externa (as capturas conferem estes números).
  (window as unknown as { __galleryStats: InterceptStats }).__galleryStats = interceptStats;
}
