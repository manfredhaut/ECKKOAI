/**
 * Backup do Postgres local (`tools/backup-db.mjs`, S1.3/T1, 22/08/2026) — a
 * guarda prova por EXECUÇÃO, não por grep, porque o script é Node puro (sem
 * dependência de npm) e roda dentro deste mesmo container sem precisar do
 * `vite build`/Docker socket que outras guardas deste arquivo não têm.
 *
 * O QUE ISTO NÃO PROVA, de propósito: que `pg_dump` de verdade sai do
 * container `postgres`. Este gate roda dentro do container do BACKEND, sem
 * socket do Docker (`/var/run/docker.sock` não existe lá — medido em
 * 22/08/2026), então `runPgDump()` (o único trecho que chama
 * `docker compose exec`) é estruturalmente inalcançável daqui. A mesma
 * lacuna já é aceita e registrada para `vite build`
 * (`checkFrontendBuildEnvPolicy.ts`) — texto e execução da lógica PURA, nunca
 * o processo externo. O que ESTA guarda prova por execução real: que um dump
 * truncado nunca é aceito como válido, e que a retenção nunca apaga um
 * arquivo fora do padrão de nome que este script cria — as duas partes que
 * não dependem do Docker para serem verdadeiras ou falsas.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface BackupCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "backup: um dump sem o marcador de conclusão do pg_dump é recusado, nunca gravado",
    name: "isValidDumpText para de exigir o marcador de fim do dump",
    kind: "obvio",
    file: "tools/backup-db.mjs",
    find: 'return text.includes(DUMP_START_MARKER) && text.includes(DUMP_COMPLETE_MARKER);',
    replace: "return text.includes(DUMP_START_MARKER);",
    expect: "isValidDumpText(truncado) devolveu true, esperado false",
  },
  {
    guard: "backup: um dump minúsculo (corpo de erro, não dump de verdade) é recusado",
    name: "MIN_DUMP_BYTES deixa de barrar um corpo minúsculo",
    kind: "esperto",
    // ESPERTO: os dois marcadores continuam exigidos — um corpo de erro
    // curto que por acaso contivesse as duas frases (ex.: uma mensagem de
    // log citando-as) passaria a validação sem este piso de tamanho.
    file: "tools/backup-db.mjs",
    find: "const MIN_DUMP_BYTES = 1024;",
    replace: "const MIN_DUMP_BYTES = 0;",
    expect: "isValidDumpText(minusculo) devolveu true, esperado false",
  },
  {
    guard: "backup: a retenção só apaga arquivo que bate com o padrão de nome deste script — nunca um `*` genérico",
    name: "selectBackupsToPrune para de filtrar pelo padrão de nome",
    kind: "esperto",
    // ESPERTO, e é o mutante que mais importa aqui: a mesma classe de
    // defeito do incidente `DELETE FROM sessions WHERE sess->>'tenantId'`
    // (PLANO-MESTRE-SEQUENCIAL.md §4) — um filtro de amplitude que apaga
    // além do que deveria. Continua existindo teto de IDADE (maxAgeDays);
    // só o filtro de NOME some, então qualquer arquivo antigo dentro de
    // backups/ — inclusive um que este script nunca criou — vira apagável.
    file: "tools/backup-db.mjs",
    find: "return entries.filter((e) => BACKUP_FILE_PATTERN.test(e.name) && e.mtimeMs < cutoffMs).map((e) => e.name);",
    replace: "return entries.filter((e) => e.mtimeMs < cutoffMs).map((e) => e.name);",
    expect: "selectBackupsToPrune apagaria um arquivo fora do padrão de nome de backup",
  },
  {
    guard: "backup: backups/ está fora do controle de versão",
    name: "backups/ some do .gitignore",
    kind: "obvio",
    file: ".gitignore",
    find: "backups/",
    replace: "backupsXXX/",
    expect: "backup: `backups/` não está no .gitignore",
  },
];

const BACKUP_SCRIPT_REL = "tools/backup-db.mjs";
const GITIGNORE_REL = ".gitignore";
const PACKAGE_JSON_REL = "package.json";

interface BackupModuleShape {
  isValidDumpText: (text: string) => boolean;
  selectBackupsToPrune: (
    entries: { name: string; mtimeMs: number }[],
    maxAgeDays: number,
    now?: Date,
  ) => string[];
  backupFilename: (date?: Date) => string;
  BACKUP_FILE_PATTERN: RegExp;
  DEFAULT_RETENTION_DAYS: number;
}

export async function checkBackupPolicy(repoRoot: string): Promise<BackupCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------
  // 1. FIAÇÃO — texto. `npm run backup-db` existe, e `backups/` nunca entra
  // no git (é um dump inteiro do banco a cada rodada).
  // ---------------------------------------------------------------------
  let packageJsonSrc: string;
  try {
    packageJsonSrc = await readFile(path.join(repoRoot, PACKAGE_JSON_REL), "utf-8");
  } catch {
    failures.push(`backup: não consegui ler ${PACKAGE_JSON_REL} para conferir o atalho de backup.`);
    return { failures, notes };
  }
  if (!/"backup-db"\s*:\s*"node tools\/backup-db\.mjs"/.test(packageJsonSrc)) {
    failures.push(
      `backup: package.json não declara o atalho "backup-db" apontando para ${BACKUP_SCRIPT_REL} — ` +
        "sem ele, rodar o backup exige lembrar o caminho do script de cabeça.",
    );
  }

  let gitignoreSrc: string;
  try {
    gitignoreSrc = await readFile(path.join(repoRoot, GITIGNORE_REL), "utf-8");
  } catch {
    failures.push(`backup: não consegui ler ${GITIGNORE_REL} para conferir se backups/ está ignorado.`);
    return { failures, notes };
  }
  if (!/^backups\/\s*$/m.test(gitignoreSrc)) {
    failures.push(
      "backup: `backups/` não está no .gitignore — um dump inteiro do Postgres (dezenas de MB, dados de " +
        "tenant) entraria no histórico do git no primeiro `git add -A` distraído.",
    );
  }

  // ---------------------------------------------------------------------
  // 2. EXECUÇÃO REAL das funções puras de tools/backup-db.mjs — nunca
  // grep. `?bust=` invalida o cache de módulo ESM do Node: sem isso, uma
  // segunda leitura (mutante revertido) devolveria a versão em cache da
  // PRIMEIRA importação, e o mutante pareceria não ter efeito.
  // ---------------------------------------------------------------------
  const scriptFull = path.join(repoRoot, BACKUP_SCRIPT_REL);
  let mod: BackupModuleShape;
  try {
    mod = (await import(`file://${scriptFull.replace(/\\/g, "/")}?bust=${Date.now()}-${Math.random()}`)) as BackupModuleShape;
  } catch (err) {
    failures.push(
      `backup: ${BACKUP_SCRIPT_REL} não pôde ser importado para execução (${
        err instanceof Error ? err.message : String(err)
      }) — um erro de sintaxe aqui quebraria o backup real sem que ninguém percebesse até precisar dele.`,
    );
    return { failures, notes };
  }

  const dumpValido = "-- PostgreSQL database dump\n" + "x".repeat(2000) + "\n-- PostgreSQL database dump complete\n";
  const dumpTruncado = "-- PostgreSQL database dump\n" + "x".repeat(2000);
  const dumpMinusculo = "-- PostgreSQL database dump\n-- PostgreSQL database dump complete\n";

  if (mod.isValidDumpText(dumpValido) !== true) {
    failures.push("backup: isValidDumpText(dump válido) devolveu false, esperado true.");
  }
  if (mod.isValidDumpText(dumpTruncado) !== false) {
    failures.push(
      "backup: isValidDumpText(truncado) devolveu true, esperado false — um dump que morreu no meio " +
        "(processo matado, disco cheio) seria gravado como se tivesse saído inteiro.",
    );
  }
  if (mod.isValidDumpText(dumpMinusculo) !== false) {
    failures.push(
      "backup: isValidDumpText(minusculo) devolveu true, esperado false — um corpo de erro pequeno " +
        "passaria por dump válido.",
    );
  }

  const agora = new Date("2026-08-22T00:00:00Z");
  const entradas = [
    { name: "twinai-2026-08-01T000000Z.sql.gz", mtimeMs: new Date("2026-08-01T00:00:00Z").getTime() }, // 21 dias — deve podar
    { name: "twinai-2026-08-20T000000Z.sql.gz", mtimeMs: new Date("2026-08-20T00:00:00Z").getTime() }, // 2 dias — mantém
    { name: "outro-arquivo-qualquer.txt", mtimeMs: new Date("2026-01-01T00:00:00Z").getTime() }, // fora do padrão — NUNCA apaga
  ];
  const podados = mod.selectBackupsToPrune(entradas, 14, agora);
  if (!podados.includes("twinai-2026-08-01T000000Z.sql.gz")) {
    failures.push("backup: selectBackupsToPrune não apagaria o backup de 21 dias, esperado que apagasse.");
  }
  if (podados.includes("twinai-2026-08-20T000000Z.sql.gz")) {
    failures.push("backup: selectBackupsToPrune apagaria o backup de 2 dias, esperado que mantivesse.");
  }
  if (podados.includes("outro-arquivo-qualquer.txt")) {
    failures.push(
      "backup: selectBackupsToPrune apagaria um arquivo fora do padrão de nome de backup — mesma classe " +
        "de defeito do incidente `DELETE FROM sessions WHERE sess->>'tenantId'` (PLANO-MESTRE-SEQUENCIAL.md " +
        "§4): filtro de amplitude apagando além do que deveria.",
    );
  }

  if (mod.BACKUP_FILE_PATTERN.test(mod.backupFilename(new Date("2026-08-22T10:46:32.123Z"))) !== true) {
    failures.push(
      "backup: BACKUP_FILE_PATTERN não reconhece o nome que backupFilename() realmente gera — a retenção " +
        "nunca apagaria backup nenhum, silenciosamente, e o diretório cresceria para sempre.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "backup: pg_dump dentro do container postgres, validado por marcador de início/fim + tamanho " +
        "mínimo, comprimido e gravado com retenção configurável — provado por EXECUÇÃO das funções puras " +
        "(tools/backup-db.mjs). A chamada real ao Docker (`runPgDump`) é estruturalmente inalcançável " +
        "deste gate (sem socket do Docker no container do backend) — lacuna registrada, não fingida como " +
        "coberta, mesmo padrão de checkFrontendBuildEnvPolicy.ts.",
    );
  }

  return { failures, notes };
}
