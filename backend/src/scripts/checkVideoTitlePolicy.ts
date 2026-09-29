/**
 * TITULO-1, 29/09/2026 — o título do vídeo chega ao payload de POST /videos.
 *
 * Verificação PURA por leitura de arquivo, mesma técnica de
 * checkSpendControlPolicy.ts: recorta só o corpo de `corpoDaGeracao` (do
 * início da função até o próximo `\n}`) para que "a string aparece no
 * arquivo" signifique de fato "o campo é montado no corpo enviado" — e não
 * um comentário ou um uso homônimo em outra função do mesmo arquivo.
 *
 * NÃO cobre (deixado para leitura futura, antes de qualquer guarda nova):
 * se o título do usuário poderia ser confundido com o campo `title` que
 * heygen.generateVideo já envia ao fornecedor (visto no log do gate,
 * "video_payload_built" ... "title":"***REDACTED***") — os dois têm o
 * mesmo nome e vivem em arquivos diferentes; ainda não lido o
 * avatarProvider.ts para confirmar que são de fato independentes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface VideoTitleCheckResult {
  failures: string[];
  notes: string[];
}

const GENERATE_STEP = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

export function checkVideoTitlePolicy(repoRoot: string): VideoTitleCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const fonte = readFileSync(path.join(repoRoot, GENERATE_STEP), "utf8");
  const inicio = fonte.indexOf("export function corpoDaGeracao");
  const corpoDaGeracao = inicio >= 0 ? fonte.slice(inicio, fonte.indexOf("\n}", inicio)) : "";
  if (!corpoDaGeracao) {
    failures.push(
      `título: não achei \`corpoDaGeracao\` em ${GENERATE_STEP}. É a função que monta o corpo de POST ` +
        "/videos; sem ela a guarda do título não tem o que olhar.",
    );
    return { failures, notes };
  }

  if (!corpoDaGeracao.includes("title: wizard.title.trim()")) {
    failures.push(
      `título: ${GENERATE_STEP} monta o corpo de POST /videos sem \`title\` vindo de ` +
        "`wizard.title.trim()` — o campo pode existir na tela e nunca chegar ao servidor, que passaria " +
        "a recusar toda geração com 400 (título obrigatório).",
    );
  }

  notes.push("título: o corpo de POST /videos inclui title vindo de wizard.title.trim()");
  return { failures, notes };
}
