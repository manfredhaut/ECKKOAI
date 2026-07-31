/**
 * Registro único de feature flags.
 *
 * Por que um registro, e não booleanos espalhados: um `if (algoLigado)`
 * solto em três arquivos não responde nenhuma das perguntas que importam —
 * quais recursos existem, quais estão desligados, e **por quê**. O "por
 * quê" é o campo que costuma faltar, e é o único que o cliente precisa ver:
 * um recurso que some sem explicação parece defeito, e um botão que aparece
 * e dá erro parece descaso.
 *
 * Divisão de responsabilidade:
 *  - este arquivo define QUAIS flags existem e o motivo de cada uma;
 *  - a tabela `feature_flags` guarda o ESTADO, para o admin alternar sem
 *    rebuild.
 *
 * Uma chave que não esteja aqui não existe: `npm run check` reprova o build
 * se o código referenciar flag fora deste registro. Isso é o que impede o
 * modo de falha clássico — a flag ser renomeada num lugar e continuar
 * `false` para sempre no outro, silenciosamente.
 */

export const FEATURE_FLAGS = {
  removable_background: {
    label: "Fundo removível",
    /**
     * O motivo é texto de produto, não de engenharia: ele aparece na tela
     * do cliente quando o recurso está indisponível.
     */
    reason: "depende de teste ainda não realizado com a HeyGen",
    defaultEnabled: false,
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isKnownFlag(key: string): key is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, key);
}

/** O que a UI recebe: estado atual + motivo, sempre juntos. */
export interface FeatureFlagState {
  key: FeatureFlagKey;
  label: string;
  enabled: boolean;
  /**
   * Sempre presente quando `enabled` é falso. A UI não deve ter um caminho
   * em que o recurso apareça indisponível sem texto — por isso o motivo
   * viaja junto do estado, e não numa tabela de tradução à parte que
   * alguém pode esquecer de preencher.
   */
  reason: string;
}
