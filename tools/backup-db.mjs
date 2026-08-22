#!/usr/bin/env node
/**
 * Backup lógico do Postgres local — `pg_dump` dentro do container,
 * comprimido em disco, com retenção simples.
 *
 *   node tools/backup-db.mjs
 *   npm run backup-db
 *
 * Existe porque HOJE não existe NENHUM backup deste banco (S1.3, 22/08/2026:
 * busca exaustiva no repositório por "pg_dump"/"backup" deu zero). O volume
 * nomeado `twinai_pgdata` sobrevive a `docker compose up`/`restart`, mas não
 * sobrevive a `docker volume rm` por engano, disco corrompido, ou a máquina
 * de desenvolvimento sendo trocada.
 *
 * Roda no HOST, não dentro do container do backend — precisa do `docker`
 * para falar com o serviço `postgres` do Compose, e o backend não tem acesso
 * ao socket do Docker (medido: `/var/run/docker.sock` não existe lá dentro).
 * `pg_dump` acontece DENTRO do container `postgres`, via `docker compose
 * exec`, usando as MESMAS variáveis que o próprio container já tem
 * (`POSTGRES_USER`/`POSTGRES_DB`, ver docker-compose.yml) — este script nunca
 * lê nem manuseia credencial nenhuma, só orquestra dois processos.
 *
 * ---------------------------------------------------------------------------
 * O QUE É VALIDADO ANTES DE GRAVAR
 *
 * `pg_dump` termina com um marcador PRÓPRIO só quando o dump saiu inteiro:
 * "-- PostgreSQL database dump complete". Uma transferência que morre no
 * meio (processo matado, disco cheio, container reiniciado durante o dump)
 * produz um arquivo que PARECE um dump — começa igual — mas não tem esse
 * marcador no fim. `isValidDumpText` exige os dois marcadores (início E fim)
 * mais um tamanho mínimo, e um dump que falhe nessa checagem NUNCA é
 * gravado em disco — o script aborta antes de criar o arquivo, para nunca
 * deixar uma cópia corrompida se fazendo passar por backup válido.
 * ---------------------------------------------------------------------------
 */
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKUP_DIR = path.join(ROOT, "backups");

/**
 * Dias que um dump sobrevive antes de ser apagado pela rotina de retenção.
 *
 * 14, e não um número maior: este backup é a rede de segurança de um banco
 * de DESENVOLVIMENTO local (34 tenants, escala pequena hoje) rodando 1x/dia
 * — 14 cópias diárias já cobrem duas semanas de trabalho, o suficiente para
 * notar um problema e ainda ter uma cópia boa por perto. Configurável para
 * quando a escala mudar.
 */
export const DEFAULT_RETENTION_DAYS = 14;

const DUMP_START_MARKER = "-- PostgreSQL database dump";
const DUMP_COMPLETE_MARKER = "-- PostgreSQL database dump complete";

/** Abaixo disto não é dump nenhum — é ruído ou uma resposta de erro. */
const MIN_DUMP_BYTES = 1024;

/**
 * Nome do arquivo de um backup, dado o instante. SEM dois-pontos (inválido
 * em nome de arquivo no Windows, o host deste projeto).
 */
export function backupFilename(date = new Date()) {
  const iso = date.toISOString().replace(/:/g, "").replace(/\.\d+Z$/, "Z");
  return `twinai-${iso}.sql.gz`;
}

/** Só arquivos que ESTE script pode ter criado — nunca um `*` genérico. */
export const BACKUP_FILE_PATTERN = /^twinai-\d{4}-\d{2}-\d{2}T\d{6}Z\.sql\.gz$/;

/**
 * O dump tem o tamanho de um dump de verdade e terminou onde `pg_dump`
 * termina um dump que saiu inteiro. Ver o cabeçalho do arquivo para o
 * porquê dos dois marcadores.
 */
export function isValidDumpText(text) {
  if (typeof text !== "string" || text.length < MIN_DUMP_BYTES) return false;
  return text.includes(DUMP_START_MARKER) && text.includes(DUMP_COMPLETE_MARKER);
}

/**
 * Quais arquivos a retenção apagaria, dada uma lista `{name, mtimeMs}` e o
 * "agora". Pura — não toca o disco — para poder ser testada com uma lista
 * fabricada, sem depender do relógio real nem de arquivos existirem.
 *
 * Filtra por `BACKUP_FILE_PATTERN` ANTES de considerar a idade: um arquivo
 * que não bate com o padrão nunca entra na lista de apagáveis, não importa
 * a idade — a mesma lição do incidente de `DELETE FROM sessions WHERE
 * sess->>'tenantId'` (PLANO-MESTRE-SEQUENCIAL.md §4): amplitude por engano é
 * mais cara do que parecer conservador demais.
 */
export function selectBackupsToPrune(entries, maxAgeDays, now = new Date()) {
  const cutoffMs = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return entries.filter((e) => BACKUP_FILE_PATTERN.test(e.name) && e.mtimeMs < cutoffMs).map((e) => e.name);
}

function runPgDump() {
  // `sh -c` roda DENTRO do container `postgres` — as variáveis são as DELE,
  // lidas no ambiente que o Compose já injeta (docker-compose.yml). O host
  // nunca vê `POSTGRES_USER`/`POSTGRES_PASSWORD`, e este processo também não.
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "sh", "-c", 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );
  if (result.error) {
    throw new Error(`Não consegui chamar o Docker: ${result.error.message}`);
  }
  if (result.status !== 0) {
    // stderr do pg_dump não carrega segredo (erro de conexão, sintaxe, etc.)
    // — é diagnóstico, não credencial. Ainda assim, cortado: um erro gigante
    // não precisa virar uma parede de texto no terminal.
    const detalhe = (result.stderr || "").slice(0, 500);
    throw new Error(`pg_dump saiu com código ${result.status}. ${detalhe}`);
  }
  return result.stdout;
}

function main() {
  console.log("  Backup do Postgres — iniciando pg_dump dentro do container...");
  const dumpText = runPgDump();

  if (!isValidDumpText(dumpText)) {
    console.error(
      `\n  ABORTADO: a saída do pg_dump não parece um dump válido (tamanho ${dumpText.length} bytes, ` +
        `marcadores de início/fim conferidos). Nada foi gravado em disco — um backup que parece bom e não é ` +
        "é pior do que nenhum backup.\n",
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = backupFilename();
  const gz = gzipSync(Buffer.from(dumpText, "utf8"));
  writeFileSync(path.join(BACKUP_DIR, filename), gz);
  console.log(`  ✓ ${filename} — ${dumpText.length} bytes brutos, ${gz.length} comprimidos.`);

  const maxAgeDays = Number(process.env.BACKUP_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
  const entries = existsSync(BACKUP_DIR)
    ? readdirSync(BACKUP_DIR).map((name) => ({ name, mtimeMs: statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    : [];
  const toPrune = selectBackupsToPrune(entries, maxAgeDays);
  for (const name of toPrune) {
    unlinkSync(path.join(BACKUP_DIR, name));
  }
  if (toPrune.length > 0) {
    console.log(`  Retenção (${maxAgeDays} dias): ${toPrune.length} backup(s) antigo(s) removido(s).`);
  }
}

// Só roda main() quando chamado diretamente (`node tools/backup-db.mjs`) —
// importado pela guarda de política, as funções acima não devem disparar
// um pg_dump de verdade. Comparação por caminho RESOLVIDO (não por string
// de URL): no Windows, `import.meta.url` e um `file://` montado à mão
// divergem em caixa de unidade ("C:" vs "c:") e barras, e a comparação
// literal falhava em silêncio — main() nunca rodava e o script não dizia
// nada, nem erro.
const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
  try {
    main();
  } catch (err) {
    console.error(`\n  Falhou: ${err.message}\n`);
    process.exitCode = 1;
  }
}
