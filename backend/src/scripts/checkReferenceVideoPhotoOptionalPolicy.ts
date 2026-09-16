/**
 * Foto do rosto e vídeo de referência são INDEPENDENTES nos itens 1 e 2
 * abaixo — decisão de produto registrada naquela rodada, não reabrir.
 * `checkReferenceVideoPhotos()` e sua chamada em `POST
 * /avatars/:id/reference-video` existiram por um commit (`d167183`) e foram
 * removidas nesta mesma rodada porque contradiziam a decisão: 0 fotos tinha
 * de continuar sendo aceito, e o treino passou a depender só do VÍDEO de
 * referência.
 *
 * ⚠️ **ITEM 3 (o botão "Concluir configuração") FOI REVISTO no BLOCO
 * AVATAR-VALIDACAO-1 — a regra "vídeo OU foto" daquele item, especificamente,
 * deixou de valer.** O BLOCO AVATAR-TREINO-1 (investigação) mediu que essa
 * mesma independência, aplicada ao botão de FECHAR o assistente, permitia
 * fechar com só fotos, SEM NUNCA chamar `/reference-video` — o avatar ficava
 * sem `provider_avatar_id`/`voice_id` para sempre, sem erro e sem aviso (caso
 * real medido: avatar "wizard 1"). O botão agora exige os DOIS — vídeo E
 * pelo menos 1 foto — antes de fechar. **Os itens 1 e 2 abaixo (a ROTA e
 * `trainAvatar()`) continuam valendo exatamente como antes: eles decidem se
 * o TREINO em si precisa de foto, o que é uma pergunta diferente de "o
 * assistente pode fechar sem ter treinado nada".**
 *
 * ┌─ O QUE ESTA GUARDA IMPEDE DE VOLTAR ──────────────────────────────────────┐
 * │ Três exigências de foto, em três lugares, cada uma capaz de reintroduzir  │
 * │ um defeito por conta própria — os itens 1 e 2 continuam impedindo a      │
 * │ EXIGÊNCIA de foto que existia antes de `d167183` ser revertido; o item 3 │
 * │ agora impede a condição CONTRÁRIA (o "OU" que virou bug):                │
 * │   1. `routes/avatars.ts` — um 422 antes do treino, condicionado a        │
 * │      `photo_urls.length`, dentro do handler de `/reference-video`.       │
 * │   2. `avatarProvider.ts` — o `throw` que existia no topo de              │
 * │      `trainAvatar()`, ANTES do desvio de fixture, então também vetava a  │
 * │      simulação (custo zero) sem foto nenhuma.                            │
 * │   3. `AvatarSetupStep.tsx` — o botão "Concluir configuração" HOJE exige  │
 * │      vídeo E pelo menos 1 foto (`||` de negações — De Morgan de "vídeo   │
 * │      && foto"). Impede tanto a exigência antiga de 3 fotos quanto a      │
 * │      condição "OU" que ficou entre as duas rodadas (AVATAR-TREINO-1).    │
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
    find: '    if (!existing[0]) return reply.code(404).send({ error: "Avatar not found" });\n',
    replace:
      '    if (!existing[0]) return reply.code(404).send({ error: "Avatar not found" });\n' +
      "\n" +
      "    if (existing[0].photo_urls.length === 0) {\n" +
      '      return reply.code(422).send({ error: "reference_video_no_face_photo", message: "Envie ao menos 1 foto do rosto antes de enviar o vídeo de referência." });\n' +
      "    }\n",
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
    guard: "o botão Concluir configuração exige vídeo E foto, nunca só um dos dois",
    name: "a condição do botão volta a ser OU (fecha só com vídeo, ou só com foto)",
    kind: "esperto",
    // ESPERTO: reintroduz EXATAMENTE o bug medido no BLOCO AVATAR-TREINO-1 —
    // a condição "OU" que ficava entre as duas rodadas, não a exigência de 3
    // fotos de antes de `d167183` (essa é o mutante irmão, já coberto pela
    // mensagem antiga desta guarda antes da revisão). Com `&&` de volta, um
    // avatar só com fotos (nunca chamou /reference-video) volta a poder
    // fechar o assistente sem treino, sem aviso.
    file: STEP,
    find: "disabled={!avatarForTraining.reference_video_url || avatarForTraining.photo_urls.length === 0}",
    replace: "disabled={!avatarForTraining.reference_video_url && avatarForTraining.photo_urls.length === 0}",
    // Recorte literal da mensagem real do failure() abaixo — MEDIDO rodando
    // o gate com o mutante aplicado à mão antes de escrever este campo, não
    // parafraseado de cabeça (o erro que a 1ª tentativa cometeu aqui).
    expect: "não reconheço a regra atual e não posso afirmar que ela ainda exige vídeo E foto",
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
  //    arquivo inteiro, que também tem outros `disabled={...avatarForTraining...}`
  //    nos controles de câmera/gravação sem relação com este porteiro.
  //
  //    REVISTO no BLOCO AVATAR-VALIDACAO-1: a regra deste item deixou de ser
  //    "vídeo OU foto" — ver o cabeçalho do arquivo para o porquê (achado do
  //    BLOCO AVATAR-TREINO-1). Hoje exige os DOIS.
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
          "vídeo de referência salvo. A regra é vídeo E pelo menos 1 foto, nunca 3.",
      );
    } else if (
      !/disabled=\{!avatarForTraining\.reference_video_url \|\| avatarForTraining\.photo_urls\.length === 0\}/.test(
        trechoBotao,
      )
    ) {
      failures.push(
        `reference-video-photo: o botão "Concluir configuração" em ${STEP} não tem a condição esperada ` +
          "(`!avatarForTraining.reference_video_url || avatarForTraining.photo_urls.length === 0`) — não " +
          "reconheço a regra atual e não posso afirmar que ela ainda exige vídeo E foto (nunca só um dos " +
          "dois — BLOCO AVATAR-TREINO-1/AVATAR-VALIDACAO-1).",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    reference-video-photo: a rota e trainAvatar() continuam sem condicionar o treino à existência de " +
        "foto (itens 1-2); o botão de concluir agora exige vídeo E pelo menos 1 foto, nunca só um dos dois " +
        "(item 3, revisto no AVATAR-VALIDACAO-1)",
    );
  }

  return { failures, notes };
}
