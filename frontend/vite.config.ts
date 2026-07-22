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

export default defineConfig({
  plugins: [react()],
  define: {
    __BASE_DOMAIN__: JSON.stringify(baseDomain),
    __WHATSAPP_NUMBER__: JSON.stringify(whatsappNumber),
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
