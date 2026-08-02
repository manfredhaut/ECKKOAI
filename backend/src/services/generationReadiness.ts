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
import { getCredential } from "./credentialLookup.js";
import { isFixtureMode } from "./providers/providerMode.js";
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
  // Só vazio. NÃO existe limite de tamanho de roteiro em lugar nenhum deste
  // projeto — nem cliente, nem servidor, nem fornecedor conferido —, e
  // inventar um número aqui seria transformar um palpite em bloqueio de tela.
  // Registrado como lacuna no CLAUDE.md em vez de adivinhado.
  if (!input.script || !input.script.trim()) {
    blockers.push({
      code: "empty_script",
      status: 400,
      message: "Escreva o roteiro no passo 2 antes de gerar o vídeo.",
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
  const { rows: creditRows } = await pool.query<{ balance: string }>(
    "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = 'video'",
    [input.tenantId],
  );
  // Linha ausente conta como zero, e não como erro: é o mesmo tratamento de
  // `debitCredit()`, que falha fechado quando o tenant nunca foi provisionado.
  const videoCredits = Number(creditRows[0]?.balance ?? 0);
  if (videoCredits < 1) {
    blockers.push({
      code: "plan_limit_reached",
      status: 403,
      message: "Créditos esgotados — adicione créditos ou aguarde a renovação mensal do seu plano.",
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
