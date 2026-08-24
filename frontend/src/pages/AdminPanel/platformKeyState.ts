import type { PlatformCredentialView } from "../../types";

/**
 * O ESTADO DE UMA CHAVE DE PLATAFORMA — W1 item 6, 24/08.
 *
 * ┌─ O verde que mentia ─────────────────────────────────────────────────────┐
 * │ Até aqui o selo era `configured ? "connected" : "disconnected"`, e       │
 * │ `configured` significa uma coisa só: existe linha gravada. O fornecedor  │
 * │ nunca entrava na conta.                                                  │
 * │                                                                          │
 * │ MEDIDO em 24/08, logo depois de o operador gravar quatro chaves pelo     │
 * │ painel: `last_validated_at` NULL nas QUATRO (fal, heygen, google,        │
 * │ embedding) — e a tela dizia "conectado" nas quatro. A validação só roda  │
 * │ a partir do clique no botão (`adminPlatformCredentials.ts`: "Só roda a   │
 * │ partir do clique"), então gravar e ver verde é o caminho normal, não o   │
 * │ excêntrico.                                                              │
 * │                                                                          │
 * │ Pior no cartão da fal: ele NÃO TEM sonda ("validar exigiria adivinhar    │
 * │ para onde mandar", e a fal não expõe endpoint de saldo). O texto do      │
 * │ cartão admitia isso enquanto o selo, na mesma linha, dizia conectado.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Verde passa a significar **o fornecedor respondeu**. Nada mais devolve
 * verde — nem a chave gravada há um minuto, nem a que não tem como ser
 * validada.
 *
 * Função PURA e separada do componente de propósito: é uma regra de leitura
 * de estado, e regra que decide o que a tela AFIRMA precisa poder ser lida
 * sem abrir JSX.
 */
export type PlatformKeyState =
  /** Não há chave gravada. */
  | "ausente"
  /** Gravada, e existe sonda — mas ninguém validou ainda. */
  | "gravada"
  /** Gravada, e NÃO existe sonda: validar é impossível, não pendente. */
  | "gravada_sem_sonda"
  /** O fornecedor respondeu OK. É o único verde. */
  | "validada"
  /** O fornecedor recusou. */
  | "recusada";

/**
 * A ORDEM das condições é a regra, e cada degrau exclui o anterior.
 *
 * `lastValidationOk` é lido ANTES de `hasProbe` de propósito: uma chave que
 * já foi validada com sucesso continua validada mesmo que a sonda seja
 * removida do código depois. O que aconteceu, aconteceu — apagar o registro
 * de uma validação real por causa de uma mudança nossa seria perder
 * informação do fornecedor.
 */
export function platformKeyState(c: PlatformCredentialView): PlatformKeyState {
  if (!c.configured) return "ausente";
  if (c.lastValidationOk === true) return "validada";
  if (c.lastValidationOk === false) return "recusada";
  // Daqui para baixo: gravada e nunca validada. Só resta distinguir "ainda
  // não validaram" de "não há como validar" — e a diferença importa, porque
  // a primeira é uma pendência de alguém clicar e a segunda não é pendência
  // nenhuma. Mostrar as duas igual faria o operador procurar um botão que
  // não existe.
  return c.hasProbe ? "gravada" : "gravada_sem_sonda";
}

/**
 * O selo VERDE é só o de `validada` — e este predicado existe para que essa
 * regra tenha um nome, em vez de estar espalhada como comparação de string.
 */
export function ehVerde(estado: PlatformKeyState): boolean {
  return estado === "validada";
}
