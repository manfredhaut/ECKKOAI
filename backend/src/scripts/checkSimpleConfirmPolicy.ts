/**
 * Diálogo de confirmação no tier Simples/HeyGen — T3, 22/08/2026.
 *
 * O QUE ISTO PROVA: o clique em "Corrigir" NUNCA dispara `POST /videos`.
 * Diferente de todas as outras guardas de fluxo pago deste projeto (que
 * conferem código de BACKEND por execução real, `pool.query` substituído
 * etc.), este é um componente React puro do lado do cliente — não há
 * handler de rota, não há função exportada isolável para importar e rodar.
 * A prova é por POSIÇÃO/CONTEÚDO de texto, ancorada em NOME DE FUNÇÃO, mesmo
 * padrão já aceito em `checkExpressivenessDefaultPolicy.ts` para o mesmo
 * tipo de superfície (comportamento de clique em componente de tela).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface SimpleConfirmCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: 'diálogo Simples: "Corrigir" nunca dispara a rota de geração',
    name: "handleSimpleConfirmCorrect passa a chamar handleGenerate também",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "  function handleSimpleConfirmCorrect() {\n" +
      "    setLastCorrectionNote(correctionNote);\n" +
      "    setShowSimpleConfirm(false);\n" +
      "  }",
    replace:
      "  function handleSimpleConfirmCorrect() {\n" +
      "    setLastCorrectionNote(correctionNote);\n" +
      "    setShowSimpleConfirm(false);\n" +
      "    void handleGenerate();\n" +
      "  }",
    expect: 'diálogo Simples: "Corrigir" chama handleGenerate — nunca deveria disparar POST /videos',
  },
  {
    guard: 'diálogo Simples: os dois botões chamam o handler certo — nunca trocados',
    name: '"Corrigir" passa a chamar o handler de "Confirmar e gerar"',
    kind: "esperto",
    // ESPERTO: as duas funções continuam existindo, cada uma do jeito
    // certo — só a FIAÇÃO do botão troca, como um copiar-colar errado. O
    // mutante do "óbvio" acima não pegaria isto: handleSimpleConfirmCorrect
    // continuaria sem chamar handleGenerate, só deixaria de ser chamado
    // pelo botão "Corrigir" nenhuma vez.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find: '<button type="button" className="btn btn-outline" onClick={handleSimpleConfirmCorrect}>',
    replace: '<button type="button" className="btn btn-outline" onClick={handleSimpleConfirmGenerate}>',
    expect: 'diálogo Simples: o botão "Corrigir" não está ligado a handleSimpleConfirmCorrect',
  },
];

const GENERATE_STEP_REL = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

export async function checkSimpleConfirmPolicy(repoRoot: string): Promise<SimpleConfirmCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  let src: string;
  try {
    src = await readFile(path.join(repoRoot, GENERATE_STEP_REL), "utf-8");
  } catch {
    failures.push(`diálogo Simples: não consegui ler ${GENERATE_STEP_REL}.`);
    return { failures, notes };
  }

  // -------------------------------------------------------------------------
  // 1. O CORPO de handleSimpleConfirmCorrect nunca chama handleGenerate nem
  // api.post — recorte pelo nome da função até o início da próxima.
  // -------------------------------------------------------------------------
  const inicioCorrigir = src.indexOf("function handleSimpleConfirmCorrect() {");
  const inicioGerar = src.indexOf("function handleSimpleConfirmGenerate() {");
  if (inicioCorrigir < 0 || inicioGerar < 0 || inicioGerar < inicioCorrigir) {
    failures.push(
      `diálogo Simples: não encontrei as duas funções (handleSimpleConfirmCorrect, ` +
        `handleSimpleConfirmGenerate) na ordem esperada em ${GENERATE_STEP_REL}.`,
    );
  } else {
    const corpoCorrigir = src.slice(inicioCorrigir, inicioGerar);
    if (corpoCorrigir.includes("handleGenerate") || corpoCorrigir.includes("api.post(")) {
      failures.push(
        'diálogo Simples: "Corrigir" chama handleGenerate — nunca deveria disparar POST /videos. O ' +
          "botão existe exatamente para NÃO gastar, e uma chamada aqui furaria essa garantia sem " +
          "nenhum aviso na tela.",
      );
    }

    // -----------------------------------------------------------------------
    // 2. O CORPO de handleSimpleConfirmGenerate CHAMA handleGenerate — é o
    // único caminho que dispara a rota a partir do diálogo. Recorte até a
    // próxima âncora estável (`useEffect(() => {\n    return () => {`).
    // -----------------------------------------------------------------------
    const fimGerar = src.indexOf("useEffect(() => {\n    return () => {", inicioGerar);
    if (fimGerar < 0) {
      failures.push(
        `diálogo Simples: não encontrei o fim do recorte de handleSimpleConfirmGenerate em ` +
          `${GENERATE_STEP_REL} (âncora do useEffect de limpeza do polling).`,
      );
    } else {
      const corpoGerar = src.slice(inicioGerar, fimGerar);
      if (!corpoGerar.includes("handleGenerate")) {
        failures.push(
          'diálogo Simples: "Confirmar e gerar" não chama handleGenerate — o único botão do diálogo ' +
            "que deveria disparar a geração deixou de fazê-lo, e o tier Simples ficaria sem nenhum " +
            "caminho para gerar de verdade.",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. FIAÇÃO dos botões — cada onClick aponta para o handler certo, texto
  // literal (função + estilo do botão juntos, para pegar troca por
  // copiar-colar sem depender só do nome da função).
  // -------------------------------------------------------------------------
  if (
    !src.includes(
      '<button type="button" className="btn btn-outline" onClick={handleSimpleConfirmCorrect}>',
    )
  ) {
    failures.push(
      'diálogo Simples: o botão "Corrigir" não está ligado a handleSimpleConfirmCorrect — a fiação do ' +
        "clique divergiu do texto do botão, e não há mais garantia de que ele não dispara a geração.",
    );
  }
  if (
    !src.includes(
      '<button type="button" className="btn btn-primary" onClick={handleSimpleConfirmGenerate}>',
    )
  ) {
    failures.push(
      'diálogo Simples: o botão "Confirmar e gerar" não está ligado a handleSimpleConfirmGenerate.',
    );
  }

  // -------------------------------------------------------------------------
  // 4. O botão "Gerar vídeo" abre o diálogo para o tier Simples, em vez de
  // chamar handleGenerate direto — sem isto, o diálogo inteiro é
  // inalcançável por clique nenhum.
  // -------------------------------------------------------------------------
  if (!src.includes('onClick={handleGenerateClick}')) {
    failures.push(
      'diálogo Simples: o botão "Gerar vídeo" não chama handleGenerateClick — sem essa ponte, o tier ' +
        "Simples nunca abre o diálogo de confirmação, e o botão principal volta a disparar a geração " +
        "direto, sem nenhuma revisão antes de gastar.",
    );
  }
  if (
    !/function handleGenerateClick\(\) \{\s*\n\s*if \(wizard\.tierVideo === "simples"\) \{/.test(src)
  ) {
    failures.push(
      "diálogo Simples: handleGenerateClick não abre o diálogo condicionado ao tier Simples — sem essa " +
        "condição, ou o diálogo aparece para todo tier (incomodando quem já tem aprovação própria no " +
        "fal), ou nunca aparece para nenhum.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      'diálogo Simples: "Corrigir" nunca chama handleGenerate/api.post, "Confirmar e gerar" é o único ' +
        "caminho que dispara a geração a partir do diálogo, e os dois botões estão ligados ao handler " +
        "certo — provado por recorte de nome de função e fiação literal do onClick.",
    );
  }

  return { failures, notes };
}
