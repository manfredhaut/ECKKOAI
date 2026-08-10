/**
 * Invariantes da LEGENDA: a escolha da tela chega ao lugar que o esquema do
 * fornecedor definiu, e as duas versões do vídeo não se atropelam.
 *
 * ---------------------------------------------------------------------------
 * O QUE FOI APURADO, E POR QUE ISSO DEFINE O QUE ESTA GUARDA MEDE
 *
 * Havia dois mecanismos possíveis para legenda, e a medição desempatou.
 *
 *  (i)  PARÂMETRO na requisição — `caption`, campo de nível superior de
 *       `POST /v3/videos`, com `file_format` e `style`. É o que vale.
 *  (ii) DUAS URLs sempre presentes na resposta, e escolher legenda seria só
 *       escolher qual guardar. REFUTADO: o vídeo `dca10724` (10/08), gerado
 *       sem `caption`, teve seu `GET /v3/videos/{id}` respondido com nove
 *       campos, e nem `subtitle_url` nem `captioned_video_url` estavam entre
 *       eles — apesar de a doc afirmar que o sidecar é sempre gerado.
 *
 * Por isso a guarda mede o CORPO ENVIADO, e não a leitura da resposta: é no
 * corpo que a escolha do usuário vira efeito. Ela também exige o caminho
 * inverso — sem escolha, nenhum campo —, porque um `caption` que fosse sempre
 * junto mudaria em silêncio o pedido de todo vídeo da conta.
 * ---------------------------------------------------------------------------
 *
 * NÃO VERIFICADO, e a guarda não finge o contrário: que o fornecedor ACEITE
 * `caption` neste caminho. Nenhuma geração deste projeto o enviou, e medir
 * custa um vídeo pago. O que se garante aqui é que o campo sai como o esquema
 * descreve — não que ele volte 200.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { captionsDelivered, urlParaServir } from "../services/video/captionSelection.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "legenda: a escolha da tela vira o campo `caption` no corpo",
    name: "a escolha de legenda não chega ao payload",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "  if (input.captions) {\n    body.caption = { file_format: CAPTION_FILE_FORMAT, style: CAPTION_STYLE };\n  }",
    replace: "",
    expect: "a escolha de legenda não chegou ao corpo",
  },
  {
    guard: "legenda: a escolha da tela vira o campo `caption` no corpo",
    name: "o corpo perde o estilo e a legenda deixa de ser queimada",
    kind: "esperto",
    // O campo continua no corpo, o fornecedor continua respondendo 200, e o
    // `.srt` continua sendo gerado. O que some é a QUEIMA — é `style` que põe a
    // legenda na imagem. O vídeo volta sem legenda visível e ninguém consegue
    // apontar o que mudou.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    body.caption = { file_format: CAPTION_FILE_FORMAT, style: CAPTION_STYLE };",
    replace: "    body.caption = { file_format: CAPTION_FILE_FORMAT };",
    expect: "sem o estilo que queima a legenda",
  },
  {
    guard: "legenda: o formulário propaga a escolha até o corpo do POST",
    name: "o formulário deixa de propagar a escolha de legenda",
    kind: "esperto",
    // O botão continua na tela, continua mudando de cor ao ser clicado e
    // continua guardando o estado. Só o corpo enviado é que nunca soube. É o
    // mesmo defeito que cenário e traje tiveram por semanas — coletados,
    // persistidos e nunca enviados.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find: "    captions: wizard.captions,",
    replace: "",
    expect: "`captions` sumiu do corpo montado pela tela",
  },
  {
    guard: "legenda: a versão legendada não sobrescreve a limpa",
    name: "a versão legendada passa a ser servida mesmo sem ter sido pedida",
    kind: "esperto",
    // Não quebra nada hoje, porque hoje ninguém pede legenda. Quebra no dia em
    // que o fornecedor devolver `captioned_video_url` por conta própria: todo
    // vídeo da conta passaria a ser servido legendado sem ninguém ter escolhido.
    file: "backend/src/services/video/captionSelection.ts",
    find: "  if (video.captions && video.captionedOutputUrl) return video.captionedOutputUrl;",
    replace: "  if (video.captionedOutputUrl) return video.captionedOutputUrl;",
    // O `expect` cita a frase COMO ELA SAI, e não uma paráfrase dela: o arnês
    // casa texto literal, e a primeira versão deste campo dizia "serviu…" onde
    // a guarda escreve "Servir…". O mutante reprovava certo e voltava AMBÍGUO —
    // reprovação que não se consegue atribuir à guarda não prova nada.
    expect: "Servir a versão legendada sem que ela tivesse sido pedida",
  },
];

export interface CaptionCheckResult {
  failures: string[];
  notes: string[];
}

/**
 * Os sub-campos de `caption`, transcritos do esquema do fornecedor lido em
 * 10/08. A lista é FECHADA pelo mesmo motivo da lista de 21 campos do corpo: o
 * schema da raiz é `additionalProperties: false` — medido em 06/08 —, e um
 * sub-campo inventado é ainda pior, porque `background` já provou que os
 * sub-objetos NÃO são fechados: o fornecedor aceita, responde 200 e ignora.
 */
const SUBCAMPOS_DO_SCHEMA = new Set(["file_format", "style"]);

export function checkCaptionPolicy(repoRoot: string): CaptionCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const format = resolveVideoFormat("youtube");
  const BASE = {
    providerAvatarId: "avatar-de-teste",
    format,
    supportedEngines: null,
    engineEnabled: false,
    engineChoice: null,
    scene: null,
  } as const;

  // ---------------------------------------------------------------------------
  // 1. Sem escolha, nenhum campo. Este é o contraponto, e ele vem primeiro
  //    porque é o caminho de TODA geração deste projeto até hoje.
  // ---------------------------------------------------------------------------
  const sem = buildHeygenVideoPayload({ ...BASE, captions: false }, "asset-de-audio", null);
  if ("caption" in sem.body) {
    failures.push(
      "legenda: o corpo levou `caption` sem ninguém ter pedido legenda. O padrão do produto é sem " +
        `legenda, e um campo que vai sempre muda em silêncio o pedido de todo vídeo da conta. ` +
        `Recebido: ${JSON.stringify(sem.body.caption)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Com escolha, o campo sai — com os dois sub-campos do esquema e nada além.
  // ---------------------------------------------------------------------------
  const com = buildHeygenVideoPayload({ ...BASE, captions: true }, "asset-de-audio", null);
  const caption = com.body.caption as Record<string, unknown> | undefined;

  if (!caption) {
    failures.push(
      "legenda: a escolha de legenda não chegou ao corpo de POST /v3/videos. O mecanismo apurado é o " +
        "parâmetro `caption` — a alternativa (duas URLs sempre na resposta) foi REFUTADA em 10/08, " +
        "quando um vídeo gerado sem o campo voltou sem `captioned_video_url` e sem `subtitle_url`.",
    );
  } else {
    if (caption.style !== "default") {
      failures.push(
        "legenda: o corpo saiu sem o estilo que queima a legenda no vídeo. É `caption.style` que põe a " +
          `legenda na imagem; sem ele o fornecedor entrega só o arquivo .srt ao lado, e o vídeo — que ` +
          `foi pago — volta sem legenda visível. Recebido: ${JSON.stringify(caption)}`,
      );
    }
    if (caption.file_format !== "srt") {
      failures.push(
        `legenda: \`caption.file_format\` saiu como ${JSON.stringify(caption.file_format)}, e o esquema ` +
          "do fornecedor documenta `srt`.",
      );
    }
    for (const campo of Object.keys(caption)) {
      if (!SUBCAMPOS_DO_SCHEMA.has(campo)) {
        failures.push(
          `legenda: \`caption.${campo}\` não está no esquema do fornecedor. Sub-objeto NÃO é fechado ` +
            "(medido em `background`, 06/08): o campo passa a validação, volta 200 e não faz nada — " +
            "que é pior que não mandar, porque parece resolvido.",
        );
      }
    }
  }

  // O resto do corpo não pode ter mudado por causa da legenda: se `caption`
  // trouxesse companhia, o efeito apareceria num vídeo pago e não aqui.
  const camposSem = Object.keys(sem.body).join(",");
  const camposCom = Object.keys(com.body)
    .filter((c) => c !== "caption")
    .join(",");
  if (camposSem !== camposCom) {
    failures.push(
      `legenda: pedir legenda mudou outros campos do corpo. Sem: [${camposSem}]. Com: [${camposCom}].`,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Qual URL se serve — os quatro casos, inclusive os dois que só existem
  //    quando algo dá errado.
  // ---------------------------------------------------------------------------
  const LIMPA = "/uploads/limpo.mp4";
  const LEGENDADA = "https://fornecedor/legendado.mp4";
  const casos: {
    nome: string;
    entrada: { captions: boolean; outputUrl: string | null; captionedOutputUrl: string | null };
    serve: string | null;
    entregue: boolean;
  }[] = [
    {
      nome: "ninguém pediu legenda",
      entrada: { captions: false, outputUrl: LIMPA, captionedOutputUrl: null },
      serve: LIMPA,
      entregue: false,
    },
    {
      nome: "pediu e veio",
      entrada: { captions: true, outputUrl: LIMPA, captionedOutputUrl: LEGENDADA },
      serve: LEGENDADA,
      entregue: true,
    },
    {
      nome: "pediu e NÃO veio",
      entrada: { captions: true, outputUrl: LIMPA, captionedOutputUrl: null },
      // Falha para a versão limpa: um vídeo sem a legenda pedida é pior que o
      // pedido, mas continua sendo um vídeo — e ele já foi cobrado.
      serve: LIMPA,
      entregue: false,
    },
    {
      nome: "não pediu mas o fornecedor mandou assim mesmo",
      entrada: { captions: false, outputUrl: LIMPA, captionedOutputUrl: LEGENDADA },
      serve: LIMPA,
      entregue: false,
    },
  ];
  for (const caso of casos) {
    const servida = urlParaServir(caso.entrada);
    if (servida !== caso.serve) {
      failures.push(
        `legenda: no caso "${caso.nome}" a URL servida foi ${JSON.stringify(servida)} e devia ser ` +
          `${JSON.stringify(caso.serve)}. ` +
          (caso.nome.startsWith("não pediu")
            ? "Servir a versão legendada sem que ela tivesse sido pedida troca o vídeo de todo mundo."
            : "É a mesma função que o download usa; divergir aqui faz a tela mostrar uma versão e o botão baixar outra."),
      );
    }
    if (captionsDelivered(caso.entrada) !== caso.entregue) {
      failures.push(
        `legenda: no caso "${caso.nome}" o veredito de entrega ficou errado — pedida e entregue são ` +
          "coisas diferentes, e a diferença é o aviso que a tela dá quando o vídeo saiu sem a legenda escolhida.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4. O formulário da tela propaga a escolha.
  //
  // Por LEITURA, porque o defeito é a AUSÊNCIA de uma linha no montador do
  // corpo — e ausência não se exercita chamando função. É exatamente a forma do
  // defeito que cenário e traje tiveram: coletados na tela, gravados no banco,
  // e o call site não os passava adiante.
  // ---------------------------------------------------------------------------
  const passoGerar = readFileSync(
    path.join(repoRoot, "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx"),
    "utf8",
  );
  if (!/captions:\s*wizard\.captions/.test(passoGerar)) {
    failures.push(
      "legenda: `captions` sumiu do corpo montado pela tela (`corpoDaGeracao`). O botão continuaria " +
        "aparecendo e mudando de estado, e só o pedido é que nunca saberia — o mesmo defeito que " +
        "cenário e traje tiveram por semanas.",
    );
  }

  // Os dois idiomas. Um botão que só existe em português é um botão quebrado
  // para metade do produto.
  for (const idioma of ["pt-BR", "en"]) {
    const textos = JSON.parse(
      readFileSync(path.join(repoRoot, `frontend/src/locales/${idioma}.json`), "utf8"),
    ) as { createVideo?: { generate?: Record<string, string> } };
    const gerar = textos.createVideo?.generate ?? {};
    for (const chave of ["captionsLabel", "captionsOn", "captionsOff", "captionsUnverified", "captionsMissing"]) {
      if (!gerar[chave]) {
        failures.push(`legenda: falta \`createVideo.generate.${chave}\` em ${idioma}.json.`);
      }
    }
  }

  notes.push(
    `legenda: campo ausente sem escolha e ${JSON.stringify(caption)} com escolha; ` +
      `${casos.length} casos de seleção de URL conferidos; textos nos 2 idiomas. ` +
      "ACEITE pelo fornecedor segue NÃO VERIFICADO — nenhuma geração enviou `caption`.",
  );
  return { failures, notes };
}
