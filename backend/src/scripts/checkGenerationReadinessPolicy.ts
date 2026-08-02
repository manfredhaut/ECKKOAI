/**
 * Invariantes do PREDICADO DE PRONTIDÃO para gerar vídeo.
 *
 * O defeito congelado aqui foi medido na Fase 1-ter do bloco 5D: o botão do
 * passo 6 conhecia TRÊS condições (`submitting || !script || training`) e a
 * rota recusava por SETE. As quatro que faltavam — crédito esgotado, teto de
 * sessão, credencial de provedor ausente, avatar sem treino concluído — só
 * apareciam depois do clique, como erro vermelho.
 *
 * A regra que este arquivo cobra: **um bloqueio precisa existir dos DOIS
 * lados**. Se o predicado o conhece, a rota tem de recusar por ele e a tela
 * tem de exibi-lo. Um bloqueio que só existe de um lado é o defeito, não a
 * metade de uma correção.
 *
 * Comportamental onde importa: as asserções 1 e 2 EXERCITAM
 * `evaluateGenerationReadiness` de verdade, com o banco substituído por um
 * duplo em memória. Casar texto no arquivo passaria a aprovar no dia em que
 * alguém movesse a avaliação de lugar — que é justamente a reorganização que
 * faz um bloqueio se perder.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface ReadinessCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "prontidão: o botão obedece ao predicado",
    name: "o botão volta a ficar sempre habilitado",
    kind: "obvio",
    // Mutante (a) do enunciado: o vínculo entre o botão e o predicado some. A
    // tela volta ao estado de antes deste bloco — clicar e descobrir.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find: "            disabled={submitting || blocked}",
    replace: "            disabled={submitting}",
    expect: "não desabilita o botão de gerar a partir do predicado",
  },
  {
    guard: "prontidão: o predicado enxerga os bloqueios",
    name: "o predicado passa a devolver lista de bloqueios sempre vazia",
    kind: "esperto",
    // Mutante (b): a assinatura não muda, a rota continua consultando, a tela
    // continua ligada — e tudo passa a estar sempre pronto. É o mutante que
    // pega guarda ancorada em "a chamada existe" em vez de no VEREDITO.
    file: "backend/src/services/generationReadiness.ts",
    find: "  return { ready: blockers.length === 0, blockers };",
    replace: "  return { ready: true, blockers: [] };",
    expect: "não devolveu bloqueio nenhum",
  },
  {
    guard: "prontidão: a rota recusa o que o predicado reprova",
    name: "a rota consulta o predicado e ignora o veredito",
    kind: "esperto",
    // Mutante (c): a chamada continua lá, o predicado continua correto, a tela
    // continua desabilitando o botão — e a proteção de verdade, a do servidor,
    // desaparece. Quem mandar a requisição direto passa.
    file: "backend/src/routes/videos.ts",
    find: "    if (!readiness.ready) {",
    replace: "    if (false) {",
    expect: "não recusa a geração quando o predicado reprova",
  },
];

const PREDICADO = "backend/src/services/generationReadiness.ts";
const ROTA = "backend/src/routes/videos.ts";
const TELA = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

/** Comentários fora: guardas deste projeto já acusaram o texto que as explicava. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * Cada cenário desliga exatamente UMA condição. O código esperado é o que a
 * rota tem de devolver e o que a tela tem de exibir — os dois lados.
 */
interface Cenario {
  nome: string;
  code: string;
  status: number;
  avatarId: string | null;
  script: string;
  /** Linha de `avatars` que o duplo devolve. `null` = avatar não existe. */
  avatar: { provider_avatar_id: string | null; provider_status: string | null } | null;
  credencialAvatar: boolean;
  creditoVideo: number;
}

const AVATAR_OK = { provider_avatar_id: "hg_123", provider_status: null };

const CENARIOS: Cenario[] = [
  {
    nome: "avatar não selecionado",
    code: "avatar_not_selected",
    status: 400,
    avatarId: null,
    script: "roteiro",
    avatar: AVATAR_OK,
    credencialAvatar: true,
    creditoVideo: 5,
  },
  {
    nome: "avatar não existe mais",
    code: "avatar_not_found",
    status: 404,
    avatarId: "a1",
    script: "roteiro",
    avatar: null,
    credencialAvatar: true,
    creditoVideo: 5,
  },
  {
    nome: "avatar sem treino concluído",
    code: "avatar_not_trained",
    status: 400,
    avatarId: "a1",
    script: "roteiro",
    avatar: { provider_avatar_id: null, provider_status: null },
    credencialAvatar: true,
    creditoVideo: 5,
  },
  {
    nome: "avatar ainda em treino",
    code: "avatar_still_training",
    status: 409,
    avatarId: "a1",
    script: "roteiro",
    avatar: { provider_avatar_id: "hg_123", provider_status: "processing" },
    credencialAvatar: true,
    creditoVideo: 5,
  },
  {
    nome: "roteiro vazio (só espaços)",
    code: "empty_script",
    status: 400,
    avatarId: "a1",
    script: "   ",
    avatar: AVATAR_OK,
    credencialAvatar: true,
    creditoVideo: 5,
  },
  {
    nome: "provedor de avatar não conectado",
    code: "no_avatar_credential",
    status: 400,
    avatarId: "a1",
    script: "roteiro",
    avatar: AVATAR_OK,
    credencialAvatar: false,
    creditoVideo: 5,
  },
  {
    nome: "crédito de vídeo esgotado",
    code: "plan_limit_reached",
    status: 403,
    avatarId: "a1",
    script: "roteiro",
    avatar: AVATAR_OK,
    credencialAvatar: true,
    creditoVideo: 0,
  },
];

export async function checkGenerationReadinessPolicy(repoRoot: string): Promise<ReadinessCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // 1. O predicado enxerga cada bloqueio — exercitado, não lido.
  // -------------------------------------------------------------------------
  const { pool } = await import("../db/pool.js");
  const realQuery = pool.query.bind(pool);
  const { encrypt } = await import("../services/crypto.js");
  const { evaluateGenerationReadiness } = await import("../services/generationReadiness.js");

  let cenarioAtual: Cenario = CENARIOS[0];

  // Duplo de banco, e SÓ isso: `getCredential()` também vai ao `pool`, então
  // interceptar a consulta cobre as três leituras do predicado sem remendar
  // módulo nenhum — o que em ESM não funcionaria de qualquer forma, porque o
  // predicado importa a função por nome e a ligação já está feita.
  //
  // Qualquer consulta que este verificador não reconheça é acusada em voz
  // alta: um duplo permissivo devolveria vazio para uma leitura nova, e o
  // bloqueio correspondente sumiria em silêncio.
  const consultasDesconhecidas: string[] = [];
  (pool as unknown as { query: unknown }).query = async (text: unknown) => {
    const sql = String(text);
    if (/FROM avatars/.test(sql)) {
      return { rows: cenarioAtual.avatar ? [cenarioAtual.avatar] : [], rowCount: cenarioAtual.avatar ? 1 : 0 };
    }
    if (/FROM tenant_credits/.test(sql)) {
      return { rows: [{ balance: String(cenarioAtual.creditoVideo) }], rowCount: 1 };
    }
    if (/FROM api_credentials/.test(sql)) {
      // Chave cifrada de verdade: `getCredential` decifra o que recebe, e um
      // valor inventado explodiria no `decrypt` — transformando "credencial
      // presente" num erro que não é o que se quer medir.
      return cenarioAtual.credencialAvatar
        ? { rows: [{ encrypted_key: encrypt("chave-de-verificacao"), vendor: "heygen" }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    consultasDesconhecidas.push(sql.replace(/\s+/g, " ").slice(0, 90));
    return { rows: [], rowCount: 0 };
  };

  const vistos = new Map<string, number>();
  try {
    for (const cenario of CENARIOS) {
      cenarioAtual = cenario;
      const resultado = await evaluateGenerationReadiness({
        tenantId: "t1",
        avatarId: cenario.avatarId,
        script: cenario.script,
      });

      if (resultado.ready || resultado.blockers.length === 0) {
        failures.push(
          `prontidão: com "${cenario.nome}" o predicado não devolveu bloqueio nenhum — deu tudo pronto. ` +
            `Esperado o código \`${cenario.code}\`. Com o predicado cego, o botão habilita e a recusa volta ` +
            "a acontecer depois do clique, que é o defeito que a Fase 1-ter fechou.",
        );
        continue;
      }

      const encontrado = resultado.blockers.find((b) => b.code === cenario.code);
      if (!encontrado) {
        failures.push(
          `prontidão: com "${cenario.nome}" o predicado não devolveu bloqueio nenhum com o código ` +
            `\`${cenario.code}\` — veio ${JSON.stringify(resultado.blockers.map((b) => b.code))}.`,
        );
        continue;
      }
      if (encontrado.status !== cenario.status) {
        failures.push(
          `prontidão: o bloqueio \`${cenario.code}\` declara status ${encontrado.status}, e a rota devolve ` +
            `esse número — esperado ${cenario.status}.`,
        );
      }
      // Mensagem vazia deixaria o botão desabilitado SEM motivo na tela, que é
      // o estado que este bloco existe para eliminar.
      if (!encontrado.message.trim()) {
        failures.push(
          `prontidão: o bloqueio \`${cenario.code}\` não traz mensagem. Botão desabilitado sem motivo ` +
            "visível é pior que erro depois do clique — parece produto quebrado.",
        );
      }
      vistos.set(cenario.code, (vistos.get(cenario.code) ?? 0) + 1);
    }

    // -----------------------------------------------------------------------
    // 2. Contraponto: com tudo pronto, o predicado LIBERA.
    //
    // Sem isto, um predicado que reprovasse qualquer coisa passaria em todos os
    // cenários acima sem distinguir nada — e o botão nunca mais habilitaria,
    // que é a forma mais rápida de matar a demonstração de amanhã.
    // -----------------------------------------------------------------------
    cenarioAtual = {
      nome: "tudo pronto",
      code: "-",
      status: 0,
      avatarId: "a1",
      script: "roteiro de verdade",
      avatar: AVATAR_OK,
      credencialAvatar: true,
      creditoVideo: 5,
    };
    const liberado = await evaluateGenerationReadiness({
      tenantId: "t1",
      avatarId: "a1",
      script: "roteiro de verdade",
    });
    if (!liberado.ready || liberado.blockers.length > 0) {
      failures.push(
        "prontidão: com tudo pronto (avatar treinado, roteiro escrito, credencial conectada, crédito " +
          `disponível) o predicado ainda bloqueou: ${JSON.stringify(liberado.blockers.map((b) => b.code))}. ` +
          "Um predicado que nunca libera desabilita o botão para sempre.",
      );
    }
  } finally {
    (pool as unknown as { query: unknown }).query = realQuery;
  }

  if (consultasDesconhecidas.length > 0) {
    failures.push(
      `prontidão: o predicado fez ${consultasDesconhecidas.length} consulta(s) que este verificador não ` +
        `conhece — ${JSON.stringify(consultasDesconhecidas)}. Um duplo que responde vazio a uma consulta ` +
        "nova faria o bloqueio correspondente sumir em silêncio.",
    );
  }

  // -------------------------------------------------------------------------
  // 3. Os dois lados: a rota consome o predicado, e a tela também.
  // -------------------------------------------------------------------------
  const ler = async (rel: string): Promise<string | null> => {
    try {
      return semComentarios(await readFile(path.join(repoRoot, rel), "utf-8"));
    } catch {
      failures.push(`prontidão: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      return null;
    }
  };

  const rota = await ler(ROTA);
  const tela = await ler(TELA);
  const predicado = await ler(PREDICADO);

  if (rota) {
    if (!/evaluateGenerationReadiness\s*\(/.test(rota)) {
      failures.push(
        `prontidão: ${ROTA} não consulta mais \`evaluateGenerationReadiness\`. A rota passou a ter a ` +
          "própria ideia do que impede gerar, e é a divergência entre as duas listas que este bloco fechou.",
      );
    }
    // Ancorado no USO do veredito, e não na chamada: consultar e ignorar é
    // exatamente o mutante (c). Ver o checklist nº 10 do CLAUDE.md.
    if (!/if\s*\(\s*!\s*readiness\.ready\s*\)/.test(rota)) {
      failures.push(
        `prontidão: ${ROTA} não recusa a geração quando o predicado reprova. A chamada pode até continuar ` +
          "lá, mas sem agir sobre o veredito a proteção de verdade — a do servidor — deixou de existir, e " +
          "quem mandar a requisição direto passa.",
      );
    }
  }

  if (tela) {
    if (!/\/videos\/readiness/.test(tela)) {
      failures.push(
        `prontidão: ${TELA} não consulta mais o predicado do servidor. Sem isso a tela volta a decidir ` +
          "sozinha o que impede gerar, com uma lista menor que a da rota.",
      );
    }
    if (!/disabled=\{submitting \|\| blocked\}/.test(tela)) {
      failures.push(
        `prontidão: ${TELA} não desabilita o botão de gerar a partir do predicado. O botão volta a ficar ` +
          "clicável com crédito zerado, teto esgotado ou credencial ausente — e a recusa volta a ser um " +
          "erro vermelho depois do clique.",
      );
    }
    // O motivo tem de ser RENDERIZADO, não só recebido. Ancorado no JSX pela
    // mesma razão do checklist nº 10: a variável existir não põe nada na tela.
    if (!/blockers\.map\(/.test(tela) || !/blocked-reasons/.test(tela)) {
      failures.push(
        `prontidão: ${TELA} não exibe o motivo do bloqueio ao lado do botão. Desabilitado sem motivo ` +
          "visível é pior que erro depois do clique: numa apresentação, um botão que não responde e não " +
          "explica parece produto quebrado.",
      );
    }
    // O custo continua visível mesmo bloqueado — é a informação que faz a
    // pessoa decidir comprar crédito em vez de desistir.
    if (!/<VideoCostPanel/.test(tela)) {
      failures.push(
        `prontidão: ${TELA} não mostra mais o custo no passo de geração. Com o botão bloqueado por falta ` +
          "de crédito, o custo é justamente o que falta saber para decidir.",
      );
    }
  }

  if (predicado && /\bMAX_SCRIPT|scriptMaxLength/.test(predicado)) {
    // Não é bloqueio, é lembrete: se alguém acrescentar um teto de roteiro,
    // ele precisa vir de medição, e não de palpite. Ver CLAUDE.md.
    notes.push("prontidão: apareceu um teto de tamanho de roteiro no predicado — confira se ele tem origem medida");
  }

  notes.push(
    `prontidão: ${vistos.size} bloqueio(s) exercitados no predicado real, cada um com código, status e ` +
      "mensagem em pt-BR; e o contraponto (tudo pronto → libera) confere",
  );
  notes.push("prontidão: rota e tela consomem o MESMO predicado — a rota age sobre o veredito, a tela exibe o motivo");
  return { failures, notes };
}
