/**
 * A APROVAÇÃO da imagem composta — o freio humano entre US$ 0,08 e US$ 1,50.
 *
 * ┌─ Por que este arquivo existe separado da rota ───────────────────────────┐
 * │ As duas propriedades que o BLOCO B3 precisa provar são de ORDEM e de     │
 * │ ALCANCE, e nenhuma das duas é observável dentro de um handler do Fastify │
 * │ sem subir a aplicação inteira. O arnês já devolveu AMBÍGUO uma vez por   │
 * │ isso (a decisão do traje, que teve de sair do handler para                │
 * │ `lookSelection.ts`), e a lição foi essa: propriedade que precisa ser     │
 * │ provada mora onde dá para chamá-la.                                      │
 * │                                                                          │
 * │ Nenhuma função aqui fala com o banco. Quem tem `pool` é a rota, e ela    │
 * │ passa o que este arquivo precisa por injeção — a mesma divisão de        │
 * │ `DiarioDoPipeline`.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { logEvent } from "../log/safeLog.js";
import {
  runFalPipeline,
  type EtapaDoPipeline,
  type FalPipelineInput,
  type FalPipelineResult,
} from "./falPipeline.js";

/**
 * Quem grava que a aprovação aconteceu.
 *
 * `marcarAprovado` devolve **false** quando a linha já não estava aguardando —
 * segundo clique, aprovação concorrente, ou expiração que chegou primeiro. Não
 * é um detalhe de implementação: é o valor de retorno que dá DESFECHO à ordem
 * medida abaixo, e é ele que impede o Wan de ser pago duas vezes.
 *
 * Na rota, é um `UPDATE … WHERE id = $1 AND status = 'awaiting_approval'` com
 * `rowCount` — a trava de concorrência e o registro da aprovação na MESMA
 * escrita, e não duas.
 */
export interface RegistroDeAprovacao {
  marcarAprovado(): Promise<boolean>;
}

export interface AprovacaoResult<T> {
  /** `false` = a linha já não estava aguardando. Nada foi animado. */
  aprovado: boolean;
  /** `null` quando não houve aprovação. */
  resultado: T | null;
}

/**
 * REGISTRA A APROVAÇÃO E SÓ ENTÃO ANIMA. A ordem é a propriedade.
 *
 * ┌─ O que a ordem inversa custa, e por que ela tem desfecho ────────────────┐
 * │ Animar primeiro e registrar depois produz o MESMO resultado no caminho   │
 * │ feliz — o vídeo sai igual, a linha fica igual, e uma guarda que só       │
 * │ perguntasse "a aprovação é registrada?" seguiria verde.                  │
 * │                                                                          │
 * │ A corrida que distingue as duas é o SEGUNDO clique: `marcarAprovado`     │
 * │ devolve `false` porque a linha já saiu de `awaiting_approval`. Nesta     │
 * │ ordem, `animar` nunca é chamado e o segundo clique custa zero. Na ordem  │
 * │ inversa, o Wan roda ANTES de alguém descobrir que não devia — e o        │
 * │ dinheiro (~US$ 1,00, MEDIDO por lista de preços) já saiu quando o        │
 * │ registro finalmente responde "essa aprovação não era sua".               │
 * │                                                                          │
 * │ É o gotcha 9 do ESTADO.md aplicado: guarda de ordem só é observável      │
 * │ quando a interpretação FALHA. Aqui a falha é o clique repetido, que num  │
 * │ botão de tela é o caso comum, não o excêntrico.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function aprovarEAnimar<T>(input: {
  videoId: string;
  registro: RegistroDeAprovacao;
  animar: () => Promise<T>;
}): Promise<AprovacaoResult<T>> {
  const aprovado = await input.registro.marcarAprovado();
  if (!aprovado) {
    logEvent("warn", "fal_aprovacao_sem_efeito", {
      context: "fal.aprovacao",
      videoId: input.videoId,
      consequence: "nenhuma etapa paga foi disparada; a linha já não estava aguardando aprovação",
    });
    return { aprovado: false, resultado: null };
  }
  logEvent("info", "fal_aprovacao_registrada", {
    context: "fal.aprovacao",
    videoId: input.videoId,
  });
  return { aprovado: true, resultado: await input.animar() };
}

/**
 * ONDE A RECOMPOSIÇÃO PARA. `"compor"`, sempre.
 *
 * Constante nomeada, e não o literal dentro da chamada, porque é ela que separa
 * US$ 0,08 de US$ 1,58: recompor existe justamente para iterar na imagem antes
 * de gastar com a animação, e um `pararApos` que escorregasse para a etapa
 * seguinte transformaria o botão "Refazer" no botão mais caro da tela — sem
 * mudar uma palavra do que ele diz.
 */
export const PARAR_APOS_RECOMPOR: EtapaDoPipeline = "compor";

/**
 * REFAZER a imagem composta, e mais nada.
 *
 * Uma corrida NOVA, com teto próprio: a anterior já gastou o que gastou, e
 * somar as duas faria a segunda recomposição ser recusada por um teto que
 * descreve dinheiro que já saiu.
 */
export async function recompor(input: FalPipelineInput): Promise<FalPipelineResult> {
  return runFalPipeline({ ...input, pararApos: PARAR_APOS_RECOMPOR });
}
