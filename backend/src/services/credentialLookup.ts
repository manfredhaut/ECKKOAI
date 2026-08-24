import { pool } from "../db/pool.js";
import { decrypt } from "./crypto.js";
import { VENDORS_BY_PROVIDER, defaultVendor } from "./providers/vendorCatalog.js";
import { resolvePlatformKey } from "./platformCredentialStore.js";
import { plataformaQueCobre } from "./platformInheritance.js";
import type { CredentialProvider } from "../types.js";

export interface ResolvedCredential {
  apiKey: string;
  vendor: string;
  /**
   * De ONDE a chave veio — W1, 24/08.
   *
   * `tenant_byok`: a linha do tenant tinha chave, e a fatura é dele.
   * `platform`: o tenant não tinha, e a plataforma está pagando.
   *
   * Presente em TODA credencial resolvida, e não só nas herdadas: um campo
   * que só aparece num dos casos obriga cada leitor a tratar `undefined`, e
   * foi assim que o `source` da fal ficou meses sendo descartado com um
   * `.apiKey` — ver R5. Quem grava consumo o repassa para
   * `provider_usage.key_source` (migration 063).
   */
  source: "tenant_byok" | "platform";
}

/**
 * A HERANÇA — a chave de plataforma quando o tenant não tem a própria.
 *
 * Extraída para uma função só porque os DOIS leitores abaixo precisam dela
 * com a mesma semântica, e duas cópias divergiriam no dia em que um par novo
 * entrasse no mapa. Devolve `null` quando não há chave de plataforma para o
 * par — falha FECHADA, e é a alternativa certa: herdar por engano faz a
 * plataforma pagar uma conta que ninguém decidiu.
 */
async function herdarDaPlataforma(
  provider: CredentialProvider,
  vendor: string,
): Promise<ResolvedCredential | null> {
  const cobertura = plataformaQueCobre(provider, vendor);
  if (!cobertura) return null;
  const daPlataforma = await resolvePlatformKey(cobertura.id);
  if (!daPlataforma) return null;
  return { apiKey: daPlataforma.value, vendor, source: "platform" };
}

/**
 * Qual vendor um tenant que NUNCA escolheu deve usar — W1, 24/08.
 *
 * ┌─ Por que não é simplesmente `defaultVendor()` ───────────────────────────┐
 * │ MEDIDO: `defaultVendor("script")` é `anthropic`, e `anthropic` está no   │
 * │ mapa de herança como `null` DE PROPÓSITO (a chave parecida, `copilot`,   │
 * │ serve o suporte, e herdar por ela faria o roteiro do cliente consumir a  │
 * │ cota do suporte). Resultado: um tenant zerado recebia `null` para        │
 * │ `script` mesmo com a chave Google da plataforma gravada — o buraco do    │
 * │ W1 sobrevivendo num dos quatro casos que ele existe para fechar.         │
 * │                                                                          │
 * │ Quem NUNCA escolheu vendor não tem preferência a respeitar. Então o      │
 * │ default, para ele, é o primeiro vendor do provider que a plataforma      │
 * │ REALMENTE cobre. Quem ESCOLHEU continua com a escolha dele, inclusive    │
 * │ quando ela não tem cobertura — aí a falha é explícita, e é correta: ele  │
 * │ pediu um fornecedor que ninguém está pagando.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sem cobertura nenhuma no provider, cai no `defaultVendor()` de sempre — o
 * comportamento anterior a esta função, e a resposta continua sendo `null`
 * lá na frente. Nunca inventa vendor.
 */
function vendorHerdavel(provider: CredentialProvider): string {
  const coberto = VENDORS_BY_PROVIDER[provider].find((v) => plataformaQueCobre(provider, v));
  return coberto ?? defaultVendor(provider);
}

/**
 * A plataforma vence a BYOK neste par? Ver `HERANCA_DE_PLATAFORMA`.
 *
 * Hoje só a fal responde `true`, por decisão do bloco de centralização
 * (21/08). Esta função existe para que os dois leitores abaixo perguntem em
 * vez de cada um decidir — e para que a exceção tenha UM lugar.
 */
async function plataformaVence(
  provider: CredentialProvider,
  vendor: string,
): Promise<ResolvedCredential | null> {
  const cobertura = plataformaQueCobre(provider, vendor);
  if (cobertura?.precedencia !== "plataforma_vence") return null;
  return herdarDaPlataforma(provider, vendor);
}

// Shared by every route that needs a tenant's BYOK credential + chosen
// vendor (scripts, copilot, avatars, videos) — returns null when the
// tenant hasn't connected a key for that provider category yet.
//
// DETERMINÍSTICA desde a Fase C (migration 060) — `ORDER BY is_default DESC
// LIMIT 1`. Avatar pode ter mais de uma linha por tenant desde a Fase B (uma
// por vendor), e sem ORDER BY o Postgres não promete nenhuma ordem
// específica: dois tenants com heygen+fal configurados podiam receber a
// linha errada por pura sorte de qual voltasse primeiro. `is_default` é a
// credencial "de sempre" — a única com `is_default=true` garantida pelo
// índice `api_credentials_tenant_avatar_default_key` — e é ela que os call
// sites NÃO-tier-aware (11 deles) continuam vendo. Os 3 call sites
// tier-aware de `routes/videos.ts` usam `getCredentialForVendor` abaixo, não
// esta.
export async function getCredential(
  tenantId: string,
  provider: CredentialProvider,
): Promise<ResolvedCredential | null> {
  const { rows } = await pool.query<{ encrypted_key: string | null; vendor: string | null }>(
    "SELECT encrypted_key, vendor FROM api_credentials WHERE tenant_id = $1 AND provider = $2 ORDER BY is_default DESC LIMIT 1",
    [tenantId, provider],
  );
  // O VENDOR é decidido ANTES de saber se há chave, porque ele é o que
  // escolhe a herança. Linha com vendor vazio (o estado em que TODO tenant
  // novo nasce — medido: 23 de 34) cai no default do provider, que é o
  // mesmo vendor que o produto usaria se o tenant tivesse escolhido.
  const escolhido = rows[0]?.vendor || null;
  const vendor = escolhido ?? vendorHerdavel(provider);
  const encryptedKey = rows[0]?.encrypted_key;
  // A EXCEÇÃO primeiro, e só ela: no par em que a plataforma vence, ela vence
  // inclusive havendo BYOK. Ver `plataformaVence`.
  const centralizada = await plataformaVence(provider, vendor);
  if (centralizada) return centralizada;
  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: "tenant_byok" };
  // W1 — sem chave própria, a plataforma cobre. Antes disto a função devolvia
  // `null` aqui, e um tenant recém-criado não alcançava fornecedor nenhum
  // mesmo com todas as chaves de plataforma gravadas.
  return herdarDaPlataforma(provider, vendor);
}

// A busca por VENDOR EXPLÍCITO — Fase C. Os 3 call sites tier-aware de
// `routes/videos.ts` não querem "a credencial default do tenant": querem "a
// credencial DESTE vendor", porque é o `tier_video` escolhido no vídeo (ou o
// `provider_vendor` já gravado na linha) que decide o vendor — não o que o
// tenant marcou como padrão no admin. `vendor` nunca vem da linha lida: é o
// parâmetro, porque a query já filtrou por ele — devolvê-lo de volta evita
// uma segunda leitura do mesmo valor que o chamador já tem.
export async function getCredentialForVendor(
  tenantId: string,
  provider: CredentialProvider,
  vendor: string,
): Promise<ResolvedCredential | null> {
  const { rows } = await pool.query<{ encrypted_key: string | null }>(
    "SELECT encrypted_key FROM api_credentials WHERE tenant_id = $1 AND provider = $2 AND vendor = $3",
    [tenantId, provider, vendor],
  );
  const encryptedKey = rows[0]?.encrypted_key;
  const centralizada = await plataformaVence(provider, vendor);
  if (centralizada) return centralizada;
  if (encryptedKey) return { apiKey: decrypt(encryptedKey), vendor, source: "tenant_byok" };
  // W1 — mesma herança da função acima, e aqui o vendor não precisa ser
  // adivinhado: ele é o parâmetro. É este caminho que faz um tenant zerado
  // poder escolher QUALQUER nível na tela, e não só o do vendor que alguém
  // tenha cadastrado para ele.
  return herdarDaPlataforma(provider, vendor);
}
