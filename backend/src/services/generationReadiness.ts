/**
 * Predicado ÚNICO de prontidão para gerar vídeo.
 *
 * POR QUE ISTO EXISTE, em uma frase: a tela e a rota tinham cada uma a sua
 * ideia do que impede gerar, e as duas listas eram diferentes.
 *
 * Medido na Fase 1-ter do bloco 5D, condição a condição: o botão do passo 6
 * era `disabled={submitting || !wizard.script || training}` — três condições —
 * enquanto `POST /videos` recusava por SETE motivos distintos. As cinco que
 * faltavam (crédito esgotado, teto de sessão, credencial ausente, avatar sem
 * treino concluído, avatar inexistente) só apareciam DEPOIS do clique, como
 * erro vermelho. E das duas que o botão pegava, só uma dizia por quê.
 *
 * Numa apresentação isso é o pior de dois mundos: ou o botão não responde e
 * não explica — que parece produto quebrado —, ou responde e devolve um erro
 * que o apresentador vai ter de justificar ao vivo.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE MÓDULO É E O QUE ELE NÃO É
 *
 * Ele é a fonte ÚNICA da pergunta "dá para gerar agora, e se não, por quê?".
 * A rota de geração e a interface consomem exatamente esta função — duas
 * cópias da regra divergem, e a divergência é justamente a família de defeito
 * que este bloco fecha.
 *
 * Ele NÃO é a proteção. Desabilitar botão é conveniência de tela; a recusa
 * continua acontecendo no servidor, e continua acontecendo ANTES de qualquer
 * débito de crédito ou chamada a fornecedor. Um cliente que ignore a interface
 * e mande a requisição direto leva a mesma recusa, com o mesmo código.
 *
 * Ele também NÃO substitui o débito atômico. `debitCredit()` continua sendo a
 * autoridade sobre saldo: a leitura daqui é um retrato, e entre o retrato e o
 * débito cabe outra requisição. O bloqueio de crédito aqui existe para a tela
 * poder AVISAR antes; quem garante é o `FOR UPDATE` lá.
 * ---------------------------------------------------------------------------
 */
import { pool } from "../db/pool.js";
import type { Avatar } from "../types.js";
import { contaDe } from "./billing/creditGate.js";
import { getCredential } from "./credentialLookup.js";
import { isFixtureMode } from "./providers/providerMode.js";
// A régua de duração vem de UM lugar só. Comparar tamanho de roteiro com um
// número escrito aqui criaria a segunda verdade que `scriptDuration.ts` existe
// para não deixar nascer.
import {
  MAX_SCRIPT_SECONDS,
  estimateSecondsFromScript,
  exceedsMaxScriptLength,
  maxScriptChars,
} from "./video/scriptDuration.js";
// O teto da Interpretação mora junto da normalização da cena, e não aqui: é o
// mesmo módulo que decide o que é uma cena válida, e separar os dois faria a
// regra viver longe do tipo que ela mede.
import { MOTION_PROMPT_MAX_CHARS, exceedsMotionPromptLimit } from "./providers/videoScene.js";
import {
  liveGenerationAttempts,
  liveGenerationsUsed,
  readLiveMaxAttempts,
  readLiveMaxGenerations,
} from "./providers/liveGuard.js";

/**
 * Códigos de bloqueio.
 *
 * Os três primeiros que já existiam (`avatar_still_training`,
 * `no_avatar_credential`, `plan_limit_reached`, `live_budget_exhausted`)
 * mantêm o nome de antes deste bloco, de propósito: mudar código de erro que
 * já está em produção quebra qualquer consumidor calado. Os dois que não
 * tinham código nenhum — devolviam a mensagem dentro do campo `error`, em
 * inglês — ganharam um.
 */
export type GenerationBlockerCode =
  | "avatar_not_selected"
  | "avatar_not_found"
  | "avatar_not_trained"
  | "avatar_still_training"
  | "no_avatar_credential"
  | "empty_script"
  | "script_too_long"
  /**
   * A Interpretação não pôde ser traduzida para o idioma do fornecedor.
   *
   * Está neste enum, ao lado dos outros dois de roteiro, mesmo não sendo
   * avaliável ANTES do clique: a tradução só acontece na geração, porque
   * depende de uma chamada a modelo que seria absurdo disparar a cada tecla. O
   * código vive aqui para a tela ter UM vocabulário de recusa, e é assim que a
   * rota o devolve.
   *
   * O que ele NUNCA significa: "seguimos sem traduzir". Ver o precedente de
   * `background_asset_failed`, que segue e cobra calado.
   */
  | "direction_translation_failed"
  | "direction_translation_unavailable"
  | "motion_prompt_too_long"
  | "plan_limit_reached"
  | "live_budget_exhausted";

export interface GenerationBlocker {
  code: GenerationBlockerCode;
  /** Texto em pt-BR, pronto para a tela. A interface não reescreve nada. */
  message: string;
  /** Status HTTP que a rota devolve para este bloqueio. */
  status: number;
}

export interface GenerationReadiness {
  ready: boolean;
  /**
   * TODOS os bloqueios, e não só o primeiro. A rota usa o primeiro (a ordem
   * abaixo é de precedência); a tela lista todos, porque quem está a um passo
   * de apresentar precisa saber que faltam duas coisas, não descobrir a
   * segunda depois de resolver a primeira.
   */
  blockers: GenerationBlocker[];
}

export interface GenerationReadinessInput {
  tenantId: string;
  avatarId: string | null | undefined;
  script: string | null | undefined;
  /**
   * A INTERPRETAÇÃO, para o teto de tamanho.
   *
   * Opcional porque o passo Cena é opcional — a maioria das gerações deste
   * produto nunca teve direção nenhuma. Ausente conta como vazia, e vazia passa.
   */
  motionPrompt?: string | null;
}

export async function evaluateGenerationReadiness(
  input: GenerationReadinessInput,
): Promise<GenerationReadiness> {
  const blockers: GenerationBlocker[] = [];

  // --- Avatar -------------------------------------------------------------
  //
  // A ordem aqui é de precedência para a rota: "nenhum avatar" precede
  // "avatar não existe", que precede "não terminou o treino".
  if (!input.avatarId) {
    blockers.push({
      code: "avatar_not_selected",
      status: 400,
      message: "Escolha um avatar no passo 1 antes de gerar o vídeo.",
    });
  } else {
    const { rows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [input.avatarId, input.tenantId],
    );
    const avatar = rows[0];

    if (!avatar) {
      blockers.push({
        code: "avatar_not_found",
        status: 404,
        message: "O avatar escolhido não existe mais. Volte ao passo 1 e escolha outro.",
      });
    } else if (!avatar.provider_avatar_id) {
      blockers.push({
        code: "avatar_not_trained",
        status: 400,
        message:
          "Este avatar ainda não foi treinado no fornecedor. Volte ao passo 1, envie as fotos e o " +
          "vídeo de referência, e conclua a configuração antes de gerar.",
      });
    } else if (avatar.provider_status === "processing") {
      // Portão de treino. Só 'processing' barra: NULL (avatares criados antes
      // desta coluna existir) e 'unknown' (perguntamos e não entendemos a
      // resposta) LIBERAM de propósito — travar um avatar já pago por causa de
      // uma suposição nossa seria pior que deixar a tentativa seguir e o
      // fornecedor recusar. Ver migration 036.
      blockers.push({
        code: "avatar_still_training",
        status: 409,
        message:
          "O avatar ainda está em treino no fornecedor e não pode gerar vídeo agora. " +
          "Isso leva alguns minutos e acontece uma vez só, logo depois de criar o avatar — " +
          "atualize a página em instantes e tente de novo. Nenhum crédito foi consumido.",
      });
    }
  }

  // --- Roteiro ------------------------------------------------------------
  //
  // Dois bloqueios, e os dois são NOSSOS: o fornecedor não publica limite de
  // tamanho de roteiro, e continuamos sem medi-lo. O que mudou é que a ausência
  // de teto deixou de ser aceitável do lado do dinheiro — sem ele, um artigo
  // colado por engano no lugar de uma frase vira débito de dezenas de dólares
  // atrás de um único checkbox de confirmação.
  if (!input.script || !input.script.trim()) {
    blockers.push({
      code: "empty_script",
      status: 400,
      message: "Escreva o roteiro no passo 2 antes de gerar o vídeo.",
    });
  } else if (exceedsMaxScriptLength(input.script)) {
    // RECUSA, e nunca corte. Um roteiro truncado geraria um vídeo que para no
    // meio de uma frase — cobrado por inteiro, sem ninguém ter escolhido isso.
    // Recusar custa zero e se resolve editando o texto.
    //
    // Os dois números da mensagem saem da MESMA régua que estima o custo: o
    // limite em caracteres é derivado de `MAX_SCRIPT_SECONDS`, não digitado, e
    // por isso não tem como discordar da duração mostrada logo acima dele.
    const estimado = estimateSecondsFromScript(input.script);
    blockers.push({
      code: "script_too_long",
      status: 400,
      message:
        `O roteiro tem ${input.script.length} caracteres, cerca de ${estimado.toFixed(0)} s de vídeo, ` +
        `e o limite é ${MAX_SCRIPT_SECONDS} s (${maxScriptChars()} caracteres). ` +
        "Nada foi cobrado. Encurte o roteiro ou divida em mais de um vídeo — " +
        "o texto não é cortado automaticamente para não entregar um vídeo que para no meio de uma frase.",
    });
  }

  // --- Interpretação ------------------------------------------------------
  //
  // RECUSA, nunca corte — mesma regra do roteiro e pelo mesmo motivo. Uma
  // direção de cena truncada não é uma direção menor: é outra direção, e o
  // fornecedor a aceita com 200 sem que nada avise.
  //
  // O teto existia só como `maxLength` de um `<textarea>`, que é sugestão ao
  // navegador. Aqui ele passa a valer para qualquer cliente.
  if (exceedsMotionPromptLimit(input.motionPrompt)) {
    blockers.push({
      code: "motion_prompt_too_long",
      status: 400,
      message:
        `A Interpretação tem ${input.motionPrompt?.trim().length} caracteres e o limite é ` +
        `${MOTION_PROMPT_MAX_CHARS}. Nada foi cobrado. Encurte o texto — a Interpretação é uma ` +
        "orientação de gesto e postura para o avatar, não um segundo roteiro; o que ele fala vem do " +
        "campo Roteiro.",
    });
  }

  // --- Credencial do fornecedor de avatar ---------------------------------
  const avatarCredential = await getCredential(input.tenantId, "avatar");
  if (!avatarCredential) {
    blockers.push({
      code: "no_avatar_credential",
      status: 400,
      message:
        "Nenhum provedor de avatar está conectado. Vá em Configurações e conecte a chave de API do " +
        "provedor de vídeo (HeyGen ou D-ID) antes de gerar.",
    });
  }
  // A credencial de VOZ não entra: ela é opcional por desenho — sem ela,
  // `generateVideo` segue com `elevenLabsApiKey: null` e o provedor decide.
  // Bloquear aqui inventaria uma exigência que a rota não faz, e um bloqueio
  // que só existe de um lado é exatamente o defeito que este módulo fecha.

  // --- Crédito ------------------------------------------------------------
  //
  // Leitura simples, sem lock: é um retrato para a tela poder avisar antes.
  // A autoridade continua sendo o `FOR UPDATE` de `debitCredit()`.
  // A CONTA sai de `contaDe()`, a mesma função que o débito usa. Ler `'video'`
  // literal aqui foi o que manteve o portão travado enquanto o saldo de ensaio
  // existia e estava cheio: este retrato recusa ANTES de `debitCredit()`, então
  // uma correção que trocasse a conta só no débito não destrava tela nenhuma —
  // devolveria 403 com o balde de ensaio intocado.
  const conta = contaDe("video");
  const { rows: creditRows } = await pool.query<{ balance: string }>(
    "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2",
    [input.tenantId, conta],
  );
  // Linha ausente conta como zero, e não como erro: é o mesmo tratamento de
  // `debitCredit()`, que falha fechado quando o tenant nunca foi provisionado.
  const videoCredits = Number(creditRows[0]?.balance ?? 0);
  if (videoCredits < 1) {
    blockers.push({
      code: "plan_limit_reached",
      status: 403,
      // Qual saldo acabou, dito com o nome certo. Em ensaio, "adicione créditos"
      // mandaria a pessoa comprar crédito para destravar algo que não cobra
      // nada — e comprar não destravaria, porque a compra vai para o balde real.
      message: isFixtureMode()
        ? "Saldo de ENSAIO esgotado. Este é o crédito do modo simulado — nenhuma cobrança aconteceu e o " +
          "saldo real não foi tocado. São 500 por tipo, semeados pela migration 043; chegar a zero " +
          "significa 500 gerações simuladas, o que costuma ser laço e não uso."
        : "Créditos esgotados — adicione créditos ou aguarde a renovação mensal do seu plano.",
    });
  }

  // --- Teto de sessão em modo live ----------------------------------------
  //
  // Em fixture nada é tarifado e o teto nunca é consumido, então incluí-lo ali
  // seria inventar um bloqueio inexistente. Este é o único bloqueio que a tela
  // não tinha COMO saber antes: o contador vive na memória do processo, e não
  // havia rota nenhuma que o expusesse — a única forma de descobrir que o teto
  // acabou era gastando uma tentativa.
  if (!isFixtureMode()) {
    const used = liveGenerationsUsed();
    const max = readLiveMaxGenerations();
    const attempts = liveGenerationAttempts();
    const maxAttempts = readLiveMaxAttempts();

    if (attempts >= maxAttempts) {
      blockers.push({
        code: "live_budget_exhausted",
        status: 429,
        message:
          `Teto de TENTATIVAS desta sessão atingido (${attempts}/${maxAttempts}). Este limite é DESTE ` +
          "aplicativo, não do fornecedor, e nada foi cobrado. Chegar aqui com gasto sobrando significa " +
          "que as chamadas estão falhando — veja o evento `live_budget_released` no log antes de " +
          "aumentar o limite. Reiniciar o backend zera a contagem.",
      });
    } else if (used >= max) {
      blockers.push({
        code: "live_budget_exhausted",
        status: 429,
        message:
          `Teto de operações tarifadas desta sessão atingido (${used}/${max}). Este limite é DESTE ` +
          "aplicativo, não do fornecedor, e nada foi cobrado. O teto conta CLONAGEM DE VOZ e GERAÇÃO " +
          "DE VÍDEO juntas, então configurar um avatar já gasta uma unidade. Reiniciar o backend zera " +
          "a contagem.",
      });
    }
  }

  return { ready: blockers.length === 0, blockers };
}
