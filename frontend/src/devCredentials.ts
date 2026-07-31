/**
 * Credenciais de desenvolvimento para preencher os formulários de login.
 *
 * Existe por um motivo prático: são duas zonas (admin e tenant), o rate
 * limiter deixa 5 tentativas por 15 minutos, e digitar senha errada uma vez
 * já custava a janela inteira — com o sintoma aparecendo como "senha
 * errada", que é o diagnóstico mais enganoso possível.
 *
 * Três regras que este arquivo existe para manter:
 *
 * 1. Nenhum valor literal aqui. Tudo entra por `define` do Vite
 *    (vite.config.ts), lido do ambiente, que vem do .env — fora do git.
 * 2. Falha fechado: sem a flag explícita `DEV_AUTOFILL=1`, e em qualquer
 *    build de produção, as constantes chegam vazias e `devAutofill` é
 *    falso. O caminho de erro é "não preenche", nunca "vaza".
 * 3. `npm run check` reprova o build se a flag estiver ligada com
 *    NODE_ENV=production, ou se qualquer senha reaparecer no fonte.
 *
 * A fonte da verdade das contas continua sendo DEV-ACCESS.local.md, e quem
 * as cria no banco é `npm run dev:seed-access` — os mesmos valores.
 */
declare const __DEV_AUTOFILL__: boolean;
declare const __DEV_ADMIN_EMAIL__: string;
declare const __DEV_ADMIN_PASSWORD__: string;
declare const __DEV_TENANT_EMAIL__: string;
declare const __DEV_TENANT_PASSWORD__: string;

export const DEV_AUTOFILL = __DEV_AUTOFILL__;

export interface DevCredential {
  email: string;
  password: string;
}

/**
 * Só devolve algo quando o autofill está ligado E os dois campos vieram
 * preenchidos. Meio preenchido é pior que vazio: o formulário pareceria
 * pronto e falharia na submissão, gastando tentativa do limiter.
 */
function credential(email: string, password: string): DevCredential | null {
  if (!DEV_AUTOFILL || !email || !password) return null;
  return { email, password };
}

export const devAdminCredential = credential(__DEV_ADMIN_EMAIL__, __DEV_ADMIN_PASSWORD__);
export const devTenantCredential = credential(__DEV_TENANT_EMAIL__, __DEV_TENANT_PASSWORD__);
