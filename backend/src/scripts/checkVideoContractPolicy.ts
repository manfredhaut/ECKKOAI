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
import { providerAvatarIdParaGeracao } from "../services/avatar/lookSelection.js";

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

  if (failures.length === 0) {
    notes.push(
      "  contrato de vídeo: o look escolhido vai como `avatar_id` (e o avatar base quando ninguém " +
        "escolhe traje); fundo pedido manda `remove_background`, e sem fundo não manda",
    );
    notes.push(
      `  contrato de vídeo: \`fit: cover\` nos dois corpos, ${CAMPOS_DO_SCHEMA.size} campos do schema ` +
        "conhecidos e nenhum fora dele, e `expressiveness` só com Avatar IV",
    );
    notes.push(
      `  contrato de vídeo: chave de idempotência no header do POST, estável na mesma tentativa e ` +
        `distinta em ${variacoes.length} variação(ões), dentro do padrão do fornecedor`,
    );
  }

  return { failures, notes };
}
