/**
 * TRAJE: criar um look, vê-lo na lista, e NÃO gastar com isso.
 *
 * O defeito de origem, medido em 05/08: o passo 1 tinha um upload de imagem e
 * um prompt de traje que não alimentavam nada. Os campos iam para
 * `defaults.outfit`/`outfitPrompt` e paravam ali — `corpoDaGeracao()`, que monta
 * o corpo de `POST /videos` desde o DEMO-2, nunca os incluiu. Um formulário que
 * aceita arquivo do cliente e não alimenta geração nenhuma é pior que um campo
 * ausente: ele promete.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA GUARDA PROTEGE, E POR QUE CADA VETOR
 *
 * 1. O traje criado EXISTE depois do clique. Os looks de fixture são derivados
 *    por função pura; se a criação não persistir, o traje some no request
 *    seguinte e o passo Cena nunca o vê — de novo um formulário decorativo,
 *    agora com mais código.
 * 2. Ele aparece na lista, JUNTO dos do fornecedor e sem duplicar.
 * 3. O caminho live RECUSA, e a recusa diz o custo. São duas razões
 *    independentes: o endpoint de criação de look do fornecedor não é conhecido
 *    (descobri-lo exige POST, que gasta), e criar look custa da ordem de
 *    US$ 1,00 — seis vezes um vídeo de 15 s. Uma recusa que só dissesse "não
 *    implementado" convidaria a implementar às pressas, e a segunda razão
 *    continuaria de pé.
 * 4. Corpo malformado é recusado como malformado NOS DOIS MODOS. Se a recusa do
 *    modo viesse antes da validação, em live todo erro viraria "não
 *    implementado" e ninguém descobriria o de verdade.
 * ---------------------------------------------------------------------------
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface OutfitCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "traje: criar look é simulado, nunca pago sem aviso",
    name: "criar traje passa a valer no modo live",
    kind: "esperto",
    // A função continua existindo, continua validando o corpo e continua
    // persistindo. Só o portão do modo some — e o que passa a acontecer é uma
    // escrita local que a tela apresenta como traje criado, enquanto o
    // fornecedor nunca soube dele. O traje "existiria" e não sairia no vídeo.
    file: "backend/src/services/avatar/looks.ts",
    find: "  if (!isFixtureMode()) {\n    return { ok: false, code: \"look_creation_not_implemented\", status: 501, message: RECUSA_LIVE };\n  }",
    replace: "  // portão removido",
    expect: "criar traje foi ACEITO com o modo em live",
  },
  {
    guard: "traje: o look criado entra na lista que o passo Cena lê",
    name: "a listagem volta a devolver só os looks do fornecedor",
    kind: "esperto",
    // O traje é criado, a linha existe no banco, a rota responde 201 — e o
    // seletor do passo Cena nunca o mostra. É o formulário órfão de volta, só
    // que agora com uma tabela por trás para disfarçar.
    file: "backend/src/services/avatar/looks.ts",
    find: "  return [...doFornecedor, ...locais];",
    replace: "  return doFornecedor;",
    expect: "o traje criado não apareceu na lista",
  },
  {
    guard: "traje: a recusa do modo pago diz quanto custa",
    name: "a recusa perde o custo e vira só \"não implementado\"",
    kind: "esperto",
    // A recusa continua acontecendo, o código continua 501, e a tela continua
    // mostrando um erro honesto. O que some é a razão que sobrevive à
    // implementação: US$ 1,00 por look. Sem ela, o próximo a ler a mensagem
    // conclui que basta descobrir o endpoint.
    file: "backend/src/services/avatar/looks.ts",
    find: "  \"que gasta. Além disso, criar avatar ou look no fornecedor custa cerca de US$ 1,00, aproximadamente \" +\n  \"seis vezes um vídeo de 15 s: não é uma chamada para acontecer por tentativa. Escolher entre os trajes \" +",
    replace: "  \"que gasta. Escolher entre os trajes \" +",
    expect: "a recusa do modo live não diz o custo",
  },
];

export async function checkOutfitPolicy(repoRoot: string): Promise<OutfitCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const { pool } = await import("../db/pool.js");
  const queryReal = pool.query.bind(pool);
  const modoOriginal = process.env.PROVIDER_MODE;

  const { criarLook, listarLooks } = await import("../services/avatar/looks.js");

  // Duplo de banco: guarda as linhas inseridas e as devolve na listagem, que é
  // exatamente o vínculo que os dois primeiros vetores medem.
  const inseridos: { provider_look_id: string; name: string; preview_image_url: string | null }[] = [];
  const desconhecidas: string[] = [];
  (pool as unknown as { query: unknown }).query = async (text: unknown, params?: unknown[]) => {
    const sql = String(text).replace(/\s+/g, " ").trim();
    if (/INSERT INTO avatar_looks/i.test(sql)) {
      inseridos.push({
        provider_look_id: String(params?.[2] ?? ""),
        name: String(params?.[3] ?? ""),
        preview_image_url: (params?.[4] as string | null) ?? null,
      });
      return { rows: [], rowCount: 1 };
    }
    if (/FROM avatar_looks/i.test(sql)) return { rows: inseridos, rowCount: inseridos.length };
    desconhecidas.push(sql.slice(0, 90));
    return { rows: [], rowCount: 0 };
  };

  const AVATAR = { tenantId: "t1", avatarId: "a1", providerAvatarId: "pa-1" };

  try {
    // -----------------------------------------------------------------------
    // 1. Em fixture o traje é criado e persistido.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "fixture";
    const criado = await criarLook({ ...AVATAR, name: "Terno azul", prompt: "terno azul-marinho" });

    if (!criado.ok) {
      failures.push(
        `traje: criar traje em fixture foi RECUSADO (${criado.code}). Ensaiar a criação de traje não toca ` +
          "fornecedor nenhum e não custa nada; recusar aqui devolve o passo 1 ao estado em que o " +
          "formulário existia e não alimentava geração alguma.",
      );
    } else if (inseridos.length !== 1) {
      failures.push(
        `traje: criar traje em fixture não persistiu (${inseridos.length} linha(s) em avatar_looks). Os ` +
          "looks simulados são derivados por função pura, então sem a linha o traje some no request " +
          "seguinte e o seletor do passo Cena nunca o mostra.",
      );
    } else if (!criado.look.id.startsWith(`${AVATAR.providerAvatarId}-look-`)) {
      failures.push(
        `traje: o id do traje criado (\`${criado.look.id}\`) não tem a forma \`<avatar>-look-…\` dos looks ` +
          "de fixture. É essa forma que faz o payload impresso na simulação não precisar de caso especial " +
          "para distinguir traje criado de traje que já existia.",
      );
    } else {
      notes.push(`  traje: criado em fixture e persistido como \`${criado.look.id}\`.`);
    }

    // -----------------------------------------------------------------------
    // 2. O traje criado aparece na lista, junto dos do fornecedor.
    // -----------------------------------------------------------------------
    const doFornecedor = [{ id: "pa-1", name: "Traje atual", previewImageUrl: null }];
    const lista = await listarLooks(AVATAR.tenantId, AVATAR.avatarId, doFornecedor);
    const idCriado = criado.ok ? criado.look.id : "";

    if (!lista.some((l) => l.id === idCriado)) {
      failures.push(
        "traje: o traje criado não apareceu na lista que o passo Cena lê. A linha foi gravada, a rota " +
          "responderia 201, e o seletor continuaria mostrando só os looks do fornecedor — o formulário " +
          "órfão de volta, agora com uma tabela por trás para disfarçar.",
      );
    } else if (!lista.some((l) => l.id === "pa-1")) {
      failures.push(
        "traje: a lista perdeu os looks do FORNECEDOR ao juntar os criados aqui. O primeiro deles é o " +
          "traje atual do avatar, e sem ele \"não trocar de traje\" deixa de ser uma opção.",
      );
    } else {
      // Duplicata: o mesmo id vindo dos dois lados tem de aparecer uma vez só.
      const duplicado = await listarLooks(AVATAR.tenantId, AVATAR.avatarId, [
        ...doFornecedor,
        { id: idCriado, name: "mesmo look", previewImageUrl: null },
      ]);
      if (duplicado.filter((l) => l.id === idCriado).length !== 1) {
        failures.push(
          "traje: um look presente nos dois lados apareceu duplicado na lista. No dia em que o caminho " +
            "real existir, um traje criado aqui volta na listagem do fornecedor, e mostrar o mesmo traje " +
            "duas vezes faz a pessoa achar que criou dois.",
        );
      } else {
        notes.push(`  traje: lista combina ${lista.length} look(s), sem duplicar o que vem dos dois lados.`);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Em live, RECUSA — e a recusa diz o custo.
    // -----------------------------------------------------------------------
    process.env.PROVIDER_MODE = "live";
    const antesDoLive = inseridos.length;
    const emLive = await criarLook({ ...AVATAR, name: "Terno preto", prompt: "terno preto" });

    if (emLive.ok) {
      failures.push(
        "traje: criar traje foi ACEITO com o modo em live. O endpoint de criação de look do fornecedor " +
          "não é conhecido — nenhum contrato lido declara a operação —, então o que acabou de acontecer " +
          "foi uma escrita local apresentada como traje criado, que o fornecedor nunca vai conhecer e que " +
          "não vai sair no vídeo.",
      );
    } else {
      if (emLive.code !== "look_creation_not_implemented" || emLive.status !== 501) {
        failures.push(
          `traje: a recusa em live veio como \`${emLive.code}\`/${emLive.status}, e não ` +
            "`look_creation_not_implemented`/501. O pedido está correto; quem não implementa somos nós, e " +
            "o código tem de dizer isso.",
        );
      }
      if (!/US\$\s*1,00/.test(emLive.message)) {
        failures.push(
          "traje: a recusa do modo live não diz o custo. Criar avatar ou look no fornecedor custa cerca " +
            "de US$ 1,00, cerca de seis vezes um vídeo de 15 s — e essa razão sobrevive à descoberta do " +
            "endpoint. Sem ela, quem ler a mensagem conclui que basta implementar.",
        );
      }
      if (inseridos.length !== antesDoLive) {
        failures.push(
          "traje: a recusa em live ainda assim gravou linha em `avatar_looks`. Recusar e persistir é o " +
            "pior dos dois: a tela mostra erro e o catálogo local fica com um traje fantasma.",
        );
      }
    }

    // -----------------------------------------------------------------------
    // 4. Corpo malformado é recusado como malformado NOS DOIS modos.
    // -----------------------------------------------------------------------
    const semNomeEmLive = await criarLook({ ...AVATAR, name: "   ", prompt: "terno" });
    if (semNomeEmLive.ok || semNomeEmLive.code !== "look_name_required") {
      failures.push(
        "traje: em live, um traje sem nome foi recusado por outro motivo que não `look_name_required` " +
          `(veio \`${semNomeEmLive.ok ? "aceito" : semNomeEmLive.code}\`). Se a recusa do modo vier antes ` +
          "da validação de forma, todo erro em live vira \"não implementado\" e o de verdade fica invisível.",
      );
    }

    process.env.PROVIDER_MODE = "fixture";
    const semConteudo = await criarLook({ ...AVATAR, name: "Só o nome" });
    if (semConteudo.ok || semConteudo.code !== "look_content_required") {
      failures.push(
        "traje: um traje sem imagem e sem descrição foi aceito. Nome sozinho não descreve roupa nenhuma, " +
          "e um look vazio chegaria ao seletor prometendo o que não tem.",
      );
    }

    const semTreino = await criarLook({ ...AVATAR, providerAvatarId: null, name: "X", prompt: "y" });
    if (semTreino.ok || semTreino.code !== "avatar_not_trained") {
      failures.push(
        "traje: criar traje foi aceito para um avatar sem `provider_avatar_id`. Look é do avatar treinado; " +
          "sem treino não há a que anexar, e o id gerado apontaria para coisa nenhuma.",
      );
    }

    if (desconhecidas.length > 0) {
      failures.push(
        "traje: o duplo de banco recebeu consulta que não sabe responder — " +
          `${JSON.stringify([...new Set(desconhecidas)])}. Alguma leitura nova entrou no caminho de traje ` +
          "e esta guarda passou a exercitá-la às cegas.",
      );
    }

    if (failures.length === 0) {
      notes.push("  traje: live recusa com 501 citando US$ 1,00, sem gravar; e corpo inválido é recusado nos dois modos.");
    }
  } finally {
    (pool as unknown as { query: unknown }).query = queryReal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  // ---------------------------------------------------------------------------
  // 5. O formulário órfão não voltou ao passo 1.
  //
  // Estático, e ancorado em USO: procura o handler de upload sendo chamado com
  // "outfit", que era o vínculo do bloco removido. A chave de tradução antiga
  // pode continuar no arquivo de idioma sem prejuízo — o que não pode voltar é
  // o campo escrevendo num estado que ninguém envia.
  // ---------------------------------------------------------------------------
  const passo1 = path.join(repoRoot, "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx");
  try {
    const fonte = await readFile(passo1, "utf-8");
    if (/handleAssetUpload\(\s*["']outfit["']/.test(fonte)) {
      failures.push(
        "traje: o upload de traje voltou ao passo 1 (`handleAssetUpload(\"outfit\", …)`). Aquele campo " +
          "gravava em `defaults.outfit`, que `corpoDaGeracao()` não inclui no corpo de POST /videos — " +
          "coletava arquivo do cliente e não alimentava geração nenhuma. Traje se cria em " +
          "\"Adicionar traje\", que produz um look de verdade.",
      );
    }
    if (!/handleCreateLook/.test(fonte)) {
      failures.push(
        "traje: o passo 1 não tem mais como criar traje — `handleCreateLook` sumiu. Sem ele o único " +
          "caminho de traje volta a ser escolher entre os que já existem, e a conta real tem um look só.",
      );
    }
  } catch {
    failures.push(`traje: não foi possível ler ${passo1} para conferir que o formulário órfão não voltou.`);
  }

  return { failures, notes };
}
