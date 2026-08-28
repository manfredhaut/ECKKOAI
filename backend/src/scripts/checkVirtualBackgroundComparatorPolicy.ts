/**
 * FUNDO VIRTUAL COMO ESCOLHA VISÍVEL E COMPARÁVEL — rodada de 28/08.
 *
 * ┌─ O que mudou ──────────────────────────────────────────────────────────┐
 * │ O bloco "Fundo virtual — Indisponível no momento" virou um controle de  │
 * │ dois níveis: (1) "Sem fundo virtual"/"Com fundo virtual"; (2) uma vez   │
 * │ "Com" escolhido, as 4 cores sólidas já implementadas (MediaPipe local,  │
 * │ sem chamada a fornecedor), para comparar ao vivo sobre o próprio rosto  │
 * │ antes de capturar. A flag `removable_background` passou a vir LIGADA   │
 * │ por padrão (migration 069) — o `!removableBackground.enabled` continua │
 * │ no código só para o dia em que um admin desligar de novo.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O que esta guarda protege, e por que É JUSTAMENTE ISTO que importa ──┐
 * │ A pergunta do operador não foi "o controle aparece?" — foi "a escolha  │
 * │ de cor afeta o FRAME CAPTURADO, não só a pré-visualização?". As duas   │
 * │ coisas podem divergir silenciosamente: um <canvas> pode mostrar uma    │
 * │ cor ao vivo enquanto `capturePhoto()` lê de outro lugar (o vídeo cru),  │
 * │ e a pessoa só descobre a foto errada depois de já ter avançado.        │
 * │ A garantia estrutural que faz as duas coisas serem A MESMA coisa é:    │
 * │ um ÚNICO canvas, desenhado a cada frame por `renderLoop` com a cor      │
 * │ corrente (`backgroundRef.current`, alimentado pelo efeito abaixo), e   │
 * │ `capturePhoto()`/`getRecordingStream()` lendo DESSE MESMO canvas — não  │
 * │ de um novo canvas, não do elemento de vídeo cru.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  O botão "Com fundo virtual" muda `backgroundId` de "none" para uma
 *       cor real — sem isto ele é decorativo: some a mensagem antiga, mas
 *       clicar não faz nada.
 *  G-2  O botão "Sem fundo virtual" devolve `backgroundId` a "none" — mesma
 *       forma de defeito, direção oposta.
 *  G-3  O efeito que traduz `backgroundId`/`intensity` em
 *       `camera.setBackground(...)` continua existindo e usando a cor da
 *       opção corrente — sem ele, os botões mudam o estado da TELA e a
 *       pré-visualização (e a captura) continuam na cor antiga, porque o
 *       motor de composição nunca é avisado.
 *  G-4  `capturePhoto()` (useCamera.ts) lê do MESMO `canvasRef` que o
 *       `renderLoop` desenha — nunca reconstrói um canvas novo a partir do
 *       vídeo cru. Esta é a guarda "não só a pré-visualização": um novo
 *       canvas, desenhado direto do `<video>`, ignoraria completamente a
 *       cor escolhida, e a foto sairia com o fundo real da câmera mesmo com
 *       a pré-visualização mostrando outra cor.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const PASSO1 = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";
const USE_CAMERA = "frontend/src/pages/CreateVideo/hooks/useCamera.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "fundo virtual: o botão liga o fundo virtual de verdade",
    name: "o botão \"Com fundo virtual\" perde o onClick",
    kind: "esperto",
    // ESPERTO: o botão continua na tela, com o mesmo rótulo — e clicar não
    // muda `backgroundId`. A pessoa clica, nada acontece na pré-visualização
    // (segmentação nunca ativa), e não há erro nenhum indicando isso.
    file: PASSO1,
    find:
      '                    onClick={() =>\n' +
      '                      setBackgroundId((atual) =>\n' +
      '                        atual === DEFAULT_BACKGROUND_ID\n' +
      '                          ? (BACKGROUND_OPTIONS.find((o) => o.color !== null)?.id ?? atual)\n' +
      '                          : atual,\n' +
      '                      )\n' +
      '                    }\n',
    replace: "",
    expect: "fundo-virtual: o botão \"Com fundo virtual\" não muda mais backgroundId",
  },
  {
    guard: "fundo virtual: o botão desliga o fundo virtual de verdade",
    name: "o botão \"Sem fundo virtual\" perde o onClick",
    kind: "esperto",
    file: PASSO1,
    find: '                    onClick={() => setBackgroundId(DEFAULT_BACKGROUND_ID)}\n',
    replace: "",
    expect: "fundo-virtual: o botão \"Sem fundo virtual\" não muda mais backgroundId",
  },
  {
    guard: "fundo virtual: a escolha de cor chega ao motor de composição (camera.setBackground)",
    name: "o efeito para de repassar a cor escolhida para a câmera",
    kind: "esperto",
    // ESPERTO: os botões continuam mudando `backgroundId` certinho (G-1/G-2
    // intactos), a tela continua destacando a cor selecionada — e
    // `camera.setBackground` nunca é chamado com a cor de verdade, sempre
    // `null`. É a forma mais enganosa: a UI parece 100% funcional olhando só
    // para ela, e nem a pré-visualização nem a foto mudam de cor nunca.
    file: PASSO1,
    find: "    camera.setBackground({ backgroundColor: option?.color ?? null, intensity });\n",
    replace: "    camera.setBackground({ backgroundColor: null, intensity });\n",
    expect: "fundo-virtual: o efeito de backgroundId para de repassar a cor escolhida a camera.setBackground",
  },
  {
    guard: "fundo virtual: a foto capturada sai do MESMO canvas que a pré-visualização, nunca do vídeo cru",
    name: "capturePhoto passa a desenhar direto do vídeo, ignorando o canvas composto",
    kind: "esperto",
    // ESPERTO: sintaticamente válido, sem erro de tipo — só troca A FONTE do
    // frame capturado. A pré-visualização (o <canvas> da tela, desenhado por
    // `renderLoop`) continua mostrando a cor escolhida perfeitamente; a foto
    // que sai de `capturePhoto()` é sempre a câmera crua, porque este canvas
    // NOVO nunca passa pelo `compositeFrame`. É exatamente o defeito que o
    // operador descreveu: "afeta só a pré-visualização".
    file: USE_CAMERA,
    find:
      "  function capturePhoto(): Promise<Blob | null> {\n" +
      "    return new Promise((resolve) => {\n" +
      "      const canvas = canvasRef.current;\n" +
      "      if (!canvas || !canvas.width) return resolve(null);\n" +
      '      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);\n' +
      "    });\n" +
      "  }\n",
    replace:
      "  function capturePhoto(): Promise<Blob | null> {\n" +
      "    return new Promise((resolve) => {\n" +
      "      const video = videoRef.current;\n" +
      "      if (!video || !video.videoWidth) return resolve(null);\n" +
      '      const c = document.createElement("canvas");\n' +
      "      c.width = video.videoWidth;\n" +
      "      c.height = video.videoHeight;\n" +
      '      const ctx = c.getContext("2d");\n' +
      "      if (!ctx) return resolve(null);\n" +
      "      ctx.drawImage(video, 0, 0);\n" +
      '      c.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);\n' +
      "    });\n" +
      "  }\n",
    // TRANSCRIÇÃO exata da mensagem real (G-4, primeiro `if`), não paráfrase
    // — ver o gotcha já registrado nesta linha de trabalho: `expect` precisa
    // ser substring literal do que `failures.push(...)` emite, senão o
    // mutante reprova por um motivo real e sai AMBÍGUO/INERTE mesmo assim.
    expect: "capturePhoto não lê mais do canvas composto (canvasRef)",
  },
];

export interface VirtualBackgroundComparatorCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF. Ver o gotcha 3 do ESTADO.md: o working copy vem em CRLF e todo
  // trecho transcrito aqui é escrito com `\n`.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkVirtualBackgroundComparatorPolicy(): VirtualBackgroundComparatorCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const passo1 = lerDaRaiz(PASSO1);
  const useCamera = lerDaRaiz(USE_CAMERA);

  // ---------------------------------------------------------------------------
  // G-1 / G-2 — os dois botões do nível 1 mudam backgroundId nas duas direções.
  // ---------------------------------------------------------------------------
  if (!passo1.includes("onClick={() => setBackgroundId(DEFAULT_BACKGROUND_ID)}")) {
    failures.push(
      `fundo-virtual: o botão "Sem fundo virtual" não muda mais backgroundId em ${PASSO1} — esperado ` +
        "`onClick={() => setBackgroundId(DEFAULT_BACKGROUND_ID)}`. Um botão que existe e não desliga o " +
        "fundo é indistinguível de funcionar até a pessoa reparar que a pré-visualização não voltou ao " +
        "normal.",
    );
  }
  if (
    !passo1.includes(
      "atual === DEFAULT_BACKGROUND_ID\n" +
        "                          ? (BACKGROUND_OPTIONS.find((o) => o.color !== null)?.id ?? atual)",
    )
  ) {
    failures.push(
      `fundo-virtual: o botão "Com fundo virtual" não muda mais backgroundId em ${PASSO1} — esperado ` +
        "que o clique, partindo de \"none\", selecione a primeira cor real de BACKGROUND_OPTIONS. Sem " +
        "isto o botão é decoração: a mensagem antiga sumiu, mas nada liga o efeito.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-3 — o efeito repassa a COR ESCOLHIDA (não um valor fixo) à câmera.
  // ---------------------------------------------------------------------------
  if (!passo1.includes("camera.setBackground({ backgroundColor: option?.color ?? null, intensity });")) {
    failures.push(
      `fundo-virtual: o efeito de backgroundId para de repassar a cor escolhida a camera.setBackground ` +
        `em ${PASSO1} — esperado \`camera.setBackground({ backgroundColor: option?.color ?? null, ` +
        "intensity })\`, lendo a opção corrente. Sem isto os botões da tela mudam de estado e a câmera " +
        "nunca sabe — nem a pré-visualização nem a foto capturada trocam de cor.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-4 — capturePhoto lê do MESMO canvas que a pré-visualização usa.
  // ---------------------------------------------------------------------------
  const inicioCaptura = useCamera.indexOf("function capturePhoto()");
  const fimCaptura = useCamera.indexOf("function getRecordingStream()", inicioCaptura);
  if (inicioCaptura < 0 || fimCaptura < 0) {
    failures.push(
      `fundo-virtual: não foi possível recortar \`capturePhoto\` em ${USE_CAMERA} pelas âncoras da ` +
        "própria função e de `getRecordingStream`.",
    );
    return { failures, notes };
  }
  const trechoCaptura = useCamera.slice(inicioCaptura, fimCaptura);
  if (!trechoCaptura.includes("canvasRef.current")) {
    failures.push(
      `fundo-virtual: capturePhoto não lê mais do canvas composto (canvasRef) em ${USE_CAMERA} — sem ` +
        "isto a foto capturada pode divergir do que a pré-visualização mostra, que é exatamente o " +
        "defeito \"a cor só afeta a pré-visualização\".",
    );
  }
  if (trechoCaptura.includes('document.createElement("canvas")')) {
    failures.push(
      `fundo-virtual: capturePhoto passou a criar um canvas NOVO em ${USE_CAMERA}, em vez de ler do ` +
        "canvas já composto por `renderLoop` — um canvas novo desenhado direto do `<video>` nunca passa " +
        "por `compositeFrame`, então a foto sai com o fundo real da câmera mesmo com uma cor escolhida " +
        "na tela.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    fundo-virtual: os dois níveis do controle (ligar/desligar, escolher cor) mudam o estado de " +
        "verdade, o estado chega a camera.setBackground, e a foto capturada sai do MESMO canvas que a " +
        "pré-visualização — a escolha de cor nunca fica só na aparência",
    );
  }

  return { failures, notes };
}
