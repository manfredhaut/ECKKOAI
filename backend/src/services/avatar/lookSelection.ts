/**
 * QUAL id vai ao fornecedor: o do traje escolhido ou o do avatar.
 *
 * Uma linha de decisão, num módulo próprio, e a razão é a de sempre neste
 * projeto: enquanto ela morava como `avatarLookId ?? avatar.provider_avatar_id`
 * dentro do handler do Fastify, a única forma de exercitá-la era subir a
 * aplicação inteira. O arnês mostrou o preço disso — o mutante que apagava o
 * look reprovava o gate por OUTRA guarda, e a guarda do contrato nunca opinava.
 * Uma guarda que não consegue opinar sobre o defeito que existe para pegar é
 * inerte, e inerte é pior que ausente.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A SUBSTITUIÇÃO, E NÃO UM CAMPO
 *
 * O fornecedor NÃO tem campo de traje em `POST /v3/videos`. A doc dele diz, na
 * letra: "The look id is the avatar_id to pass when creating a video". O traje
 * é um LOOK do avatar, e escolher traje é mandar outro id no MESMO campo.
 *
 * A consequência prática é que o defeito aqui é silencioso dos dois lados: o
 * corpo continua bem formado, o fornecedor continua respondendo 200, e o vídeo
 * chega com a roupa errada — cobrado. Foi assim em 06/08.
 * ---------------------------------------------------------------------------
 */

/**
 * @param providerAvatarId id do avatar no fornecedor — o padrão de "não trocar
 *   de roupa", e o que toda geração deste produto usou até agora.
 * @param avatarLookId look escolhido no passo Cena, ou `null`/vazio quando
 *   ninguém escolheu.
 */
export function providerAvatarIdParaGeracao(
  providerAvatarId: string,
  avatarLookId: string | null | undefined,
): string {
  // String vazia é tratada como ausência de propósito: um `<select>` sem
  // escolha manda `""`, e `"" ?? x` devolve `""` — que iria ao fornecedor como
  // avatar inexistente e derrubaria a geração DEPOIS do débito.
  const look = (avatarLookId ?? "").trim();
  return look.length > 0 ? look : providerAvatarId;
}
