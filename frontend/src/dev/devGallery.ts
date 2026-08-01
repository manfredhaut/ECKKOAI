/**
 * Flag da galeria de desenvolvimento (/dev/steps).
 *
 * Mesmo padrão do preenchimento de credenciais: o valor entra por `define`
 * do Vite, exige `DEV_GALLERY=1` explícito, e **falha fechado** em qualquer
 * build de produção — lá a rota não deve existir. "Não existir" significa
 * 404, não uma tela vazia: uma rota que responde 200 com nada convida a
 * pensar que quebrou, e deixa um caminho de código vivo onde não devia.
 *
 * `npm run check` reprova o build se a flag estiver ligada com
 * NODE_ENV=production.
 */
declare const __DEV_GALLERY__: boolean;

export const DEV_GALLERY = __DEV_GALLERY__;
