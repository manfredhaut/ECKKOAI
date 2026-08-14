/**
 * BASE_DOMAIN não pode cair em silêncio no default de desenvolvimento num
 * build de PRODUÇÃO do frontend.
 *
 * O defeito que isto fecha: `vite.config.ts` sempre teve
 * `process.env.BASE_DOMAIN ?? "twinai.localhost"`, coerente enquanto a
 * variável era lida a cada boot do dev server (VITE-PROD-1). Migrado o
 * frontend para build+nginx (VITE-PROD-3), a mesma leitura passa a
 * acontecer UMA VEZ, no build da imagem — e um build de produção sem
 * BASE_DOMAIN no ambiente assaria "twinai.localhost" no bundle publicado,
 * sem erro nenhum: links e QR codes de tenant errados, com aparência
 * normal, na frente de quem estiver vendo. É o "default silencioso", risco
 * nº1 identificado em VITE-PROD-2.
 *
 * O QUE ESTA GUARDA NÃO FAZ, de propósito: não roda `vite build`. O gate
 * inteiro roda dentro do container do backend, que não tem o projeto do
 * frontend instalado — só TEXTO. Ela prova que o INTERRUPTOR (`required()`
 * em vite.config.ts) existe e está com a condição certa; não prova que
 * `vite build` de fato lança e sai não-zero quando a condição dispara. Essa
 * prova de execução é uma LACUNA conhecida, registrada em VITE-PROD-3, não
 * fingida como coberta.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface FrontendBuildEnvCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "frontend: BASE_DOMAIN obrigatória em build de produção",
    name: "BASE_DOMAIN volta ao default sem guarda",
    kind: "obvio",
    file: "frontend/vite.config.ts",
    find: `const baseDomain = required("BASE_DOMAIN") || "twinai.localhost";`,
    replace: `const baseDomain = process.env.BASE_DOMAIN ?? "twinai.localhost";`,
    expect: "BASE_DOMAIN não usa required() em vite.config.ts",
  },
  {
    guard: "frontend: BASE_DOMAIN obrigatória em build de produção",
    name: "required() nunca reconhece produção (typo em NODE_ENV)",
    kind: "esperto",
    // A chamada `required("BASE_DOMAIN")` continua lá — passaria numa
    // guarda que só conferisse "a chamada existe". O typo faz o
    // interruptor nunca disparar em produção de VERDADE (NODE_ENV é
    // fixado literal "production" em docker-compose.prod.yml), e o build
    // volta a cair no default calado — com a aparência de proteção
    // presente.
    file: "frontend/vite.config.ts",
    find: `if (!value && process.env.NODE_ENV === "production") {`,
    replace: `if (!value && process.env.NODE_ENV === "producao") {`,
    expect: "required() não reconhece NODE_ENV=production",
  },
];

const VITE_CONFIG_REL = "frontend/vite.config.ts";

export async function checkFrontendBuildEnvPolicy(repoRoot: string): Promise<FrontendBuildEnvCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const full = path.join(repoRoot, VITE_CONFIG_REL);
  let source: string;
  try {
    source = await readFile(full, "utf-8");
  } catch {
    failures.push(
      `frontend: não consegui ler ${VITE_CONFIG_REL} para conferir a guarda de build de BASE_DOMAIN.`,
    );
    return { failures, notes };
  }

  if (!/const baseDomain = required\("BASE_DOMAIN"\)/.test(source)) {
    failures.push(
      "frontend: BASE_DOMAIN não usa required() em vite.config.ts — um build de produção sem a " +
        'variável no ambiente cairia calado em "twinai.localhost", sem erro nenhum. O build de ' +
        "produção precisa FALHAR quando BASE_DOMAIN está ausente, não gerar bundle com o valor errado.",
    );
  }

  if (!/if \(!value && process\.env\.NODE_ENV === "production"\) \{/.test(source)) {
    failures.push(
      'frontend: required() não reconhece NODE_ENV=production em vite.config.ts — o literal exato ' +
        '"production" precisa aparecer na condição, senão o interruptor nunca dispara em produção de ' +
        "verdade (docker-compose.prod.yml fixa NODE_ENV como esse literal) e a guarda vira aparência " +
        "sem efeito.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "frontend: BASE_DOMAIN obrigatória em build de produção via required(), interruptor confere " +
        "com o literal do compose",
    );
  }

  return { failures, notes };
}
