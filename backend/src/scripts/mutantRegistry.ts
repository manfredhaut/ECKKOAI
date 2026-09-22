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
import { MUTANTS as frontendBuildEnvMutants } from "./checkFrontendBuildEnvPolicy.js";
import { MUTANTS as backupMutants } from "./checkBackupPolicy.js";
import { MUTANTS as heygenSpendCapMutants } from "./checkHeygenSpendCapPolicy.js";
import { MUTANTS as simpleConfirmMutants } from "./checkSimpleConfirmPolicy.js";
import { MUTANTS as bundleFreshnessMutants } from "./checkFrontendBundleFreshnessPolicy.js";
import { MUTANTS as viteServeFreshnessMutants } from "./checkViteServeFreshnessPolicy.js";
import { MUTANTS as costReferenceMutants } from "./checkCostReferencePolicy.js";
import { MUTANTS as singleDomainMutants } from "./checkSingleDomainPolicy.js";
import { MUTANTS as tenantOnboardingMutants } from "./checkTenantOnboardingPolicy.js";
import { MUTANTS as emailVerificationMutants } from "./checkEmailVerificationPolicy.js";
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
import { MUTANTS as falPollRecoveryMutants } from "./checkFalPollRecoveryPolicy.js";
import { MUTANTS as blockResumeMutants } from "./checkBlockResumePolicy.js";
import { MUTANTS as wan3TomadaUnicaMutants } from "./checkWan3TomadaUnicaPolicy.js";
import { MUTANTS as tomadaUnicaMarkerCacheMutants } from "./checkTomadaUnicaMarkerCachePolicy.js";
import { MUTANTS as syncFolgaMutants } from "./checkSyncFolgaPolicy.js";
import { MUTANTS as scriptLimitMutants } from "./checkScriptLimitPolicy.js";
import { MUTANTS as captionMutants } from "./checkCaptionPolicy.js";
import { MUTANTS as translationMutants } from "./checkTranslationPolicy.js";
import { MUTANTS as sceneTextTranslationMutants } from "./checkSceneTextTranslationPolicy.js";
import { MUTANTS as frozenIdentityMutants } from "./checkFrozenIdentityPolicy.js";
import { MUTANTS as videoCancelMutants } from "./checkVideoCancelPolicy.js";
import { MUTANTS as videoDetailsMutants } from "./checkVideoDetailsPolicy.js";
import { MUTANTS as videoAdjustMutants } from "./checkVideoAdjustPolicy.js";
import { MUTANTS as directionLimitMutants } from "./checkDirectionLimitPolicy.js";
import { MUTANTS as expressivenessDefaultMutants } from "./checkExpressivenessDefaultPolicy.js";
import { MUTANTS as audioDurationGateMutants } from "./checkAudioDurationGatePolicy.js";
import { MUTANTS as avatarCardSelectableMutants } from "./checkAvatarCardSelectablePolicy.js";
import { MUTANTS as tierAvailabilityMutants } from "./checkTierAvailabilityPolicy.js";
import { MUTANTS as normalAspectRatioMutants } from "./checkNormalAspectRatioPolicy.js";
import { MUTANTS as avatarMultiVendorMutants } from "./checkAvatarMultiVendorPolicy.js";
import { MUTANTS as tierVendorMutants } from "./checkTierVendorPolicy.js";
import { MUTANTS as vendorProbeMutants } from "./checkVendorProbePolicy.js";
import { MUTANTS as falClientMutants } from "./checkFalClientPolicy.js";
import { MUTANTS as falPipelineMutants } from "./checkFalPipelinePolicy.js";
import { MUTANTS as falGenerationPathMutants } from "./checkFalGenerationPathPolicy.js";
import { MUTANTS as falApprovalMutants } from "./checkFalApprovalPolicy.js";
import { MUTANTS as falVideoApprovalMutants } from "./checkFalVideoApprovalPolicy.js";
import { MUTANTS as falGastoInstrumentadoMutants } from "./checkFalGastoInstrumentadoPolicy.js";
import { MUTANTS as usageAttributionMutants } from "./checkUsageAttributionPolicy.js";
import { MUTANTS as voiceRotationMutants } from "./checkVoiceRotationPolicy.js";
import { MUTANTS as voiceTuningMutants } from "./checkVoiceTuningPolicy.js";
import { MUTANTS as ensaioSimuladoMutants } from "./checkEnsaioSimuladoPolicy.js";
import { MUTANTS as platformInheritanceMutants } from "./checkPlatformInheritancePolicy.js";
import { MUTANTS as gateRunnerMutants } from "./checkGateRunnerPolicy.js";
import { MUTANTS as providerPricesMutants } from "./checkProviderPricesPolicy.js";
import { MUTANTS as refacoesMutants } from "./checkRefacoesPolicy.js";
import { MUTANTS as falSceneWiringMutants } from "./checkFalSceneWiringPolicy.js";
import { MUTANTS as falFase0DefaultsMutants } from "./checkFalFase0DefaultsPolicy.js";
import { MUTANTS as falTierMutants } from "./checkFalTierPolicy.js";
import { MUTANTS as referenceVideoPhotoOptionalMutants } from "./checkReferenceVideoPhotoOptionalPolicy.js";
import { MUTANTS as avatarSceneDefaultsMutants } from "./checkAvatarSceneDefaultsPolicy.js";
import { MUTANTS as avatarTrainingVendorMutants } from "./checkAvatarTrainingVendorPolicy.js";
import { MUTANTS as avatarPreviewVendorMutants } from "./checkAvatarPreviewVendorPolicy.js";
import { MUTANTS as avatarTabRestoreMutants } from "./checkAvatarTabRestorePolicy.js";
import { MUTANTS as scenePerVideoMutants } from "./checkScenePerVideoPolicy.js";
import { MUTANTS as photoRemovalMutants } from "./checkPhotoRemovalPolicy.js";
import { MUTANTS as virtualBackgroundComparatorMutants } from "./checkVirtualBackgroundComparatorPolicy.js";
import { MUTANTS as mutantRegistryMutants } from "./checkMutantRegistryPolicy.js";
import { MUTANTS as scriptFractioningMutants } from "./checkScriptFractioningPolicy.js";
import { MUTANTS as expressivenessDirectionMutants } from "./checkExpressivenessDirectionPolicy.js";
import { MUTANTS as targetDurationCapMutants } from "./checkTargetDurationCapPolicy.js";
import { MUTANTS as recomposeFeedbackMutants } from "./checkRecomposeFeedbackPolicy.js";
import { MUTANTS as falSpendLedgerMutants } from "./checkFalSpendLedgerPolicy.js";
import { MUTANTS as scriptValidationStatusMutants } from "./checkScriptValidationStatusPolicy.js";
import { MUTANTS as alvoDeDuracaoMutants } from "./checkAlvoDeDuracaoPolicy.js";
import { MUTANTS as trimOvershootMutants } from "./checkTrimOvershootPolicy.js";
import { MUTANTS as recomposeLateralPhotoMutants } from "./checkRecomposeLateralPhotoPolicy.js";
import { MUTANTS as wanBlockOrchestrationMutants } from "./checkWanBlockOrchestrationPolicy.js";
import { MUTANTS as colorMatchDefaultMutants } from "./checkColorMatchDefaultPolicy.js";
import { MUTANTS as wanPromptQuoteHeuristicMutants } from "./checkWanPromptQuoteHeuristicPolicy.js";
import { MUTANTS as heygenVoiceCloneMutants } from "./checkHeygenVoiceClonePolicy.js";
import { MUTANTS as heygenVoiceCloneWiringMutants } from "./checkHeygenVoiceCloneWiringPolicy.js";
import { MUTANTS as heygenCallbackWiringMutants } from "./checkHeygenCallbackWiringPolicy.js";
import { MUTANTS as idempotencyReplayMutants } from "./checkIdempotencyReplayPolicy.js";
import { MUTANTS as backgroundResizeMutants } from "./checkBackgroundResizePolicy.js";
import { MUTANTS as audioMeasuredMutants } from "./checkAudioMeasuredPolicy.js";
import { MUTANTS as heygenWebhookMutants } from "./checkHeygenWebhookPolicy.js";
import { MUTANTS as heygenPayloadPersistenceMutants } from "./checkHeygenPayloadPersistencePolicy.js";
import { MUTANTS as avatarDistanceAndFitMutants } from "./checkAvatarDistanceAndFitPolicy.js";
import { MUTANTS as studioMovieEditMutants } from "./checkStudioMovieEditPolicy.js";
import type { Mutant } from "./mutants.js";


/**
 * Carimba cada mutante com a GUARDA que o declara.
 *
 * A passada AFETADA seleciona por arquivo tocado. Sem este carimbo ela olharia
 * só o `file` do mutante — o ALVO — e editar uma guarda sem tocar o alvo
 * deixaria os mutantes dela de fora, que é exatamente a mudança em que se mais
 * precisa deles.
 */
function de(sourceFile: string, mutantes: Mutant[]): Mutant[] {
  return mutantes.map((m) => ({ ...m, sourceFile }));
}

export const ALL_MUTANTS: Mutant[] = [
  ...de("backend/src/scripts/checkPolicy.ts", policyMutants),
  ...de("backend/src/scripts/checkEnvironmentPolicy.ts", environmentMutants),
  ...de("backend/src/scripts/checkProviderPolicy.ts", providerMutants),
  ...de("backend/src/scripts/checkPlatformKeyPolicy.ts", platformKeyMutants),
  ...de("backend/src/scripts/checkRefundPolicy.ts", refundMutants),
  ...de("backend/src/scripts/checkPollPolicy.ts", pollMutants),
  ...de("backend/src/scripts/checkLiveBudgetPolicy.ts", liveBudgetMutants),
  ...de("backend/src/scripts/checkVendorLogPolicy.ts", vendorLogMutants),
  ...de("backend/src/scripts/checkVideoFormatPolicy.ts", videoFormatMutants),
  ...de("backend/src/scripts/checkVendorErrorPathPolicy.ts", vendorErrorPathMutants),
  ...de("backend/src/scripts/checkImageFreshnessPolicy.ts", imageFreshnessMutants),
  ...de("backend/src/scripts/checkFrontendBuildEnvPolicy.ts", frontendBuildEnvMutants),
  ...de("backend/src/scripts/checkBackupPolicy.ts", backupMutants),
  ...de("backend/src/scripts/checkHeygenSpendCapPolicy.ts", heygenSpendCapMutants),
  ...de("backend/src/scripts/checkSimpleConfirmPolicy.ts", simpleConfirmMutants),
  ...de("backend/src/scripts/checkFrontendBundleFreshnessPolicy.ts", bundleFreshnessMutants),
  ...de("backend/src/scripts/checkViteServeFreshnessPolicy.ts", viteServeFreshnessMutants),
  ...de("backend/src/scripts/checkCostReferencePolicy.ts", costReferenceMutants),
  ...de("backend/src/scripts/checkSingleDomainPolicy.ts", singleDomainMutants),
  ...de("backend/src/scripts/checkTenantOnboardingPolicy.ts", tenantOnboardingMutants),
  ...de("backend/src/scripts/checkEmailVerificationPolicy.ts", emailVerificationMutants),
  ...de("backend/src/scripts/checkCostPolicy.ts", costMutants),
  ...de("backend/src/scripts/checkNetworkEgressPolicy.ts", egressMutants),
  ...de("backend/src/scripts/checkVideoPlaybackPolicy.ts", playbackMutants),
  ...de("backend/src/scripts/checkGenerationReadinessPolicy.ts", readinessMutants),
  ...de("backend/src/scripts/checkRecordingGuidancePolicy.ts", recordingMutants),
  ...de("backend/src/scripts/checkDerivationPolicy.ts", derivationMutants),
  ...de("backend/src/scripts/checkNativeBatchPolicy.ts", nativeBatchMutants),
  ...de("backend/src/scripts/checkPaddingPolicy.ts", paddingMutants),
  ...de("backend/src/scripts/checkVoiceSamplePolicy.ts", voiceSampleMutants),
  ...de("backend/src/scripts/checkStepOneFlowPolicy.ts", stepOneMutants),
  ...de("backend/src/scripts/checkDocsInternalPolicy.ts", docsInternalMutants),
  ...de("backend/src/scripts/checkCloneSampleFormatPolicy.ts", cloneSampleFormatMutants),
  ...de("backend/src/scripts/checkSpendControlPolicy.ts", spendControlMutants),
  ...de("backend/src/scripts/checkRehearsalCreditPolicy.ts", rehearsalCreditMutants),
  ...de("backend/src/scripts/checkOutfitPolicy.ts", outfitMutants),
  ...de("backend/src/scripts/checkLegacyEndpointPolicy.ts", legacyEndpointMutants),
  ...de("backend/src/scripts/checkPreflightSummaryPolicy.ts", preflightSummaryMutants),
  ...de("backend/src/scripts/checkVideoContractPolicy.ts", videoContractMutants),
  ...de("backend/src/scripts/checkVideoRecoveryPolicy.ts", videoRecoveryMutants),
  ...de("backend/src/scripts/checkFalPollRecoveryPolicy.ts", falPollRecoveryMutants),
  ...de("backend/src/scripts/checkBlockResumePolicy.ts", blockResumeMutants),
  ...de("backend/src/scripts/checkWan3TomadaUnicaPolicy.ts", wan3TomadaUnicaMutants),
  ...de("backend/src/scripts/checkTomadaUnicaMarkerCachePolicy.ts", tomadaUnicaMarkerCacheMutants),
  ...de("backend/src/scripts/checkSyncFolgaPolicy.ts", syncFolgaMutants),
  ...de("backend/src/scripts/checkScriptLimitPolicy.ts", scriptLimitMutants),
  ...de("backend/src/scripts/checkCaptionPolicy.ts", captionMutants),
  ...de("backend/src/scripts/checkTranslationPolicy.ts", translationMutants),
  ...de("backend/src/scripts/checkSceneTextTranslationPolicy.ts", sceneTextTranslationMutants),
  ...de("backend/src/scripts/checkFrozenIdentityPolicy.ts", frozenIdentityMutants),
  ...de("backend/src/scripts/checkVideoCancelPolicy.ts", videoCancelMutants),
  ...de("backend/src/scripts/checkVideoDetailsPolicy.ts", videoDetailsMutants),
  ...de("backend/src/scripts/checkVideoAdjustPolicy.ts", videoAdjustMutants),
  ...de("backend/src/scripts/checkDirectionLimitPolicy.ts", directionLimitMutants),
  ...de("backend/src/scripts/checkExpressivenessDefaultPolicy.ts", expressivenessDefaultMutants),
  ...de("backend/src/scripts/checkAudioDurationGatePolicy.ts", audioDurationGateMutants),
  ...de("backend/src/scripts/checkAvatarCardSelectablePolicy.ts", avatarCardSelectableMutants),
  ...de("backend/src/scripts/checkTierAvailabilityPolicy.ts", tierAvailabilityMutants),
  ...de("backend/src/scripts/checkNormalAspectRatioPolicy.ts", normalAspectRatioMutants),
  ...de("backend/src/scripts/checkAvatarMultiVendorPolicy.ts", avatarMultiVendorMutants),
  ...de("backend/src/scripts/checkTierVendorPolicy.ts", tierVendorMutants),
  ...de("backend/src/scripts/checkVendorProbePolicy.ts", vendorProbeMutants),
  ...de("backend/src/scripts/checkFalClientPolicy.ts", falClientMutants),
  ...de("backend/src/scripts/checkFalPipelinePolicy.ts", falPipelineMutants),
  ...de("backend/src/scripts/checkFalGenerationPathPolicy.ts", falGenerationPathMutants),
  ...de("backend/src/scripts/checkFalApprovalPolicy.ts", falApprovalMutants),
  ...de("backend/src/scripts/checkFalVideoApprovalPolicy.ts", falVideoApprovalMutants),
  ...de("backend/src/scripts/checkFalGastoInstrumentadoPolicy.ts", falGastoInstrumentadoMutants),
  ...de("backend/src/scripts/checkUsageAttributionPolicy.ts", usageAttributionMutants),
  ...de("backend/src/scripts/checkVoiceRotationPolicy.ts", voiceRotationMutants),
  ...de("backend/src/scripts/checkVoiceTuningPolicy.ts", voiceTuningMutants),
  ...de("backend/src/scripts/checkEnsaioSimuladoPolicy.ts", ensaioSimuladoMutants),
  ...de("backend/src/scripts/checkPlatformInheritancePolicy.ts", platformInheritanceMutants),
  ...de("backend/src/scripts/checkGateRunnerPolicy.ts", gateRunnerMutants),
  ...de("backend/src/scripts/checkProviderPricesPolicy.ts", providerPricesMutants),
  ...de("backend/src/scripts/checkRefacoesPolicy.ts", refacoesMutants),
  ...de("backend/src/scripts/checkFalSceneWiringPolicy.ts", falSceneWiringMutants),
  ...de("backend/src/scripts/checkFalFase0DefaultsPolicy.ts", falFase0DefaultsMutants),
  ...de("backend/src/scripts/checkFalTierPolicy.ts", falTierMutants),
  ...de("backend/src/scripts/checkReferenceVideoPhotoOptionalPolicy.ts", referenceVideoPhotoOptionalMutants),
  ...de("backend/src/scripts/checkAvatarSceneDefaultsPolicy.ts", avatarSceneDefaultsMutants),
  ...de("backend/src/scripts/checkAvatarTrainingVendorPolicy.ts", avatarTrainingVendorMutants),
  ...de("backend/src/scripts/checkAvatarPreviewVendorPolicy.ts", avatarPreviewVendorMutants),
  ...de("backend/src/scripts/checkAvatarTabRestorePolicy.ts", avatarTabRestoreMutants),
  ...de("backend/src/scripts/checkScenePerVideoPolicy.ts", scenePerVideoMutants),
  ...de("backend/src/scripts/checkPhotoRemovalPolicy.ts", photoRemovalMutants),
  ...de("backend/src/scripts/checkVirtualBackgroundComparatorPolicy.ts", virtualBackgroundComparatorMutants),
  ...de("backend/src/scripts/checkMutantRegistryPolicy.ts", mutantRegistryMutants),
  ...de("backend/src/scripts/checkScriptFractioningPolicy.ts", scriptFractioningMutants),
  ...de("backend/src/scripts/checkExpressivenessDirectionPolicy.ts", expressivenessDirectionMutants),
  ...de("backend/src/scripts/checkTargetDurationCapPolicy.ts", targetDurationCapMutants),
  ...de("backend/src/scripts/checkRecomposeFeedbackPolicy.ts", recomposeFeedbackMutants),
  ...de("backend/src/scripts/checkFalSpendLedgerPolicy.ts", falSpendLedgerMutants),
  ...de("backend/src/scripts/checkScriptValidationStatusPolicy.ts", scriptValidationStatusMutants),
  ...de("backend/src/scripts/checkAlvoDeDuracaoPolicy.ts", alvoDeDuracaoMutants),
  ...de("backend/src/scripts/checkTrimOvershootPolicy.ts", trimOvershootMutants),
  ...de("backend/src/scripts/checkRecomposeLateralPhotoPolicy.ts", recomposeLateralPhotoMutants),
  ...de("backend/src/scripts/checkWanBlockOrchestrationPolicy.ts", wanBlockOrchestrationMutants),
  ...de("backend/src/scripts/checkColorMatchDefaultPolicy.ts", colorMatchDefaultMutants),
  ...de("backend/src/scripts/checkWanPromptQuoteHeuristicPolicy.ts", wanPromptQuoteHeuristicMutants),
  ...de("backend/src/scripts/checkHeygenVoiceClonePolicy.ts", heygenVoiceCloneMutants),
  ...de("backend/src/scripts/checkHeygenVoiceCloneWiringPolicy.ts", heygenVoiceCloneWiringMutants),
  ...de("backend/src/scripts/checkHeygenCallbackWiringPolicy.ts", heygenCallbackWiringMutants),
  ...de("backend/src/scripts/checkIdempotencyReplayPolicy.ts", idempotencyReplayMutants),
  ...de("backend/src/scripts/checkBackgroundResizePolicy.ts", backgroundResizeMutants),
  ...de("backend/src/scripts/checkAudioMeasuredPolicy.ts", audioMeasuredMutants),
  ...de("backend/src/scripts/checkHeygenWebhookPolicy.ts", heygenWebhookMutants),
  ...de("backend/src/scripts/checkHeygenPayloadPersistencePolicy.ts", heygenPayloadPersistenceMutants),
  ...de("backend/src/scripts/checkAvatarDistanceAndFitPolicy.ts", avatarDistanceAndFitMutants),
  ...de("backend/src/scripts/checkStudioMovieEditPolicy.ts", studioMovieEditMutants),
];