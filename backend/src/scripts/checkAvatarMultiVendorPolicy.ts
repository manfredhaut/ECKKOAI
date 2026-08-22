/**
 * MULTI-VENDOR DE AVATAR — Fase B (backend de `adminPanel.ts` + merge de
 * estado nos dois editores do frontend). Migration 060 (Fase A) deu à
 * tabela dois índices parciais no lugar de um `UNIQUE (tenant_id,
 * provider)` só; este bloco é o código de APLICAÇÃO que depende deles.
 *
 *  G-1  o INSERT de avatar mira o índice parcial de avatar
 *       (`WHERE provider = 'avatar'`) no `ON CONFLICT`
 *  G-2  a primeira credencial de avatar do tenant nasce `is_default=true`;
 *       toda credencial seguinte nasce `false`
 *  G-3  o INSERT de voice/script mira o índice parcial deles
 *       (`WHERE provider <> 'avatar'`) no `ON CONFLICT`
 *  G-4  `/credentials/avatar/test` usa o `vendor` da query string pra
 *       escolher QUAL linha testar, quando ele vem
 *  G-5  `AdminApisPanel.tsx`: salvar um vendor de avatar não apaga a
 *       entrada de outro vendor do mesmo tenant na tela
 *  G-6  `AdminPanelPage.tsx`: mesma invariante de G-5, cópia irmã
 *
 * ┌─ POR QUE G-1 E G-3 EXISTEM: um bug real, reproduzido nesta sessão ──────┐
 * │ O PRIMEIRO ensaio HTTP desta rodada bateu exatamente no defeito que     │
 * │ G-1 previne: `ON CONFLICT (tenant_id, provider, vendor)` SEM o `WHERE   │
 * │ provider = 'avatar'` devolve, do Postgres, "42P10 — there is no unique  │
 * │ or exclusion constraint matching the ON CONFLICT specification" — os    │
 * │ dois índices parciais (migration 060) só existem COM predicado; sem     │
 * │ ele, nenhum dos dois casa. MEDIDO ao vivo: `PUT                         │
 * │ /admin/tenants/:id/credentials/avatar` devolvia 500 até a causa (código │
 * │ velho, não a query) ser encontrada — e o texto do erro real é o que G-1 │
 * │ e G-3 medem.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-1, G-3, G-4 medem FORMA — mesma limitação de G-D/G-E em               │
 * │ checkFalApprovalPolicy.ts: a query e o `if` vivem dentro do closure do   │
 * │ handler (`app.put(...)`), sem função exportada para chamar por          │
 * │ execução isolada. A alternativa MEDIDA nesta sessão (ensaio HTTP real,   │
 * │ ver o commit) já provou que a SQL funciona contra o Postgres de          │
 * │ verdade; o que falta um mutante provar é que o TEXTO continua sendo o    │
 * │ que foi provado, não uma reconstrução dele.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-2 mede LÓGICA AVALIADA, mesmo padrão de                               │
 * │ checkAvatarCardSelectablePolicy.ts: `primeiraCredencialDeAvatar` é uma   │
 * │ expressão isolável, e um mutante que trocasse `=== 0` por `!== 0` (ou    │
 * │ qualquer outra comparação) muda o RESULTADO — é isso que se avalia, não  │
 * │ o texto.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-5 e G-6 medem LÓGICA AVALIADA — o predicado `mesmaEntrada` é uma      │
 * │ função pura de dois `Credential`, extraída e executada contra os casos   │
 * │ que distinguem "casar por provider" de "casar por (provider,vendor)".   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. G-1/G-3/G-4 leem arquivo; G-2/G-5/G-6 avaliam expressão em
 * memória. Nenhuma rede, nenhum banco.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";

const ADMIN_PANEL_ROUTE = "backend/src/routes/adminPanel.ts";
const APIS_PANEL = "frontend/src/pages/AdminPanel/AdminApisPanel.tsx";
const TENANT_DETAIL_PANEL = "frontend/src/pages/AdminPanel/AdminPanelPage.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "o INSERT de avatar mira o índice parcial de avatar no ON CONFLICT",
    name: "o WHERE provider = 'avatar' some do ON CONFLICT do avatar",
    kind: "obvio",
    // MEDIDO nesta sessão: sem o WHERE, o Postgres devolve 42P10 — "there is
    // no unique or exclusion constraint matching the ON CONFLICT
    // specification" — porque os dois índices parciais (migration 060) só
    // casam COM predicado.
    file: ADMIN_PANEL_ROUTE,
    find: "         ON CONFLICT (tenant_id, provider, vendor) WHERE provider = 'avatar'",
    replace: "         ON CONFLICT (tenant_id, provider, vendor)",
    expect: "o ON CONFLICT do avatar não mira o índice parcial de avatar",
  },
  {
    guard: "o INSERT de voice/script mira o índice parcial deles no ON CONFLICT",
    name: "o WHERE provider <> 'avatar' some do ON CONFLICT de voice/script",
    kind: "obvio",
    file: ADMIN_PANEL_ROUTE,
    find: "         ON CONFLICT (tenant_id, provider) WHERE provider <> 'avatar'",
    replace: "         ON CONFLICT (tenant_id, provider)",
    expect: "o ON CONFLICT de voice/script não mira o índice parcial deles",
  },
  {
    guard: "a primeira credencial de avatar do tenant nasce is_default=true; as seguintes nascem false",
    name: "a checagem de 'primeira credencial' é invertida",
    kind: "esperto",
    // ESPERTO: o `tsc` continua verde (comparação de número válida), a
    // query continua completa, e o caminho feliz de UM SÓ vendor ainda
    // funciona por acidente às vezes — o defeito aparece exatamente no
    // caso que este bloco existe para cobrir: o SEGUNDO vendor de avatar
    // de um tenant.
    file: ADMIN_PANEL_ROUTE,
    find: "      const primeiraCredencialDeAvatar = Number(existentes[0].count) === 0;",
    replace: '      const primeiraCredencialDeAvatar = Number(existentes[0].count) !== 0;',
    expect: "a checagem de primeira credencial de avatar deu o veredito errado",
  },
  {
    guard: "/credentials/avatar/test usa o vendor da query string para escolher a linha",
    name: "o vendor da query string deixa de filtrar a linha testada",
    kind: "esperto",
    // ESPERTO: a rota continua aceitando `?vendor=`, continua devolvendo
    // 200/400 normalmente — só que sempre para a MESMA linha (`rows[0]`,
    // sem ORDER BY), então "Testar" no card do fal testaria a chave do
    // heygen (ou o contrário) por acaso, com um tenant que tem os dois.
    file: ADMIN_PANEL_ROUTE,
    find:
      "      const { rows } = await pool.query<CredentialRow>(\n" +
      "        req.query.vendor\n" +
      "          ? \"SELECT * FROM api_credentials WHERE tenant_id = $1 AND provider = $2 AND vendor = $3\"\n" +
      "          : \"SELECT * FROM api_credentials WHERE tenant_id = $1 AND provider = $2\",\n" +
      "        req.query.vendor ? [tenantId, provider, req.query.vendor] : [tenantId, provider],\n" +
      "      );",
    replace:
      "      const { rows } = await pool.query<CredentialRow>(\n" +
      "        \"SELECT * FROM api_credentials WHERE tenant_id = $1 AND provider = $2\",\n" +
      "        [tenantId, provider],\n" +
      "      );",
    expect: "a rota de teste ignora o vendor da query string",
  },
  {
    guard: "AdminApisPanel.tsx: salvar um vendor de avatar não apaga a entrada de outro vendor na tela",
    name: "a condição de mesmaEntrada é invertida (=== vira !==)",
    kind: "esperto",
    // ESPERTO: o `tsc` continua verde, os dois ramos do ternário continuam
    // no arquivo — só o que decide QUAL ramo usar inverte. Avatar passa a
    // casar só por `provider` (salvar fal apagaria heygen da tela);
    // voice/script passam a exigir vendor igual (trocar de fornecedor no
    // seletor duplicaria a linha em vez de atualizá-la).
    file: APIS_PANEL,
    find: '        updated.provider === "avatar"\n          ? c.provider === updated.provider && c.vendor === updated.vendor\n          : c.provider === updated.provider;',
    replace: '        updated.provider !== "avatar"\n          ? c.provider === updated.provider && c.vendor === updated.vendor\n          : c.provider === updated.provider;',
    expect: "o predicado `mesmaEntrada` deu o veredito errado",
  },
  {
    guard: "AdminPanelPage.tsx: salvar um vendor de avatar não apaga a entrada de outro vendor na tela",
    name: "a condição de mesmaEntrada é invertida (=== vira !==)",
    kind: "esperto",
    file: TENANT_DETAIL_PANEL,
    find: '        updated.provider === "avatar"\n          ? c.provider === updated.provider && c.vendor === updated.vendor\n          : c.provider === updated.provider;',
    replace: '        updated.provider !== "avatar"\n          ? c.provider === updated.provider && c.vendor === updated.vendor\n          : c.provider === updated.provider;',
    expect: "o predicado `mesmaEntrada` deu o veredito errado",
  },
];

export interface AvatarMultiVendorResult {
  failures: string[];
  notes: string[];
}

function lerFonte(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf8").replace(/\r\n/g, "\n");
}

/** Os casos que distinguem "casar por provider" de "casar por (provider,vendor)". */
const CASOS_MESMA_ENTRADA: ReadonlyArray<{
  rotulo: string;
  c: { provider: string; vendor: string };
  updated: { provider: string; vendor: string };
  mesmaEsperado: boolean;
}> = [
  {
    rotulo: "avatar, vendors DIFERENTES (heygen existente, fal salvo agora)",
    c: { provider: "avatar", vendor: "heygen" },
    updated: { provider: "avatar", vendor: "fal" },
    mesmaEsperado: false,
  },
  {
    rotulo: "avatar, MESMO vendor (heygen resalvo)",
    c: { provider: "avatar", vendor: "heygen" },
    updated: { provider: "avatar", vendor: "heygen" },
    mesmaEsperado: true,
  },
  {
    rotulo: "voice, vendor TROCADO no seletor (a linha antiga é a mesma linha)",
    c: { provider: "voice", vendor: "elevenlabs" },
    updated: { provider: "voice", vendor: "outro-vendor-hipotetico" },
    mesmaEsperado: true,
  },
  {
    rotulo: "providers diferentes (avatar vs voice)",
    c: { provider: "voice", vendor: "elevenlabs" },
    updated: { provider: "avatar", vendor: "heygen" },
    mesmaEsperado: false,
  },
];

function checarMesmaEntrada(
  failures: string[],
  notes: string[],
  arquivo: string,
  fonte: string,
  rotuloGuarda: string,
): void {
  const casado = /const mesmaEntrada = \(c: Credential\) =>\s*\n([\s\S]+?);\s*\n\s*return \{/.exec(fonte);
  if (!casado) {
    failures.push(
      `${rotuloGuarda}: não há \`const mesmaEntrada = (c: Credential) => …;\` em ${arquivo}. Sem esse ` +
        "predicado, salvar um segundo vendor de avatar substitui o primeiro na tela em vez de somar a ele.",
    );
    return;
  }
  const expressao = casado[1].trim();
  let avaliar: (c: unknown, updated: unknown) => unknown;
  try {
    // eslint-disable-next-line no-new-func
    avaliar = new Function("c", "updated", `return (${expressao});`) as typeof avaliar;
  } catch (err) {
    failures.push(
      `${rotuloGuarda}: o predicado \`${expressao}\` não é uma expressão avaliável (${String(err)}).`,
    );
    return;
  }

  let algumaFalha = false;
  for (const caso of CASOS_MESMA_ENTRADA) {
    let obtido: unknown;
    try {
      obtido = avaliar(caso.c, caso.updated);
    } catch (err) {
      failures.push(`${rotuloGuarda}: avaliar o caso "${caso.rotulo}" levantou ${String(err)}.`);
      algumaFalha = true;
      continue;
    }
    if (Boolean(obtido) === caso.mesmaEsperado) continue;
    algumaFalha = true;
    failures.push(
      `${rotuloGuarda}: o predicado \`mesmaEntrada\` deu o veredito errado para ${caso.rotulo} — esperado ` +
        `${caso.mesmaEsperado}, obtido ${Boolean(obtido)}. Predicado: \`${expressao}\`.`,
    );
  }
  if (!algumaFalha) {
    notes.push(`    ${rotuloGuarda}: mesmaEntrada distingue por (provider,vendor) só para avatar`);
  }
}

export function checkAvatarMultiVendorPolicy(repoRoot: string): AvatarMultiVendorResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-1 e G-3 — os dois ON CONFLICT, por FORMA (recorte intrínseco: o corpo
  // do handler PUT, entre a assinatura da rota e a rota seguinte)
  // -------------------------------------------------------------------------
  const rota = lerFonte(repoRoot, ADMIN_PANEL_ROUTE);
  const inicioPut = rota.indexOf('"/admin/tenants/:tenantId/credentials/:provider", async (req, reply) => {');
  const fimPut = rota.indexOf('"/admin/tenants/:tenantId/credentials/:provider/test"', inicioPut);
  if (inicioPut < 0 || fimPut < 0) {
    failures.push(
      `avatar multi-vendor: não foi possível recortar o handler PUT de credenciais em ${ADMIN_PANEL_ROUTE}. ` +
        "A guarda não pode opinar sobre um trecho que não encontrou.",
    );
  } else {
    const trecho = rota.slice(inicioPut, fimPut);
    if (!trecho.includes("ON CONFLICT (tenant_id, provider, vendor) WHERE provider = 'avatar'")) {
      failures.push(
        "avatar multi-vendor: o ON CONFLICT do avatar não mira o índice parcial de avatar — MEDIDO nesta " +
          "sessão: sem `WHERE provider = 'avatar'`, o Postgres devolve 42P10 (\"there is no unique or " +
          "exclusion constraint matching the ON CONFLICT specification\"), porque nenhum dos dois índices " +
          "parciais da migration 060 casa com uma inferência sem predicado.",
      );
    } else {
      notes.push("    avatar multi-vendor: o ON CONFLICT do avatar mira o índice parcial de avatar");
    }
    if (!trecho.includes("ON CONFLICT (tenant_id, provider) WHERE provider <> 'avatar'")) {
      failures.push(
        "avatar multi-vendor: o ON CONFLICT de voice/script não mira o índice parcial deles — mesma causa " +
          "de raiz do defeito do avatar, do outro lado do branch.",
      );
    } else {
      notes.push("    avatar multi-vendor: o ON CONFLICT de voice/script mira o índice parcial deles");
    }

    // ------------------------------------------------------------------
    // G-2 — a checagem de primeira credencial, AVALIADA
    // ------------------------------------------------------------------
    const casadoPrimeira = /const primeiraCredencialDeAvatar = ([^;]+);/.exec(trecho);
    if (!casadoPrimeira) {
      failures.push(
        `avatar multi-vendor: não há \`const primeiraCredencialDeAvatar = …;\` em ${ADMIN_PANEL_ROUTE}. ` +
          "Sem essa checagem, is_default é gravado sem saber se é a primeira credencial de avatar do tenant.",
      );
    } else {
      const expressao = casadoPrimeira[1].trim();
      let avaliar: (existentes: { count: string }[]) => unknown;
      try {
        // eslint-disable-next-line no-new-func
        avaliar = new Function("existentes", `return (${expressao});`) as typeof avaliar;
      } catch (err) {
        failures.push(
          `avatar multi-vendor: o predicado \`${expressao}\` não é uma expressão avaliável (${String(err)}).`,
        );
        avaliar = undefined as never;
      }
      if (avaliar) {
        const casosPrimeira: ReadonlyArray<{ rotulo: string; count: string; esperado: boolean }> = [
          { rotulo: "zero credenciais de avatar existentes (primeira de sempre)", count: "0", esperado: true },
          { rotulo: "uma credencial de avatar já existe (segunda em diante)", count: "1", esperado: false },
          { rotulo: "duas credenciais já existem", count: "2", esperado: false },
        ];
        let algumaFalha = false;
        for (const caso of casosPrimeira) {
          let obtido: unknown;
          try {
            obtido = avaliar([{ count: caso.count }]);
          } catch (err) {
            failures.push(`avatar multi-vendor: avaliar o caso "${caso.rotulo}" levantou ${String(err)}.`);
            algumaFalha = true;
            continue;
          }
          if (Boolean(obtido) === caso.esperado) continue;
          algumaFalha = true;
          failures.push(
            "avatar multi-vendor: a checagem de primeira credencial de avatar deu o veredito errado para " +
              `${caso.rotulo} — esperado ${caso.esperado}, obtido ${Boolean(obtido)}. Predicado: \`${expressao}\`. ` +
              "Errar aqui grava `is_default` errado: um tenant novo pode nascer sem NENHUMA linha default " +
              "(os call sites não-tier-aware de getCredential ficam sem uma resposta clara), ou um segundo " +
              "vendor pode nascer default e colidir com `api_credentials_tenant_avatar_default_key` — o " +
              "clique de \"Adicionar vendor\" volta 500.",
          );
        }
        if (!algumaFalha) {
          notes.push(
            "    avatar multi-vendor: a primeira credencial de avatar do tenant nasce is_default=true; " +
              "as seguintes nascem false",
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // G-4 — o vendor da query string na rota de teste, por FORMA
  // -------------------------------------------------------------------------
  const inicioTest = rota.indexOf('"/admin/tenants/:tenantId/credentials/:provider/test"');
  const fimTest = rota.indexOf("const credential = rows[0];", inicioTest);
  if (inicioTest < 0 || fimTest < 0) {
    failures.push(
      `avatar multi-vendor: não foi possível recortar o handler de teste em ${ADMIN_PANEL_ROUTE}. A guarda ` +
        "não pode opinar sobre um trecho que não encontrou.",
    );
  } else {
    const trechoTest = rota.slice(inicioTest, fimTest);
    // ÂNCORA DE CÓDIGO, não de prosa: o comentário logo acima da query
    // também menciona `req.query.vendor` em texto explicativo — um
    // `includes("req.query.vendor")` sozinho casava com o COMENTÁRIO e
    // ficava INERTE quando o CÓDIGO era mutado (MEDIDO nesta sessão,
    // mutação testada à mão). O array de parâmetros só existe no código.
    if (!trechoTest.includes("[tenantId, provider, req.query.vendor]")) {
      failures.push(
        "avatar multi-vendor: a rota de teste ignora o vendor da query string — com um tenant que tem mais " +
          "de uma linha de avatar, \"Testar\" no card do fal (ou de qualquer vendor) testaria uma linha " +
          "arbitrária (`rows[0]`, sem ORDER BY), possivelmente a chave errada.",
      );
    } else {
      notes.push("    avatar multi-vendor: a rota de teste usa o vendor da query string para escolher a linha");
    }
  }

  // -------------------------------------------------------------------------
  // G-5 e G-6 — mesmaEntrada, avaliada, nos dois arquivos do frontend
  // -------------------------------------------------------------------------
  checarMesmaEntrada(
    failures,
    notes,
    APIS_PANEL,
    lerFonte(repoRoot, APIS_PANEL),
    "avatar multi-vendor (AdminApisPanel)",
  );
  checarMesmaEntrada(
    failures,
    notes,
    TENANT_DETAIL_PANEL,
    lerFonte(repoRoot, TENANT_DETAIL_PANEL),
    "avatar multi-vendor (AdminPanelPage)",
  );

  return { failures, notes };
}
