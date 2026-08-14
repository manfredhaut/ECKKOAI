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
import { FRONTEND_STAMP_URL, fetchStamp } from "./frontendStampFetch.js";

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
  {
    guard: "frescor: imagem do frontend corresponde ao repositório",
    name: "404 do carimbo volta a virar NOTA, não FALHA",
    kind: "esperto",
    // O defeito real que a migração para nginx (VITE-PROD-3) expôs: um
    // `dist/__image-stamp` ausente faz nginx devolver 404, e a versão antiga
    // desta guarda tratava QUALQUER res.ok===false — inclusive uma resposta
    // HTTP de verdade — como "serviço fora do ar", uma NOTA em vez de FALHA.
    // Este mutante reintroduz exatamente isso: colapsa "respondeu com
    // erro" de volta em "não respondeu", dentro de fetchStamp()
    // (frontendStampFetch.ts) — sem tocar no autoteste, que continua em
    // checkImageFreshnessPolicy.ts chamando a MESMA fetchStamp() mutada.
    // Mirar o arquivo EXTRAÍDO, e não este, evita a auto-colisão: um
    // mutante que mira o arquivo que o declara conta 2x para
    // checkMutantRegistryPolicy (uma vez dentro do próprio `find`, outra no
    // código real) e reprova por ambiguidade antes de rodar gate nenhum.
    file: "backend/src/scripts/frontendStampFetch.ts",
    find: `  if (!response.ok) return { kind: "http-error", status: response.status };`,
    replace: `  if (!response.ok) return { kind: "off" };`,
    expect: "autoteste — uma resposta HTTP não-2xx",
  },
];

export async function checkImageFreshnessPolicy(repoRoot: string): Promise<ImageFreshnessResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // Autoteste sintético: prova que "respondeu, mas não-2xx" vira FALHA, sem
  // depender do que o frontend REAL está servindo agora (que pode ser 200
  // legitimamente, e nesse caso o ramo abaixo nunca executaria na prática).
  // Troca `globalThis.fetch` por uma resposta 404 fabricada, chama a MESMA
  // `fetchStamp()` que a checagem real usa mais abaixo — não uma cópia da
  // lógica — e restaura no `finally`. Mesmo padrão de `checkPollPolicy.ts`.
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const autoteste = await fetchStamp();
    if (autoteste.kind !== "http-error") {
      failures.push(
        'frescor: autoteste — uma resposta HTTP não-2xx do endpoint do carimbo deveria ser ' +
          `classificada como "http-error", veio "${autoteste.kind}". Se isto ficar "off", um 404 ` +
          "(serviço no ar, carimbo ausente) fica indistinguível de serviço fora do ar — e essa " +
          "distinção é o que faz um dist/__image-stamp faltando virar FALHA, não NOTA.",
      );
    }
  } finally {
    globalThis.fetch = fetchOriginal;
  }

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
  const resultado = await fetchStamp();

  if (resultado.kind === "off") {
    notes.push(
      `frescor: NÃO VERIFICADO — o frontend não respondeu em ${FRONTEND_STAMP_URL}. ` +
        "A imagem pode estar velha sem que nada acuse; suba o serviço e rode de novo.",
    );
    return { failures, notes };
  }

  if (resultado.kind === "http-error") {
    failures.push(
      `frescor: o frontend respondeu ${resultado.status} em ${FRONTEND_STAMP_URL} — o serviço está ` +
        "no ar, mas o carimbo não está sendo servido. Num deploy de nginx isto tipicamente é " +
        "dist/__image-stamp ausente (o passo que grava o carimbo caiu do build), que é exatamente o " +
        "tipo de defeito que esta guarda existe para não deixar passar em silêncio. " +
        "Conserto: confira o `RUN ... node image-stamp.mjs . > dist/__image-stamp` no Dockerfile.",
    );
    return { failures, notes };
  }

  const daImagem = resultado.text;

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
