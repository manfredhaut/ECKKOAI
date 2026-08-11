/**
 * GAP 1 — `expressiveness` nunca sai `null`.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 *
 * O passo Cena tinha três chips (low/medium/high) e NENHUM vinha
 * pré-selecionado — o estado inicial do assistente nascia com
 * `expressiveness: null`. Quem não clicasse em nenhum nível mandava o vídeo
 * sem o campo no corpo: `avatarProvider.ts:632` só inclui `expressiveness`
 * quando há valor, e a doc do fornecedor documenta, com todas as letras,
 * "Avatar expressiveness level. Photo avatars only. Defaults to 'low' when
 * omitted." — o vídeo saía apático, cobrado por inteiro, sem que a tela
 * tivesse dito nada.
 *
 * A escolha foi PRÉ-SELECIONAR "medium" no estado inicial, e não bloquear o
 * avanço do passo até uma escolha explícita: bloquear adiciona fricção a um
 * fluxo que hoje deixa passar, e pré-selecionar garante que o campo nunca
 * mais é omitido sem exigir clique nenhum — quem quer outro nível troca
 * livremente antes de gerar.
 * ---------------------------------------------------------------------------
 * O QUE ESTA GUARDA MEDE, E O QUE ELA NÃO MEDE
 *
 * Duas pernas, porque o defeito tem duas metades:
 *
 *  (i)  FONTE — o estado inicial de `CreateVideoPage.tsx` nunca volta a ser
 *       `null`. Por LEITURA, e não por chamada de função: um valor inicial de
 *       `useState` em React não se exercita rodando o componente aqui — é a
 *       mesma técnica (e a mesma justificativa) do item 4 de
 *       `checkCaptionPolicy`.
 *  (ii) COMPORTAMENTO — com o valor que a tela agora produz por padrão
 *       ("medium") e o motor efetivo `avatar_iv` (o caminho REAL de produção
 *       hoje, com a flag `explicit_avatar_engine` desligada — ver Parte 1 do
 *       reconhecimento de 11/08), o campo chega ao OBJETO enviado ao
 *       fornecedor. Ancorado no valor do payload, nunca em nome de campo ou
 *       comentário — a regra "USO, nunca MENÇÃO" que já rendeu sete guardas
 *       inertes neste projeto.
 *
 * O contraponto (motor diferente de `avatar_iv` continua omitindo o campo) é
 * exercitado para provar que a mudança de default NÃO tocou a condição do
 * motor — só o valor de entrada mudou, a regra continua a mesma.
 *
 * NÃO VERIFICADO, e a guarda não finge o contrário: que "medium" produza um
 * vídeo mais expressivo que "low" na prática. Isso só um vídeo pago prova, e
 * nenhum foi gerado nesta passada.
 * ---------------------------------------------------------------------------
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import type { Mutant } from "./mutants.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "expressiveness: o passo Cena nasce com um nível escolhido, nunca null",
    name: "o passo Cena volta a nascer com expressiveness null",
    kind: "esperto",
    // Desfaz exatamente o Gap 1: nenhum chip continua mudando de cor ao ser
    // clicado, nenhum texto muda — só o valor com que o assistente NASCE.
    // Quem não tocar em nada volta a mandar o vídeo sem o campo.
    file: "frontend/src/pages/CreateVideo/CreateVideoPage.tsx",
    find: '    expressiveness: "medium",',
    replace: "    expressiveness: null,",
    expect: "o passo Cena nasce sem um nível escolhido",
  },
];

export interface ExpressivenessDefaultCheckResult {
  failures: string[];
  notes: string[];
}

export function checkExpressivenessDefaultPolicy(repoRoot: string): ExpressivenessDefaultCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. FONTE — o estado inicial nunca nasce null.
  // ---------------------------------------------------------------------------
  const createVideoPage = readFileSync(
    path.join(repoRoot, "frontend/src/pages/CreateVideo/CreateVideoPage.tsx"),
    "utf8",
  );
  if (!/expressiveness:\s*"medium",/.test(createVideoPage)) {
    failures.push(
      "expressiveness: o passo Cena nasce sem um nível escolhido — o estado inicial do assistente " +
        "(`CreateVideoPage.tsx`) não fixa `expressiveness` em \"medium\". Sem chip pré-selecionado, " +
        "quem não clicar em nenhum nível manda o vídeo com `expressiveness` ausente, e o fornecedor " +
        "aplica \"low\" em silêncio (doc: \"Defaults to 'low' when omitted\").",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. COMPORTAMENTO — o default da tela chega ao payload quando o motor
  //    efetivo é avatar_iv (caminho real de produção: flag de motor desligada
  //    força avatar_iv em avatarProvider.ts:631, independente da conta).
  // ---------------------------------------------------------------------------
  const format = resolveVideoFormat("youtube");
  const BASE = {
    providerAvatarId: "avatar-de-teste",
    format,
    supportedEngines: null,
    engineChoice: null,
  } as const;

  const comDefaultDaTela = buildHeygenVideoPayload(
    { ...BASE, engineEnabled: false, scene: { expressiveness: "medium" } },
    "asset-de-audio",
    null,
  );
  if (comDefaultDaTela.body.expressiveness !== "medium") {
    failures.push(
      "expressiveness: com o default da tela (\"medium\") e motor avatar_iv, o corpo enviado ao " +
        `fornecedor saiu com expressiveness ${JSON.stringify(comDefaultDaTela.body.expressiveness)} ` +
        'em vez de "medium".',
    );
  }

  // ---------------------------------------------------------------------------
  // 3. CONTRAPONTO — 2.4 do pedido: motor que não é avatar_iv continua
  //    omitindo o campo. A mudança de default não pode ter afrouxado esta
  //    regra, que é do fornecedor ("Avatar IV only"), não nossa.
  // ---------------------------------------------------------------------------
  const motorDiferente = buildHeygenVideoPayload(
    { ...BASE, engineEnabled: true, engineChoice: "avatar_iii", scene: { expressiveness: "medium" } },
    "asset-de-audio",
    null,
  );
  if ("expressiveness" in motorDiferente.body) {
    failures.push(
      "expressiveness: motor avatar_iii recebeu o campo `expressiveness` mesmo o fornecedor " +
        'documentando-o como "Avatar IV only" — a mudança de default do Gap 1 não pode ter afrouxado ' +
        "esta regra.",
    );
  }

  notes.push(
    'expressiveness: estado inicial confirmado como "medium" (nunca null); payload com motor avatar_iv ' +
      "leva o valor da tela; motor avatar_iii continua sem o campo, como antes.",
  );
  return { failures, notes };
}
