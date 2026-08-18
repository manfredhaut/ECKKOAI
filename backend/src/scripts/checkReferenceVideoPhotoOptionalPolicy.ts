/**
 * Foto do rosto e vídeo de referência são INDEPENDENTES — decisão de produto
 * registrada nesta rodada, não reabrir. `checkReferenceVideoPhotos()` e sua
 * chamada em `POST /avatars/:id/reference-video` existiram por um commit
 * (`d167183`) e foram removidas nesta mesma rodada porque contradiziam a
 * decisão: 0 fotos tinha de continuar sendo aceito, e o treino passou a
 * depender só do VÍDEO de referência.
 *
 * ┌─ O QUE ESTA GUARDA IMPEDE DE VOLTAR ──────────────────────────────────────┐
 * │ Três exigências de foto, em três lugares, cada uma capaz de reintroduzir  │
 * │ o defeito por conta própria:                                             │
 * │   1. `routes/avatars.ts` — um 422 antes do treino, condicionado a        │
 * │      `photo_urls.length`, dentro do handler de `/reference-video`.       │
 * │   2. `avatarProvider.ts` — o `throw` que existia no topo de              │
 * │      `trainAvatar()`, ANTES do desvio de fixture, então também vetava a  │
 * │      simulação (custo zero) sem foto nenhuma.                            │
 * │   3. `AvatarSetupStep.tsx` — o botão "Concluir configuração" exigia 3    │
 * │      fotos (`photo_urls.length < 3`) além do vídeo, travando a tela      │
 * │      mesmo com o backend já aceitando 0 fotos. Achado na rodada em que   │
 * │      os itens 1 e 2 foram fechados; corrigido nesta.                     │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADA NO USO, não na menção ──────────────────────────────────────────┐
 * │ As duas checagens recortam o CORPO real (o handler da rota; o corpo de    │
 * │ `trainAvatar()` até o desvio de fixture) e procuram `photoUrls.length` /  │
 * │ `photo_urls.length` DENTRO dele, com comentários já removidos. Este       │
 * │ próprio arquivo de guarda cita as duas strings no comentário acima — se a │
 * │ busca não removesse comentário e não recortasse pelo corpo certo, ela     │
 * │ acusaria a si mesma. Precedente: 6 guardas já saíram inertes neste        │
 * │ projeto por casar menção em vez de uso (checklist nº 10 do CLAUDE.md).    │
 * └────────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROUTE = "backend/src/routes/avatars.ts";
const PROVIDER = "backend/src/services/providers/avatarProvider.ts";
const STEP = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "0 fotos não recusa o vídeo de referência na rota",
    name: "a exigência de foto volta para a rota do vídeo de referência",
    kind: "esperto",
    // Reintroduz EXATAMENTE o bloco removido nesta rodada (era o corpo de
    // `checkReferenceVideoPhotos`, inline, sem depender da função apagada de
    // `uploadLimits.ts` — assim o mutante compila e reproduz o defeito pela
    // FORMA, não citando um símbolo que não existe mais).
    file: ROUTE,
    find:
      '    if (!existing[0]) return reply.code(404).send({ error: "Avatar not found" });\n' +
      "\n" +
      "    const avatarCredential = await getCredential(req.tenantId, \"avatar\");",
    replace:
      '    if (!existing[0]) return reply.code(404).send({ error: "Avatar not found" });\n' +
      "\n" +
      "    if (existing[0].photo_urls.length === 0) {\n" +
      '      return reply.code(422).send({ error: "reference_video_no_face_photo", message: "Envie ao menos 1 foto do rosto antes de enviar o vídeo de referência." });\n' +
      "    }\n" +
      "\n" +
      "    const avatarCredential = await getCredential(req.tenantId, \"avatar\");",
    expect: "volta a condicionar o handler de /reference-video a `photo_urls.length`",
  },
  {
    guard: "0 fotos não impede a simulação de treino (fixture, custo zero)",
    name: "a exigência de foto volta para trainAvatar() antes do desvio de fixture",
    kind: "esperto",
    // O PONTO EXATO que fazia a versão antiga vetar até a simulação: o throw
    // vinha ANTES de `if (isFixtureMode())`. Reintroduzi-lo ali — não depois —
    // é o que reproduz o defeito original (custo zero recusado por falta de
    // foto), e não outro.
    file: PROVIDER,
    find:
      "export async function trainAvatar(input: TrainAvatarInput): Promise<TrainAvatarResult> {\n" +
      "  if (isFixtureMode()) return trainAvatarFixture();",
    replace:
      "export async function trainAvatar(input: TrainAvatarInput): Promise<TrainAvatarResult> {\n" +
      "  if (input.photoUrls.length === 0) {\n" +
      '    throw new AvatarProviderError("At least one face photo is required to train an avatar.");\n' +
      "  }\n" +
      "  if (isFixtureMode()) return trainAvatarFixture();",
    expect: "volta a exigir foto ANTES do desvio de fixture em trainAvatar()",
  },
  {
    guard: "o botão Concluir configuração não exige 3 fotos",
    name: "a exigência de 3 fotos volta para o botão de concluir",
    kind: "esperto",
    // Reintroduz EXATAMENTE a condição antiga (photo_urls.length < 3),
    // travando o botão mesmo com vídeo salvo e mesmo com 1 ou 2 fotos.
    file: STEP,
    find: "disabled={!draftAvatar.reference_video_url && draftAvatar.photo_urls.length === 0}",
    replace: "disabled={draftAvatar.photo_urls.length < 3 || !draftAvatar.reference_video_url}",
    expect: "volta a exigir 3 fotos",
  },
];

export interface ReferenceVideoPhotoOptionalResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF. Ver o gotcha 3 do ESTADO.md: o working copy vem em CRLF e todo
  // trecho transcrito aqui é escrito com `\n`.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

export async function checkReferenceVideoPhotoOptionalPolicy(): Promise<ReferenceVideoPhotoOptionalResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // 1. A rota: o handler de /reference-video, do início da definição até o
  //    fim do arquivo — é a ÚLTIMA rota declarada em avatarRoutes(), então
  //    "até o fim do arquivo" não vaza para nenhum outro handler.
  const rota = lerDaRaiz(ROUTE);
  const inicioRota = rota.indexOf('"/avatars/:id/reference-video",');
  if (inicioRota < 0) {
    failures.push(
      `reference-video-photo: não encontrei a declaração da rota POST /avatars/:id/reference-video em ` +
        `${ROUTE}. A guarda não pode conferir um handler que não localizou.`,
    );
  } else {
    const trechoRota = semComentarios(rota.slice(inicioRota));
    if (/photo_urls\.length/.test(trechoRota)) {
      failures.push(
        `reference-video-photo: ${ROUTE} volta a condicionar o handler de /reference-video a ` +
          "`photo_urls.length` — a foto do rosto e o vídeo de referência são independentes por decisão de " +
          "produto (vale um, vale o outro, valem os dois); recusar por falta de foto aqui é o defeito que " +
          "esta rodada fechou.",
      );
    }
  }

  // 2. O provider: o corpo de trainAvatar(), do início da função até o desvio
  //    de fixture — é ali, ANTES da simulação, que a exigência antiga vetava
  //    até o caminho de custo zero.
  const provider = lerDaRaiz(PROVIDER);
  const inicioFn = provider.indexOf(
    "export async function trainAvatar(input: TrainAvatarInput): Promise<TrainAvatarResult> {",
  );
  const fimFn = provider.indexOf("if (isFixtureMode()) return trainAvatarFixture();", inicioFn);
  if (inicioFn < 0 || fimFn < 0) {
    failures.push(
      `reference-video-photo: não encontrei o início de trainAvatar() ou o desvio de fixture em ` +
        `${PROVIDER}. A guarda não pode conferir um trecho que não localizou.`,
    );
  } else {
    const trechoFn = semComentarios(provider.slice(inicioFn, fimFn));
    if (/photoUrls\.length/.test(trechoFn)) {
      failures.push(
        `reference-video-photo: ${PROVIDER} volta a exigir foto ANTES do desvio de fixture em ` +
          "trainAvatar() — isso veta até a simulação de custo zero, não só o caminho live. O treino " +
          "depende do vídeo de referência; quando houver foto, uma já é suficiente, e nenhuma é aceitável.",
      );
    }
  }

  // 3. O botão "Concluir configuração": ancorado em `onClick={handleFinishSetup}`
  //    (único no arquivo) até o fechamento do próprio botão — nunca no
  //    arquivo inteiro, que também tem outros `disabled={...draftAvatar...}`
  //    nos controles de câmera/gravação sem relação com este porteiro.
  const step = lerDaRaiz(STEP);
  const inicioBotao = step.indexOf("onClick={handleFinishSetup}");
  const fimBotao = step.indexOf("</button>", inicioBotao);
  if (inicioBotao < 0 || fimBotao < 0) {
    failures.push(
      `reference-video-photo: não encontrei o botão "Concluir configuração" (onClick={handleFinishSetup}) ` +
        `em ${STEP}. A guarda não pode conferir um botão que não localizou.`,
    );
  } else {
    const trechoBotao = semComentarios(step.slice(inicioBotao, fimBotao));
    if (/photo_urls\.length\s*<\s*3/.test(trechoBotao)) {
      failures.push(
        `reference-video-photo: o botão "Concluir configuração" volta a exigir 3 fotos ` +
          "(`photo_urls.length < 3`) — trava a tela mesmo com o backend já aceitando 0 fotos e mesmo com " +
          "vídeo de referência salvo. A regra é vídeo OU pelo menos 1 foto.",
      );
    } else if (!/disabled=\{!draftAvatar\.reference_video_url && draftAvatar\.photo_urls\.length === 0\}/.test(trechoBotao)) {
      failures.push(
        `reference-video-photo: o botão "Concluir configuração" em ${STEP} não tem a condição esperada ` +
          "(`!draftAvatar.reference_video_url && draftAvatar.photo_urls.length === 0`) — não reconheço a " +
          "regra atual e não posso afirmar que ela ainda é vídeo-OU-foto.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    reference-video-photo: nem a rota, nem trainAvatar(), nem o botão de concluir condicionam o " +
        "treino/avanço à existência de foto além de vídeo-OU-1-foto",
    );
  }

  return { failures, notes };
}
