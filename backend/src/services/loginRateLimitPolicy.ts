/**
 * Política do rate limiter de login, num arquivo só.
 *
 * O limiter existe para tornar caro um ataque de força bruta, e esse valor
 * não deve mudar em produção. Mas em desenvolvimento ele cobra um preço
 * diferente: 5 tentativas por 15 minutos, num ambiente onde a mesma pessoa
 * loga em duas zonas (admin e tenant), roda o smoke e ainda erra a senha uma
 * vez, esgota a janela e faz o sintoma parecer "senha errada" — já custou
 * tempo de sessão mais de uma vez.
 *
 * Daí a forma: o default é o valor de produção, o afrouxamento é opt-in por
 * variável de ambiente, e `isRelaxed()` existe para que `npm run check`
 * possa REPROVAR o build se alguém levar um valor folgado para produção.
 * A configuração é permitida; o descuido é que não é.
 */

export interface LoginRateLimit {
  maxAttempts: number;
  windowMs: number;
}

/** Valores de produção. Mexer aqui muda o que se considera "folgado". */
export const LOGIN_RATE_LIMIT_DEFAULTS: LoginRateLimit = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
};

export const LOGIN_RATE_LIMIT_ENV = {
  max: "LOGIN_RATE_LIMIT_MAX",
  windowMs: "LOGIN_RATE_LIMIT_WINDOW_MS",
} as const;

/**
 * Lê a configuração do ambiente, caindo no default a cada campo inválido.
 *
 * Valor não numérico, zero ou negativo cai no default em vez de virar
 * `NaN` — um limiter com `NaN` compararia sempre falso e desligaria a
 * proteção em silêncio, que é o pior resultado possível para um erro de
 * digitação numa variável de ambiente.
 */
export function readLoginRateLimit(env: NodeJS.ProcessEnv = process.env): LoginRateLimit {
  return {
    maxAttempts: positiveOrDefault(env[LOGIN_RATE_LIMIT_ENV.max], LOGIN_RATE_LIMIT_DEFAULTS.maxAttempts),
    windowMs: positiveOrDefault(env[LOGIN_RATE_LIMIT_ENV.windowMs], LOGIN_RATE_LIMIT_DEFAULTS.windowMs),
  };
}

function positiveOrDefault(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * "Folgado" é qualquer coisa mais permissiva que o default: mais tentativas
 * ou janela mais curta. Um valor MAIS restritivo que o default não é
 * folga e não deve reprovar build nenhum.
 */
export function isRelaxed(limit: LoginRateLimit): boolean {
  return (
    limit.maxAttempts > LOGIN_RATE_LIMIT_DEFAULTS.maxAttempts ||
    limit.windowMs < LOGIN_RATE_LIMIT_DEFAULTS.windowMs
  );
}

export function describeLoginRateLimit(limit: LoginRateLimit): string {
  const minutes = Math.round(limit.windowMs / 60000);
  return `${limit.maxAttempts} tentativas / ${minutes} min`;
}
