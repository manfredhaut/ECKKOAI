import type { Avatar } from "../../types.js";
import type { VoiceTuning } from "../providers/voiceProvider.js";

/**
 * OS QUATRO AJUSTES DE SÍNTESE, LIDOS DO AVATAR — 25/08.
 *
 * ┌─ Por que uma função, e não quatro campos repetidos em cada call site ────┐
 * │ São CINCO call sites de produto (um da HeyGen e quatro do fal), e três   │
 * │ dos quatro campos são `numeric`, que o driver `pg` devolve como STRING.  │
 * │ Repetir `Number(...)` cinco vezes é cinco chances de esquecer uma — e o  │
 * │ esquecimento não quebra nada: `"0.5"` vira `"0.5"` no JSON, o fornecedor │
 * │ responde 200, e o campo silenciosamente não é o número que a tela        │
 * │ mostrou. É o mesmo pior caso de sempre, aceito e ignorado em silêncio.   │
 * │                                                                          │
 * │ Sendo função pura, ela é exercitável com um avatar montado em memória —  │
 * │ sem banco, sem chave e sem rede. É a mesma razão pela qual as guardas de │
 * │ amostra vivem em `voiceSample.ts` e a escolha de look vive em            │
 * │ `lookSelection.ts`.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Os valores vêm SEMPRE do banco (migration 067), nunca de constante: um
 * default embutido aqui faria a tela oferecer quatro controles que não mudam
 * nada, e o sintoma seria "ajustei e não mudou" — indistinguível de o
 * fornecedor ter ignorado o campo.
 */
export function voiceTuningDoAvatar(
  avatar: Pick<
    Avatar,
    "voice_stability" | "voice_similarity_boost" | "voice_style" | "voice_speaker_boost"
  >,
): VoiceTuning {
  return {
    // `Number()` nos três `numeric` — ver o cabeçalho. O boolean não precisa:
    // `pg` já devolve `boolean` para a coluna booleana.
    stability: Number(avatar.voice_stability),
    similarityBoost: Number(avatar.voice_similarity_boost),
    style: Number(avatar.voice_style),
    speakerBoost: avatar.voice_speaker_boost,
  };
}
