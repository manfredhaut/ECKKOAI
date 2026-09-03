/**
 * O CONTRATO de `POST /v3/videos`: o que sai no corpo, e o que sai no header.
 *
 * Esta guarda nasceu de uma geração paga que voltou errada em 06/08 — sem o
 * traje escolhido e com o fundo por cor inerte — e do levantamento que veio
 * depois. Ela existe porque três coisas diferentes podem quebrar aqui, e
 * nenhuma delas grita:
 *
 * 1. **O traje escolhido some no caminho.** O fornecedor NÃO tem campo de
 *    traje: a doc dele diz, na letra, que "the look id is the avatar_id to
 *    pass when creating a video". Ou seja, o look ENTRA NO LUGAR do avatar. Um
 *    call site que esqueça o look manda o avatar base, o fornecedor responde
 *    200, e o vídeo sai com a roupa errada — pago. Foi exatamente assim que a
 *    geração de 06/08 saiu, e nada no sistema soube.
 *
 * 2. **Campo a mais derruba tudo.** MEDIDO em 06/08, com `avatar_id`
 *    inexistente como fusível: o schema é `additionalProperties: false` e um
 *    campo desconhecido volta 400 `"Extra inputs are not permitted"`. O débito
 *    acontece ANTES da chamada, então um campo inventado custa o estorno e a
 *    confiança de quem clicou. Esta guarda mantém a lista fechada.
 *
 * 3. **Sem chave de idempotência, duplo clique é dinheiro.** O fornecedor
 *    documenta `Idempotency-Key` com replay de 24 h. A chave só serve se for
 *    derivada da TENTATIVA — do instante, ela nunca colide, e é como não ter.
 *
 * O que esta guarda NÃO afirma: que `remove_background` conserta o fundo e que
 * `fit: "cover"` acaba com as barras. Isso é DEDUZIDO da doc e do sintoma, e só
 * uma geração paga decide. O que ela afirma é que os dois campos SAEM — porque
 * a falha anterior não foi de valor errado, foi de campo ausente.
 */
import type { Mutant } from "./mutants.js";
import {
  buildHeygenVideoPayload,
  heygenIdempotencyKey,
  heygenVideoRequestHeaders,
} from "../services/providers/avatarProvider.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { assertLookUsavel, LookInvalidoError, providerAvatarIdParaGeracao } from "../services/avatar/lookSelection.js";

export interface VideoContractCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "contrato de vídeo: o traje escolhido chega ao objeto enviado",
    name: "o traje escolhido não chega ao objeto enviado",
    kind: "esperto",
    // A tela continua oferecendo o seletor, o banco continua gravando
    // `avatar_look_id`, e o fornecedor continua respondendo 200. Só o corpo
    // enviado volta a ter o avatar base — e o vídeo sai com a roupa errada,
    // pago, sem nada acusando. É o defeito de 06/08, letra por letra.
    file: "backend/src/services/avatar/lookSelection.ts",
    find: "  return look.length > 0 ? look : providerAvatarId;",
    replace: "  void look;\n  return providerAvatarId;",
    expect: "o traje escolhido não chegou ao corpo de POST /v3/videos",
  },
  {
    guard: "contrato de vídeo: o traje escolhido chega ao objeto enviado",
    name: "o seletor sem escolha vira avatar inexistente",
    kind: "esperto",
    // `"" ?? x` devolve `""`. Um `<select>` sem escolha manda string vazia, e
    // ela atravessaria como `avatar_id: ""` — 4xx do fornecedor DEPOIS do
    // débito, num caminho que parece o mais comum de todos: ninguém escolheu
    // traje.
    file: "backend/src/services/avatar/lookSelection.ts",
    find:
      '  const look = (avatarLookId ?? "").trim();\n' +
      "  return look.length > 0 ? look : providerAvatarId;",
    replace: "  return avatarLookId ?? providerAvatarId;",
    expect: "o traje escolhido não chegou ao corpo de POST /v3/videos",
  },
  {
    guard: "contrato de vídeo: fundo pedido manda remover o original",
    name: "o fundo vai sem mandar remover o original",
    kind: "esperto",
    // `background` continua no corpo, o fornecedor continua aceitando com 200,
    // e o vídeo sai com o fundo da FOTO. Foi o que aconteceu em 06/08: a cor
    // #1B2A4A foi enviada e não apareceu em lugar nenhum do quadro.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "  if (body.background) body.remove_background = true;",
    replace: "  void body.background;",
    expect: "o fundo foi pedido sem mandar remover o original",
  },
  {
    guard: "contrato de vídeo: o quadro é preenchido, não embarrado",
    name: "o quadro volta a caber com barra",
    kind: "esperto",
    // `contain` é o comportamento ANTIGO e ele parece correto: o vídeo sai
    // inteiro, na proporção pedida, sem cortar nada. O preço são os 40% de
    // barra sólida medidos no 4:5 e os 57,8% no 9:16 — que passaram meses
    // sendo lidos como "assim que o fornecedor entrega".
    file: "backend/src/services/providers/avatarProvider.ts",
    find: 'const HEYGEN_FIT: "contain" | "cover" = "cover";',
    replace: 'const HEYGEN_FIT: "contain" | "cover" = "contain";',
    expect: "o quadro voltou a ser preenchido com barra",
  },
  {
    guard: "contrato de vídeo: a chave de idempotência é da tentativa",
    name: "a chave de idempotência passa a variar por request",
    kind: "esperto",
    // O header continua sendo enviado, continua no formato certo, continua
    // aparecendo no log. Só que agora ele nunca colide — e a proteção contra
    // duplo clique, que é a única razão de o campo existir, some inteira sem
    // que nada mude de aparência.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "  return `eckko-${createHash(\"sha256\").update(material).digest(\"hex\")}`;",
    replace: "  return `eckko-${createHash(\"sha256\").update(material + String(Date.now())).digest(\"hex\")}`;",
    expect: "a chave de idempotência deixou de ser derivada da tentativa",
  },
  {
    guard: "contrato de vídeo: a chave de idempotência é da tentativa",
    name: "a chave de idempotência deixa de ser enviada",
    kind: "obvio",
    // Nada muda de aparência: o corpo é o mesmo, a resposta é a mesma, o vídeo
    // sai igual. Só que o duplo clique volta a custar dois vídeos.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '    "Idempotency-Key": heygenIdempotencyKey(input),',
    replace: "",
    expect: "a requisição de vídeo saiu sem chave de idempotência",
  },
  {
    guard: "contrato de vídeo: nenhum campo fora do schema do fornecedor",
    name: "um campo fora do schema entra no corpo",
    kind: "obvio",
    // O schema é `additionalProperties: false` — MEDIDO. Um campo a mais
    // derruba a geração inteira com 400, DEPOIS do débito.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    fit: HEYGEN_FIT,\n  };",
    replace: '    fit: HEYGEN_FIT,\n    outfit_id: "traje",\n  };',
    expect: "campo fora do schema do fornecedor",
  },
  {
    guard: "look: um traje ainda processing/failed é recusado antes de qualquer chamada ao fornecedor",
    name: "assertLookUsavel deixa de recusar look não-completed",
    kind: "esperto",
    // ESPERTO: a função continua existindo, continua sendo chamada, continua
    // lançando para OUTRO avatar — só o status deixa de ser conferido. Um
    // traje criado por texto (assíncrono, migration 045) ainda `processing`
    // passaria intacto para `providerAvatarIdParaGeracao` e viraria o
    // `avatar_id` de uma chamada real ao fornecedor, para um look que ele
    // ainda não terminou de preparar.
    // ⚠️ `replace` usa `doAvatar.status !== doAvatar.status` (sempre falso em
    // runtime) e NÃO um literal `false`: o TypeScript trata `if (false) {…}`
    // como bloco inalcançável e para de propagar o narrowing de `doAvatar`
    // (que vem de `if (!doAvatar) throw` acima) para dentro dele — MEDIDO
    // nesta rodada, o gate saiu 2 pelo `tsc` ("doAvatar" possibly undefined)
    // em vez de a guarda opinar. Mesmo gotcha já documentado para
    // `checkFalGenerationPathPolicy.ts`.
    file: "backend/src/services/avatar/lookSelection.ts",
    find: '  if (doAvatar.status !== "completed") {',
    replace: "  if (doAvatar.status !== doAvatar.status) {",
    expect: "look_nao_pronto",
  },
  {
    guard: "look: um traje simulated=true não alcança uma geração live",
    name: "assertLookUsavel deixa de recusar look simulado em live",
    kind: "esperto",
    // ESPERTO: o traje nasceu em `fixture` (nunca existiu de verdade no
    // fornecedor) e a checagem de status continua funcionando — só a de
    // `simulated` desliga. Em live, o id iria ao fornecedor como se fosse
    // real.
    file: "backend/src/services/avatar/lookSelection.ts",
    find: "  if (doAvatar.simulated && !isFixtureMode()) {",
    replace: "  if (false) {",
    expect: "look_simulado_em_live",
  },
  {
    guard: "look: um provider_look_id de OUTRO avatar deste tenant é recusado, não silenciosamente aceito",
    name: "assertLookUsavel passa a filtrar por avatar_id na consulta, e o look de outro avatar vira \"sem linha local\"",
    kind: "esperto",
    // ESPERTO: parece uma simplificação inofensiva — filtrar direto no SQL em
    // vez de filtrar em memória. O efeito real é o oposto do pretendido: um
    // look de OUTRO avatar deixa de aparecer na consulta (WHERE avatar_id
    // não bate), a função lê "nenhuma linha" e devolve — e o comentário do
    // módulo é claro que "nenhuma linha" é o caminho de PASSAGEM (look nativo
    // do fornecedor). Um id de traje real, mas de outro avatar, passaria como
    // se nunca tivesse existido localmente.
    file: "backend/src/services/avatar/lookSelection.ts",
    find:
      '    "SELECT avatar_id, status, simulated FROM avatar_looks WHERE tenant_id = $1 AND provider_look_id = $2",\n' +
      "    [params.tenantId, params.avatarLookId],",
    replace:
      '    "SELECT avatar_id, status, simulated FROM avatar_looks WHERE tenant_id = $1 AND provider_look_id = $2 AND avatar_id = $3",\n' +
      "    [params.tenantId, params.avatarLookId, params.avatarId],",
    expect: "look_outro_avatar",
  },
  {
    guard: "contrato de vídeo: sem `extras` o corpo é o de sempre; com `extras`, voice_id+script é mutuamente exclusivo com audio_asset_id",
    name: "o modo voice_id deixa de ser exclusivo — passa a rodar mesmo com audio_asset_id presente",
    kind: "esperto",
    // ESPERTO: os dois `if` continuam sintaticamente válidos, `audio_asset_id`
    // continua no corpo — só que `voice_id`/`script` PASSAM A ENTRAR JUNTO
    // quando `extras.voiceId` também está presente. O fornecedor documenta os
    // dois modos de áudio como alternativas exclusivas: um corpo com os dois
    // é o tipo de erro que só aparece no 400 do fornecedor, depois do débito.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "  if (audioAssetId) {\n    body.audio_asset_id = audioAssetId;\n  } else if (extras?.voiceId) {",
    replace: "  if (audioAssetId) {\n    body.audio_asset_id = audioAssetId;\n  }\n  if (extras?.voiceId) {",
    expect: "voice_id`/`script` chegaram ao corpo mesmo assim",
  },
  {
    guard: "contrato de vídeo: sem `extras` o corpo é o de sempre",
    name: "output_format entra no corpo mesmo sem extras",
    kind: "esperto",
    // ESPERTO: o campo continua com valor válido do schema — só passa a
    // aparecer em TODA geração, inclusive as que nunca passaram `extras`
    // (todo call site de produto hoje). Um vídeo que sempre pediu o default
    // do fornecedor passaria a pedir webm sempre, sem ninguém ter escolhido.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '  if (extras?.outputFormat) body.output_format = extras.outputFormat;',
    replace: '  body.output_format = extras?.outputFormat ?? "mp4";',
    expect: "sem `extras`, o corpo trouxe `output_format` mesmo assim",
  },
  {
    guard: "contrato de vídeo: `voice_settings` só traz os subcampos fornecidos",
    name: "voice_settings passa a incluir pitch/volume mesmo quando não fornecidos",
    kind: "esperto",
    // ESPERTO: `speed`/`locale` continuam corretos — só `pitch`/`volume`
    // passam a aparecer como `undefined` no objeto (que `JSON.stringify`
    // omite na SERIALIZAÇÃO, mas `"pitch" in vs` continua `true` em memória,
    // que é o que este vetor mede — o mesmo tipo de vazamento silencioso que
    // já foi medido neste projeto no `background` sem `remove_background`).
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "      if (extras.voiceSettings.pitch != null) vs.pitch = extras.voiceSettings.pitch;\n" +
      "      if (extras.voiceSettings.volume != null) vs.volume = extras.voiceSettings.volume;",
    replace: "      vs.pitch = extras.voiceSettings.pitch;\n      vs.volume = extras.voiceSettings.volume;",
    expect: "voice_settings` trouxe um subcampo não fornecido",
  },
];

/**
 * Os campos que `POST /v3/videos` aceita no corpo do tipo `avatar`.
 *
 * Transcritos da doc do fornecedor lida em 06/08. A lista é FECHADA porque o
 * schema dele é fechado: qualquer coisa fora daqui volta 400 e derruba uma
 * geração que já foi debitada.
 */
const CAMPOS_DO_SCHEMA = new Set([
  "type",
  "avatar_id",
  "title",
  "resolution",
  "aspect_ratio",
  "fit",
  "background",
  "remove_background",
  "callback_url",
  "callback_id",
  "watermark",
  "caption",
  "output_format",
  "script",
  "voice_id",
  "audio_url",
  "audio_asset_id",
  "voice_settings",
  "motion_prompt",
  "expressiveness",
  "engine",
]);

/** O padrão que o fornecedor declara para o header. */
const PADRAO_IDEMPOTENCIA = /^[A-Za-z0-9_\-:.]{1,255}$/;

const LOOK = "look-do-jaleco-branco";
const AVATAR_BASE = "avatar-base-sem-traje";

export async function checkVideoContractPolicy(): Promise<VideoContractCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const format = resolveVideoFormat("youtube");
  const BASE = {
    format,
    supportedEngines: null,
    engineEnabled: false,
    engineChoice: null,
  } as const;

  // ---------------------------------------------------------------------------
  // 1. O TRAJE vai no lugar do avatar — é assim que o fornecedor recebe traje.
  //
  // A decisão é exercitada pela FUNÇÃO que a rota chama, com os valores que a
  // rota lhe passa, e o resultado entra no montador. Assim o vetor mede o id
  // que de fato sai no corpo, e não a presença de um trecho de texto no
  // handler — que é a diferença entre pegar o defeito e citá-lo.
  // ---------------------------------------------------------------------------
  const escolhido = providerAvatarIdParaGeracao(AVATAR_BASE, LOOK);
  const naoEscolhido = providerAvatarIdParaGeracao(AVATAR_BASE, null);
  const escolhaVazia = providerAvatarIdParaGeracao(AVATAR_BASE, "");

  if (naoEscolhido !== AVATAR_BASE || escolhaVazia !== AVATAR_BASE) {
    failures.push(
      "contrato de vídeo: o traje escolhido não chegou ao corpo de POST /v3/videos — sem escolha, o id " +
        `enviado deixou de ser o do avatar (null → ${JSON.stringify(naoEscolhido)}, "" → ` +
        `${JSON.stringify(escolhaVazia)}). Um seletor sem escolha manda string vazia, e ela iria ao ` +
        "fornecedor como avatar inexistente — 4xx DEPOIS do débito.",
    );
  }

  const comTraje = buildHeygenVideoPayload(
    {
      ...BASE,
      providerAvatarId: escolhido,
      scene: { background: { type: "color", value: "#1e3a5f" }, motionPrompt: "gesto leve", expressiveness: "medium" },
    },
    "asset-de-audio",
    null,
  );

  if (comTraje.body.avatar_id !== LOOK) {
    failures.push(
      `contrato de vídeo: o traje escolhido não chegou ao corpo de POST /v3/videos — foi ` +
        `\`avatar_id: ${JSON.stringify(comTraje.body.avatar_id)}\` no lugar do look. O fornecedor não tem ` +
        "campo de traje: a doc dele diz que o id do LOOK é o `avatar_id` a enviar. Um corpo com o avatar " +
        "base volta 200 e entrega a roupa errada, cobrada — foi exatamente a geração de 06/08.",
    );
  }

  // O contraponto: sem look escolhido, o avatar base é o certo. Sem ele, um
  // vetor que só olha "avatar_id é o look" passaria verde com o call site
  // mandando o look SEMPRE, inclusive quando ninguém escolheu traje.
  const semTraje = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: naoEscolhido, scene: null },
    "asset-de-audio",
    null,
  );
  if (semTraje.body.avatar_id !== AVATAR_BASE) {
    failures.push(
      "contrato de vídeo: sem traje escolhido o corpo deixou de levar o avatar base. O padrão de não " +
        "trocar de roupa é o avatar como ele é, e perdê-lo quebra toda geração que não escolhe traje.",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. FUNDO pedido manda remover o original — senão a cor é inerte.
  // ---------------------------------------------------------------------------
  const fundo = comTraje.body.background as { type?: string; value?: string } | undefined;
  if (fundo?.type !== "color" || fundo.value !== "#1e3a5f") {
    failures.push(
      `contrato de vídeo: o fundo por cor não chegou ao corpo na forma do contrato — veio ` +
        `${JSON.stringify(comTraje.body.background)}, esperado {type:"color", value:"#1e3a5f"}.`,
    );
  }
  if (comTraje.body.remove_background !== true) {
    failures.push(
      "contrato de vídeo: o fundo foi pedido sem mandar remover o original (`remove_background` " +
        `veio ${JSON.stringify(comTraje.body.remove_background)}). MEDIDO em 06/08: a cor #1B2A4A foi ` +
        "enviada, o fornecedor respondeu 200, e o vídeo saiu com o fundo da FOTO. O avatar é um talking " +
        "photo e a foto tem fundo próprio — pedir uma cor sem tirar o que já está lá não deixa a cor com " +
        "onde aparecer.",
    );
  }
  // E o contraponto que impede a correção preguiçosa de mandar `true` sempre:
  // remover o fundo sem pôr nada no lugar entrega um recorte sobre vazio.
  if ("remove_background" in semTraje.body) {
    failures.push(
      "contrato de vídeo: sem fundo escolhido o corpo mandou remover o fundo assim mesmo. Isso entrega " +
        "um recorte sobre vazio, que ninguém pediu — a remoção existe para dar lugar ao fundo novo.",
    );
  }

  // ---------------------------------------------------------------------------
  // 3. O QUADRO é preenchido, não embarrado.
  // ---------------------------------------------------------------------------
  for (const [rotulo, corpo] of [["com traje", comTraje.body], ["sem traje", semTraje.body]] as const) {
    if (corpo.fit !== "cover") {
      failures.push(
        `contrato de vídeo: o quadro voltou a ser preenchido com barra (${rotulo}: \`fit\` veio ` +
          `${JSON.stringify(corpo.fit)}). MEDIDO no fornecedor que o campo aceita só "contain" ou ` +
          '"cover"; "contain" cabe o quadro inteiro e preenche o resto com sólido, que são os 40% de ' +
          "barra medidos no 4:5 e os 57,8% no 9:16.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4. NENHUM campo fora do schema — ele é fechado, e o débito vem antes.
  // ---------------------------------------------------------------------------
  for (const [rotulo, corpo] of [["com traje", comTraje.body], ["sem traje", semTraje.body]] as const) {
    const fora = Object.keys(corpo).filter((k) => !CAMPOS_DO_SCHEMA.has(k));
    if (fora.length > 0) {
      failures.push(
        `contrato de vídeo: campo fora do schema do fornecedor no corpo ${rotulo} — ` +
          `${JSON.stringify(fora)}. MEDIDO em 06/08 que \`POST /v3/videos\` é additionalProperties:false ` +
          'e devolve 400 "Extra inputs are not permitted". O débito acontece ANTES da chamada, então um ' +
          "campo inventado custa o estorno e a geração.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 5. EXPRESSIVIDADE só com Avatar IV.
  //
  // O schema NÃO impõe isto — medido: `expressiveness` com `avatar_iii` passa a
  // validação. O fornecedor aceita e ignora em silêncio, que é o pior caso, e
  // por isso a regra vive aqui, onde é observável.
  // ---------------------------------------------------------------------------
  const comIii = buildHeygenVideoPayload(
    {
      ...BASE,
      engineEnabled: true,
      engineChoice: "avatar_iii",
      providerAvatarId: LOOK,
      scene: { expressiveness: "high" },
    },
    "asset-de-audio",
    null,
  );
  if ("expressiveness" in comIii.body) {
    failures.push(
      "contrato de vídeo: `expressiveness` foi enviado com `engine.type: avatar_iii`. O fornecedor " +
        "documenta o campo como Avatar IV only e NÃO o rejeita no schema — ele aceita e ignora, então " +
        "quem escolheu 'expressiva' recebe um vídeo neutro sem nada dizendo por quê.",
    );
  }
  const comIv = buildHeygenVideoPayload(
    {
      ...BASE,
      engineEnabled: true,
      engineChoice: "avatar_iv",
      providerAvatarId: LOOK,
      scene: { expressiveness: "high" },
    },
    "asset-de-audio",
    null,
  );
  if (comIv.body.expressiveness !== "high") {
    failures.push(
      "contrato de vídeo: `expressiveness` não chegou ao corpo com Avatar IV, que é o motor em que ele " +
        "vale. A escolha da tela some sem aviso.",
    );
  }
  // Flag desligada não manda `engine`, e o default do fornecedor é avatar_iv —
  // o campo continua valendo, e é o caminho de TODA geração de hoje.
  if (comTraje.body.expressiveness !== "medium") {
    failures.push(
      "contrato de vídeo: com a flag de motor desligada, `expressiveness` sumiu do corpo. É o caminho " +
        "de toda geração deste produto hoje, e o default declarado do fornecedor é avatar_iv — o campo " +
        "vale, e tirá-lo aqui apaga silenciosamente a escolha da tela.",
    );
  }

  // ---------------------------------------------------------------------------
  // 6. A CHAVE DE IDEMPOTÊNCIA é da TENTATIVA, não do instante.
  // ---------------------------------------------------------------------------
  const tentativa = {
    tenantId: "t1",
    providerAvatarId: LOOK,
    script: "Bom dia. Este é um teste de traje.",
    format,
    scene: { background: { type: "color" as const, value: "#1e3a5f" }, expressiveness: "medium" as const },
    engineChoice: null,
  };
  const k1 = heygenIdempotencyKey(tentativa);
  await new Promise((r) => setTimeout(r, 5));
  const k2 = heygenIdempotencyKey({ ...tentativa });

  // O header que VAI no `fetch`, e não a menção a ele: sem este vetor, apagar
  // a linha da requisição deixaria a derivação perfeita e a chave em lugar
  // nenhum — o defeito mais fácil de não notar, porque nada muda de aparência.
  const headers = heygenVideoRequestHeaders("chave-do-fornecedor", tentativa);
  const enviada = headers["Idempotency-Key"];
  if (!enviada) {
    failures.push(
      "contrato de vídeo: a requisição de vídeo saiu sem chave de idempotência — os headers de " +
        `POST /v3/videos são ${JSON.stringify(Object.keys(headers))}. O fornecedor replica a resposta ` +
        "por 24 h na mesma chave, e é só isso que impede um duplo clique de enfileirar (e cobrar) dois " +
        "vídeos.",
    );
  } else if (enviada !== k1) {
    failures.push(
      "contrato de vídeo: a chave enviada no header não é a derivada da tentativa. Duas derivações " +
        "diferentes para a mesma coisa significam que uma delas não protege nada.",
    );
  }

  if (k1 !== k2) {
    failures.push(
      "contrato de vídeo: a chave de idempotência deixou de ser derivada da tentativa — a MESMA " +
        "tentativa produziu duas chaves. Derivada do instante ela nunca colide, e uma chave que nunca " +
        "colide é o mesmo que não mandar chave: o duplo clique volta a gerar (e cobrar) dois vídeos.",
    );
  }
  if (!PADRAO_IDEMPOTENCIA.test(k1)) {
    failures.push(
      `contrato de vídeo: a chave de idempotência (${JSON.stringify(k1.slice(0, 40))}…, ${k1.length} ` +
        "caracteres) está fora do padrão `[A-Za-z0-9_\\-:.]{1,255}` que o fornecedor declara. Chave " +
        "malformada é 400 depois do débito.",
    );
  }
  // Tentativas DIFERENTES não podem colidir: replay de 24 h numa chave repetida
  // devolveria o vídeo antigo para quem pediu um novo.
  const variacoes: [string, Parameters<typeof heygenIdempotencyKey>[0]][] = [
    ["outro traje", { ...tentativa, providerAvatarId: AVATAR_BASE }],
    ["outro roteiro", { ...tentativa, script: tentativa.script + " Mais uma frase." }],
    ["outro formato", { ...tentativa, format: resolveVideoFormat("reels_tiktok") }],
    ["outro fundo", { ...tentativa, scene: { ...tentativa.scene, background: { type: "color", value: "#ffffff" } } }],
    ["outra expressividade", { ...tentativa, scene: { ...tentativa.scene, expressiveness: "low" } }],
    ["outro tenant", { ...tentativa, tenantId: "t2" }],
  ];
  for (const [rotulo, v] of variacoes) {
    if (heygenIdempotencyKey(v) === k1) {
      failures.push(
        `contrato de vídeo: a chave de idempotência COLIDIU com ${rotulo}. Dentro de 24 h o fornecedor ` +
          "replica a resposta da chave, então quem pediu um vídeo diferente receberia o anterior.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 7. O LOOK é validado ANTES da substituição — G2, gap dimensionado em Z0.3.
  //
  // Duplo de banco em memória: `assertLookUsavel` só usa `pool.query`, e o que
  // se mede aqui é a DECISÃO sobre as linhas devolvidas, não uma consulta SQL
  // de verdade — a mesma economia de `checkOutfitPolicy.ts`.
  // ---------------------------------------------------------------------------
  {
    type LinhaDeTeste = { avatar_id: string; status: string; simulated: boolean; provider_look_id: string };
    // Sensível ao NÚMERO de parâmetros da consulta, não só ao texto: é o que
    // distingue o código real (2 parâmetros — tenant, look; o filtro por
    // avatar acontece EM MEMÓRIA, depois) do mutante que move o filtro por
    // avatar_id para dentro do próprio SQL (3 parâmetros). Um duplo que
    // ignorasse essa diferença ficaria INERTE para esse mutante específico —
    // foi MEDIDO nesta rodada: sem esta sensibilidade, o mutante 3 passava
    // verde porque o duplo sempre devolvia a linha, mascarando o efeito real
    // de um WHERE avatar_id=$3 (que faria um Postgres de verdade devolver
    // ZERO linhas para o look de outro avatar, não a linha completa).
    const poolDuplo = (linhas: LinhaDeTeste[]) =>
      ({
        query: async (_texto: unknown, params?: unknown[]) => {
          const [, providerLookId, avatarIdNoFiltro] = params as [string, string, string?];
          const rows = linhas
            .filter((l) => l.provider_look_id === providerLookId)
            .filter((l) => avatarIdNoFiltro === undefined || l.avatar_id === avatarIdNoFiltro);
          return { rows, rowCount: rows.length };
        },
      }) as unknown as import("pg").Pool;

    const TENANT = "tenant-da-prova";
    const AVATAR_A = "avatar-a";
    const AVATAR_B = "avatar-b";

    // 7.1 — sem linha local: PASSA (look nativo do fornecedor, nunca inserido
    // em avatar_looks — ver o comentário de assertLookUsavel).
    try {
      await assertLookUsavel(poolDuplo([]), { tenantId: TENANT, avatarId: AVATAR_A, avatarLookId: "look-nativo" });
    } catch (err) {
      failures.push(
        `look: um avatarLookId sem linha local foi recusado (${String(err)}) — isso quebraria o ` +
          "caminho de looks nativos do fornecedor, nunca inseridos em avatar_looks (18 órfãos, CLAUDE.md).",
      );
    }

    // 7.2 — linha local, completed, do avatar certo, não simulada: PASSA.
    const linhaBoa: LinhaDeTeste = { avatar_id: AVATAR_A, status: "completed", simulated: false, provider_look_id: "look-ok" };
    try {
      await assertLookUsavel(poolDuplo([linhaBoa]), { tenantId: TENANT, avatarId: AVATAR_A, avatarLookId: "look-ok" });
    } catch (err) {
      failures.push(`look: um traje completed, do avatar certo e não simulado foi recusado (${String(err)}).`);
    }

    // 7.3 — status processing: RECUSA como look_nao_pronto.
    const linhaProcessando: LinhaDeTeste = { avatar_id: AVATAR_A, status: "processing", simulated: false, provider_look_id: "look-processando" };
    try {
      await assertLookUsavel(poolDuplo([linhaProcessando]), { tenantId: TENANT, avatarId: AVATAR_A, avatarLookId: "look-processando" });
      failures.push(
        "look_nao_pronto: um traje ainda `processing` NÃO foi recusado — ele chegaria intacto a " +
          "providerAvatarIdParaGeracao e viraria o avatar_id de uma chamada real ao fornecedor.",
      );
    } catch (err) {
      if (!(err instanceof LookInvalidoError) || err.code !== "look_nao_pronto") {
        failures.push(`look_nao_pronto: traje processing recusado pelo motivo errado (${String(err)}).`);
      }
    }

    // 7.4 — simulated=true em modo live: RECUSA como look_simulado_em_live.
    const linhaSimulada: LinhaDeTeste = { avatar_id: AVATAR_A, status: "completed", simulated: true, provider_look_id: "look-simulado" };
    const modoOriginal = process.env.PROVIDER_MODE;
    process.env.PROVIDER_MODE = "live";
    try {
      await assertLookUsavel(poolDuplo([linhaSimulada]), { tenantId: TENANT, avatarId: AVATAR_A, avatarLookId: "look-simulado" });
      failures.push(
        "look_simulado_em_live: um traje `simulated=true` NÃO foi recusado em modo live — ele nunca " +
          "existiu de verdade no fornecedor e chegaria como avatar_id de uma chamada real.",
      );
    } catch (err) {
      if (!(err instanceof LookInvalidoError) || err.code !== "look_simulado_em_live") {
        failures.push(`look_simulado_em_live: traje simulado em live recusado pelo motivo errado (${String(err)}).`);
      }
    } finally {
      if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
      else process.env.PROVIDER_MODE = modoOriginal;
    }

    // 7.5 — linha existe, mas de OUTRO avatar do mesmo tenant: RECUSA como
    // look_outro_avatar — nunca "sem linha local" (que passaria).
    const linhaDeOutroAvatar: LinhaDeTeste = { avatar_id: AVATAR_B, status: "completed", simulated: false, provider_look_id: "look-do-b" };
    try {
      await assertLookUsavel(poolDuplo([linhaDeOutroAvatar]), { tenantId: TENANT, avatarId: AVATAR_A, avatarLookId: "look-do-b" });
      failures.push(
        "look_outro_avatar: um provider_look_id de OUTRO avatar do mesmo tenant NÃO foi recusado — a " +
          "geração sairia com o rosto/traje de um avatar diferente do que a tela mostrava.",
      );
    } catch (err) {
      if (!(err instanceof LookInvalidoError) || err.code !== "look_outro_avatar") {
        failures.push(`look_outro_avatar: traje de outro avatar recusado pelo motivo errado (${String(err)}).`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. B1, BLOCO HEYGEN-SIMPLES-1 (02/09/2026) — os campos SEM call site ainda.
  //
  // Omitir `extras` (o caminho de produto de hoje) produz o corpo de sempre;
  // cada campo simples só entra quando fornecido; e o modo `voice_id` (voz
  // clonada NA HeyGen, B5) é MUTUAMENTE EXCLUSIVO com `audio_asset_id` — a
  // doc do fornecedor documenta os dois como alternativas de áudio, nunca
  // os dois juntos.
  // ---------------------------------------------------------------------------
  const semExtras = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: AVATAR_BASE, scene: null },
    "asset-de-audio",
    null,
  );
  for (const campo of ["output_format", "brand_glossary_id", "title", "callback_url", "callback_id", "voice_id", "voice_settings", "script"]) {
    if (campo in semExtras.body) {
      failures.push(
        `contrato de vídeo: sem \`extras\`, o corpo trouxe \`${campo}\` mesmo assim. Nenhum call site de ` +
          "produto passa `extras` ainda (B5/B7 não ligados) — um campo vazando aqui muda o corpo de TODA " +
          "geração de hoje sem ninguém ter pedido.",
      );
    }
  }

  const comExtrasSimples = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: AVATAR_BASE, scene: null },
    "asset-de-audio",
    null,
    {
      outputFormat: "webm",
      brandGlossaryId: "glossario-1",
      title: "titulo-do-video",
      callbackUrl: "https://exemplo.test/callback",
      callbackId: "callback-1",
    },
  );
  const camposEsperados: Record<string, string> = {
    output_format: "webm",
    brand_glossary_id: "glossario-1",
    title: "titulo-do-video",
    callback_url: "https://exemplo.test/callback",
    callback_id: "callback-1",
  };
  for (const [campo, valor] of Object.entries(camposEsperados)) {
    if ((comExtrasSimples.body as Record<string, unknown>)[campo] !== valor) {
      failures.push(
        `contrato de vídeo: com \`extras\` preenchido, \`${campo}\` não chegou ao corpo (veio ` +
          `${JSON.stringify((comExtrasSimples.body as Record<string, unknown>)[campo])}, esperado ` +
          `${JSON.stringify(valor)}).`,
      );
    }
  }

  // O MODO voice_id — só existe quando `audioAssetId` é `null`. Com áudio já
  // sintetizado (o caminho de hoje), `voice_id` NUNCA aparece, mesmo que
  // `extras.voiceId` esteja preenchido — é a exclusão mútua.
  const audioVenceVoiceId = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: AVATAR_BASE, scene: null, script: "roteiro de teste" },
    "asset-de-audio",
    null,
    { voiceId: "voz-heygen-1" },
  );
  if ("voice_id" in audioVenceVoiceId.body || "script" in audioVenceVoiceId.body) {
    failures.push(
      "contrato de vídeo: com `audioAssetId` presente, `voice_id`/`script` chegaram ao corpo mesmo " +
        "assim. O fornecedor documenta os dois modos de áudio como MUTUAMENTE EXCLUSIVOS — mandar os " +
        "dois juntos é o tipo de corpo que só se descobre errado no 400 do fornecedor, depois do débito.",
    );
  }
  if (audioVenceVoiceId.body.audio_asset_id !== "asset-de-audio") {
    failures.push(
      "contrato de vídeo: com `audioAssetId` presente, o corpo deixou de levar `audio_asset_id`.",
    );
  }

  const semAudioComVoiceId = buildHeygenVideoPayload(
    { ...BASE, providerAvatarId: AVATAR_BASE, scene: null, script: "roteiro de teste" },
    null,
    null,
    {
      voiceId: "voz-heygen-1",
      voiceSettings: { speed: 1.1, locale: "pt-BR" },
    },
  );
  if (semAudioComVoiceId.body.voice_id !== "voz-heygen-1") {
    failures.push(
      "contrato de vídeo: sem `audioAssetId` e com `extras.voiceId`, `voice_id` não chegou ao corpo — o " +
        "modo alternativo de áudio (voz clonada na HeyGen, B5) ficaria sem como se conectar.",
    );
  }
  if (semAudioComVoiceId.body.script !== "roteiro de teste") {
    failures.push(
      "contrato de vídeo: no modo `voice_id`, `script` não chegou ao corpo — sem ele o fornecedor não " +
        "tem o que sintetizar.",
    );
  }
  if ("audio_asset_id" in semAudioComVoiceId.body) {
    failures.push(
      "contrato de vídeo: no modo `voice_id`, `audio_asset_id` apareceu mesmo assim — os dois modos de " +
        "áudio não podem coexistir no mesmo corpo.",
    );
  }
  const voiceSettingsEnviado = semAudioComVoiceId.body.voice_settings as Record<string, unknown> | undefined;
  if (voiceSettingsEnviado?.speed !== 1.1 || voiceSettingsEnviado?.locale !== "pt-BR") {
    failures.push(
      `contrato de vídeo: \`voice_settings\` não chegou com os campos fornecidos (veio ` +
        `${JSON.stringify(voiceSettingsEnviado)}, esperado speed=1.1 e locale="pt-BR").`,
    );
  }
  if (voiceSettingsEnviado && ("pitch" in voiceSettingsEnviado || "volume" in voiceSettingsEnviado)) {
    failures.push(
      `contrato de vídeo: \`voice_settings\` trouxe um subcampo não fornecido (${JSON.stringify(voiceSettingsEnviado)}) — ` +
        "só os campos que quem chama de fato passou deveriam aparecer.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "  contrato de vídeo: o look escolhido vai como `avatar_id` (e o avatar base quando ninguém " +
        "escolhe traje); fundo pedido manda `remove_background`, e sem fundo não manda",
    );
    notes.push(
      "  look: assertLookUsavel recusa processing/simulated-em-live/outro-avatar antes de qualquer " +
        "chamada ao fornecedor; sem linha local passa (look nativo do fornecedor, caminho legítimo)",
    );
    notes.push(
      `  contrato de vídeo: \`fit: cover\` nos dois corpos, ${CAMPOS_DO_SCHEMA.size} campos do schema ` +
        "conhecidos e nenhum fora dele, e `expressiveness` só com Avatar IV",
    );
    notes.push(
      `  contrato de vídeo: chave de idempotência no header do POST, estável na mesma tentativa e ` +
        `distinta em ${variacoes.length} variação(ões), dentro do padrão do fornecedor`,
    );
    notes.push(
      "  contrato de vídeo: sem `extras` o corpo é o de sempre; com `extras`, output_format/" +
        "brand_glossary_id/title/callback_url/callback_id só entram se fornecidos, e voice_id+script " +
        "(voz HeyGen nativa) é mutuamente exclusivo com audio_asset_id",
    );
  }

  return { failures, notes };
}
