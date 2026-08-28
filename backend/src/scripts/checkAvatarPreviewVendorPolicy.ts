/**
 * TRÊS ROTAS DE AVATAR resolvem credencial pelo VENDOR QUE TREINOU — GET
 * /looks e GET /preview em 27/08, POST /looks (criar traje) em 28/08.
 *
 * ┌─ O defeito real, sem dinheiro em jogo nas DUAS de leitura, COM dinheiro
 * │  em jogo no POST ──────────────────────────────────────────────────────┐
 * │ As três resolviam a credencial com `getCredential(req.tenantId,          │
 * │ "avatar")` — a linha `is_default=true` do tenant para `provider=         │
 * │ 'avatar'`, seja qual for o vendor. Para um tenant com `fal` como         │
 * │ `is_default` (guardada só para o pipeline de ANIMAÇÃO — `fal` nunca teve │
 * │ ramo de avatar na HeyGen), a chamada saía com a chave da fal e voltava   │
 * │ 401 — nas DUAS DE LEITURA, tratado como "sem prévia"/"sem traje", sem    │
 * │ erro visível; no POST (criar traje, US$ 1,00), o clique falharia SEMPRE  │
 * │ para esse tenant, mesmo com a chave HeyGen certa cadastrada na           │
 * │ plataforma — dinheiro potencialmente debitado (a rota debita ANTES da    │
 * │ chamada, por `criarLook()`) por uma credencial que nunca poderia          │
 * │ funcionar. MESMA CLASSE do bug de TREINO corrigido em `68b418b` (26/08,  │
 * │ ver checkAvatarTrainingVendorPolicy.ts), que ficou tampada nas rotas de   │
 * │ LEITURA até 27/08 e no POST de criar traje até esta rodada (28/08).      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que a correção aqui NÃO é o loop do treino ──────────────────────────┐
 * │ No treino, o vendor ainda não é conhecido — por isso `trainAvatar()`      │
 * │ itera `VENDORS_WITH_TRAINING_PATH.avatar` (heygen, depois did). Nas três  │
 * │ rotas aqui, o avatar JÁ FOI treinado — `avatar.provider` já está          │
 * │ gravado, sempre na MESMA UPDATE que grava `provider_avatar_id` (rota de   │
 * │ treino, routes/avatars.ts). Não há o que iterar: basta pedir a           │
 * │ credencial do vendor que já é conhecido, via `getCredentialForVendor`.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  nenhuma das três rotas chama `getCredential(req.tenantId, "avatar")`
 *       — o genérico, por `is_default` — para decidir a credencial.
 *  G-2  as três resolvem por `getCredentialForVendor(req.tenantId, "avatar",
 *       avatar.provider as AvatarVendor)` — o vendor que treinou, nunca um
 *       vendor fixo nem o default do tenant.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTA_AVATARS = "backend/src/routes/avatars.ts";

const ANCORA_LOOKS_INICIO = 'app.get<{ Params: { id: string } }>("/avatars/:id/looks", async (req, reply) => {';
const ANCORA_CRIAR_LOOK_INICIO =
  'app.post<{ Params: { id: string }; Body: { name?: string; imageUrl?: string; prompt?: string } }>(\n' +
  '    "/avatars/:id/looks",\n' +
  '    { preHandler: requireActiveTenant },\n' +
  '    async (req, reply) => {';
const ANCORA_PREVIEW_INICIO = 'app.get<{ Params: { id: string } }>("/avatars/:id/preview", async (req, reply) => {';

export const MUTANTS: Mutant[] = [
  {
    guard: "GET /avatars/:id/looks resolve credencial de leitura pelo vendor que treinou, nunca pelo is_default genérico",
    name: "a rota de looks volta a resolver credencial de leitura pelo is_default genérico de provider=avatar",
    kind: "esperto",
    // ESPERTO: a rota continua compilando e continua devolvendo looks quando
    // o tenant só tem heygen configurado — o defeito só aparece com um
    // tenant que tem `fal` como is_default de avatar, e nesse caso o
    // fornecedor responde 401 calado, tratado como "sem traje".
    file: ROTA_AVATARS,
    find:
      "    const credential = avatar.provider_avatar_id\n" +
      "      ? await getCredentialForVendor(req.tenantId, \"avatar\", avatar.provider as AvatarVendor)\n" +
      "      : null;\n",
    replace: "    const credential = await getCredential(req.tenantId, \"avatar\");\n",
    expect: "avatar-preview-vendor: GET /avatars/:id/looks volta a resolver a credencial de leitura pelo is_default genérico",
  },
  {
    guard: "GET /avatars/:id/preview resolve credencial de leitura pelo vendor que treinou, nunca pelo is_default genérico",
    name: "a rota de preview volta a resolver credencial de leitura pelo is_default genérico de provider=avatar",
    kind: "esperto",
    file: ROTA_AVATARS,
    // A linha de resolução é TEXTUALMENTE IDÊNTICA à do POST /looks (mesma
    // correção, mesma forma) — a âncora INCLUI a linha seguinte, que diverge
    // entre as duas (`if (credential)` aqui, `if (!credential)` no POST),
    // para o `find` casar só uma vez no arquivo.
    find:
      '      const credential = await getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor);\n' +
      "      if (credential) {\n",
    replace: '      const credential = await getCredential(req.tenantId, "avatar");\n      if (credential) {\n',
    expect: "avatar-preview-vendor: GET /avatars/:id/preview volta a resolver a credencial de leitura pelo is_default genérico",
  },
  {
    guard: "POST /avatars/:id/looks (criar traje) resolve credencial pelo vendor que treinou, nunca pelo is_default genérico",
    name: "a rota de criar traje volta a resolver credencial pelo is_default genérico de provider=avatar",
    kind: "esperto",
    // ESPERTO, E COM DINHEIRO EM JOGO: a rota continua compilando, continua
    // aceitando o POST, continua debitando via `criarLook()` — o defeito só
    // aparece para um tenant com `fal` como is_default de avatar, e nesse
    // caso o clique em "Criar traje" (US$ 1,00) falha SEMPRE contra a
    // HeyGen, mesmo com a chave certa cadastrada na plataforma.
    //
    // Mesma âncora anti-colisão do mutante irmão (preview): a linha seguinte
    // (`if (!credential)`) é o que diferencia esta ocorrência da de preview.
    file: ROTA_AVATARS,
    find:
      '      const credential = await getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor);\n' +
      "      if (!credential) {\n",
    replace: '      const credential = await getCredential(req.tenantId, "avatar");\n      if (!credential) {\n',
    expect: "avatar-preview-vendor: POST /avatars/:id/looks volta a resolver a credencial pelo is_default genérico",
  },
];

export interface AvatarPreviewVendorCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/**
 * Recorta o corpo de um handler `app.get(...)` deste arquivo, da âncora de
 * abertura até o próximo `\n  app.` (o início do handler seguinte) — nunca um
 * wrapper de layout, sempre a forma real do handler.
 */
function recortarHandler(
  conteudo: string,
  ancoraInicio: string,
  rotulo: string,
  failures: string[],
): string | null {
  const inicio = conteudo.indexOf(ancoraInicio);
  if (inicio < 0) {
    failures.push(
      `avatar-preview-vendor: não achei a âncora de abertura de ${rotulo} (\`${ancoraInicio}\`) em ` +
        `${ROTA_AVATARS}. A guarda não pode opinar sobre um handler que não encontrou.`,
    );
    return null;
  }
  // Sem próximo `app.`, o handler é o ÚLTIMO do arquivo — o recorte vai até
  // o fim do conteúdo (hoje é o caso de /preview, a última rota declarada).
  const fim = conteudo.indexOf("\n  app.", inicio + ancoraInicio.length);
  return fim < 0 ? conteudo.slice(inicio) : conteudo.slice(inicio, fim);
}

export function checkAvatarPreviewVendorPolicy(repoRoot: string): AvatarPreviewVendorCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const rota = lerDaRaiz(repoRoot, ROTA_AVATARS);

  // ---------------------------------------------------------------------------
  // GET /avatars/:id/looks
  // ---------------------------------------------------------------------------
  const corpoLooks = recortarHandler(rota, ANCORA_LOOKS_INICIO, "GET /avatars/:id/looks", failures);
  if (corpoLooks !== null) {
    if (/getCredential\(req\.tenantId, "avatar"\)/.test(corpoLooks)) {
      failures.push(
        "avatar-preview-vendor: GET /avatars/:id/looks volta a resolver a credencial de leitura pelo " +
          `is_default genérico — achei \`getCredential(req.tenantId, "avatar")\` dentro do handler em ` +
          `${ROTA_AVATARS}. Um tenant com \`fal\` como is_default de provider=avatar receberia 401 calado ` +
          "da HeyGen, e a tela mostraria \"sem traje\" onde deveria mostrar o traje real.",
      );
    }
    if (!corpoLooks.includes('getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor)')) {
      failures.push(
        "avatar-preview-vendor: GET /avatars/:id/looks não resolve mais a credencial de leitura por " +
          `\`getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor)\` em ` +
          `${ROTA_AVATARS} — sem o vendor que treinou como parâmetro explícito, a leitura volta a depender ` +
          "do is_default do tenant, que pode ser um vendor sem ramo de leitura de avatar.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // GET /avatars/:id/preview
  // ---------------------------------------------------------------------------
  const corpoPreview = recortarHandler(rota, ANCORA_PREVIEW_INICIO, "GET /avatars/:id/preview", failures);
  if (corpoPreview !== null) {
    if (/getCredential\(req\.tenantId, "avatar"\)/.test(corpoPreview)) {
      failures.push(
        "avatar-preview-vendor: GET /avatars/:id/preview volta a resolver a credencial de leitura pelo " +
          `is_default genérico — achei \`getCredential(req.tenantId, "avatar")\` dentro do handler em ` +
          `${ROTA_AVATARS}. Mesmo defeito do /looks: 401 calado da HeyGen quando o is_default do tenant é ` +
          "outro vendor, e a tela mostraria \"imagem do fornecedor não disponível\".",
      );
    }
    if (!corpoPreview.includes('getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor)')) {
      failures.push(
        "avatar-preview-vendor: GET /avatars/:id/preview não resolve mais a credencial de leitura por " +
          `\`getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor)\` em ` +
          `${ROTA_AVATARS}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // POST /avatars/:id/looks (criar traje) — 28/08.
  // ---------------------------------------------------------------------------
  const corpoCriarLook = recortarHandler(rota, ANCORA_CRIAR_LOOK_INICIO, "POST /avatars/:id/looks", failures);
  if (corpoCriarLook !== null) {
    if (/getCredential\(req\.tenantId, "avatar"\)/.test(corpoCriarLook)) {
      failures.push(
        "avatar-preview-vendor: POST /avatars/:id/looks volta a resolver a credencial pelo is_default " +
          `genérico — achei \`getCredential(req.tenantId, "avatar")\` dentro do handler em ${ROTA_AVATARS}. ` +
          "Um tenant com `fal` como is_default de provider=avatar teria o clique em \"Criar traje\" " +
          "(US$ 1,00) recusado SEMPRE pela HeyGen, mesmo com a chave certa cadastrada na plataforma.",
      );
    }
    if (!corpoCriarLook.includes('getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor)')) {
      failures.push(
        "avatar-preview-vendor: POST /avatars/:id/looks não resolve mais a credencial por " +
          `\`getCredentialForVendor(req.tenantId, "avatar", avatar.provider as AvatarVendor)\` em ` +
          `${ROTA_AVATARS} — sem o vendor que treinou como parâmetro explícito, a criação de traje volta a ` +
          "depender do is_default do tenant, que pode ser um vendor sem ramo de avatar na HeyGen.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    avatar-preview-vendor: GET /avatars/:id/looks, GET /avatars/:id/preview e POST /avatars/:id/looks " +
        "(criar traje) resolvem a credencial pelo vendor que treinou (avatar.provider), nunca pelo " +
        "is_default genérico",
    );
  }

  return { failures, notes };
}
