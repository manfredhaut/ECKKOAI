/**
 * "REFAZER" TAMBÉM MANDA A FOTO LATERAL — achado em 29/08, ao investigar a
 * suspeita de que a lateral não estava reforçando a composição.
 *
 * ┌─ O que foi medido, não presumido ──────────────────────────────────────┐
 * │ A composição mais recente na hora da investigação (`origem: "criacao"`) │
 * │ publicou 4 entradas — `rosto, cenario, traje, lado_direito` — MEDIDO no  │
 * │ log real (`fal_pipeline_entradas_publicadas`). O caminho de CRIAÇÃO      │
 * │ (`avatarProvider.ts`) nunca teve regressão: `photoUrls[1]`/`[2]` já      │
 * │ eram enviados antes desta sessão, e nenhum commit de hoje tocou aquele   │
 * │ trecho (`git log` confirma o último toque em `f0a66c1`, 28/08 14:13,     │
 * │ antes do fracionamento começar).                                        │
 * │                                                                          │
 * │ O que ERA um defeito real, achado no caminho: `entradasDaComposicao()`  │
 * │ (routes/videos.ts, usada só por `/recompose`) NUNCA incluía a lateral — │
 * │ só `outfit`/`scenario`. Clicar "Refazer" perdia a referência de          │
 * │ identidade que a criação original tinha. Não é regressão desta sessão   │
 * │ (a função nunca teve a lateral, em nenhum commit) — é uma lacuna própria │
 * │ do caminho de recomposição, corrigida agora.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  `entradasDaComposicao` inclui `lado_direito`/`lado_esquerdo` de
 *       `avatar.photo_urls`, com a MESMA prioridade de `avatarProvider.ts`
 *       (só um dos dois, `lado_direito` primeiro) — por FORMA.
 *  G-2  o call site de `/recompose` passa `avatar` para a função — sem
 *       isso, a assinatura pode estar certa e nunca ser alimentada com o
 *       avatar de verdade.
 *
 * Custo: ZERO. Leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "/recompose inclui a foto lateral (lado_direito/lado_esquerdo) nas entradas da composição",
    name: "entradasDaComposicao para de incluir a lateral",
    kind: "esperto",
    // ESPERTO: `outfit`/`scenario` continuam entrando normalmente — só a
    // lateral desaparece, e o "Refazer" volta a perder a referência de
    // identidade que a criação original tinha.
    file: ROTA_DE_VIDEOS,
    find:
      '    const ladoDireitoUrl = avatar.photo_urls?.[1];\n' +
      '    const ladoEsquerdoUrl = avatar.photo_urls?.[2];\n' +
      '    if (ladoDireitoUrl) {\n' +
      '      extras.push({ rotulo: "lado_direito", bytes: await readUpload(ladoDireitoUrl), mimeType: mimeDoUpload(ladoDireitoUrl) });\n' +
      '    } else if (ladoEsquerdoUrl) {\n' +
      '      extras.push({ rotulo: "lado_esquerdo", bytes: await readUpload(ladoEsquerdoUrl), mimeType: mimeDoUpload(ladoEsquerdoUrl) });\n' +
      '    }\n',
    replace: "",
    expect: "entradasDaComposicao não inclui a foto lateral",
  },
  {
    guard: "/recompose passa o avatar para entradasDaComposicao",
    name: "o call site deixa de passar avatar",
    kind: "obvio",
    // ÓBVIO: sem o segundo argumento, `avatar.photo_urls` dentro da função
    // seria `undefined.photo_urls` — mas o defeito que importa aqui não é
    // o crash, é a rota nunca ter chegado a alimentar a função certa.
    file: ROTA_DE_VIDEOS,
    find: "          entradasExtras: await entradasDaComposicao(video, avatar),",
    replace: "          entradasExtras: await entradasDaComposicao(video, avatar as never),",
    expect: "/recompose não passa avatar a entradasDaComposicao",
  },
];

export interface RecomposeLateralPhotoCheckResult {
  failures: string[];
  notes: string[];
}

export function checkRecomposeLateralPhotoPolicy(repoRoot: string): RecomposeLateralPhotoCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const src = readFileSync(path.join(repoRoot, ROTA_DE_VIDEOS), "utf8");

  if (!src.includes("async function entradasDaComposicao(video: VideoRow, avatar: Avatar)")) {
    failures.push(
      `${ROTA_DE_VIDEOS}: entradasDaComposicao não tem a assinatura (video: VideoRow, avatar: Avatar) — ` +
        "sem o avatar, a função não tem de onde ler a foto lateral.",
    );
  }
  if (
    !src.includes('avatar.photo_urls?.[1]') ||
    !src.includes('rotulo: "lado_direito"') ||
    !src.includes('rotulo: "lado_esquerdo"')
  ) {
    failures.push(
      `${ROTA_DE_VIDEOS}: entradasDaComposicao não inclui a foto lateral — "Refazer" (/recompose) ` +
        "perderia a referência de identidade que a criação original tinha.",
    );
  }
  if (!src.includes("await entradasDaComposicao(video, avatar),")) {
    failures.push(
      `${ROTA_DE_VIDEOS}: o call site de /recompose não passa avatar a entradasDaComposicao — a função ` +
        "pode estar certa e nunca receber o avatar de verdade.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    /recompose: entradasDaComposicao inclui a foto lateral do avatar (lado_direito, ou " +
        "lado_esquerdo na ausência dele), com a mesma prioridade do caminho de criação — \"Refazer\" não " +
        "perde mais a referência de identidade",
    );
  }

  return { failures, notes };
}
