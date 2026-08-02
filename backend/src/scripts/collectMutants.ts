/**
 * Junta os mutantes declarados por cada guarda e imprime como JSON.
 *
 * A divisão de trabalho é deliberada: os mutantes moram JUNTO da guarda que
 * testam (quem edita a guarda vê o mutante no mesmo arquivo, e um mutante
 * órfão fica óbvio), mas quem os executa é o runner do host — porque o arnês
 * precisa de `git` para provar a reversão, e o container não tem git nem o
 * repositório inteiro montado para escrita.
 *
 * Este script é a ponte entre os dois: roda dentro do container, onde o
 * TypeScript resolve, e devolve dados puros.
 */
import { MUTANTS as policyMutants } from "./checkPolicy.js";
import { MUTANTS as environmentMutants } from "./checkEnvironmentPolicy.js";
import { MUTANTS as providerMutants } from "./checkProviderPolicy.js";
import { MUTANTS as platformKeyMutants } from "./checkPlatformKeyPolicy.js";
import { MUTANTS as refundMutants } from "./checkRefundPolicy.js";
import { MUTANTS as pollMutants } from "./checkPollPolicy.js";
import { MUTANTS as liveBudgetMutants } from "./checkLiveBudgetPolicy.js";
import { MUTANTS as vendorLogMutants } from "./checkVendorLogPolicy.js";
import { MUTANTS as videoFormatMutants } from "./checkVideoFormatPolicy.js";
import { MUTANTS as vendorErrorPathMutants } from "./checkVendorErrorPathPolicy.js";
import { MUTANTS as imageFreshnessMutants } from "./checkImageFreshnessPolicy.js";
import { MUTANTS as costMutants } from "./checkCostPolicy.js";
import { MUTANTS as egressMutants } from "./checkNetworkEgressPolicy.js";
import { MUTANTS as playbackMutants } from "./checkVideoPlaybackPolicy.js";
import type { Mutant } from "./mutants.js";

const all: Mutant[] = [
  ...policyMutants,
  ...environmentMutants,
  ...providerMutants,
  ...platformKeyMutants,
  ...refundMutants,
  ...pollMutants,
  ...liveBudgetMutants,
  ...vendorLogMutants,
  ...videoFormatMutants,
  ...vendorErrorPathMutants,
  ...imageFreshnessMutants,
  ...costMutants,
  ...egressMutants,
  ...playbackMutants,
];

// Um mutante malformado só apareceria no meio da execução, com a árvore já
// mutada — o pior momento. Validado aqui, antes de qualquer escrita em disco.
const problemas: string[] = [];
for (const m of all) {
  const id = `${m.guard} / ${m.name}`;
  if (!m.file && !m.env) problemas.push(`${id}: não tem file nem env — não muta nada.`);
  if (m.file && (m.find === undefined || m.replace === undefined)) {
    problemas.push(`${id}: declara file sem find/replace.`);
  }
  if (m.find !== undefined && m.find === m.replace) problemas.push(`${id}: find e replace são iguais.`);
  if (!m.expect) problemas.push(`${id}: sem expect — a reprovação não poderia ser atribuída a esta guarda.`);
}

if (problemas.length > 0) {
  console.error(JSON.stringify({ error: "mutantes malformados", problemas }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(all));
