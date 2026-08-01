import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const traefikHttpPort = Number(process.env.TRAEFIK_HTTP_PORT) || 8090;
// Single source of truth is backend/src/domainConfig.ts — this is just the
// same BASE_DOMAIN env var, read here because Vite's config can't import
// backend TS code across containers.
const baseDomain = process.env.BASE_DOMAIN ?? "twinai.localhost";
// Same idea: read once from the environment here, exposed to React via
// `define` below — see src/publicConfig.ts.
const whatsappNumber = process.env.WHATSAPP_NUMBER ?? "";
// Mesmos valores que backend/src/services/uploadLimits.ts lê, da mesma
// variável de ambiente: o docker-compose repassa aos DOIS serviços, para que
// cliente e servidor concordem por construção. O servidor continua sendo a
// autoridade; o cliente só evita subir 90 MB para receber 413 no fim.
const maxReferenceVideoBytes = Number(process.env.REFERENCE_VIDEO_MAX_BYTES) || 100 * 1024 * 1024;
const maxRecordingSeconds = Number(process.env.MAX_RECORDING_SECONDS) || 120;

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
  plugins: [react()],
  define: {
    __BASE_DOMAIN__: JSON.stringify(baseDomain),
    __WHATSAPP_NUMBER__: JSON.stringify(whatsappNumber),
    __MAX_REFERENCE_VIDEO_BYTES__: JSON.stringify(maxReferenceVideoBytes),
    __MAX_RECORDING_SECONDS__: JSON.stringify(maxRecordingSeconds),
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
  },
});
