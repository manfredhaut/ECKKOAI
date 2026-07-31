/**
 * Modo de operação dos provedores que custam dinheiro por chamada.
 *
 * `live`    — fala com HeyGen e ElevenLabs de verdade.
 * `fixture` — devolve artefatos locais, sem tocar a rede.
 *
 * Por que existe: a cota destes dois fornecedores é escassa e cara o
 * bastante para que ensaiar o fluxo custe mais que o próprio fluxo vale. Um
 * modo de simulação transforma "não posso testar" em "posso testar quantas
 * vezes quiser", que é a diferença entre um caminho exercitado e um caminho
 * que só roda na frente do cliente.
 *
 * Escopo deliberado: **só HeyGen e ElevenLabs**. Os provedores de texto
 * (roteiro, copiloto) não entram aqui — a cota deles é outra ordem de
 * grandeza e simulá-los esconderia justamente o que se quer observar.
 *
 * O padrão em desenvolvimento é `fixture`: o caminho seguro tem de ser o
 * que acontece quando ninguém configurou nada. Em produção o padrão é
 * `live`, e `npm run check` reprova o build se alguém deixar `fixture`
 * ligado com NODE_ENV=production — simular geração para um cliente pagante
 * seria uma mentira cobrada.
 */

export type ProviderMode = "fixture" | "live";

export const PROVIDER_MODE_ENV = "PROVIDER_MODE";

export function readProviderMode(env: NodeJS.ProcessEnv = process.env): ProviderMode {
  const raw = (env[PROVIDER_MODE_ENV] ?? "").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "fixture") return "fixture";

  // Sem valor explícito: seguro por padrão fora de produção, real em
  // produção. Um valor inválido cai aqui também — em vez de virar um
  // terceiro modo silencioso.
  return (env.NODE_ENV ?? "development") === "production" ? "live" : "fixture";
}

export function isFixtureMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return readProviderMode(env) === "fixture";
}

/**
 * Rótulo que acompanha qualquer artefato produzido em simulação, do banco
 * até a tela. Existe como constante para que a marca não dependa de alguém
 * lembrar de escrever a mesma frase em cada lugar.
 */
export const SIMULATED_MARKER = "simulated";
