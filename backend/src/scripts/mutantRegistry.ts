/**
 * O REGISTRO de todos os mutantes, num lugar só.
 *
 * Extraído de `collectMutants.ts` porque aquele arquivo IMPRIME e chama
 * `process.exit` ao ser carregado: importá-lo de uma guarda dispararia os dois
 * como efeito colateral do `import`. Aqui só há dados.
 *
 * Quem consome: `collectMutants.ts` (que serializa para o runner do host) e
 * `checkMutantRegistryPolicy.ts` (que confere se cada `find` ainda casa). Os
 * dois leem a MESMA lista — uma segunda cópia envelheceria em silêncio, que é
 * o defeito que este projeto já pagou várias vezes.
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
import { MUTANTS as readinessMutants } from "./checkGenerationReadinessPolicy.js";
import { MUTANTS as recordingMutants } from "./checkRecordingGuidancePolicy.js";
import { MUTANTS as derivationMutants } from "./checkDerivationPolicy.js";
import { MUTANTS as nativeBatchMutants } from "./checkNativeBatchPolicy.js";
import { MUTANTS as paddingMutants } from "./checkPaddingPolicy.js";
import { MUTANTS as voiceSampleMutants } from "./checkVoiceSamplePolicy.js";
import { MUTANTS as stepOneMutants } from "./checkStepOneFlowPolicy.js";
import { MUTANTS as docsInternalMutants } from "./checkDocsInternalPolicy.js";
import { MUTANTS as cloneSampleFormatMutants } from "./checkCloneSampleFormatPolicy.js";
import { MUTANTS as spendControlMutants } from "./checkSpendControlPolicy.js";
import { MUTANTS as rehearsalCreditMutants } from "./checkRehearsalCreditPolicy.js";
import { MUTANTS as outfitMutants } from "./checkOutfitPolicy.js";
import { MUTANTS as legacyEndpointMutants } from "./checkLegacyEndpointPolicy.js";
import { MUTANTS as preflightSummaryMutants } from "./checkPreflightSummaryPolicy.js";
import { MUTANTS as videoContractMutants } from "./checkVideoContractPolicy.js";
import { MUTANTS as videoRecoveryMutants } from "./checkVideoRecoveryPolicy.js";
import { MUTANTS as scriptLimitMutants } from "./checkScriptLimitPolicy.js";
import { MUTANTS as captionMutants } from "./checkCaptionPolicy.js";
import { MUTANTS as translationMutants } from "./checkTranslationPolicy.js";
import { MUTANTS as directionLimitMutants } from "./checkDirectionLimitPolicy.js";
import { MUTANTS as expressivenessDefaultMutants } from "./checkExpressivenessDefaultPolicy.js";
import { MUTANTS as audioDurationGateMutants } from "./checkAudioDurationGatePolicy.js";
import { MUTANTS as avatarCardSelectableMutants } from "./checkAvatarCardSelectablePolicy.js";
import { MUTANTS as vendorProbeMutants } from "./checkVendorProbePolicy.js";
import { MUTANTS as falClientMutants } from "./checkFalClientPolicy.js";
import { MUTANTS as falPipelineMutants } from "./checkFalPipelinePolicy.js";
import { MUTANTS as mutantRegistryMutants } from "./checkMutantRegistryPolicy.js";
import type { Mutant } from "./mutants.js";

export const ALL_MUTANTS: Mutant[] = [
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
  ...readinessMutants,
  ...recordingMutants,
  ...derivationMutants,
  ...nativeBatchMutants,
  ...paddingMutants,
  ...voiceSampleMutants,
  ...stepOneMutants,
  ...docsInternalMutants,
  ...cloneSampleFormatMutants,
  ...spendControlMutants,
  ...rehearsalCreditMutants,
  ...outfitMutants,
  ...legacyEndpointMutants,
  ...preflightSummaryMutants,
  ...videoContractMutants,
  ...videoRecoveryMutants,
  ...scriptLimitMutants,
  ...captionMutants,
  ...translationMutants,
  ...directionLimitMutants,
  ...expressivenessDefaultMutants,
  ...audioDurationGateMutants,
  ...avatarCardSelectableMutants,
  ...vendorProbeMutants,
  ...falClientMutants,
  ...falPipelineMutants,
  ...mutantRegistryMutants,
];