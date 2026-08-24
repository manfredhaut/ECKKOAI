#!/usr/bin/env node
/**
 * RODAR O GATE CONTRA UMA CÓPIA DA ÁRVORE — a peça que torna o arnês
 * paralelizável (V0, 24/08/2026).
 *
 * ┌─ Por que o gate não podia ser paralelo antes ────────────────────────────┐
 * │ `docker compose exec backend npm run check` sempre atinge o MESMO        │
 * │ container, e esse container monta `./backend/src` do repositório         │
 * │ principal. Dois mutantes ao mesmo tempo escreveriam no mesmo arquivo e   │
 * │ um leria a mutação do outro — não é lentidão, é impossibilidade.         │
 * │                                                                          │
 * │ Aqui cada execução é um container EFÊMERO (`docker run --rm`) montando   │
 * │ uma cópia própria da árvore. As cópias são `git worktree`, então custam  │
 * │ quase nada: MEDIDO em 24/08, criar CINCO levou 0,86 s.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ As montagens são as do compose, uma a uma, e a lista é a parte frágil ──┐
 * │ O serviço `backend` monta 15 caminhos, e o gate lê TODOS: `/app/src`     │
 * │ para o `tsc`, `/repo/...` para as guardas que inspecionam o repositório. │
 * │ Descobri a lista por tentativa — cada montagem faltando produziu uma     │
 * │ violação diferente e nomeada (`/app/docs` ausente, `image-stamp.mjs` não │
 * │ encontrado, `.gitignore` ilegível), o que ajudou.                        │
 * │                                                                          │
 * │ ⚠️ Uma montagem NOVA no compose e ausente aqui faz o gate paralelo        │
 * │ reprovar por falta de arquivo, e o sintoma vai parecer defeito da guarda │
 * │ e não da lista. É a fragilidade conhecida desta abordagem, e existe uma  │
 * │ guarda comparando as duas listas (`checkGateRunnerPolicy`).             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MEDIÇÕES de 24/08, 12 núcleos:
 *
 *   N=1   16,4 s   16,4 s por gate   0,061 gates/s
 *   N=4   28,0 s    7,0 s por gate   0,143 gates/s
 *   N=6   37,8 s    6,3 s por gate   0,159 gates/s   <- ótimo
 *   N=10  66,6 s    6,7 s por gate   0,150 gates/s
 *
 * A vazão sobe até 6 e CAI a partir daí — o `tsc` satura a CPU. Por isso o
 * default é 6, e não "quantos núcleos houver".
 */
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** O serviço do compose de onde saem a imagem, a rede e o ambiente. */
const SERVICO = "twinai-backend-1";
const IMAGEM = "twinai-backend";
const REDE = "twinai_twinai";

/**
 * As montagens que o gate precisa, relativas à RAIZ da cópia.
 *
 * `origem` é relativa ao worktree; `destino` é absoluto no container. A única
 * exceção é `uploads`, que aponta sempre para o repositório principal: ele é
 * ignorado pelo git (não existe no worktree) e o gate só precisa que o
 * diretório exista.
 */
export const MONTAGENS = [
  { origem: "backend/src", destino: "/app/src", ro: true },
  { origem: "docs", destino: "/app/docs", ro: true },
  { origem: "docker-compose.yml", destino: "/repo/docker-compose.yml", ro: true },
  { origem: "package.json", destino: "/repo/package.json", ro: true },
  { origem: ".gitignore", destino: "/repo/.gitignore", ro: true },
  { origem: "tools", destino: "/repo/tools", ro: true },
  { origem: "backend/src", destino: "/repo/backend/src", ro: true },
  { origem: "backend/scripts", destino: "/repo/backend/scripts", ro: true },
  { origem: "frontend/src", destino: "/repo/frontend/src", ro: true },
  { origem: "frontend/package.json", destino: "/repo/frontend/package.json", ro: true },
  { origem: "frontend/tsconfig.json", destino: "/repo/frontend/tsconfig.json", ro: true },
  { origem: "frontend/vite.config.ts", destino: "/repo/frontend/vite.config.ts", ro: true },
  { origem: "frontend/Dockerfile", destino: "/repo/frontend/Dockerfile", ro: true },
  { origem: "frontend/image-stamp.mjs", destino: "/repo/frontend/image-stamp.mjs", ro: true },
];

/** Lido UMA vez: `docker inspect` custa ~0,3 s e o valor não muda na passada. */
let ambienteEmCache = null;

/**
 * O ambiente do container real, repassado ao efêmero.
 *
 * Copiado do serviço em execução em vez de remontado a partir do `.env`: são
 * 49 variáveis, e uma diferença entre o que o gate vê aqui e o que ele vê no
 * container de verdade faria o arnês paralelo medir OUTRA configuração — o
 * tipo de divergência que só aparece quando um mutante passa aqui e reprova
 * lá.
 */
export function ambienteDoServico() {
  if (ambienteEmCache) return ambienteEmCache;
  const bruto = execFileSync(
    "docker",
    ["inspect", SERVICO, "--format", "{{range .Config.Env}}{{println .}}{{end}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  ambienteEmCache = bruto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l));
  return ambienteEmCache;
}

/**
 * Roda `npm run check` contra `arvore`, num container efêmero.
 *
 * Mesmo contrato de retorno do `runGate` serial que ele substitui:
 * `{ code, output }`, nunca lança. O `maxBuffer` de 32 MiB é o mesmo, e pela
 * mesma razão medida em 12/08: a saída do gate passa de 1 MiB com facilidade,
 * e truncada ela perde a mensagem da guarda — que sai no fim — fazendo um
 * mutante correto ser reportado como AMBÍGUO.
 */
export function argumentosDoGate(arvore, env = {}) {
  const base = Object.prototype.hasOwnProperty.call(env, "PROVIDER_MODE")
    ? env
    : { PROVIDER_MODE: "fixture", ...env };

  const args = ["run", "--rm", "--network", REDE, "-w", "/app"];
  for (const m of MONTAGENS) {
    const origem = path.join(arvore, m.origem);
    args.push("-v", `${origem}:${m.destino}${m.ro ? ":ro" : ""}`);
  }
  // `uploads` do repositório PRINCIPAL: é ignorado pelo git, então não existe
  // na cópia, e o gate só precisa que o caminho exista.
  args.push("-v", `${path.join(repoRoot, "uploads")}:/app/uploads`);

  for (const linha of ambienteDoServico()) args.push("-e", linha);
  // Depois do ambiente do serviço, para VENCER: `ARNES_EM_CURSO` sinaliza que
  // há mutante aplicado (`checkMutantRegistryPolicy` pula a conferência de
  // cadastro, que sob mutação é falsa por construção), e o `env` do mutante
  // pode precisar sobrescrever um valor herdado.
  args.push("-e", "ARNES_EM_CURSO=1");
  for (const [k, v] of Object.entries(base)) args.push("-e", `${k}=${v}`);

  args.push(IMAGEM, "npm", "run", "check");
  return args;
}

/** Opções comuns às duas formas — ver o comentário do `maxBuffer` acima. */
function opcoesDeExecucao() {
  return {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    // `MSYS_NO_PATHCONV`: no Git Bash do Windows, os caminhos absolutos das
    // montagens (`/app/src`, `/repo/...`) são convertidos para caminhos
    // Windows antes de chegarem ao docker, e o container recebe
    // `C:/Program Files/Git/app/src`. Sem isto NENHUMA montagem funciona.
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  };
}

/**
 * Roda `npm run check` contra `arvore`. Síncrona — o caminho serial.
 *
 * Mesmo contrato do `runGate` que ela substitui: `{ code, output }`, nunca
 * lança. Saída 1 é o resultado ESPERADO na metade dos casos do arnês, e
 * transformá-la em exceção faria o `finally` da reversão competir com o
 * tratamento de erro.
 */
export function rodarGateEm(arvore, env = {}) {
  try {
    const out = execFileSync("docker", argumentosDoGate(arvore, env), {
      ...opcoesDeExecucao(),
      stdio: "pipe",
    });
    return { code: 0, output: out };
  } catch (err) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * A MESMA execução, assíncrona — é ela que torna o pool possível.
 *
 * Duas formas da mesma coisa, e não uma só: a serial existe para o modo
 * `--serial` (a retaguarda de quando o paralelo estiver sob suspeita), e uma
 * versão async chamada em sequência teria o mesmo efeito mas esconderia a
 * diferença. Elas COMPARTILHAM `argumentosDoGate` e `opcoesDeExecucao`, que é
 * onde uma divergência doeria.
 */
export function rodarGateEmAsync(arvore, env = {}) {
  return new Promise((resolve) => {
    execFile("docker", argumentosDoGate(arvore, env), opcoesDeExecucao(), (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, output: stdout });
      resolve({ code: err.code ?? 1, output: `${stdout ?? ""}${stderr ?? ""}` });
    });
  });
}
