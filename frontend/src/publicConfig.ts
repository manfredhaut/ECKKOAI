// Build-time values injected by vite.config.ts `define`, sourced from the
// same env vars the backend reads — never hardcoded here or anywhere else.
declare const __BASE_DOMAIN__: string;
declare const __WHATSAPP_NUMBER__: string;

export const BASE_DOMAIN = __BASE_DOMAIN__;
export const WHATSAPP_NUMBER = __WHATSAPP_NUMBER__;

// True on the root domain (twinai.localhost) — the public marketing site.
// False on any tenant subdomain (acme.twinai.localhost) — the app itself.
export function isRootDomain(hostname: string = window.location.hostname): boolean {
  return hostname === BASE_DOMAIN;
}
