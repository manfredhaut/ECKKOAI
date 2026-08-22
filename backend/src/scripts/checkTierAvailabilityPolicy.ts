/**
 * O CARTÃO "SIMPLES" NÃO PODE SER OFERECIDO A QUEM ELE NÃO SERVE PRA NADA.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 *
 * `videoTierParaPipeline` (`falPipeline.ts`) só conhece dois motores —
 * `"normal"` e `"premium"` — e todo valor que não seja `"premium"` cai em
 * `"normal"`. Isso é intencional: o vendor (heygen/fal) é decidido pela
 * credencial do TENANT, não pelo `tier_video`, e "simples" só existiria de
 * fato num tenant vendor=heygen. Um tenant fal-only (como `dev-c77a5b8a`
 * hoje) que escolhe "Simples" na tela recebe um vídeo IDÊNTICO ao "Normal"
 * — mesmo motor, mesmo custo — sem nenhum aviso de que a escolha não fez
 * diferença. MEDIDO em 22/08: `tier_video='simples'` gravado, `animar`
 * submetido a `wan/v2.6/image-to-video/flash` (o motor do Normal).
 *
 * Este bloco NÃO toca o roteamento (`falPipeline.ts` continua exatamente
 * como estava) — é só sobre a TELA não oferecer uma escolha vazia sem
 * dizer isso. `GenerateStep.tsx` passa a consultar `GET /credentials`
 * (dado que `routes/videos.ts` já consulta para decidir o vendor de
 * verdade — `avatarCredential.vendor`) e desabilita o cartão "Simples"
 * quando o avatar da conta não está no vendor HeyGen, com uma legenda que
 * NUNCA nomeia o fornecedor.
 * ---------------------------------------------------------------------------
 * COMO ESTA GUARDA MEDE
 *
 * G-1 mede por LÓGICA AVALIADA, mesmo padrão de
 * `checkAvatarCardSelectablePolicy.ts`: extrai `const podeEscolherSimples =
 * …;` por âncora intrínseca e EXECUTA a expressão contra os vendors
 * possíveis — não casa texto, porque um mutante que troca `===` por `!==`
 * (o pior caso: habilita Simples pra quem não serve e desabilita pra quem
 * serve) deixaria qualquer guarda por texto verde.
 *
 * G-2 e G-3 medem FORMA — `disabled={indisponivel}` no botão e o bloco da
 * legenda condicional são JSX estrutural, não uma expressão isolável para
 * avaliar sozinha (dependem do array `TIER_OPTIONS.map` e do JSX ao redor).
 * A âncora é o recorte do laço dos cartões, INTRÍNSECA ao que se mede
 * (`TIER_OPTIONS.map((opt) => {` … o fim do `</div>` que fecha o laço),
 * nunca um wrapper de layout genérico.
 * ---------------------------------------------------------------------------
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de um arquivo e
 * avaliação de uma expressão booleana.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";

const ARQUIVO_DA_TELA = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "o cartão Simples só fica disponível pra quem está no vendor HeyGen",
    name: "a comparação de vendor é invertida (=== vira !==)",
    kind: "esperto",
    // O PIOR CASO possível deste bloco inteiro: com a inversão, um tenant
    // fal-only (o caso real, MEDIDO) passa a ver "Simples" DISPONÍVEL — a
    // lacuna original, intacta — e um tenant heygen de verdade (o único
    // caso em que "Simples" faz diferença) veria o cartão DESABILITADO.
    // Nada no JSX muda: é só o valor que `podeEscolherSimples` calcula.
    file: ARQUIVO_DA_TELA,
    find: '  const podeEscolherSimples = avatarVendor === "heygen";',
    replace: '  const podeEscolherSimples = avatarVendor !== "heygen";',
    expect: "o predicado de disponibilidade do Simples deu o veredito errado",
  },
  {
    guard: "o cartão Simples fica desabilitado quando indisponível",
    name: "o disabled some do botão do cartão",
    kind: "obvio",
    file: ARQUIVO_DA_TELA,
    find: "                    disabled={indisponivel}\n",
    replace: "",
    expect: "o cartão Simples continua clicável mesmo indisponível",
  },
  {
    guard: "a legenda de indisponibilidade aparece quando o Simples está desabilitado",
    name: "o bloco da legenda de indisponibilidade é removido",
    kind: "esperto",
    // ESPERTO: o cartão CONTINUA desabilitado (G-2 não pega isto — o
    // `disabled` está intacto), só que sem explicação nenhuma na tela. Quem
    // vê um cartão cinza sem legenda não sabe se é bug, carregamento ou
    // decisão de produto.
    file: ARQUIVO_DA_TELA,
    find:
      "            {!podeEscolherSimples && (\n" +
      "              <p className=\"text-muted\" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>\n" +
      "                {t(\"createVideo.generate.tierUnavailable\")}\n" +
      "              </p>\n" +
      "            )}\n",
    replace: "",
    expect: "a legenda de indisponibilidade do Simples não aparece",
  },
];

export interface TierAvailabilityResult {
  failures: string[];
  notes: string[];
}

/** Os vendors possíveis de `avatarVendor` e o veredito exigido para cada um. */
const CASOS: ReadonlyArray<{ rotulo: string; vendor: string | null; disponivelEsperado: boolean }> = [
  { rotulo: "vendor heygen (o único em que Simples faz diferença)", vendor: "heygen", disponivelEsperado: true },
  { rotulo: "vendor fal (o caso MEDIDO, dev-c77a5b8a)", vendor: "fal", disponivelEsperado: false },
  { rotulo: "vendor did", vendor: "did", disponivelEsperado: false },
  { rotulo: "sem credencial de avatar (null)", vendor: null, disponivelEsperado: false },
];

function lerFonte(repoRoot: string): string {
  return readFileSync(path.join(repoRoot, ARQUIVO_DA_TELA), "utf8").replace(/\r\n/g, "\n");
}

export function checkTierAvailabilityPolicy(repoRoot: string): TierAvailabilityResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const fonte = lerFonte(repoRoot);

  // -------------------------------------------------------------------------
  // G-1 — o predicado, AVALIADO contra os vendors possíveis
  // -------------------------------------------------------------------------
  const casadoPredicado = /const podeEscolherSimples\s*=\s*([^;]+);/.exec(fonte);
  if (!casadoPredicado) {
    failures.push(
      "tier: não há `const podeEscolherSimples = …;` em " +
        `${ARQUIVO_DA_TELA}. Sem esse predicado não existe trava: o cartão "Simples" volta a ficar ` +
        "disponível sempre, inclusive para um tenant fal-only, que recebe um vídeo idêntico ao Normal " +
        "sem nenhum aviso de que a escolha não fez diferença.",
    );
  } else {
    const expressao = casadoPredicado[1].trim();
    let avaliar: (avatarVendor: string | null) => unknown;
    try {
      // eslint-disable-next-line no-new-func
      avaliar = new Function("avatarVendor", `return (${expressao});`) as typeof avaliar;
    } catch (err) {
      failures.push(
        `tier: o predicado \`${expressao}\` não é uma expressão avaliável (${String(err)}). Esta guarda ` +
          "EXECUTA o predicado em vez de casar o texto, porque texto casado continua verde com a " +
          "comparação invertida.",
      );
      avaliar = undefined as never;
    }

    if (avaliar) {
      let algumaFalha = false;
      for (const caso of CASOS) {
        let obtido: unknown;
        try {
          obtido = avaliar(caso.vendor);
        } catch (err) {
          failures.push(
            `tier: avaliar o predicado no caso "${caso.rotulo}" levantou ${String(err)}. O predicado tem ` +
              "de depender só do vendor do avatar.",
          );
          algumaFalha = true;
          continue;
        }
        if (Boolean(obtido) === caso.disponivelEsperado) continue;
        algumaFalha = true;
        failures.push(
          `tier: o predicado de disponibilidade do Simples deu o veredito errado para ${caso.rotulo} — ` +
            `esperado disponível=${caso.disponivelEsperado}, obtido=${Boolean(obtido)}. Predicado: ` +
            `\`${expressao}\`. Trocar \`===\` por \`!==\` inverte os dois lados de uma vez: quem devia ` +
            "ver o cartão disponível não vê, e quem não devia (o caso real, fal-only) passa a ver.",
        );
      }
      if (!algumaFalha) {
        notes.push(
          "    tier: o cartão Simples só fica disponível quando o avatar está no vendor HeyGen — " +
            "avaliado nos 4 vendors possíveis (heygen, fal, did, ausente)",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // G-2 e G-3 — o laço dos cartões, recortado por âncora intrínseca
  // -------------------------------------------------------------------------
  const inicioLaco = fonte.indexOf("{TIER_OPTIONS.map((opt) => {");
  const fimLaco = fonte.indexOf("</fieldset>", inicioLaco);
  if (inicioLaco < 0 || fimLaco < 0) {
    failures.push(
      "tier: não foi possível recortar o laço dos cartões em " +
        `${ARQUIVO_DA_TELA} pelas âncoras \`{TIER_OPTIONS.map((opt) => {\` e \`</fieldset>\`. A guarda ` +
        "não pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
    return { failures, notes };
  }
  const trecho = fonte.slice(inicioLaco, fimLaco);

  if (!trecho.includes("disabled={indisponivel}")) {
    failures.push(
      "tier: o cartão Simples continua clicável mesmo indisponível — `disabled={indisponivel}` não está " +
        "mais no botão do cartão. Sem a trava, um tenant fal-only volta a poder escolher \"Simples\" e " +
        "receber um vídeo idêntico ao Normal sem saber.",
    );
  } else {
    notes.push("    tier: o botão do cartão Simples leva `disabled={indisponivel}`");
  }

  if (!trecho.includes('{t("createVideo.generate.tierUnavailable")}')) {
    failures.push(
      "tier: a legenda de indisponibilidade do Simples não aparece — o texto " +
        '`{t("createVideo.generate.tierUnavailable")}` não está mais no recorte do laço dos cartões. ' +
        "O cartão pode continuar desabilitado (isso é outra guarda), mas sem explicação nenhuma na tela " +
        "quem vê um cartão cinza não sabe se é bug, carregamento ou decisão de produto.",
    );
  } else {
    notes.push("    tier: a legenda de indisponibilidade do Simples aparece quando ele está desabilitado");
  }

  return { failures, notes };
}
