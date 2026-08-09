/**
 * PRÉVIA AUDÍVEL da voz recém-clonada.
 *
 * O defeito que este módulo fecha custou TRÊS SLOTS IRREVERSÍVEIS em 09/08.
 * A tela pedia uma decisão sem volta ("substitui? não tem retorno") e não
 * mostrava o resultado: clonava, gravava o `voice_id` e devolvia uma frase de
 * sucesso. Quem quisesse saber como a voz ficou não tinha como — e a única
 * saída de dentro do produto era clonar de novo, que é precisamente a operação
 * que gasta o slot. Foram três clonagens seguidas no mesmo avatar, às 08:0x,
 * 08:13 e 08:22, cada uma substituindo a anterior e nenhuma delas ouvida.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM MÓDULO, E NÃO DUAS LINHAS NO HANDLER
 *
 * Mesma razão de `lookSelection.ts`: dentro da rota do Fastify a única forma de
 * exercitar isto seria subir a aplicação inteira, e o arnês já mostrou o preço
 * disso — uma guarda que não consegue opinar sobre o defeito que existe para
 * pegar é inerte, e inerte é pior que ausente.
 *
 * O defeito que precisa ser pegável aqui é ESPECÍFICO: sintetizar a prévia com
 * o `voice_id` ANTIGO. Ele não tem sintoma nenhum — a chamada responde 200, o
 * player toca, sai voz. Só que é a voz anterior, e o operador aprova uma
 * clonagem que nunca ouviu. `previewVoiceId()` existe para que a guarda possa
 * comparar o id que vai ao TTS com o id que a clonagem devolveu, em vez de se
 * contentar em verificar que houve chamada.
 * ---------------------------------------------------------------------------
 */

/**
 * A frase. Curta de propósito — 59 caracteres, ~4,6 s, meio centavo — e
 * escolhida para EXERCITAR a voz, não para encher tempo:
 *
 *  - "Amanhã" e "apresento" trazem nasais, que é onde clonagem ruim aparece;
 *  - "vinte e três" é número POR EXTENSO: escrito como "23" o sintetizador
 *    poderia lê-lo em outro idioma, e o teste passaria a medir o normalizador
 *    do fornecedor em vez da voz;
 *  - "eckko" é o nome do produto, que é o que vai ser dito na demo.
 *
 * Fixa, e não derivada do roteiro do cliente: a prévia serve para comparar
 * DUAS clonagens entre si, e isso exige que o texto não mude entre elas.
 */
export const VOICE_PREVIEW_PHRASE =
  "Amanhã eu apresento o eckko para vinte e três investidores.";

/**
 * QUAL id vai ao text-to-speech da prévia.
 *
 * Uma linha, e ela é a razão de este arquivo existir. No handler, no instante
 * da prévia, existem dois ids no escopo: `avatar.voice_id` — ainda o ANTIGO,
 * porque o `UPDATE` acontece depois — e o que `cloneVoice()` acabou de
 * devolver. Trocar um pelo outro não produz erro nenhum: 200, áudio, player.
 *
 * O parâmetro se chama `voiceIdRecemClonado` para que a troca fique visível na
 * revisão, e não escondida atrás de um nome genérico.
 */
export function previewVoiceId(voiceIdRecemClonado: string): string {
  return voiceIdRecemClonado;
}

/**
 * NOME da voz no fornecedor.
 *
 * A rota clonava com `name: avatar.name` e mais nada. O resultado está na
 * conta agora: CINCO vozes chamadas "TESTE REAL 15:40 01/08", indistinguíveis
 * no painel do ElevenLabs. Não é só feio — é o que torna a limpeza manual
 * arriscada, porque não há como saber qual apagar sem cruzar `voice_id` com o
 * log, e apagar a errada quebra o avatar que a usa.
 *
 * O sufixo é a data/hora da criação, em UTC. UTC e não local de propósito: o
 * `voice_id_replaced` do log é UTC, e um nome em fuso diferente obrigaria a
 * converter de cabeça justamente no momento em que alguém está tentando
 * identificar qual voz é qual.
 *
 * Formato `AAAA-MM-DD HH:mm` — ordenável alfabeticamente, que é como um painel
 * de fornecedor costuma listar.
 *
 * O nome do avatar é TRUNCADO antes de receber o sufixo. O limite de tamanho
 * de nome do ElevenLabs não está documentado nem foi medido; cortar em 60
 * deixa folga confortável e é preferível a descobrir o teto com uma clonagem
 * recusada DEPOIS de o slot ter sido consumido.
 */
const NOME_MAX_BASE = 60;

export function voiceNameWithTimestamp(avatarName: string, agora: Date): string {
  const iso = agora.toISOString();
  const carimbo = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  const base = avatarName.trim().slice(0, NOME_MAX_BASE);
  return `${base} · ${carimbo}`;
}

/**
 * O que a rota devolve no campo `preview`.
 *
 * `url` e `phrase` andam juntos: um player sem o texto obriga quem ouve a
 * adivinhar o que deveria ter sido dito, e é o texto que torna a comparação
 * entre duas clonagens possível.
 */
export interface VoicePreview {
  url: string;
  phrase: string;
  durationSeconds: number | null;
}

/**
 * Motivo da prévia ausente, em texto de PRODUTO.
 *
 * Nunca `null` silencioso: a resposta é 201 mesmo quando a prévia falha (a
 * clonagem aconteceu e o slot foi gasto — ver a rota), e sem este campo a tela
 * mostraria sucesso sem player e sem explicação. O texto diz as três coisas
 * que quem está olhando não tem como saber: que a voz EXISTE, que o slot foi
 * consumido, e que clonar de novo não conserta a prévia.
 */
export function previewUnavailableMessage(detalhe: string): string {
  return (
    `A voz foi criada e já está ligada a este avatar — o slot do fornecedor foi consumido. ` +
    `Só a prévia não pôde ser gerada (${detalhe}). ` +
    `Clonar de novo NÃO conserta a prévia e gastaria outro slot irreversível.`
  );
}
