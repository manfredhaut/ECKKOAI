/**
 * `tools/viteServeFreshness.mjs` — L1, 23/08/2026.
 *
 * A guarda prova por EXECUÇÃO das funções puras, e contra o CASO REAL do
 * incidente que a motivou: o bypass do diálogo de confirmação aconteceu
 * DUAS vezes (22/08 e 23/08), a segunda com `checkFrontendBundleFreshness`
 * já existindo e já integrado ao `tools/up.sh`. Ele não impediu por
 * ALCANCE, não por lógica — só roda quando alguém executa `up.sh`, e o
 * ambiente sobe por pelo menos seis caminhos, sendo `docker compose restart
 * frontend` (o conserto que o próprio gotcha 2 do CLAUDE.md manda rodar) um
 * dos que NÃO passam por lá.
 *
 * O mecanismo novo vive no HEALTHCHECK do container do frontend, que roda a
 * cada 10 s independentemente de por onde o container subiu. Esta guarda
 * cobre as duas metades disso:
 *
 *  · a LÓGICA — as funções puras pegam o caso real (servido = pré-G3,
 *    disco = pós-G3) e NÃO acusam o contraponto (servido = disco);
 *  · a FIAÇÃO — o `docker-compose.yml` monta `tools/` no frontend e o
 *    healthcheck de fato chama o script. Sem isso o mecanismo existe e
 *    nunca roda, que é exatamente o defeito que ele veio corrigir.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const SCRIPT_REL = "tools/viteServeFreshness.mjs";
const COMPOSE_REL = "docker-compose.yml";

/**
 * DISCO — recorte fiel do `GenerateStep.tsx` de HOJE: os dois handlers
 * renomeados no G3 e as duas chaves de i18n que o G3 acrescentou.
 */
const DISCO_ATUAL = `
  function handleConfirmDialogCorrect() {
    setLastCorrectionNote(correctionNote);
    setShowGenerateConfirm(false);
  }
  function handleConfirmDialogGenerate() {
    setShowGenerateConfirm(false);
    void handleGenerate();
  }
  const rotuloCusto = t("createVideo.generate.falConfirm.composeCost");
  const aviso = t("createVideo.generate.falConfirm.animationNote");
`;

/**
 * SERVIDO — o mesmo trecho como o Vite o devolvia DURANTE o incidente: os
 * nomes antigos, sem as chaves do G3. É o texto real de antes de `da5ff72`.
 */
const SERVIDO_OBSOLETO = `
  function handleSimpleConfirmCorrect() {
    setLastCorrectionNote(correctionNote);
    setShowSimpleConfirm(false);
  }
  function handleSimpleConfirmGenerate() {
    setShowSimpleConfirm(false);
    void handleGenerate();
  }
  const rotuloCusto = t("createVideo.generate.simpleConfirm.estimatedCost");
`;

export const MUTANTS: Mutant[] = [
  {
    guard: "frescor do Vite: sinaisDoDisco extrai chaves de i18n E nomes declarados",
    name: "sinaisDoDisco para de extrair os nomes declarados, só olha i18n",
    kind: "esperto",
    // ESPERTO: continua extraindo sinal, continua devolvendo uma lista, e o
    // caso real CONTINUA sendo pego (o G3 mexeu nas duas coisas ao mesmo
    // tempo). O que se perde é a classe de mudança que NÃO toca texto —
    // renomear um handler, trocar a condição de um clique — que é
    // exatamente a metade do G3 que nenhuma chave de i18n denunciaria.
    file: SCRIPT_REL,
    find: '  for (const m of limpo.matchAll(/\\bfunction\\s+([A-Za-z_$][\\w$]{3,})\\s*\\(/g)) sinais.add(m[1]);',
    replace: "  void limpo;",
    expect: "frescor do Vite: sinaisDoDisco não extraiu o nome de função declarada",
  },
  {
    guard: "frescor do Vite: comentário não vira sinal (senão todo arquivo acusa staleness falsa)",
    name: "semComentarios deixa de tirar os comentários de bloco",
    kind: "esperto",
    // ESPERTO: o transform do Vite APAGA comentários. Um nome que só existe
    // dentro de um comentário no disco nunca apareceria no servido, e a
    // checagem acusaria staleness em arquivo perfeitamente fresco. Falso
    // positivo em healthcheck é pior que checagem nenhuma: ensina a ignorar
    // o sinal, e aí o verdadeiro passa junto.
    file: SCRIPT_REL,
    find: '  return fonte.replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ").replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1 ");',
    replace: "  return fonte;",
    expect: "frescor do Vite: um nome que só existe em COMENTÁRIO virou sinal",
  },
  {
    guard: "frescor do Vite: estaObsoleto exige um mínimo de sinais antes de afirmar qualquer coisa",
    name: "estaObsoleto passa a afirmar staleness com sinal nenhum",
    kind: "esperto",
    // ESPERTO: o caminho feliz não muda em nada — arquivos reais têm dezenas
    // de sinais. O defeito só aparece no arquivo do qual não se extraiu
    // sinal alguma: sem o piso, uma lista vazia comparada com um servido
    // vazio viraria veredito, e o healthcheck passaria a opinar sobre o que
    // não mediu.
    file: SCRIPT_REL,
    find: "  if (!Array.isArray(sinais) || sinais.length < minimoDeSinais) return false;",
    replace: "  void minimoDeSinais;",
    expect: "frescor do Vite: estaObsoleto opinou sobre um arquivo sem sinal suficiente",
  },
  {
    guard: "frescor do Vite: o healthcheck do frontend chama o script",
    name: "a chamada ao script some do healthcheck do frontend",
    kind: "obvio",
    // Sem isto o mecanismo inteiro existe, é testado, e NUNCA roda — que é
    // literalmente o defeito que ele veio corrigir, um andar acima.
    file: COMPOSE_REL,
    find: " && node /app/tools/viteServeFreshness.mjs",
    replace: "",
    expect: "frescor do Vite: o healthcheck do frontend não chama mais",
  },
  {
    guard: "frescor do Vite: tools/ está montado no container do frontend",
    name: "o mount de tools/ some do serviço frontend",
    kind: "esperto",
    // ESPERTO: o healthcheck CONTINUA citando o script, então uma guarda que
    // só procurasse a chamada ficaria verde. Sem o mount, `node
    // /app/tools/...` falha com MODULE_NOT_FOUND — o container fica
    // permanentemente unhealthy, e a leitura fácil seria "o detector é
    // instável", não "faltou o mount".
    file: COMPOSE_REL,
    find: "      - ./tools:/app/tools:ro\n",
    replace: "",
    expect: "frescor do Vite: tools/ não está montado no serviço frontend",
  },
];

export interface ViteServeFreshnessCheckResult {
  failures: string[];
  notes: string[];
}

interface ModuloDeFrescor {
  semComentarios: (fonte: string) => string;
  sinaisDoDisco: (fonte: string) => string[];
  sinaisAusentesNoServido: (sinais: string[], servido: string) => string[];
  estaObsoleto: (input: { sinais: string[]; ausentes: string[]; minimoDeSinais?: number }) => boolean;
  escolherAlvo: (
    arquivos: { full: string; mtimeMs: number }[],
    lerFonte: (f: string) => string,
    minimoDeSinais?: number,
  ) => { full: string; sinais: string[] } | null;
}

export async function checkViteServeFreshnessPolicy(
  repoRoot: string,
): Promise<ViteServeFreshnessCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // `?bust=` invalida o cache de módulo ESM do Node — mesmo motivo de
  // checkFrontendBundleFreshnessPolicy.ts: sem isso um mutante revertido
  // leria a versão em cache da primeira importação.
  const full = path.join(repoRoot, SCRIPT_REL);
  let mod: ModuloDeFrescor;
  try {
    mod = (await import(
      `file://${full.replace(/\\/g, "/")}?bust=${Date.now()}-${Math.random()}`
    )) as unknown as ModuloDeFrescor;
  } catch (err) {
    failures.push(
      `frescor do Vite: ${SCRIPT_REL} não pôde ser importado (${err instanceof Error ? err.message : String(err)}).`,
    );
    return { failures, notes };
  }

  // ---------------------------------------------------------------------------
  // 1. SINAIS — os dois tipos, e nenhum vindo de comentário.
  // ---------------------------------------------------------------------------
  const sinais = mod.sinaisDoDisco(DISCO_ATUAL);

  if (!sinais.includes("handleConfirmDialogCorrect")) {
    failures.push(
      "frescor do Vite: sinaisDoDisco não extraiu o nome de função declarada " +
        `(\`handleConfirmDialogCorrect\`). Extraiu ${JSON.stringify(sinais)}. Sem os nomes declarados, uma ` +
        "mudança que não toca texto nenhum — renomear um handler, trocar a condição de um clique — passaria " +
        "batida, e foi metade do que o G3 mudou.",
    );
  }
  if (!sinais.includes("createVideo.generate.falConfirm.composeCost")) {
    failures.push(
      "frescor do Vite: sinaisDoDisco não extraiu a chave de i18n " +
        `(\`createVideo.generate.falConfirm.composeCost\`). Extraiu ${JSON.stringify(sinais)}.`,
    );
  }

  const comComentario = mod.sinaisDoDisco(
    '/* const nomeSoEmComentario = 1; */\nconst nomeDeVerdade = 2;\nfunction outroDeVerdade() {}\nconst maisUm = 3;',
  );
  if (comComentario.includes("nomeSoEmComentario")) {
    failures.push(
      "frescor do Vite: um nome que só existe em COMENTÁRIO virou sinal. O transform do Vite apaga " +
        "comentários, então esse sinal NUNCA apareceria no módulo servido e todo arquivo comentado seria " +
        "acusado de obsoleto — falso positivo em healthcheck é pior que checagem nenhuma, porque ensina a " +
        "ignorar o sinal.",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. O CASO REAL — servido = pré-G3, disco = pós-G3.
  // ---------------------------------------------------------------------------
  const ausentes = mod.sinaisAusentesNoServido(sinais, SERVIDO_OBSOLETO);
  if (!mod.estaObsoleto({ sinais, ausentes })) {
    failures.push(
      "frescor do Vite: o caso REAL do incidente não foi detectado — com o disco em pós-G3 e o Vite " +
        `servindo o módulo de antes dele, estaObsoleto() devolveu false (ausentes: ${JSON.stringify(ausentes)}). ` +
        'É exatamente esta combinação que fez "Gerar vídeo" disparar POST /videos direto, duas vezes.',
    );
  }

  // O CONTRAPONTO, e ele não é decoração: sem ele, uma função que devolvesse
  // `true` sempre passaria no vetor acima e deixaria o container
  // permanentemente unhealthy.
  const ausentesNoAtual = mod.sinaisAusentesNoServido(sinais, DISCO_ATUAL);
  if (mod.estaObsoleto({ sinais, ausentes: ausentesNoAtual })) {
    failures.push(
      "frescor do Vite: um módulo servido IDÊNTICO ao disco foi acusado de obsoleto " +
        `(ausentes: ${JSON.stringify(ausentesNoAtual)}). O healthcheck marcaria o frontend unhealthy para ` +
        "sempre, e o sinal viraria ruído.",
    );
  }

  // ---------------------------------------------------------------------------
  // 3. O PISO — sem sinal suficiente, não se afirma nada.
  // ---------------------------------------------------------------------------
  if (mod.estaObsoleto({ sinais: [], ausentes: [] })) {
    failures.push(
      "frescor do Vite: estaObsoleto opinou sobre um arquivo sem sinal suficiente — lista de sinais vazia " +
        "virou veredito. Não medir e concluir é a mesma classe de defeito de uma guarda inerte.",
    );
  }
  if (mod.estaObsoleto({ sinais: ["a", "b"], ausentes: ["a"], minimoDeSinais: 3 })) {
    failures.push(
      "frescor do Vite: estaObsoleto opinou sobre um arquivo sem sinal suficiente — 2 sinais com piso 3 " +
        "deveriam ser insuficientes para afirmar staleness.",
    );
  }

  // ---------------------------------------------------------------------------
  // 4. O ALVO segue o mtime — é isso que dispensa marcador fixo.
  // ---------------------------------------------------------------------------
  const fontes: Record<string, string> = {
    "/app/src/velho.tsx": DISCO_ATUAL,
    "/app/src/novo.tsx": DISCO_ATUAL.replace(/handleConfirmDialog/g, "handleOutroNome"),
  };
  const alvo = mod.escolherAlvo(
    [
      { full: "/app/src/velho.tsx", mtimeMs: 1000 },
      { full: "/app/src/novo.tsx", mtimeMs: 9000 },
    ],
    (f) => fontes[f],
  );
  if (alvo?.full !== "/app/src/novo.tsx") {
    failures.push(
      `frescor do Vite: escolherAlvo não pegou o arquivo de maior mtime (pegou ${JSON.stringify(alvo?.full)}). ` +
        "Seguir o mtime é o que dispensa marcador fixo: a checagem acompanha sozinha o que foi editado por " +
        "último, que é o que o cache do Vite mais provavelmente não viu.",
    );
  }

  // ---------------------------------------------------------------------------
  // 5. FIAÇÃO — o healthcheck chama, e tools/ está montado.
  // ---------------------------------------------------------------------------
  const compose = readFileSync(path.join(repoRoot, COMPOSE_REL), "utf8").replace(/\r\n/g, "\n");
  if (!compose.includes(" && node /app/tools/viteServeFreshness.mjs")) {
    failures.push(
      `frescor do Vite: o healthcheck do frontend não chama mais ${SCRIPT_REL}. O mecanismo continuaria ` +
        "existindo e testado, e nunca rodaria — que é literalmente o defeito que ele veio corrigir.",
    );
  }
  const blocoFrontend = compose.slice(compose.indexOf("\n  frontend:"));
  if (!blocoFrontend.includes("- ./tools:/app/tools:ro")) {
    failures.push(
      "frescor do Vite: tools/ não está montado no serviço frontend. O healthcheck citaria o script e " +
        "falharia com MODULE_NOT_FOUND — o container ficaria unhealthy para sempre, e a leitura fácil seria " +
        '"o detector é instável" em vez de "faltou o mount".',
    );
  }

  if (failures.length === 0) {
    notes.push(
      "  frescor do Vite: detecta o caso REAL (servido pré-G3 × disco pós-G3) pelos dois tipos de sinal " +
        "(chave de i18n e nome declarado), não acusa servido idêntico ao disco, e não opina sem sinal " +
        "suficiente",
    );
    notes.push(
      "  frescor do Vite: healthcheck do frontend chama o script e tools/ está montado — roda a cada 10 s " +
        "independentemente de por onde o container subiu (up.sh, restart, up -d, boot da máquina)",
    );
  }

  return { failures, notes };
}
