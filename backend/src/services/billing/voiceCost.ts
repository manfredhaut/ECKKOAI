/**
 * O custo da VOZ, por caractere — MÓDULO FOLHA, sem uma única importação.
 *
 * ┌─ Por que ele não mora em `providerCost.ts`, onde deveria ────────────────┐
 * │ A doutrina desta casa é que todo número de dinheiro vive em              │
 * │ `providerCost.ts`, e ela continua valendo: aquele arquivo REEXPORTA o    │
 * │ que está aqui, e é por ele que o resto do produto lê. O que mudou é só   │
 * │ ONDE o valor é declarado, e a razão é um ciclo de importação MEDIDO em   │
 * │ 24/08.                                                                   │
 * │                                                                          │
 * │ O bloco R5 fez `avatarProvider.ts` importar `providerCost.ts` para       │
 * │ gravar o custo da síntese. Isso fechou o anel:                           │
 * │                                                                          │
 * │   providerCost → scriptDuration → voiceProvider → fixtureProvider        │
 * │                → avatarProvider → providerCost                           │
 * │                                                                          │
 * │ E `providerCost.ts` CHAMA `estimateSecondsFromChars` no topo do módulo   │
 * │ (para derivar `DEFAULT_HEYGEN_TETO_USD`), então o anel não é benigno:    │
 * │ entrando por `falPipeline`, o `VOICE_SPEED` de `voiceProvider` ainda não │
 * │ está inicializado quando aquela linha executa, e o processo morre com    │
 * │ `ReferenceError: Cannot access 'VOICE_SPEED' before initialization`.     │
 * │                                                                          │
 * │ ⚠️ **O GATE NÃO PEGA ISSO**, e é o que torna o caso instrutivo: o gate   │
 * │ entra por `checkPolicy.ts`, cuja ordem de imports carrega               │
 * │ `scriptDuration` antes e faz o anel se resolver. O defeito só aparece    │
 * │ quando a ENTRADA é `falPipeline` — medido nos dois sentidos: quebra em   │
 * │ `eeef85b` (R5) e não quebra em `1a2c273` (o commit anterior).            │
 * │                                                                          │
 * │ Um módulo sem importação nenhuma não pode participar de ciclo. É a       │
 * │ propriedade inteira deste arquivo, e é por isso que ele precisa          │
 * │ continuar sem imports — inclusive de tipos.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MEDIDO uma vez, em 05/08, no painel do fornecedor: um vídeo real sintetizou
 * 561 caracteres (87 + 474) e o painel debitou 280 créditos = **US$ 0,056** —
 * 0,5 crédito por caractere, US$ 0,0001 por caractere. Uma medição só, num
 * modelo só; QUAL modelo produziu aquela tarifa está encerrado como NÃO
 * VERIFICADO no CLAUDE.md.
 *
 * ⚠️ **NÃO é lido por `costFor`.** Voz e roteiro devolvem AUSÊNCIA na tela por
 * nunca terem sido medidos com rigor, e essa decisão continua de pé para tudo
 * que a pessoa vê. O único consumidor é a atribuição de gasto
 * (`provider_usage.estimated_cost_usd`, migration 063), que grava o que a
 * régua AFIRMAVA para poder confrontá-la com a fatura depois.
 */
export const ELEVENLABS_VOICE_COST = {
  usdPerCharacter: 0.0001,
  measuredOn: "2026-08-05",
  method: "561 caracteres sintetizados → 280 créditos → US$ 0,056 no painel do fornecedor",
} as const;

/** Ver `ELEVENLABS_VOICE_COST` — a multiplicação, para não repeti-la em call site. */
export function custoVozUsd(caracteres: number): number {
  return caracteres * ELEVENLABS_VOICE_COST.usdPerCharacter;
}
