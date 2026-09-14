/**
 * BLOCO STUDIO-EDIT-1 — as 4 guardas da Parte 4 (decisão deliberada: 4, não
 * 3 — a superfície de upload+exclusão é risco novo e merece guarda própria).
 *
 * G1  O resumo/corpo (aba "Studio Movie Edit") deriva da função pura
 *     `montarCorpo`, nunca de um objeto montado à mão a partir do estado do
 *     formulário. Checagem ESTÁTICA (o arquivo é `.tsx`, sem DOM/React no
 *     gate) — mesma técnica de `checkPreflightSummaryPolicy.ts`.
 * G2  Uma sobreposição colidindo com um trecho de b-roll é RECUSADA por
 *     `listarBloqueios`. Checagem por EXECUÇÃO REAL da função pura.
 * G3  Nenhum caminho grava `url` (blob local ou de disco) em vez de
 *     `assetId` ao montar o payload persistido. Checagem por EXECUÇÃO REAL
 *     de `payloadDoProjeto`.
 * G4  Trocar ou remover um arquivo (b-roll/sobreposição/fundo) sempre chama
 *     `DELETE /tenant/edit-assets/:asset_id` do arquivo ANTIGO. Checagem
 *     ESTÁTICA, ancorada no corpo de cada handler — nunca em menção solta.
 *
 * G2 e G3 rodam contra o MÓDULO DE VERDADE (import dinâmico do arquivo do
 * backend) — mais forte que ler texto, porque prova o COMPORTAMENTO, não só
 * a presença de uma palavra.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const TELA = "frontend/src/pages/CreateVideo/steps/StudioMovieEditStep.tsx";
const LOGICA_PURA = "backend/src/services/video/editProject.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "studio-movie-edit: o corpo exibido deriva de montarCorpo, nunca do estado bruto do formulário",
    name: "o corpo passa a ser montado à mão a partir do estado",
    kind: "esperto",
    // ESPERTO: `corpo` continua existindo, continua com o formato certo
    // (`{tracks: []}` passa qualquer checagem de forma), e a tela continua
    // renderizando "Ver o corpo exato" sem erro — só que ele para de refletir
    // trechos/inserções/volume/fundo reais. É o mesmo defeito que
    // `checkPreflightSummaryPolicy.ts` já pegou uma vez no resumo de Gerar.
    file: TELA,
    find: "montarCorpo(base, trechos, insercoes, volVoz, fundo)",
    replace: "{ tracks: [] }",
    expect: "studio-movie-edit: o corpo exibido não é mais derivado de montarCorpo",
  },
  {
    guard: "studio-movie-edit: sobreposição colidindo com um trecho de b-roll é recusada",
    name: "a verificação de colisão sai de listarBloqueios",
    kind: "esperto",
    // ESPERTO: as outras checagens de listarBloqueios continuam de pé (b-roll
    // sem arquivo, sobreposição sem arquivo, sobreposição que passa do fim) —
    // só a colisão especificamente contra um b-roll para de ser detectada.
    // O botão Guardar/Exportar deixaria de travar exatamente no caso que o
    // protótipo desenhou para pegar: b-roll é EXCLUSIVO, e uma sobreposição
    // sobre ele nunca apareceria (V2 nunca desenha por cima de um b-roll).
    file: LOGICA_PURA,
    find: '    if (colide) b.push({ code: "sobreposicaoSobreBroll", params: { indice: n + 1, nome: i.nome } });\n',
    replace: "",
    expect: "studio-movie-edit: sobreposição sobre b-roll não foi recusada",
  },
  {
    guard: "studio-movie-edit: payloadDoProjeto nunca grava url — só assetId",
    name: "payloadDoProjeto grava a url do b-roll em vez do assetId",
    kind: "esperto",
    // ESPERTO: o payload continua tendo o campo `assetId` — só que o VALOR
    // gravado nele passa a ser a `url` (que pode ser um blob local ou um
    // caminho de proxy), não o identificador real do arquivo. Um projeto
    // salvo assim aponta para algo que não sobrevive a uma nova sessão de
    // navegador (blob:) ou não é resolúvel de volta a um arquivo (proxy url
    // sem o id). G3 existe porque isto é exatamente o que edit_projects NUNCA
    // pode conter.
    file: LOGICA_PURA,
    find: '        : { id: t.id, tipo: "broll", nome: t.nome, duracao: t.duracao, volume: t.volume, assetId: t.assetId },',
    replace: '        : { id: t.id, tipo: "broll", nome: t.nome, duracao: t.duracao, volume: t.volume, assetId: t.url },',
    expect: "studio-movie-edit: payloadDoProjeto gravou a url em vez do assetId",
  },
  {
    guard: "studio-movie-edit: trocar ou remover um arquivo sempre exclui o asset antigo",
    name: "removerTrecho para de excluir o asset do b-roll removido (ramo REMOÇÃO)",
    kind: "esperto",
    // ESPERTO: o trecho some da timeline normalmente, a duração encolhe
    // certinho, nada na tela indica problema — e o arquivo fica órfão em
    // `uploads/<tenant>/edit-assets/`, sem nada que o remova depois. É a
    // mesma classe de defeito que `checkPhotoRemovalPolicy.ts` já pegou uma
    // vez (G-3, foto do rosto) — aqui do lado do editor.
    file: TELA,
    find: '    if (alvo && alvo.tipo === "broll" && alvo.assetId) excluirEditAsset(alvo.assetId);\n  }\n\n  function juntarComProximo',
    replace: "  }\n\n  function juntarComProximo",
    // ACHADO em 14/09/2026 (STUDIO-EDIT-1-VERIF, item 5): este `expect` dizia
    // "studio-movie-edit: remover um trecho de b-roll não apaga mais o
    // arquivo" — o texto da checagem ESPECÍFICA de antes do item 2 desta
    // rodada. Quando a checagem foi generalizada para os 5 handlers (G4
    // ganhou o ramo TROCA), a mensagem passou a ser a genérica abaixo, e
    // ninguém atualizou este campo — o mutante reprovava de verdade (a
    // checagem funciona), mas NUNCA batia com `expect`, em NENHUMA
    // execução, isolada ou em lote. O AMBÍGUO do arnês era o diagnóstico
    // CORRETO; o erro era meu, não dele. Confirmado por execução isolada
    // via container efêmero (o mesmo mecanismo do arnês) depois do
    // conserto: bate.
    expect: "studio-movie-edit: `removerTrecho` não chama mais `excluirEditAsset`",
  },
  {
    guard: "studio-movie-edit: trocar ou remover um arquivo sempre exclui o asset antigo",
    name: "handleUploadBroll para de excluir o asset antigo ao trocar arquivo (ramo TROCA)",
    kind: "esperto",
    // ESPERTO, e é o ramo que a passada STUDIO-EDIT-1 original tinha deixado
    // sem mutante: a checagem estática de `handleUploadBroll` já existia
    // (linhas mais abaixo neste arquivo), mas nunca tinha sido PROVADA —
    // uma guarda que confere um handler sem nunca ter visto esse handler
    // reprovar é indistinguível de uma guarda podre. Achado no fechamento
    // STUDIO-EDIT-1-VERIF (item 2), a pedido do operador. O upload novo
    // continua funcionando (o trecho passa a apontar para o arquivo novo
    // normalmente) — só o arquivo ANTIGO fica órfão em
    // `uploads/<tenant>/edit-assets/`, exatamente o defeito que a rota
    // DELETE existe para evitar.
    file: TELA,
    find:
      "      mexeu();\n" +
      "      // ORDEM OBRIGATÓRIA: só apaga o antigo DEPOIS do novo confirmado.\n" +
      "      if (assetIdAntigo) excluirEditAsset(assetIdAntigo);",
    replace: "      mexeu();\n      // ORDEM OBRIGATÓRIA: só apaga o antigo DEPOIS do novo confirmado.",
    expect: "studio-movie-edit: `handleUploadBroll` não chama mais `excluirEditAsset`",
  },
];

export interface StudioMovieEditCheckResult {
  failures: string[];
  notes: string[];
}

async function lerDaRaiz(repoRoot: string, rel: string, failures: string[]): Promise<string> {
  const fonte = await readFile(path.join(repoRoot, rel), "utf8").catch(() => "");
  if (!fonte) failures.push(`studio-movie-edit: ${rel} não foi encontrado — verificador cego é pior que reprovar.`);
  return fonte.replace(/\r\n/g, "\n");
}

/** Recorta o CORPO de uma função pelo nome, até a âncora da PRÓXIMA declaração dada. */
function recortarFuncao(fonte: string, inicioMarca: string, fimMarca: string): string | null {
  const i = fonte.indexOf(inicioMarca);
  if (i < 0) return null;
  const f = fonte.indexOf(fimMarca, i);
  if (f < 0) return null;
  return fonte.slice(i, f);
}

export async function checkStudioMovieEditPolicy(repoRoot: string): Promise<StudioMovieEditCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const tela = await lerDaRaiz(repoRoot, TELA, failures);

  // ---------------------------------------------------------------------------
  // G1 — o corpo exibido vem de montarCorpo(base, trechos, insercoes, volVoz,
  // fundo), a ATRIBUIÇÃO real, não uma menção solta (import/comentário).
  // ---------------------------------------------------------------------------
  if (tela) {
    if (!/const corpo = useMemo\(\s*\(\) => montarCorpo\(base, trechos, insercoes, volVoz, fundo\),/.test(tela)) {
      failures.push(
        `studio-movie-edit: o corpo exibido não é mais derivado de montarCorpo — \`const corpo = useMemo(() => ` +
          `montarCorpo(base, trechos, insercoes, volVoz, fundo), ...)\` não está em ${TELA}. "Ver o corpo exato" ` +
          "existe para mostrar o que SERIA enviado; sem vir da função pura, ele pode mostrar algo que os " +
          "trechos/sobreposições reais não produziriam.",
      );
    }

    // ---------------------------------------------------------------------------
    // G4 — troca e remoção de arquivo sempre chamam excluirEditAsset do
    // arquivo ANTIGO, ancorado no CORPO de cada handler.
    // ---------------------------------------------------------------------------
    const handlers: { nome: string; inicio: string; fim: string; chamadaEsperada: string }[] = [
      {
        nome: "handleUploadBroll",
        inicio: "async function handleUploadBroll(",
        fim: "async function handleUploadInsercao(",
        chamadaEsperada: "if (assetIdAntigo) excluirEditAsset(assetIdAntigo);",
      },
      {
        nome: "handleUploadInsercao",
        inicio: "async function handleUploadInsercao(",
        fim: "async function handleUploadFundo(",
        chamadaEsperada: "if (assetIdAntigo) excluirEditAsset(assetIdAntigo);",
      },
      {
        nome: "handleUploadFundo",
        inicio: "async function handleUploadFundo(",
        fim: "async function guardarProjeto(",
        chamadaEsperada: "if (assetIdAntigo) excluirEditAsset(assetIdAntigo);",
      },
      {
        nome: "removerTrecho",
        inicio: "function removerTrecho(",
        fim: "function juntarComProximo",
        chamadaEsperada: 'if (alvo && alvo.tipo === "broll" && alvo.assetId) excluirEditAsset(alvo.assetId);',
      },
      {
        nome: "removerInsercao",
        inicio: "function removerInsercao(",
        fim: "async function handleUploadBroll(",
        chamadaEsperada: "if (alvo?.assetId) excluirEditAsset(alvo.assetId);",
      },
    ];
    for (const h of handlers) {
      const corpoFn = recortarFuncao(tela, h.inicio, h.fim);
      if (corpoFn === null) {
        failures.push(`studio-movie-edit: não foi possível recortar \`${h.nome}\` em ${TELA} pelas âncoras esperadas.`);
        continue;
      }
      if (!corpoFn.includes(h.chamadaEsperada)) {
        failures.push(
          `studio-movie-edit: \`${h.nome}\` não chama mais \`excluirEditAsset\` do arquivo antigo em ${TELA} — ` +
            "esperado \`" +
            h.chamadaEsperada +
            "\` dentro da função. Sem isso, trocar ou remover um arquivo deixa o " +
            "anterior órfão em uploads/<tenant>/edit-assets/, sem nada que o apague depois.",
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // G2 + G3 — EXECUÇÃO real da lógica pura, sem rede e sem banco.
  // ---------------------------------------------------------------------------
  const { listarBloqueios, payloadDoProjeto } = await import("../services/video/editProject.js");

  // G2 — colisão entre sobreposição e b-roll.
  const baseDeTeste = { id: "v1", nome: "vídeo de teste", url: "/uploads/tenant/v1.mp4", duracaoOriginal: 10 };
  const trechosComBroll = [
    { id: "t1", tipo: "base" as const, entrada: 0, saida: 3 },
    {
      id: "t2",
      tipo: "broll" as const,
      nome: "b-roll de teste",
      duracao: 4,
      volume: 100,
      assetId: "11111111-1111-4111-8111-111111111111",
      url: "/tenant/edit-assets/11111111-1111-4111-8111-111111111111",
    },
    { id: "t3", tipo: "base" as const, entrada: 3, saida: 6 },
  ];
  const insercaoSobreBroll = [
    {
      id: "i1",
      nome: "sobreposição de teste",
      tipo: "imagem" as const,
      inicio: 4,
      duracao: 1,
      escala: 0.5,
      posicao: "sup-dir" as const,
      assetId: "22222222-2222-4222-8222-222222222222",
      url: "/tenant/edit-assets/22222222-2222-4222-8222-222222222222",
    },
  ];
  const bloqueiosComColisao = listarBloqueios(baseDeTeste, trechosComBroll, insercaoSobreBroll);
  if (!bloqueiosComColisao.some((b) => b.code === "sobreposicaoSobreBroll")) {
    failures.push(
      "studio-movie-edit: sobreposição sobre b-roll não foi recusada — uma sobreposição em 4-5s, com um " +
        "b-roll de 3-7s (offset 3, duração 4), deveria produzir o bloqueio `sobreposicaoSobreBroll` e não " +
        `produziu (bloqueios encontrados: ${JSON.stringify(bloqueiosComColisao.map((b) => b.code))}). Sem essa ` +
        "checagem, Guardar/Exportar deixaria passar um projeto em que o V2 nunca conseguiria de fato desenhar " +
        "a sobreposição — o b-roll é exclusivo.",
    );
  }

  // G3 — payloadDoProjeto nunca grava url.
  const trechoComUrlSuspeita = [
    {
      id: "t1",
      tipo: "broll" as const,
      nome: "b-roll de teste",
      duracao: 2,
      volume: 100,
      assetId: "33333333-3333-4333-8333-333333333333",
      url: "blob:http://localhost:8090/prova-de-blob-local",
    },
  ];
  const payload = payloadDoProjeto(
    trechoComUrlSuspeita,
    [],
    100,
    { nome: null, assetId: null, url: null, volume: 35 },
  );
  const brollNoPayload = payload.trechos[0] as { assetId?: string };
  if (brollNoPayload.assetId !== "33333333-3333-4333-8333-333333333333") {
    failures.push(
      "studio-movie-edit: payloadDoProjeto gravou a url em vez do assetId — o trecho de b-roll tinha " +
        '`assetId: "33333333-3333-4333-8333-333333333333"` e `url: "blob:http://localhost:8090/..."`, e o ' +
        `payload persistido devolveu assetId=${JSON.stringify(brollNoPayload.assetId)}. edit_projects.payload ` +
        "NUNCA pode conter uma URL de blob local — ela não sobrevive a uma nova sessão de navegador.",
    );
  }
  if (JSON.stringify(payload).includes("blob:")) {
    failures.push(
      'studio-movie-edit: o payload persistido contém a substring "blob:" — nenhuma referência de arquivo ' +
        "dentro de edit_projects.payload pode ser uma URL de blob local, sob nenhum campo.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "  studio-movie-edit: o corpo exibido deriva de montarCorpo; colisão sobreposição×b-roll é recusada " +
        "por execução real de listarBloqueios; payloadDoProjeto nunca grava url (execução real, testado com " +
        'uma url "blob:" deliberadamente suspeita); troca/remoção de arquivo sempre exclui o asset antigo, ' +
        "ancorado no corpo de cada handler",
    );
  }

  return { failures, notes };
}
