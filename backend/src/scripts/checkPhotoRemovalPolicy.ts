/**
 * EXCLUIR/REFAZER UMA FOTO DO ROSTO — rodada de 28/08.
 *
 * ┌─ Por que esta guarda existe ────────────────────────────────────────────┐
 * │ Até esta rodada a captura era mão única: uma foto enviada (pela câmera   │
 * │ OU por arquivo) não tinha como sair, e uma foto ruim obrigava a apagar   │
 * │ o avatar inteiro. O defeito que ESTA guarda persegue não é a falta do    │
 * │ botão — é o botão que EXISTE e não remove de fato. Ele tem três formas,  │
 * │ e as três passam despercebidas na tela:                                  │
 * │   (1) o clique não chama nada (botão decorativo);                        │
 * │   (2) o servidor remove e a tela não relê — a miniatura continua ali,    │
 * │       e o clique seguinte recebe 400 sobre uma foto ainda visível;       │
 * │   (3) a rota responde 200 e não escreve no banco — a tela some com a     │
 * │       foto, o treino continua recebendo as 3, e ninguém descobre até     │
 * │       o avatar sair com a foto que a pessoa achou que tinha excluído.    │
 * │ A forma (3) é a mais cara: `videos.ts` usa `photo_urls[0]` como imagem   │
 * │ base no caminho da fal, então uma lista que não encolheu muda o que é    │
 * │ gerado, e isso custa dinheiro.                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  A rota `DELETE /avatars/:id/photos/:index` existe.
 *  G-2  Ela ESCREVE a lista encolhida no banco (o `UPDATE ... SET photo_urls`
 *       com o array filtrado) — sem isto ela responde 200 mentindo.
 *  G-3  Ela apaga o arquivo do disco — sem isto cada refazer deixa um órfão
 *       em `uploads/` que nada mais remove (`DELETE /avatars/:id` só varre o
 *       que estiver em `photo_urls` NA HORA).
 *  G-4  O botão da tela está ligado a `handleDeletePhoto(i)` — não é um
 *       `<button>` sem `onClick`.
 *  G-5  `handleDeletePhoto` chama a rota E relê a resposta para o estado
 *       (`updateAvatarForTraining`) — as duas metades, porque cada uma
 *       sozinha produz uma das formas silenciosas acima.
 *
 * ANCORAGEM: o recorte do backend vai do comentário próprio da rota até o
 * comentário que abre a rota seguinte (`/reference-video`) — nunca um wrapper.
 * O da tela vai do `PHOTO_SLOTS.map(` até o fechamento do laço, que é
 * intrínseco ao que se mede (o slot), com rede anti-vazamento para o bloco de
 * upload por arquivo que vem logo depois.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTAS = "backend/src/routes/avatars.ts";
const PASSO1 = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "excluir foto: a rota grava a lista encolhida no banco",
    name: "a rota de excluir foto responde 200 sem escrever no banco",
    kind: "esperto",
    // ESPERTO: troca o UPDATE por um SELECT do MESMO avatar. A rota continua
    // existindo, continua devolvendo um avatar com 200, continua apagando o
    // arquivo do disco — e a lista nunca encolhe. Na tela a foto some (o
    // estado é substituído pela resposta), volta ao recarregar, e o treino
    // segue recebendo a foto excluída.
    file: ROTAS,
    find: '        "UPDATE avatars SET photo_urls = $3::jsonb WHERE id = $1 AND tenant_id = $2 RETURNING *",\n        [req.params.id, req.tenantId, JSON.stringify(restantes)],',
    replace:
      '        "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",\n        [req.params.id, req.tenantId],',
    expect: "excluir-foto: a rota não grava mais a lista encolhida",
  },
  {
    guard: "excluir foto: o arquivo sai do disco junto",
    name: "a rota de excluir foto deixa o arquivo órfão em uploads/",
    kind: "esperto",
    // ESPERTO: o banco encolhe certinho, a tela relê certinho, tudo parece
    // funcionar — e cada refazer deixa um arquivo que nada mais referencia e
    // nada mais apaga. Só aparece como disco cheio, meses depois, sem pista
    // de qual clique o produziu.
    file: ROTAS,
    find: '      await unlink(path.join(config.uploadsDir, removida.replace("/uploads/", ""))).catch(() => {});\n',
    replace: "",
    expect: "excluir-foto: a rota não apaga mais o arquivo do disco",
  },
  {
    guard: "excluir foto: o botão da tela está ligado ao handler",
    name: "o botão de excluir foto perde o onClick",
    kind: "esperto",
    // ESPERTO: o botão continua na tela, com o mesmo rótulo e a mesma
    // aparência, ao lado da miniatura certa — e clicar nele não faz
    // absolutamente nada. Sem erro, sem spinner, sem mensagem. É o defeito
    // mais fácil de introduzir refatorando o laço dos slots, e o mais fácil
    // de não notar: quem testa clica, vê que "não deu erro" e segue.
    file: PASSO1,
    find: "                          onClick={() => handleDeletePhoto(i)}\n",
    replace: "",
    expect: "excluir-foto: o botão de excluir não chama mais handleDeletePhoto",
  },
  {
    guard: "excluir foto: a tela relê o avatar depois de remover",
    name: "handleDeletePhoto para de atualizar o estado da tela",
    kind: "esperto",
    // ESPERTO: a chamada acontece, o servidor remove de verdade, o arquivo
    // sai do disco — e a tela continua mostrando a miniatura, porque nada
    // substituiu o avatar em memória. O clique seguinte no mesmo botão manda
    // um índice que já não existe e recebe 400 sobre uma foto que a pessoa
    // ainda está vendo. Todo o resto da cadeia está intacto.
    file: PASSO1,
    find: "      updateAvatarForTraining(atualizado);\n    });\n  }\n\n  // Mesmo tratamento que a câmera já aplica por frame",
    replace: "    });\n  }\n\n  // Mesmo tratamento que a câmera já aplica por frame",
    expect: "excluir-foto: handleDeletePhoto não atualiza mais o avatar na tela",
  },
];

export interface PhotoRemovalCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF. Ver o gotcha 3 do ESTADO.md: o working copy vem em CRLF e todo
  // trecho transcrito aqui é escrito com `\n`.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkPhotoRemovalPolicy(): PhotoRemovalCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const rotas = lerDaRaiz(ROTAS);
  const passo1 = lerDaRaiz(PASSO1);

  // ---------------------------------------------------------------------------
  // G-1 — a rota existe, e o recorte dela é ancorado no que ela É.
  // ---------------------------------------------------------------------------
  const inicioRota = rotas.indexOf('"/avatars/:id/photos/:index"');
  const fimRota = rotas.indexOf('"/avatars/:id/reference-video"', inicioRota);
  if (inicioRota < 0 || fimRota < 0) {
    failures.push(
      `excluir-foto: a rota \`DELETE /avatars/:id/photos/:index\` não foi encontrada em ${ROTAS} — sem ` +
        "ela a tela não tem como remover foto nenhuma, e o botão da tela vira decoração. A guarda não " +
        "pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
    return { failures, notes };
  }
  const trechoRota = rotas.slice(inicioRota, fimRota);

  // ---------------------------------------------------------------------------
  // G-2 — a rota escreve a lista encolhida.
  // ---------------------------------------------------------------------------
  if (
    !trechoRota.includes("UPDATE avatars SET photo_urls = $3::jsonb") ||
    !trechoRota.includes("JSON.stringify(restantes)")
  ) {
    failures.push(
      `excluir-foto: a rota não grava mais a lista encolhida em ${ROTAS} — sem o \`UPDATE avatars SET ` +
        "photo_urls\` com o array filtrado ela responde 200 mentindo: a tela some com a foto, o banco " +
        "continua com ela, e o treino segue usando o que a pessoa achou que tinha excluído (a primeira " +
        "foto da lista é a imagem base do caminho da fal).",
    );
  }

  // ---------------------------------------------------------------------------
  // G-3 — o arquivo sai do disco.
  // ---------------------------------------------------------------------------
  if (!trechoRota.includes("unlink(path.join(config.uploadsDir")) {
    failures.push(
      `excluir-foto: a rota não apaga mais o arquivo do disco em ${ROTAS} — cada refazer passa a deixar ` +
        "um órfão em `uploads/` que nada mais referencia e nada mais remove (o `DELETE /avatars/:id` só " +
        "varre o que estiver em `photo_urls` na hora).",
    );
  }

  // ---------------------------------------------------------------------------
  // G-4 — o botão da tela está ligado ao handler, dentro do laço dos slots.
  // ---------------------------------------------------------------------------
  const inicioSlots = passo1.indexOf("{PHOTO_SLOTS.map((slot, i) => (");
  const fimSlots = passo1.indexOf("{/* A consequência de excluir", inicioSlots);
  if (inicioSlots < 0 || fimSlots < 0) {
    failures.push(
      `excluir-foto: não foi possível recortar o laço dos slots de foto em ${PASSO1} pelas âncoras ` +
        "`{PHOTO_SLOTS.map((slot, i) => (` e `{/* A consequência de excluir`.",
    );
    return { failures, notes };
  }
  const trechoSlots = passo1.slice(inicioSlots, fimSlots);

  // Rede anti-vazamento: o recorte não pode engolir o bloco de upload por
  // arquivo, que vem logo depois e tem botão próprio.
  if (trechoSlots.includes("photoFileInput.current?.click()")) {
    failures.push(
      "excluir-foto: o recorte do laço dos slots engoliu o bloco de upload por arquivo " +
        "(`photoFileInput`) — a âncora vazou, e o que for conferido nele não diz nada sobre o botão de " +
        "excluir de cada slot.",
    );
  }

  if (!trechoSlots.includes("onClick={() => handleDeletePhoto(i)}")) {
    failures.push(
      `excluir-foto: o botão de excluir não chama mais handleDeletePhoto em ${PASSO1} — esperado ` +
        "`onClick={() => handleDeletePhoto(i)}` dentro do laço dos slots. Um botão que existe na tela e " +
        "não dispara nada é indistinguível de funcionar: sem erro, sem mensagem, a foto simplesmente fica.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-5 — o handler chama a rota E relê o avatar para o estado.
  // ---------------------------------------------------------------------------
  if (!passo1.includes("api.delete<Avatar>(`/avatars/${avatarForTraining.id}/photos/${index}`)")) {
    failures.push(
      `excluir-foto: handleDeletePhoto não chama mais a rota de remoção em ${PASSO1} — sem a chamada, ` +
        "o clique só mexe (ou nem isso) no estado local, e a foto volta na primeira releitura.",
    );
  }
  const inicioHandler = passo1.indexOf("async function handleDeletePhoto(index: number)");
  const fimHandler = passo1.indexOf("async function applyQualityToFile", inicioHandler);
  if (inicioHandler < 0 || fimHandler < 0) {
    failures.push(
      `excluir-foto: não foi possível recortar \`handleDeletePhoto\` em ${PASSO1} pelas âncoras da ` +
        "própria função e de `applyQualityToFile`.",
    );
  } else if (!passo1.slice(inicioHandler, fimHandler).includes("updateAvatarForTraining(atualizado)")) {
    failures.push(
      `excluir-foto: handleDeletePhoto não atualiza mais o avatar na tela em ${PASSO1} — esperado ` +
        "`updateAvatarForTraining(atualizado)` dentro da função. Sem isso o servidor remove e a " +
        "miniatura continua visível até alguém recarregar, e o clique seguinte manda um índice que já " +
        "não existe.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    excluir-foto: a rota encolhe a lista e apaga o arquivo, e a tela liga o botão ao handler que " +
        "chama a rota e relê o avatar — as duas metades, porque cada uma sozinha remove só na aparência",
    );
  }

  return { failures, notes };
}
