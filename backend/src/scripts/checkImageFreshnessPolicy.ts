/**
 * A imagem do frontend em execução corresponde ao repositório?
 *
 * O modo de falha que isto detecta já aconteceu e é o mais desagradável do
 * projeto: a imagem era anterior ao commit que acrescentou
 * `__MAX_IMAGE_BYTES__` ao `vite.config.ts`. Esse arquivo **não está no bind
 * mount** e o código que o consome **está** — então o container servia um
 * bundle referenciando um `define` inexistente e a app inteira ficava em
 * branco, com console limpo, Vite anunciando `ready` e healthcheck verde.
 *
 * Nada no ambiente dizia "a imagem está velha". Todos os sinais disponíveis
 * diziam o contrário. Esta guarda é o sinal que faltava.
 *
 * O QUE ELA NÃO FAZ, de propósito: reprovar quando o frontend está fora do ar.
 * O gate também é usado como verificação de código, e amarrá-lo a um serviço
 * de pé transformaria "rodei o check com o compose parado" em falha — o tipo
 * de falso positivo que ensina a ignorar o gate. Inalcançável vira NOTA, e a
 * nota diz que a verificação não aconteceu, em vez de fingir que passou.
 */
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface ImageFreshnessResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "frescor: imagem do frontend corresponde ao repositório",
    name: "arquivo fora do bind mount muda sem rebuild",
    kind: "obvio",
    file: "frontend/vite.config.ts",
    // Um comentário: não muda comportamento nenhum, não quebra o `tsc`, e o
    // bind mount não mostra este arquivo. É EXATAMENTE a forma do defeito real
    // — o repositório anda, a imagem fica para trás, e nada acusa.
    find: "const traefikHttpPort = Number(process.env.TRAEFIK_HTTP_PORT) || 8090;",
    replace:
      "// mutante do arnês: edição fora do bind mount, sem rebuild\nconst traefikHttpPort = Number(process.env.TRAEFIK_HTTP_PORT) || 8090;",
    // Caixa idêntica à da mensagem: o arnês compara com `includes`, que
    // diferencia maiúscula. Um `expect` com a caixa errada transforma guarda
    // saudável em mutante AMBÍGUO — foi o que aconteceu na primeira execução.
    expect: "NÃO corresponde ao repositório",
  },
  {
    guard: "frescor: imagem do frontend corresponde ao repositório",
    name: "a lista de arquivos carimbados esvazia",
    kind: "esperto",
    file: "frontend/image-stamp.mjs",
    // O carimbo continua existindo, continua sendo servido, continua batendo —
    // porque passou a cobrir NADA. Hash de conjunto vazio é estável, então a
    // guarda seguiria verde para sempre, e a imagem poderia divergir à
    // vontade. Uma guarda que compara dois valores sem verificar o que eles
    // cobrem é uma guarda que compara duas constantes.
    find: `export const STAMPED_FILES = ["package.json", "tsconfig.json", "vite.config.ts", "Dockerfile"];`,
    replace: `export const STAMPED_FILES = [];`,
    expect: "não cobre arquivo nenhum",
  },
];

/** Onde o frontend responde, de dentro da rede do compose. */
const FRONTEND_STAMP_URL = "http://frontend:5173/__image-stamp";

export async function checkImageFreshnessPolicy(repoRoot: string): Promise<ImageFreshnessResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const frontendDir = path.join(repoRoot, "frontend");

  // O módulo do carimbo é o MESMO usado no build — importado, não reimplementado.
  // Uma cópia da fórmula aqui divergiria da do Dockerfile em silêncio, e a
  // guarda passaria a comparar dois cálculos diferentes do mesmo nome.
  let computeStamp: (dir: string) => string;
  let stampedFiles: string[];
  try {
    const mod = await import(/* @vite-ignore */ `file://${path.join(frontendDir, "image-stamp.mjs")}`);
    computeStamp = mod.computeStamp;
    stampedFiles = mod.STAMPED_FILES;
  } catch (err) {
    failures.push(
      `frescor: não foi possível carregar frontend/image-stamp.mjs (${err instanceof Error ? err.message : String(err)}). ` +
        "Sem ele não há como comparar imagem e repositório, e a divergência volta a ser invisível.",
    );
    return { failures, notes };
  }

  // Guarda que não cobre nada é guarda que compara duas constantes.
  if (!Array.isArray(stampedFiles) || stampedFiles.length === 0) {
    failures.push(
      "frescor: o carimbo da imagem não cobre arquivo nenhum (STAMPED_FILES vazio). O hash de um " +
        "conjunto vazio é estável, então a comparação passaria para sempre enquanto a imagem diverge " +
        "à vontade — que é o defeito original, agora com aparência de verificação.",
    );
    return { failures, notes };
  }

  const doRepo = computeStamp(frontendDir);

  let daImagem: string | null = null;
  try {
    const res = await fetch(FRONTEND_STAMP_URL, { signal: AbortSignal.timeout(4000) });
    if (res.ok) daImagem = (await res.text()).trim();
  } catch {
    // Frontend fora do ar. Tratado abaixo como nota, não falha.
  }

  if (daImagem === null) {
    notes.push(
      `frescor: NÃO VERIFICADO — o frontend não respondeu em ${FRONTEND_STAMP_URL}. ` +
        "A imagem pode estar velha sem que nada acuse; suba o serviço e rode de novo.",
    );
    return { failures, notes };
  }

  if (daImagem === "sem-carimbo") {
    failures.push(
      "frescor: a imagem do frontend em execução não tem carimbo — foi construída antes desta " +
        "invariante existir, e por isso é velha por definição. Rode `docker compose build frontend`.",
    );
    return { failures, notes };
  }

  if (daImagem !== doRepo) {
    failures.push(
      `frescor: a imagem do frontend NÃO corresponde ao repositório (imagem=${daImagem}, repo=${doRepo}). ` +
        `Algum destes mudou sem rebuild: ${stampedFiles.join(", ")}. ` +
        "Eles são COPIADOS para a imagem e não montados, então a edição não tem efeito nenhum em " +
        "execução — e o sintoma pode ser a app inteira em branco, com o console limpo e o Vite " +
        "anunciando `ready`. Conserto: `docker compose build frontend && docker compose up -d frontend`.",
    );
    return { failures, notes };
  }

  notes.push(
    `frescor: imagem do frontend confere com o repositório (${daImagem}), ` +
      `${stampedFiles.length} arquivo(s) fora do bind mount carimbado(s)`,
  );
  return { failures, notes };
}
