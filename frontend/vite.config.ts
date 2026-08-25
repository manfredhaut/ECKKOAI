import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Publica o carimbo de frescor da imagem em `GET /__image-stamp`.
 *
 * É o único jeito de o gate — que roda dentro do container do backend —
 * descobrir o que há DENTRO da imagem do frontend. Ele compara essa resposta
 * com o hash calculado a partir do repositório; divergiu, a imagem está velha.
 *
 * Responde em texto puro e nunca falha: se o carimbo não existir (imagem
 * construída antes desta invariante), devolve um valor que se identifica como
 * tal, para o gate distinguir "imagem antiga demais" de "imagem divergente" —
 * são causas diferentes com a mesma cara.
 */
function imageStampPlugin(): Plugin {
  return {
    name: "eckko-image-stamp",
    configureServer(server) {
      server.middlewares.use("/__image-stamp", (_req, res) => {
        let stamp: string;
        try {
          stamp = readFileSync("/app/.image-stamp", "utf8").trim();
        } catch {
          stamp = "sem-carimbo";
        }
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(stamp);
      });
    },
  };
}

const traefikHttpPort = Number(process.env.TRAEFIK_HTTP_PORT) || 8090;

// Mesmo padrão de backend/src/config.ts, adaptado: lá `required()` sempre
// lança, porque o backend não tem modo dev tolerante. Aqui só lança com
// NODE_ENV=production (fixado literal em docker-compose.prod.yml) — fora de
// produção a ausência ainda cai no default de desenvolvimento, como sempre.
//
// Existe porque a leitura de BASE_DOMAIN deixou de acontecer a cada boot do
// dev server (VITE-PROD-1/2/3: o frontend passou a ser build+nginx) e passou
// a acontecer UMA VEZ, no build da imagem. Sem isto, um build de produção
// sem BASE_DOMAIN no ambiente assaria "twinai.localhost" no bundle, sem erro
// nenhum — links e QR codes de tenant errados, com aparência normal, na
// frente de quem estiver vendo.
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(
      `vite.config.ts: ${name} é obrigatória com NODE_ENV=production e está ausente. ` +
        "Build de produção não pode cair no default de desenvolvimento em silêncio.",
    );
  }
  return value ?? "";
}

// Single source of truth is backend/src/domainConfig.ts — this is just the
// same BASE_DOMAIN env var, read here because Vite's config can't import
// backend TS code across containers.
const baseDomain = required("BASE_DOMAIN") || "twinai.localhost";
// Same idea: read once from the environment here, exposed to React via
// `define` below — see src/publicConfig.ts.
const whatsappNumber = process.env.WHATSAPP_NUMBER ?? "";
// Mesmos valores que backend/src/services/uploadLimits.ts lê, da mesma
// variável de ambiente: o docker-compose repassa aos DOIS serviços, para que
// cliente e servidor concordem por construção. O servidor continua sendo a
// autoridade; o cliente só evita subir 90 MB para receber 413 no fim.
const maxReferenceVideoBytes = Number(process.env.REFERENCE_VIDEO_MAX_BYTES) || 100 * 1024 * 1024;
const maxRecordingSeconds = Number(process.env.MAX_RECORDING_SECONDS) || 120;
const maxImageBytes = Number(process.env.IMAGE_UPLOAD_MAX_BYTES) || 25 * 1024 * 1024;

// Preenchimento automático das telas de login em desenvolvimento.
//
// Regra: os valores NUNCA aparecem no fonte — entram no bundle só por este
// `define`, lidos do ambiente (que vem do .env, fora do git). E só entram
// se a flag estiver explicitamente em "1": qualquer outro valor, incluindo
// ausência, produz credenciais vazias e o autofill some da tela.
//
// A segunda condição é a que importa: mesmo com a flag ligada por engano,
// um build de produção não pode carregar senha nenhuma. Aqui isso falha
// fechado; `npm run check` ainda reprova o build antes, para o erro
// aparecer como erro em vez de virar um silêncio conveniente.
const isProduction = process.env.NODE_ENV === "production";
const devAutofill = process.env.DEV_AUTOFILL === "1" && !isProduction;
// Galeria de passos (/dev/steps). Mesmo padrão do autofill: opt-in
// explícito e impossível em produção — lá a rota não deve existir, e "não
// existir" significa 404, não uma tela vazia.
const devGallery = process.env.DEV_GALLERY === "1" && !isProduction;
const devCred = (name: string) => (devAutofill ? (process.env[name] ?? "") : "");

export default defineConfig({
  plugins: [react(), imageStampPlugin()],
  define: {
    __BASE_DOMAIN__: JSON.stringify(baseDomain),
    __WHATSAPP_NUMBER__: JSON.stringify(whatsappNumber),
    __MAX_REFERENCE_VIDEO_BYTES__: JSON.stringify(maxReferenceVideoBytes),
    __MAX_RECORDING_SECONDS__: JSON.stringify(maxRecordingSeconds),
    __MAX_IMAGE_BYTES__: JSON.stringify(maxImageBytes),
    __DEV_AUTOFILL__: JSON.stringify(devAutofill),
    __DEV_GALLERY__: JSON.stringify(devGallery),
    __DEV_ADMIN_EMAIL__: JSON.stringify(devCred("DEV_ADMIN_EMAIL")),
    __DEV_ADMIN_PASSWORD__: JSON.stringify(devCred("DEV_ADMIN_PASSWORD")),
    __DEV_TENANT_EMAIL__: JSON.stringify(devCred("DEV_TENANT_EMAIL")),
    __DEV_TENANT_PASSWORD__: JSON.stringify(devCred("DEV_TENANT_PASSWORD")),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Vite blocks requests with an unrecognized Host header by default (DNS
    // rebinding protection) — allow the app's own domain and every tenant
    // subdomain (leading dot = wildcard).
    allowedHosts: [baseDomain, `.${baseDomain}`],
    // The app is only ever reached through Traefik on its host port,
    // so the HMR websocket client must reconnect there, not to the internal
    // container port.
    hmr: {
      clientPort: traefikHttpPort,
    },
    // Polling, não inotify. O código vem de um bind mount do Windows, e
    // eventos de sistema de arquivos do host NÃO atravessam essa fronteira:
    // o watcher do Vite fica cego para edições e segue servindo o módulo
    // que carregou na subida — 200 e errado ao mesmo tempo.
    //
    // Isto NÃO é otimização: em 23–25/08 o container passou 35 h
    // `unhealthy` (1300 sondas seguidas) servindo um GenerateStep.tsx
    // anterior a dois commits, e quatro passos de um percurso pela tela
    // foram medidos sobre código velho. `restart` conserta até a PRÓXIMA
    // edição e volta a divergir em silêncio; o polling fecha a causa.
    //
    // O custo é uma varredura a cada 300 ms — irrelevante nesta árvore, e
    // pago só em desenvolvimento: produção é build + nginx, sem watcher.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
