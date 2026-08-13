/**
 * Contrato do arnês de mutação.
 *
 * POR QUE ISTO EXISTE, em uma frase: contagem de ocorrências não detecta guarda
 * inerte; só a tentativa de reprovar detecta.
 *
 * O caso que originou o arnês está registrado no bloco LIVE-2. A
 * `checkVendorLogPolicy` casava TREZE funções — número alto, aparência de
 * cobertura sólida — e mesmo assim era inerte, porque verificava a proposição
 * errada: exigia que quem chama `fetch` mencionasse um helper, sem nunca olhar
 * se o helper ainda registrava alguma coisa. Esvaziar o helper deixava treze
 * funções descobertas de uma vez, sem que nenhuma delas mudasse, e o check
 * continuava verde. Isso só apareceu porque tentei reprovar à mão. Este arquivo
 * torna essa tentativa automática e permanente.
 *
 * Um MUTANTE é uma substituição textual determinística que introduz exatamente
 * o defeito que uma guarda existe para pegar. O arnês aplica, roda o gate,
 * exige saída 1 **com a mensagem daquela guarda**, reverte e exige saída 0.
 *
 * A regra dos dois mutantes, tirada do que aconteceu:
 *
 *  - **óbvio** — remover a chamada, apagar a linha. Pega a regressão comum.
 *  - **esperto** — deslocar a verdade SEM mexer na superfície que a guarda
 *    olha. É o único que detecta guarda que verifica a proposição errada, e é
 *    o que teria pego o defeito do LIVE-2 no dia em que ele foi escrito.
 *
 * `expect` não é decoração: sem ele, um mutante que quebrasse a compilação
 * faria o gate sair 1 por causa do `tsc` e o arnês daria a guarda como ativa
 * sem ela ter opinado. O arnês exige que a falha seja a DAQUELA guarda.
 */

export type MutantKind = "obvio" | "esperto";

export interface Mutant {
  /** Guarda que este mutante testa. Agrupa o relatório. */
  guard: string;
  /** O que o mutante faz, em poucas palavras. */
  name: string;
  kind: MutantKind;
  /**
   * Caminho relativo à raiz do repositório. Opcional porque algumas guardas
   * não vigiam código, e sim CONFIGURAÇÃO: "fixture com NODE_ENV=production",
   * "limiter afrouxado em produção". O defeito que elas pegam não existe em
   * arquivo nenhum — existe no ambiente em que o processo sobe. Para essas, o
   * mutante é `env`, e forçá-las por edição de código faria a guarda ser
   * testada contra si mesma, que não prova nada.
   */
  file?: string;
  /**
   * Trecho a substituir. Precisa ocorrer EXATAMENTE UMA VEZ — o arnês aborta
   * se ocorrer zero (mutante apodreceu junto com o código) ou mais de uma vez
   * (substituição ambígua). A lição vem do DEMO-4: substituição por script que
   * não confirma o resultado é indistinguível de sucesso.
   */
  find?: string;
  replace?: string;
  /**
   * Variáveis de ambiente injetadas só nesta execução do gate. Não tocam
   * disco, então a reversão é automática — o processo seguinte já não as vê.
   */
  env?: Record<string, string>;
  /**
   * Trecho que precisa aparecer na saída do gate para a reprovação contar.
   * Garante que quem reprovou foi a guarda, e não o compilador.
   */
  expect: string;
  /**
   * Inverte a expectativa: este mutante DEVE manter o gate verde, e `expect`
   * passa a ser o trecho que precisa aparecer na saída de sucesso.
   *
   * É o contraponto, e ele importa tanto quanto a reprovação: uma guarda que
   * reprova tudo também "reprova o mutante", e passaria no arnês sem
   * distinguir nada. O mesmo raciocínio do `checkPollPolicy`, que testa
   * "processing continua processando" junto com os casos de erro.
   */
  expectGreen?: boolean;
  /**
   * Arquivo da GUARDA que declara este mutante. Preenchido pelo registro, não
   * escrito à mão — é o que permite à passada AFETADA incluir os mutantes de
   * uma guarda editada mesmo quando o alvo dela não mudou.
   */
  sourceFile?: string;
}
