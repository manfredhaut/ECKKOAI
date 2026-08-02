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
  provider_avatar_id: "gallery-provider-avatar-1",
  provider_status: "ready",
  audio_treatment_enabled: true,
  audio_treatment_target_lufs: "-16",
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
    duration_seconds: 30,
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

  // Custo: estimativa (antes de gerar) e medição (depois). Os dois com a
  // MESMA forma, como no backend — a galeria precisa exercitar o painel real,
  // e um formato próprio aqui esconderia justamente o caminho de renderização.
  if (method === "GET" && path.includes("/video-cost-estimate")) {
    return json({
      requestedSeconds: 30,
      estimate: { costUsd: 1.35, costUnknownReason: null },
      actual: null,
      difference: null,
      failure: null,
      basis: "Estimativa baseada em uma única medição real (2026-08-01), em 16:9 / 720p.",
      simulated: true,
    });
  }
  if (method === "GET" && /\/videos\/[^/]+\/cost$/.test(path)) {
    return json({
      requestedSeconds: 15,
      estimate: { costUsd: 0.675, costUnknownReason: null },
      actual: { seconds: 5, unitSource: "vendor_response", costUsd: 0.225, costUnknownReason: null, vendorUnits: 14 },
      difference: { usd: -0.45, factor: 3 },
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
