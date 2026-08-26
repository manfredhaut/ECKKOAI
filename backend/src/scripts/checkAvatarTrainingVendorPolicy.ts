/**
 * TREINO DE AVATAR RESOLVE CREDENCIAL SÓ ENTRE QUEM TREINA — 26/08.
 *
 * ┌─ O defeito real, com dinheiro em jogo ────────────────────────────────────┐
 * │ `POST /avatars/:id/reference-video` resolvia a credencial com            │
 * │ `getCredential(req.tenantId, "avatar")` — a linha `is_default=true` do    │
 * │ tenant para `provider='avatar'`, seja qual for o vendor. Para o tenant    │
 * │ `dev-c77a5b`, essa linha é `vendor='fal'` (guardada só para o pipeline    │
 * │ de ANIMAÇÃO — `fal` nunca teve ramo de treino). `trainAvatar()`           │
 * │ (avatarProvider.ts) despacha por um ternário que só conhece "did" como   │
 * │ caso especial; "fal" caiu no `else` e foi para `trainAvatarHeygen`, que   │
 * │ mandou a CHAVE DA FAL para `api.heygen.com` num cabeçalho `x-api-key`.    │
 * │ MEDIDO em live: 401 do fornecedor, `vendor_error kind="auth"` — a chave   │
 * │ era real, só era do fornecedor errado.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  a rota NÃO chama `getCredential(req.tenantId, "avatar")` — o
 *       genérico, por `is_default` — para resolver a credencial de TREINO.
 *  G-2  a rota resolve por `getCredentialForVendor`, iterando
 *       `VENDORS_WITH_TRAINING_PATH.avatar` — nunca um vendor fixo, para não
 *       perder D-ID se um dia a HeyGen não tiver credencial e D-ID tiver.
 *  G-3  `VENDORS_WITH_TRAINING_PATH.avatar` é exatamente `["heygen", "did"]`
 *       — nem vazio (ninguém treinaria nunca), nem com `fal` de volta (é
 *       exatamente essa lista sendo "quem não tem ramo de treino" que o
 *       defeito violou).
 *
 * Prova o cenário do relato: um tenant com `fal` como `is_default` de
 * `provider=avatar` (como o dev-c77a5b estava) preserva o direito de treinar
 * — a rota NUNCA olha `is_default` para decidir quem treina, só pergunta
 * "há credencial de heygen? Senão, há de did?". Nunca fal.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTA_AVATARS = "backend/src/routes/avatars.ts";
const VENDOR_CATALOG = "backend/src/services/providers/vendorCatalog.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "treino de avatar resolve credencial só entre quem treina (heygen/did), nunca pelo is_default genérico",
    name: "a rota de treino volta a resolver credencial pelo is_default genérico de provider=avatar",
    kind: "esperto",
    // ESPERTO: a rota continua compilando, continua pedindo uma credencial,
    // continua treinando quando o tenant só tem heygen configurado — o
    // defeito só aparece com um tenant que tem `fal` como is_default de
    // avatar (como o dev-c77a5b), e nesse caso manda a chave errada para a
    // HeyGen, com 401 do fornecedor e dinheiro em jogo.
    file: ROTA_AVATARS,
    find:
      "    let avatarCredential: ResolvedCredential | null = null;\n" +
      "    for (const vendorDeTreino of VENDORS_WITH_TRAINING_PATH.avatar) {\n" +
      "      avatarCredential = await getCredentialForVendor(req.tenantId, \"avatar\", vendorDeTreino);\n" +
      "      if (avatarCredential) break;\n" +
      "    }\n",
    replace: "    const avatarCredential = await getCredential(req.tenantId, \"avatar\");\n",
    expect: "avatar-training-vendor: a rota volta a resolver a credencial de treino pelo is_default genérico",
  },
];

export interface AvatarTrainingVendorCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkAvatarTrainingVendorPolicy(repoRoot: string): AvatarTrainingVendorCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const rota = lerDaRaiz(repoRoot, ROTA_AVATARS);

  // ---------------------------------------------------------------------------
  // Recorte por FORMA: o corpo do handler de reference-video, entre a rota e
  // o fim natural do handler (a rota GET de download, que vem antes dela no
  // arquivo, não serve de âncora — usa-se o INSERT em avatar_trainings, que
  // só existe UMA vez no arquivo inteiro, logo depois do trecho que importa).
  // ---------------------------------------------------------------------------
  const inicio = rota.indexOf('"/avatars/:id/reference-video",');
  const fim = rota.indexOf("INSERT INTO avatar_trainings", inicio);
  if (inicio < 0 || fim < 0) {
    failures.push(
      `avatar-training-vendor: não foi possível recortar o handler de reference-video em ${ROTA_AVATARS} ` +
        "pelas âncoras `\"/avatars/:id/reference-video\",` e `INSERT INTO avatar_trainings`. A guarda não " +
        "pode opinar sobre um trecho que não encontrou.",
    );
  } else {
    const corpo = rota.slice(inicio, fim);

    // G-1 — NUNCA getCredential genérico (bare) para decidir quem treina.
    if (/getCredential\(req\.tenantId, "avatar"\)/.test(corpo)) {
      failures.push(
        "avatar-training-vendor: a rota volta a resolver a credencial de treino pelo is_default genérico " +
          `— achei \`getCredential(req.tenantId, "avatar")\` dentro do handler de reference-video em ` +
          `${ROTA_AVATARS}. Um tenant com \`fal\` como is_default de provider=avatar (como o dev-c77a5b) ` +
          "voltaria a mandar a chave da fal para a HeyGen, com 401 do fornecedor e dinheiro em jogo.",
      );
    }

    // G-2 — resolve por getCredentialForVendor, iterando a lista de quem treina.
    if (!corpo.includes("getCredentialForVendor(req.tenantId, \"avatar\", vendorDeTreino)")) {
      failures.push(
        "avatar-training-vendor: a rota não resolve mais a credencial de treino por " +
          `\`getCredentialForVendor(req.tenantId, "avatar", vendorDeTreino)\` em ${ROTA_AVATARS}. Sem a ` +
          "iteração sobre os vendors que treinam, um tenant só com D-ID configurado (sem HeyGen) perderia " +
          "o treino mesmo tendo credencial válida para o vendor certo.",
      );
    }
    if (!corpo.includes("VENDORS_WITH_TRAINING_PATH.avatar")) {
      failures.push(
        `avatar-training-vendor: a rota não itera mais \`VENDORS_WITH_TRAINING_PATH.avatar\` em ` +
          `${ROTA_AVATARS} — sem essa lista como fonte, a escolha de quem treina volta a ser um vendor fixo ` +
          "ou o is_default genérico, reabrindo o mesmo buraco.",
      );
    }
    if (failures.length === 0) {
      notes.push(
        "    avatar-training-vendor: POST /avatars/:id/reference-video resolve a credencial de treino só " +
          "entre heygen/did, nunca pelo is_default genérico de provider=avatar",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-3 — VENDORS_WITH_TRAINING_PATH.avatar é exatamente ["heygen", "did"].
  // ---------------------------------------------------------------------------
  const catalogo = lerDaRaiz(repoRoot, VENDOR_CATALOG);
  if (!/VENDORS_WITH_TRAINING_PATH[\s\S]{0,80}avatar:\s*\["heygen", "did"\]/.test(catalogo)) {
    failures.push(
      `avatar-training-vendor: \`VENDORS_WITH_TRAINING_PATH.avatar\` não é mais exatamente ` +
        `["heygen", "did"] em ${VENDOR_CATALOG}. Incluir "fal" reabre o defeito original (chave da fal ` +
        "mandada para a HeyGen); esvaziar a lista impede qualquer treino, mesmo com credencial válida.",
    );
  } else {
    notes.push('    avatar-training-vendor: VENDORS_WITH_TRAINING_PATH.avatar é exatamente ["heygen", "did"]');
  }

  return { failures, notes };
}
