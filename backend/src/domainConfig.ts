// Domain/DNS configuration — MOCKED until a real domain is chosen.
//
// To go live with the real domain: update BASE_DOMAIN, DNS_PROVIDER, and the
// ACME resolver fields in traefik/traefik.yml below — nothing else in the
// codebase needs to change. Every place that needs the app's domain (slug
// generation, subdomain resolution, session cookie scope, Traefik routing)
// reads from this file / the BASE_DOMAIN env var, never a hardcoded string.

// "twinai.localhost" (not "twinai.local") for local dev: modern browsers
// resolve *.localhost to 127.0.0.1 natively, with no /etc/hosts entries and
// none of ".local"'s mDNS/Bonjour special-casing (which caused inconsistent
// browser behavior when this was ".local").
export const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "twinai.localhost";

// One of: "cloudflare" | "route53" | "registro.br" (final choice pending).
// Once decided, this drives which Traefik ACME DNS-01 resolver gets enabled
// in traefik/traefik.yml (see the commented certificatesResolvers block there).
export const DNS_PROVIDER = process.env.DNS_PROVIDER ?? "pending";
