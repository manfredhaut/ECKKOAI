/**
 * O VÉU: o que a linha de um vídeo NÃO pode carregar quando ela vai para o
 * cliente do tenant.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM FILTRO, E NÃO "cuidado ao montar a resposta"
 *
 * As três rotas que devolvem vídeo (`GET /videos`, `GET /videos/:id` e o 201 de
 * `POST /videos`) montam a resposta a partir de `SELECT *`. Isso é conveniente e
 * é o motivo de o defeito ser fácil: TODA coluna nova entra na resposta
 * sozinha, sem ninguém decidir, e o dia em que ela não devia entrar é
 * indistinguível dos outros. `motion_prompt_en` é a primeira coluna deste
 * projeto que existe para o servidor e para o painel admin, e não para quem
 * usa o produto.
 *
 * O véu não é estética: o modelo do produto é que a pessoa escreve, vê e revisa
 * SEMPRE o próprio texto. Ela não sabe que existe uma versão em inglês, e não
 * precisa saber. Uma tela que mostrasse as duas transformaria uma decisão
 * interna numa segunda caixa de texto a revisar — e, pior, numa que ela não
 * consegue editar.
 *
 * Vale para QUALQUER superfície do tenant: a Biblioteca, o resumo "O QUE VAI SER
 * ENVIADO" do passo 4, tooltip, mensagem de erro e o JSON cru que o navegador
 * recebe. Auditoria vive em log de servidor e no painel admin, que têm outra
 * identidade e outro caminho.
 * ---------------------------------------------------------------------------
 *
 * A lista é declarada, e não inferida por prefixo ou sufixo. Uma convenção de
 * nome ("tudo que termina em `_en`") pareceria mais elegante e falharia calada
 * no primeiro campo velado que não seguisse a convenção.
 */
// Anotada como `readonly string[]`, e NÃO deixada inferir a tupla literal.
//
// Com `as const`, `CAMPOS_VELADOS.length` tem o tipo `1`, e a guarda que
// confere se a lista esvaziou vira `1 === 0` — erro de compilação TS2367 em vez
// de verificação. Ela reprovaria por não compilar, calada, sem nunca dizer o que
// está errado: INERTE. É o mesmo defeito já medido em `VOICE_SPEED` e pago de
// novo em `MAX_SCRIPT_SECONDS`; aqui ele foi pego pelo `tsc` antes de custar um
// mutante.
export const CAMPOS_VELADOS: readonly string[] = ["motion_prompt_en"];

/**
 * A linha sem os campos velados.
 *
 * Devolve um objeto NOVO em vez de apagar as chaves do recebido: o chamador
 * pode ainda precisar da linha inteira (o payload do fornecedor precisa, e é o
 * ponto), e mutar o argumento faria o véu vazar como perda de dado em vez de
 * proteção.
 *
 * `Record<string, unknown>` e não um tipo estreito de propósito — o que entra
 * aqui já passou por `...row` com colunas que nem o tipo `Video` conhece, e um
 * tipo estreito daria a impressão de que a lista de campos é conhecida em tempo
 * de compilação, quando o risco real é justamente a coluna que ninguém declarou.
 */
export function semCamposVelados<T extends Record<string, unknown>>(linha: T): T {
  const copia = { ...linha };
  for (const campo of CAMPOS_VELADOS) {
    delete copia[campo];
  }
  return copia;
}
