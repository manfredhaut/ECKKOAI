/**
 * A FICHA DE IDENTIDADE — P2-1, VERSÃO FINAL, 22/09/2026.
 *
 * Um avatar pode trocar de foto, de voz ou de ajustes de síntese DEPOIS de
 * um vídeo já ter sido gerado (P3 — ajustar avatar não pode mudar
 * silenciosamente o que "Refazer" produz num vídeo antigo). Este módulo é
 * onde as 5 rotas fal (/approve, /recompose, /approve-video, /redo-video,
 * /resume-blocks) e as 3 funções de composição (promptDaComposicaoDaLinha,
 * entradasDaComposicao, fotoDeIdentidadeDoAvatar) resolvem QUAL identidade
 * usar — nunca lendo `avatar.voice_id`/`avatar.photo_urls` direto.
 *
 * SEM BANCO, SEM REDE — todas as funções são puras, exercitáveis com
 * objetos montados em memória. A checagem de rede (a voz ainda existe?)
 * fica em `voiceProvider.ts`, chamada pela ROTA, nunca por este módulo.
 */
import type { Avatar, Video } from "../../types.js";
import { voiceTuningDoAvatar } from "../voice/voiceTuning.js";
import type { VoiceTuning } from "../providers/voiceProvider.js";
import { logEvent } from "../log/safeLog.js";

export interface IdentitySnapshotV1 {
  v: 1;
  photo_urls: unknown;
  voice_id: unknown;
  voice_tuning: {
    stability: unknown;
    similarity_boost: unknown;
    style: unknown;
    speaker_boost: unknown;
  };
  audio_treatment: {
    enabled: unknown;
    target_lufs: unknown;
  };
  captured_at: string;
}

type AvatarParaCaptura = Pick<
  Avatar,
  | "photo_urls"
  | "voice_id"
  | "voice_stability"
  | "voice_similarity_boost"
  | "voice_style"
  | "voice_speaker_boost"
  | "audio_treatment_enabled"
  | "audio_treatment_target_lufs"
>;

/**
 * A ficha, capturada do avatar NESTE INSTANTE — chamada só na criação
 * (`POST /videos`). CRUA: nenhum `Number()`/`Boolean()`/`?? 0`/`?? false`
 * aqui. O que o avatar tinha é exatamente o que a ficha guarda — a mesma
 * regra que já vale para `motion_prompt_en`/`scenario_prompt_en` (L1):
 * capturar sem converter, para a LEITURA (sempre por `voiceTuningDoAvatar`)
 * decidir o que cada valor significa, uma vez só.
 */
export function capturarIdentidade(avatar: AvatarParaCaptura): IdentitySnapshotV1 {
  return {
    v: 1,
    photo_urls: avatar.photo_urls,
    voice_id: avatar.voice_id,
    voice_tuning: {
      stability: avatar.voice_stability,
      similarity_boost: avatar.voice_similarity_boost,
      style: avatar.voice_style,
      speaker_boost: avatar.voice_speaker_boost,
    },
    audio_treatment: {
      enabled: avatar.audio_treatment_enabled,
      target_lufs: avatar.audio_treatment_target_lufs,
    },
    captured_at: new Date().toISOString(),
  };
}

/**
 * A ficha, validada — nunca confiada crua. `null` em QUALQUER formato
 * inesperado: ausente, versão desconhecida, ou forma corrompida (faltando
 * uma das 5 chaves, ou com tipo errado onde uma estrutura é exigida).
 * Quem chama trata `null` como "sem ficha" — cai no avatar ao vivo, o
 * mesmo comportamento de um vídeo anterior a esta migration.
 *
 * O LOG registra só o MOTIVO, nunca o conteúdo — a ficha pode ter um
 * `voice_id`/caminho de foto, e este módulo não é dono da decisão de
 * exibir isso em lugar nenhum.
 */
export function lerIdentidade(snapshot: unknown): IdentitySnapshotV1 | null {
  if (snapshot == null) return null;
  if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
    logEvent("warn", "identity_snapshot_invalido", { context: "video.frozenIdentity", motivo: "não é objeto" });
    return null;
  }
  const s = snapshot as Record<string, unknown>;
  if (s.v !== 1) {
    logEvent("warn", "identity_snapshot_invalido", {
      context: "video.frozenIdentity",
      motivo: `versão desconhecida (${typeof s.v})`,
    });
    return null;
  }
  const tuning = s.voice_tuning;
  const tratamento = s.audio_treatment;
  if (
    !Array.isArray(s.photo_urls) ||
    typeof tuning !== "object" || tuning === null || Array.isArray(tuning) ||
    typeof tratamento !== "object" || tratamento === null || Array.isArray(tratamento) ||
    typeof s.captured_at !== "string"
  ) {
    logEvent("warn", "identity_snapshot_invalido", { context: "video.frozenIdentity", motivo: "formato inesperado" });
    return null;
  }
  return s as unknown as IdentitySnapshotV1;
}

export interface IdentidadeResolvida {
  origem: "congelada" | "ao_vivo";
  voiceId: string;
  voiceTuning: VoiceTuning;
  photoUrls: string[];
}

/**
 * A identidade que REALMENTE compôs este vídeo, ou o avatar ao vivo quando
 * não há ficha (vídeo anterior à migration 082, ou ficha ilegível).
 *
 * REGRA DE EQUIVALÊNCIA: `voiceTuningDoAvatar` é a ÚNICA função que decide o
 * que cada valor de ajuste significa — chamada aqui com os 4 campos da
 * ficha no lugar dos do avatar, NUNCA com uma conversão própria. Por
 * construção (não por coincidência de teste), resolver a partir da ficha
 * capturada de um avatar é idêntico a usar esse avatar ao vivo.
 */
export function resolverIdentidade(
  video: Pick<Video, "identity_snapshot">,
  avatar: Pick<Avatar, "voice_id" | "photo_urls" | "voice_stability" | "voice_similarity_boost" | "voice_style" | "voice_speaker_boost">,
): IdentidadeResolvida {
  const ficha = lerIdentidade(video.identity_snapshot);
  if (!ficha) {
    return {
      origem: "ao_vivo",
      voiceId: avatar.voice_id ?? "",
      voiceTuning: voiceTuningDoAvatar(avatar),
      photoUrls: avatar.photo_urls ?? [],
    };
  }
  return {
    origem: "congelada",
    voiceId: (ficha.voice_id as string | null) ?? "",
    voiceTuning: voiceTuningDoAvatar({
      voice_stability: ficha.voice_tuning.stability,
      voice_similarity_boost: ficha.voice_tuning.similarity_boost,
      voice_style: ficha.voice_tuning.style,
      voice_speaker_boost: ficha.voice_tuning.speaker_boost,
    } as Pick<Avatar, "voice_stability" | "voice_similarity_boost" | "voice_style" | "voice_speaker_boost">),
    photoUrls: (ficha.photo_urls as string[] | null) ?? [],
  };
}

export interface DecidirVozInput {
  origem: "congelada" | "ao_vivo";
  /** Só quando `origem === "congelada"`. */
  voiceIdCongelada: string | null;
  voiceIdAtual: string;
  /** `GET /v1/voices/{id}` — `null` quando não foi necessário checar. */
  vozExiste: boolean | null;
  temAudioReutilizavel: boolean;
  /**
   * A PRÓPRIA rota já reaproveita por um motivo independente de P2-1 —
   * hoje só `/approve-video` (V33, item 2: reusar evita medir uma duração
   * DIFERENTE numa ressíntese do mesmo texto). Quando `true`, a decisão
   * nem olha `vozExiste`.
   */
  rotaJaReaproveita: boolean;
}

export type DecisaoDeVoz = "sintetizar" | "reaproveitar" | "bloquear_e_estornar";

/**
 * A decisão, pura — nenhuma chamada de rede aqui. `vozExiste` já veio
 * resolvido (ou `null`, quando não foi preciso checar) de quem chama.
 */
export function decidirVoz(input: DecidirVozInput): DecisaoDeVoz {
  if (input.rotaJaReaproveita) return "reaproveitar";
  if (input.origem === "ao_vivo") return "sintetizar";
  if (input.voiceIdCongelada === input.voiceIdAtual) return "sintetizar";
  if (input.vozExiste !== false) return "sintetizar"; // true, ou null (não verificado) — confia
  return input.temAudioReutilizavel ? "reaproveitar" : "bloquear_e_estornar";
}

/**
 * PRECISA checar se a voz congelada ainda existe? — CORREÇÃO, 22/09/2026.
 *
 * NUNCA pode olhar para "há áudio reaproveitável" — esse é exatamente o
 * engano que motivou esta correção: com áudio já existente E voz apagada,
 * pular a checagem faz `decidirVoz` receber `vozExiste: null` (não
 * verificado) e cair no ramo "confia" (`vozExiste !== false` → sintetizar),
 * tentando narrar de novo com uma voz que não existe mais — em vez de
 * reaproveitar o áudio que já estava ali, pronto.
 *
 * A pergunta desta função é só "a voz MUDOU desde que este vídeo foi
 * criado?" — se mudou, `decidirVoz` PRECISA saber se a nova ainda existe,
 * seja qual for o desfecho (sintetizar, reaproveitar ou bloquear).
 */
export function precisaChecarVozAntesDeNarrar(input: {
  origem: "congelada" | "ao_vivo";
  voiceIdCongelada: string | null;
  voiceIdAtual: string;
  rotaJaReaproveita: boolean;
}): boolean {
  return !input.rotaJaReaproveita && input.origem === "congelada" && input.voiceIdCongelada !== input.voiceIdAtual;
}
