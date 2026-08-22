/**
 * Diálogo de confirmação antes de qualquer chamada paga — T3 (Simples,
 * 22/08/2026) estendido a Normal/Premium em G3, mesma data.
 *
 * NASCEU só para o tier Simples/HeyGen (disparo direto no fornecedor, sem
 * artefato intermediário para aprovar antes de pagar). G3 generalizou
 * `handleGenerateClick` para abrir o MESMO diálogo nos três tiers: em
 * Normal/Premium ele mostra o custo FIXO da composição
 * (`PRECOS_FAL.comporUsd`, único número certo antes do clique nesse
 * caminho) e avisa que animar e narrar+sincronizar têm aprovação própria
 * depois — a pausa que JÁ existia (`awaiting_approval`) continua existindo,
 * sem relação com este diálogo, que é ANTES da composição.
 *
 * O QUE ISTO PROVA: (1) o clique em "Corrigir" NUNCA dispara `POST /videos`,
 * nos três tiers; (2) `handleGenerateClick` abre o diálogo SEMPRE, não mais
 * só para "simples" — a condição por tier foi REMOVIDA de propósito; (3) o
 * conteúdo específico da fal (custo da composição, aviso de aprovação
 * própria) só aparece fora de "simples".
 *
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
    guard: 'diálogo de confirmação: "Corrigir" nunca dispara a rota de geração',
    name: "handleConfirmDialogCorrect passa a chamar handleGenerate também",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "  function handleConfirmDialogCorrect() {\n" +
      "    setLastCorrectionNote(correctionNote);\n" +
      "    setShowGenerateConfirm(false);\n" +
      "  }",
    replace:
      "  function handleConfirmDialogCorrect() {\n" +
      "    setLastCorrectionNote(correctionNote);\n" +
      "    setShowGenerateConfirm(false);\n" +
      "    void handleGenerate();\n" +
      "  }",
    expect: '"Corrigir" chama handleGenerate — nunca deveria disparar POST /videos',
  },
  {
    guard: 'diálogo de confirmação: os dois botões chamam o handler certo — nunca trocados',
    name: '"Corrigir" passa a chamar o handler de "Confirmar e gerar"',
    kind: "esperto",
    // ESPERTO: as duas funções continuam existindo, cada uma do jeito
    // certo — só a FIAÇÃO do botão troca, como um copiar-colar errado. O
    // mutante do "óbvio" acima não pegaria isto: handleConfirmDialogCorrect
    // continuaria sem chamar handleGenerate, só deixaria de ser chamado
    // pelo botão "Corrigir" nenhuma vez.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find: '<button type="button" className="btn btn-outline" onClick={handleConfirmDialogCorrect}>',
    replace: '<button type="button" className="btn btn-outline" onClick={handleConfirmDialogGenerate}>',
    expect: 'o botão "Corrigir" não está ligado a handleConfirmDialogCorrect',
  },
  {
    guard: "diálogo de confirmação: handleGenerateClick abre o diálogo para QUALQUER tier, não só Simples",
    name: "a condição por tier volta a existir em handleGenerateClick",
    kind: "esperto",
    // ESPERTO, e é a forma mais provável de isto regredir: alguém "otimiza"
    // devolvendo a condição que existia antes do G3, achando que só o
    // Simples precisa do diálogo — sem perceber que Normal/Premium agora
    // mostram o custo da composição por ELE. O efeito é o botão "Gerar
    // vídeo" voltar a disparar `POST /videos` DIRETO para Normal/Premium,
    // sem ninguém ter visto o custo fixo antes.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "  function handleGenerateClick() {\n" +
      "    setCorrectionNote(\"\");\n" +
      "    setShowGenerateConfirm(true);\n" +
      "  }",
    replace:
      "  function handleGenerateClick() {\n" +
      "    if (wizard.tierVideo === \"simples\") {\n" +
      "      setCorrectionNote(\"\");\n" +
      "      setShowGenerateConfirm(true);\n" +
      "      return;\n" +
      "    }\n" +
      "    void handleGenerate();\n" +
      "  }",
    expect: "handleGenerateClick voltou a condicionar o diálogo ao tier Simples",
  },
  {
    guard: "diálogo de confirmação: Normal/Premium mostram o custo da composição, não o custo estimado do vídeo",
    name: "o ramo fal do diálogo passa a mostrar estimatedCost em vez de composeCost",
    kind: "esperto",
    // ESPERTO: o rótulo muda de chave de tradução, mas o texto do bloco
    // continua parecendo plausível. O defeito é mostrar `estimate.costUsd`
    // (SEMPRE null/"sem medição" para fal) onde deveria mostrar
    // `estimate.composeCostUsd` (o único número certo neste caminho) — quem
    // lê o diálogo veria "sem medição" e teria a impressão de que NADA foi
    // medido, quando na verdade a composição TEM preço fixo conhecido.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "                        <strong>{t(\"createVideo.generate.falConfirm.composeCost\")}:</strong>{\" \"}\n" +
      "                        {estimate.composeCostUsd != null",
    replace:
      "                        <strong>{t(\"createVideo.generate.falConfirm.composeCost\")}:</strong>{\" \"}\n" +
      "                        {estimate.estimate.costUsd != null",
    expect: "o ramo fal do diálogo não lê mais composeCostUsd",
  },
  {
    guard: "diálogo de confirmação: o aviso de aprovação própria (animar/narrar+sincronizar) aparece fora do tier Simples",
    name: "o aviso de aprovação própria some do diálogo fal",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      '                {wizard.tierVideo !== "simples" && (\n' +
      '                  <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>\n' +
      '                    {t("createVideo.generate.falConfirm.animationNote")}\n' +
      "                  </p>\n" +
      "                )}",
    replace: "",
    expect: "não menciona mais falConfirm.animationNote",
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
    failures.push(`diálogo de confirmação: não consegui ler ${GENERATE_STEP_REL}.`);
    return { failures, notes };
  }

  // -------------------------------------------------------------------------
  // 1. O CORPO de handleConfirmDialogCorrect nunca chama handleGenerate nem
  // api.post — recorte pelo nome da função até o início da próxima.
  // -------------------------------------------------------------------------
  const inicioCorrigir = src.indexOf("function handleConfirmDialogCorrect() {");
  const inicioGerar = src.indexOf("function handleConfirmDialogGenerate() {");
  if (inicioCorrigir < 0 || inicioGerar < 0 || inicioGerar < inicioCorrigir) {
    failures.push(
      `diálogo de confirmação: não encontrei as duas funções (handleConfirmDialogCorrect, ` +
        `handleConfirmDialogGenerate) na ordem esperada em ${GENERATE_STEP_REL}.`,
    );
  } else {
    const corpoCorrigir = src.slice(inicioCorrigir, inicioGerar);
    // "handleGenerate()" (com parênteses), e não a substring solta
    // "handleGenerate" — o NOME da própria função (handleConfirmDialog…)
    // não colide, mas checar a chamada de verdade é o que sobrevive a um
    // próximo apelido que volte a conter o prefixo.
    if (corpoCorrigir.includes("handleGenerate()") || corpoCorrigir.includes("api.post(")) {
      failures.push(
        '"Corrigir" chama handleGenerate — nunca deveria disparar POST /videos. O botão existe ' +
          "exatamente para NÃO gastar, e uma chamada aqui furaria essa garantia sem nenhum aviso na " +
          "tela, nos três tiers.",
      );
    }

    // -----------------------------------------------------------------------
    // 2. O CORPO de handleConfirmDialogGenerate CHAMA handleGenerate — é o
    // único caminho que dispara a rota a partir do diálogo. Recorte até a
    // próxima âncora estável (`useEffect(() => {\n    return () => {`).
    // -----------------------------------------------------------------------
    const fimGerar = src.indexOf("useEffect(() => {\n    return () => {", inicioGerar);
    if (fimGerar < 0) {
      failures.push(
        `diálogo de confirmação: não encontrei o fim do recorte de handleConfirmDialogGenerate em ` +
          `${GENERATE_STEP_REL} (âncora do useEffect de limpeza do polling).`,
      );
    } else {
      const corpoGerar = src.slice(inicioGerar, fimGerar);
      if (!corpoGerar.includes("handleGenerate()")) {
        failures.push(
          '"Confirmar e gerar" não chama handleGenerate — o único botão do diálogo que deveria ' +
            "disparar a geração deixou de fazê-lo, e nenhum tier ficaria com caminho para gerar de " +
            "verdade a partir dele.",
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
      '<button type="button" className="btn btn-outline" onClick={handleConfirmDialogCorrect}>',
    )
  ) {
    failures.push(
      'o botão "Corrigir" não está ligado a handleConfirmDialogCorrect — a fiação do clique divergiu ' +
        "do texto do botão, e não há mais garantia de que ele não dispara a geração.",
    );
  }
  if (
    !src.includes(
      '<button type="button" className="btn btn-primary" onClick={handleConfirmDialogGenerate}>',
    )
  ) {
    failures.push('o botão "Confirmar e gerar" não está ligado a handleConfirmDialogGenerate.');
  }

  // -------------------------------------------------------------------------
  // 4. O botão "Gerar vídeo" abre o diálogo — SEMPRE, para os três tiers.
  //
  // G3: a condição `if (wizard.tierVideo === "simples")` que existia aqui
  // FOI REMOVIDA de propósito. Esta guarda agora prova o INVERSO do que
  // provava antes de G3 — que a condição por tier NÃO voltou.
  // -------------------------------------------------------------------------
  if (!src.includes("onClick={handleGenerateClick}")) {
    failures.push(
      'o botão "Gerar vídeo" não chama handleGenerateClick — sem essa ponte, o diálogo de confirmação ' +
        "nunca abre, e o botão principal dispara a geração direto, sem nenhuma revisão antes de gastar.",
    );
  }
  const inicioClick = src.indexOf("function handleGenerateClick() {");
  const fimClick = src.indexOf("\n  }", inicioClick);
  if (inicioClick < 0 || fimClick < 0) {
    failures.push(`diálogo de confirmação: não encontrei o corpo de handleGenerateClick em ${GENERATE_STEP_REL}.`);
  } else {
    const corpoClick = src.slice(inicioClick, fimClick);
    if (corpoClick.includes('wizard.tierVideo === "simples"')) {
      failures.push(
        "handleGenerateClick voltou a condicionar o diálogo ao tier Simples — Normal/Premium deixariam " +
          "de mostrar o custo fixo da composição e o aviso de aprovação própria antes do primeiro POST, " +
          "que é exatamente o que G3 fechou.",
      );
    }
    if (!corpoClick.includes("setShowGenerateConfirm(true)")) {
      failures.push(
        "handleGenerateClick não abre mais o diálogo (setShowGenerateConfirm(true) ausente) — nenhum " +
          "tier veria o diálogo antes do primeiro POST.",
      );
    }
  }

  // -------------------------------------------------------------------------
  // 5. Conteúdo ESPECÍFICO da fal — custo da composição e aviso de
  // aprovação própria — só fora de "simples", e lendo o campo CERTO
  // (composeCostUsd, nunca estimate.costUsd, que é sempre null para fal).
  // -------------------------------------------------------------------------
  if (!src.includes("createVideo.generate.falConfirm.composeCost")) {
    failures.push(
      "o diálogo de confirmação não menciona mais falConfirm.composeCost — Normal/Premium ficariam sem " +
        "mostrar o custo fixo da composição antes do clique.",
    );
  }
  if (!src.includes("estimate.composeCostUsd != null")) {
    failures.push(
      "o ramo fal do diálogo não lê mais composeCostUsd — se ele passou a ler estimate.estimate.costUsd " +
        '(sempre null/"sem medição" para fal), quem confirma veria "sem medição" onde existe um preço ' +
        "fixo conhecido.",
    );
  }
  if (!src.includes("createVideo.generate.falConfirm.animationNote")) {
    failures.push(
      "o diálogo de confirmação não menciona mais falConfirm.animationNote — o aviso de que animar e " +
        "narrar+sincronizar têm aprovação própria depois desapareceu.",
    );
  }
  if (!/wizard\.tierVideo !== "simples" &&[\s\S]{0,300}falConfirm\.animationNote/.test(src)) {
    failures.push(
      "o aviso de aprovação própria (falConfirm.animationNote) não está condicionado a " +
        '`wizard.tierVideo !== "simples"` — ele apareceria (ou sumiria) no tier errado.',
    );
  }

  if (failures.length === 0) {
    notes.push(
      '  diálogo de confirmação: "Corrigir" nunca chama handleGenerate/api.post e "Confirmar e gerar" ' +
        "é o único caminho que dispara a geração, nos três tiers — provado por recorte de nome de " +
        "função e fiação literal do onClick",
    );
    notes.push(
      "  diálogo de confirmação: handleGenerateClick abre o diálogo SEMPRE (sem condição por tier); " +
        "Normal/Premium mostram composeCostUsd (nunca estimate.costUsd) e o aviso de aprovação própria",
    );
  }

  return { failures, notes };
}
