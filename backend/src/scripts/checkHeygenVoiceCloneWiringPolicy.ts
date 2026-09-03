/**
 * A MESMA GRAVAÇÃO clona TAMBÉM na HeyGen — B6, BLOCO HEYGEN-SIMPLES-1
 * (02/09/2026, migration 076).
 *
 * ┌─ O desenho, e por que ele precisa ficar assim ────────────────────────────┐
 * │ `avatars.voice_id` sempre guardou o id ElevenLabs — o único vendor de     │
 * │ voz que o produto tinha. O nível Simples exige voz clonada DIRETO na      │
 * │ HeyGen, e um MESMO avatar pode ser usado tanto no Simples quanto no       │
 * │ Normal/Premium — por isso `heygen_voice_id` é uma coluna PARALELA         │
 * │ (migration 076), nunca uma substituição.                                  │
 * │                                                                            │
 * │ A clonagem HeyGen é BEST-EFFORT, de propósito: o slot ElevenLabs já foi   │
 * │ consumido e a resposta principal (voice_id) já é válida por si só — um    │
 * │ avatar continua funcionando no Normal/Premium mesmo se a HeyGen recusar   │
 * │ ou estiver fora do ar. Uma falha aqui NUNCA pode derrubar a resposta      │
 * │ 201 da clonagem ElevenLabs que já aconteceu e já foi paga.                │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  a credencial HeyGen é resolvida por `getCredentialForVendor(req.
 *       tenantId, "avatar", "heygen")` — nunca um vendor fixo nem o
 *       genérico `getCredential`, mesma regra já usada para treino/preview.
 *  G-2  a clonagem HeyGen só é TENTADA quando essa credencial existe —
 *       sem ela, pula em silêncio (comportamento de hoje, tenant sem
 *       HeyGen conectada).
 *  G-3  a chamada está dentro de um `try/catch` que NÃO relança — uma
 *       falha da HeyGen vira log, nunca um 5xx sobre uma clonagem
 *       ElevenLabs que já teve sucesso e já consumiu o slot.
 *  G-4  `heygen_voice_id` só é gravado no UPDATE quando a clonagem teve
 *       sucesso (dentro do bloco que atribui `heygenVoiceId`), nunca
 *       incondicionalmente.
 *  G-5  a coluna existe na migration 076.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTA_VOICE = "backend/src/routes/voice.ts";
const MIGRATION_076 = "backend/src/db/migrations/076_heygen_voice_id.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "clonagem HeyGen resolve a credencial por getCredentialForVendor(avatar, heygen), nunca um vendor fixo",
    name: "a clonagem HeyGen passa a usar getCredential genérico",
    kind: "esperto",
    // ESPERTO: a rota continua compilando, continua tentando clonar — só
    // que a credencial pode vir de QUALQUER vendor default do tenant. Um
    // tenant fal-default (como dev-c77a5b) mandaria a chave da fal para a
    // HeyGen — 401 calado, mesmo defeito já medido em
    // checkAvatarTrainingVendorPolicy.ts, por outra rota.
    file: ROTA_VOICE,
    find: '  const heygenCredential = await getCredentialForVendor(req.tenantId, "avatar", "heygen");',
    replace: '  const heygenCredential = await getCredential(req.tenantId, "avatar");',
    expect: "getCredentialForVendor",
  },
  {
    guard: "clonagem HeyGen é BEST-EFFORT: uma falha vira log, nunca derruba a resposta da clonagem ElevenLabs",
    name: "a falha da clonagem HeyGen passa a propagar e derrubar a resposta 201",
    kind: "esperto",
    // ESPERTO: o `try` continua existindo — só o `catch` deixa de capturar
    // e volta a relançar. Uma HeyGen fora do ar (ou uma credencial
    // inválida) faria a rota inteira responder 5xx sobre uma clonagem
    // ElevenLabs que JÁ teve sucesso e JÁ consumiu o slot pago — o mesmo
    // padrão de erro já documentado no bloco 6b logo acima na rota
    // (amostra não amarrada à voz).
    file: ROTA_VOICE,
    find:
      "            detail: err instanceof Error ? err.message : String(err),\n" +
      "          });\n" +
      "        }",
    replace:
      "            detail: err instanceof Error ? err.message : String(err),\n" +
      "          });\n" +
      "          throw err;\n" +
      "        }",
    expect: "não é mais capturada (best-effort)",
  },
  {
    guard: "heygen_voice_id só é gravado quando a clonagem HeyGen teve sucesso",
    name: "heygen_voice_id passa a ser gravado incondicionalmente",
    kind: "esperto",
    // ESPERTO: o UPDATE continua existindo — só a CONDIÇÃO de entrada
    // muda. Sem credencial HeyGen (o caminho de todo tenant que não
    // conectou a chave ainda), `heygenVoiceId` continua `null`, e um
    // UPDATE incondicional gravaria NULL por cima de um valor que talvez
    // já existisse de uma clonagem anterior — perdendo a voz HeyGen já
    // clonada sem que o fornecedor tenha sido consultado de novo.
    file: ROTA_VOICE,
    find: "      if (heygenVoiceId && updated[0]) updated[0].heygen_voice_id = heygenVoiceId;",
    replace: "      if (updated[0]) updated[0].heygen_voice_id = heygenVoiceId;",
    expect: "não é mais gravado condicionalmente",
  },
];

export interface HeygenVoiceCloneWiringCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkHeygenVoiceCloneWiringPolicy(repoRoot: string): HeygenVoiceCloneWiringCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const rota = lerDaRaiz(repoRoot, ROTA_VOICE);

  // ---------------------------------------------------------------------------
  // Recorte por FORMA: o bloco "6c" inteiro, entre a âncora do comentário e
  // o UPDATE de voice_id principal (que vem ANTES, já existia) até a seção
  // "7. prévia audível" (que vem depois).
  // ---------------------------------------------------------------------------
  const inicio = rota.indexOf("6c. a MESMA gravação, clonada TAMBÉM na HeyGen");
  const fim = rota.indexOf("7. prévia audível", inicio);
  if (inicio < 0 || fim < 0) {
    failures.push(
      `heygen-voice-clone-wiring: não foi possível recortar o bloco de clonagem HeyGen em ${ROTA_VOICE} ` +
        "pelas âncoras do comentário 6c e da seção 7. A guarda não pode opinar sobre um trecho que não encontrou.",
    );
  } else {
    const corpo = rota.slice(inicio, fim);

    if (!corpo.includes('getCredentialForVendor(req.tenantId, "avatar", "heygen")')) {
      failures.push(
        `heygen-voice-clone-wiring: getCredentialForVendor não achado no bloco de clonagem HeyGen em ${ROTA_VOICE}.`,
      );
    }
    if (!/if\s*\(heygenCredential\)\s*\{/.test(corpo)) {
      failures.push(
        "heygen-voice-clone-wiring: a clonagem HeyGen não está condicionada a `if (heygenCredential)` em " +
          `${ROTA_VOICE} — sem credencial, a tentativa deveria pular em silêncio, não falhar tentando.`,
      );
    }
    // G-3 é sobre AUSÊNCIA de relance: o catch precisa terminar em log, nunca
    // em `throw`. Recorte o bloco catch específico (do `catch (err) {` até o
    // seu próprio fechamento) e procure `throw` dentro dele — não no arquivo
    // inteiro, que tem outros catches legítimos que relançam.
    const catchInicio = corpo.indexOf("} catch (err) {");
    const catchFim = catchInicio >= 0 ? corpo.indexOf("\n        }", catchInicio) : -1;
    if (catchInicio < 0 || catchFim < 0) {
      failures.push(
        `heygen-voice-clone-wiring: não achei o bloco \`catch (err) { ... }\` da clonagem HeyGen em ` +
          `${ROTA_VOICE} — a guarda não pode confirmar que ele é best-effort.`,
      );
    } else if (/throw\b/.test(corpo.slice(catchInicio, catchFim))) {
      failures.push(
        `heygen-voice-clone-wiring: a falha da clonagem HeyGen não é mais capturada (best-effort) em ` +
          `${ROTA_VOICE} — o catch agora relança (\`throw\`), e uma HeyGen fora do ar derrubaria a ` +
          "resposta de uma clonagem ElevenLabs que já teve sucesso e já consumiu o slot pago.",
      );
    }
    if (!corpo.includes("if (heygenVoiceId && updated[0]) updated[0].heygen_voice_id = heygenVoiceId;")) {
      failures.push(
        `heygen-voice-clone-wiring: heygen_voice_id não é mais gravado condicionalmente ao sucesso da ` +
          `clonagem em ${ROTA_VOICE}.`,
      );
    }
    if (failures.length === 0) {
      notes.push(
        "    heygen-voice-clone-wiring: POST /avatars/:id/voice-sample clona TAMBÉM na HeyGen quando há " +
          "credencial (getCredentialForVendor avatar/heygen), best-effort (falha não derruba a resposta " +
          "ElevenLabs), e grava heygen_voice_id só em sucesso",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-5 — a coluna existe.
  // ---------------------------------------------------------------------------
  try {
    const migration = lerDaRaiz(repoRoot, MIGRATION_076);
    if (!/ADD COLUMN\s+heygen_voice_id\s+text/i.test(migration)) {
      failures.push(
        `heygen-voice-clone-wiring: ${MIGRATION_076} não declara \`heygen_voice_id text\` — a coluna que a ` +
          "rota grava não existiria no banco.",
      );
    } else {
      notes.push("    heygen-voice-clone-wiring: migration 076 declara avatars.heygen_voice_id");
    }
  } catch {
    failures.push(`heygen-voice-clone-wiring: não consegui ler ${MIGRATION_076}.`);
  }

  return { failures, notes };
}
