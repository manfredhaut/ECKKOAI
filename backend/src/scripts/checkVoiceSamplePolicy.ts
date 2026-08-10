/**
 * Invariantes da captura de voz e da clonagem.
 *
 * O que dá valor a esta guarda: clonar consome um slot IRREVERSÍVEL na conta
 * do fornecedor, e este produto não tem caminho de exclusão. Toda decisão que
 * barra uma clonagem precisa ser exercitável sem gastar nada — e é isso que
 * este arquivo faz: chama as funções REAIS de política com entradas
 * construídas, sem rede, sem banco e sem consumir slot nenhum.
 *
 * O defeito congelado aqui foi medido nesta conta: a única voz clonada com
 * sucesso do projeto foi treinada com uma amostra de **15,37 s** (ffprobe,
 * bloco 5D). Nada recusou — a tela declarava 30 s como piso e não verificava,
 * o fornecedor aceitou, e o resultado é um clone que fala rápido. O fornecedor
 * NÃO protege contra amostra curta: ele entrega um clone pior e cobra o slot.
 */
import type { Mutant } from "./mutants.js";
import { redactText } from "../services/log/safeLog.js";
import {
  ALLOWED_CLONE_FIELDS,
  CATALOG_LABEL_FIELDS,
  CLONE_SAMPLE_RATE_HZ,
  MAX_SAMPLE_SECONDS,
  MIN_SAMPLE_SECONDS,
  PREMADE_VOICE_CATEGORY,
  countOwnedVoices,
  PROTECTED_VOICE_IDS,
  RECOMMENDED_SAMPLE_SECONDS,
  VOICE_SAMPLE_MAX_BYTES,
  checkSampleDuration,
  checkSampleFormat,
  checkVoiceReplacement,
  checkVoiceSlots,
  sniffAudioFormat,
  voiceIdForLog,
} from "../services/voice/voiceSample.js";
import {
  previewUnavailableMessage,
  voiceNameWithTimestamp,
} from "../services/voice/voicePreview.js";
import { VOICE_SPEED, buildSynthesisBody, supportsSpeed } from "../services/providers/voiceProvider.js";
import {
  CHARS_PER_SECOND,
  SCRIPT_PACING,
  estimateSecondsFromChars,
} from "../services/video/scriptDuration.js";

export interface VoiceSampleCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  // --- G12: a velocidade da fala ------------------------------------------
  {
    guard: "voz: a velocidade da fala é enviada, e é a medida",
    name: "a velocidade some de um dos dois ramos",
    kind: "esperto",
    // O ramo com timestamps responde quase sempre, então o defeito fica
    // dormindo: só aparece quando o fallback entra em ação, e aí a voz sai
    // 18% mais rápida sem que nada no sistema tenha mudado. Intermitente,
    // sem sintoma e sem erro — a pior combinação para diagnosticar.
    file: "backend/src/services/providers/voiceProvider.ts",
    // O `find` acompanha o corpo do FALLBACK, que no bloco TRADUCAO-1 passou a
    // ser montado numa variável para poder ser registrado antes de sair. O
    // texto antigo (`body: JSON.stringify(buildSynthesisBody(text))`) deixou de
    // existir e o mutante voltou ERRO de aplicação — que não é reprovação nem
    // aprovação: é o arnês dizendo que não conseguiu nem plantar o defeito.
    find: `  const corpoFallback = buildSynthesisBody(text);`,
    replace: `  const corpoFallback = { text, model_id: ELEVENLABS_TTS_MODEL };`,
    expect: "não monta o corpo pela mesma função nos dois ramos",
  },
  {
    guard: "voz: a velocidade da fala é enviada, e é a medida",
    name: "a velocidade volta ao padrão do fornecedor",
    kind: "esperto",
    // Nada quebra. A fala fica 18% mais rápida, o vídeo fica MAIS BARATO, e
    // a régua continua coerente consigo mesma. Parece melhoria até alguém
    // ouvir — e foi exatamente esse o som que o operador reprovou em 09/08.
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "export const VOICE_SPEED: number = 0.85;",
    replace: "export const VOICE_SPEED: number = 1.0;",
    expect: "a velocidade da fala deixou de ser a medida",
  },
  {
    guard: "voz: a velocidade da fala é enviada, e é a medida",
    name: "voice_settings vai sem speed",
    kind: "esperto",
    // O corpo continua válido e o campo continua lá — só o subcampo some. E
    // isto é PIOR que não mandar nada: `voice_settings` sobrescreve o que
    // está guardado na voz, então um objeto vazio devolve tudo ao default do
    // fornecedor. O 0.85 salvo no painel deixa de valer.
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "    body.voice_settings = { speed: VOICE_SPEED };",
    replace: "    body.voice_settings = {};",
    expect: "não leva `voice_settings.speed",
  },
  {
    guard: "voz: a velocidade da fala é enviada, e é a medida",
    name: "o campo vai mesmo em modelo que não o suporta",
    kind: "esperto",
    // Cai no pior caso conhecido do projeto: o fornecedor aceita e ignora em
    // silêncio, como `expressiveness` com `avatar_iii`. O sintoma seria uma
    // fala mais rápida que ninguém saberia explicar.
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "  return MODELS_WITH_SPEED.includes(modelId);",
    replace: "  return true;",
    expect: "envia speed para um modelo que não o suporta",
  },
  {
    guard: "voz: a régua conhece a velocidade da fala",
    name: "a régua ignora a velocidade e volta ao ritmo puro",
    kind: "esperto",
    // A estimativa volta a 15 s / 45 un para 194 caracteres, e o fornecedor
    // debita 51. A tela fica coerente consigo mesma e errada contra a
    // carteira — é o defeito 4 renascendo menor, e ele passou semanas
    // invisível da primeira vez.
    file: "backend/src/services/video/scriptDuration.ts",
    find: "  return chars / CHARS_PER_SECOND / VOICE_SPEED;",
    replace: "  return chars / CHARS_PER_SECOND;",
    expect: "a régua deixou de dividir pela velocidade",
  },
  {
    guard: "voz: a régua conhece a velocidade da fala",
    name: "a constante é recalibrada para embutir a velocidade",
    kind: "esperto",
    // O jeito "esperto" de consertar que quebra na próxima mudança: 12,8151 ×
    // 0,85 = 10,893 dá o MESMO resultado hoje, e passa a dar o errado no dia
    // em que a velocidade mudar — sem que ninguém saiba qual dos dois números
    // está errado.
    file: "backend/src/services/video/scriptDuration.ts",
    find: `export const CHARS_PER_SECOND =
  SCRIPT_PACING.measuredChars / SCRIPT_PACING.measuredDeliveredSeconds;`,
    replace: "export const CHARS_PER_SECOND = 10.8928;",
    expect: "o ritmo deixou de ser derivado da medição",
  },
  {
    guard: "voz: a velocidade da fala é enviada, e é a medida",
    name: "não há velocidade nenhuma",
    kind: "obvio",
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "  if (supportsSpeed(modelId)) {\n    body.voice_settings = { speed: VOICE_SPEED };\n  }",
    replace: "",
    expect: "não leva `voice_settings.speed",
  },

  // --- G11: a prévia da voz recém-clonada ---------------------------------
  {
    guard: "voz: a prévia sai da voz que acabou de ser criada",
    name: "a prévia usa o voice_id antigo",
    kind: "esperto",
    // O mutante mais perigoso do lote, e o motivo de a guarda comparar o
    // ARGUMENTO em vez de contar chamadas. Aqui nada quebra: o TTS responde
    // 200, o arquivo é salvo, o player aparece e sai voz. Só que é a voz
    // ANTERIOR — e o operador aprova uma clonagem que nunca ouviu, agora com
    // motivo para confiar. É pior que não ter prévia nenhuma.
    file: "backend/src/routes/voice.ts",
    find: "          previewVoiceId(voiceId),",
    replace: "          previewVoiceId(avatar.voice_id ?? voiceId),",
    expect: "a prévia é sintetizada com",
  },
  {
    guard: "voz: a prévia sai da voz que acabou de ser criada",
    name: "a falha da prévia some do corpo",
    kind: "esperto",
    // A resposta continua bem formada e continua 201. A tela mostra sucesso,
    // sem player e sem explicação — indistinguível de defeito de tela. Quem vê
    // isso clona de novo.
    file: "backend/src/routes/voice.ts",
    find: "        preview_error: previewError,",
    replace: "        preview_error: null,",
    expect: "não devolve mais `preview_error`",
  },
  {
    guard: "voz: o custo do slot é dito DEPOIS, não só antes",
    name: "o aviso de clonar de novo deixa de dizer que a voz antiga fica",
    kind: "esperto",
    // Sutil de propósito: o aviso CONTINUA lá e continua falando em slot. Só
    // deixa de dizer que a voz atual não é apagada — e sem isso "gasta outro
    // slot" se lê como TROCA, que parece indolor. Foi essa leitura que
    // produziu cinco vozes homônimas na conta.
    file: "frontend/src/locales/pt-BR.json",
    find: "\"cloneAgainWarning\": \"Clonar de novo cria uma voz NOVA e gasta outro slot irreversível. A voz atual continua na conta do provedor e não é apagada — este produto não exclui vozes.\"",
    replace: "\"cloneAgainWarning\": \"Clonar de novo cria uma voz nova e gasta outro slot.\"",
    expect: "não diz as duas coisas necessárias",
  },
  {
    guard: "voz: o custo do slot é dito DEPOIS, não só antes",
    name: "o bloco de resultado perde o aviso",
    kind: "obvio",
    file: "frontend/src/pages/CreateVideo/VoiceSampleRecorder.tsx",
    find: "            {t(\"createVideo.voiceSample.result.cloneAgainWarning\")}",
    replace: "            {null}",
    expect: "não usa mais `result.cloneAgainWarning`",
  },
  {
    guard: "voz: a prévia sai da voz que acabou de ser criada",
    name: "não há prévia",
    kind: "obvio",
    file: "backend/src/routes/voice.ts",
    find: "          previewVoiceId(voiceId),",
    replace: "          \"\",",
    expect: "a prévia é sintetizada com",
  },
  {
    guard: "voz: o nome da voz distingue uma clonagem da outra",
    name: "o nome volta a ser só o do avatar",
    kind: "esperto",
    // Nada quebra hoje. O dano aparece na quinta voz homônima, quando alguém
    // precisa apagar uma e não tem como saber qual.
    file: "backend/src/routes/voice.ts",
    find: "          name: voiceNameWithTimestamp(avatar.name, new Date()),",
    replace: "          name: avatar.name,",
    expect: "voltou a clonar sem carimbo no nome",
  },
  {
    guard: "voz: o nome da voz distingue uma clonagem da outra",
    name: "o carimbo perde a hora e vira só a data",
    kind: "esperto",
    // Duas clonagens no mesmo dia — que é exatamente o caso medido, três em
    // vinte minutos — voltam a ser indistinguíveis.
    file: "backend/src/services/voice/voicePreview.ts",
    find: "  const carimbo = `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;",
    replace: "  const carimbo = iso.slice(0, 10);",
    expect: "fora do formato AAAA-MM-DD HH:mm em UTC",
  },

  // --- GUARDA C: a porta da voz protegida ---------------------------------
  {
    guard: "voz: a porta da voz protegida é estreita",
    name: "a porta abre sem digitar nada",
    kind: "esperto",
    // A porta continua na tela, o campo continua aparecendo, o texto continua
    // explicando o que se perde — e o servidor deixa de conferir. Quem opera
    // vê exatamente a mesma coisa que veria com a proteção funcionando.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  return b.length > 0 && a === b;",
    replace: "  return true;",
    expect: "a voz protegida foi substituída sem que o nome do avatar sequer viesse",
  },
  {
    guard: "voz: a porta da voz protegida é estreita",
    name: "a comparação do nome vira prefixo",
    kind: "esperto",
    // A forma mais provável de alguém "facilitar" isto: quatro caracteres
    // passam a bastar. A proteção continua existindo no papel e deixa de
    // proteger na prática, porque digitar "TEST" não é ler o nome do avatar.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  return b.length > 0 && a === b;",
    replace: "  return b.length > 0 && a.length > 0 && b.startsWith(a);",
    expect: "a porta da voz protegida abriu com um PREFIXO do nome",
  },
  // --- GUARDA A: duração mínima -----------------------------------------
  {
    guard: "voz: duração mínima da amostra",
    name: "o piso de 60 s cai para zero",
    kind: "obvio",
    file: "backend/src/services/voice/voiceSample.ts",
    find: "export const MIN_SAMPLE_SECONDS = 60;",
    replace: "export const MIN_SAMPLE_SECONDS = 0;",
    expect: "uma amostra de 10 s foi ACEITA",
  },
  {
    guard: "voz: duração mínima da amostra",
    name: "a recusa vira aviso",
    kind: "esperto",
    // O piso continua declarado em 60, a mensagem continua correta e a faixa
    // de aviso continua existindo. Só o veredito muda: `ok: true` com um texto
    // de alerta. A tela mostraria o aviso, a pessoa clicaria em enviar assim
    // mesmo, e o slot seria consumido por uma amostra de 10 s — que é
    // exatamente o desfecho já medido nesta conta.
    file: "backend/src/services/voice/voiceSample.ts",
    find: `  if (durationSeconds < MIN_SAMPLE_SECONDS) {
    return {
      ok: false,
      code: "sample_too_short",`,
    replace: `  if (durationSeconds < MIN_SAMPLE_SECONDS) {
    return {
      ok: true,
      code: "sample_too_short",`,
    expect: "uma amostra de 10 s foi ACEITA",
  },
  {
    guard: "voz: duração mínima da amostra",
    name: "amostra longa continua passando (contraponto)",
    kind: "esperto",
    expectGreen: true,
    // Sem este contraponto, uma política que recusasse TUDO passaria nos dois
    // mutantes acima sem distinguir nada. Aqui a faixa de aviso é empurrada
    // para além de qualquer amostra concebível: a de 120 s continua aceita,
    // então a guarda tem de continuar verde.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "export const RECOMMENDED_SAMPLE_SECONDS = 90;",
    replace: "export const RECOMMENDED_SAMPLE_SECONDS = 91;",
    expect: "voz: amostra de 10 s recusada",
  },

  // --- GUARDA B: slots ---------------------------------------------------
  {
    guard: "voz: slots do fornecedor",
    name: "conta cheia deixa de barrar",
    kind: "obvio",
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  if (input.used >= input.limit) {",
    replace: "  if (false) {",
    expect: "uma conta CHEIA passou pela guarda de slots",
  },
  {
    guard: "voz: slots do fornecedor",
    name: "a contagem volta a somar a biblioteca do fornecedor",
    kind: "esperto",
    // O defeito REAL de 04/08, e o que ele ensina: o teto, a comparação e a
    // mensagem estavam todos certos. O que estava errado era o número que
    // chegava — `GET /v1/voices` devolve as vozes `premade` da biblioteca
    // junto com as da pessoa, e somar o array inteiro deu 25 numa conta de 4.
    // A clonagem foi recusada com "25 de 10 vozes em uso". Nenhum dos dois
    // mutantes vizinhos pega isto: eles mutam a COMPARAÇÃO, e aqui ela nunca
    // chega a ser consultada com o valor certo.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  return voices.filter((v) => v?.category !== PREMADE_VOICE_CATEGORY).length;",
    replace: "  return voices.length;",
    expect: "premade",
  },
  {
    guard: "voz: slots do fornecedor",
    name: "compara com > em vez de >=",
    kind: "esperto",
    // A guarda continua existindo, a mensagem continua certa, e a conta
    // 11/10 continua sendo barrada. Só o caso exato do teto (10/10) passa —
    // que é o único que acontece na prática, porque é onde a conta chega
    // clonando uma voz de cada vez.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  if (input.used >= input.limit) {",
    replace: "  if (input.used > input.limit) {",
    expect: "uma conta CHEIA passou pela guarda de slots",
  },

  // --- GUARDA C: voz protegida ------------------------------------------
  {
    guard: "voz: proteção da voz em uso",
    name: "substituição sem flag passa",
    kind: "obvio",
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  if (!input.replace) {",
    replace: "  if (false) {",
    expect: "substituir uma voz existente SEM a flag foi permitido",
  },
  {
    guard: "voz: proteção da voz em uso",
    name: "a lista de vozes protegidas fica vazia",
    kind: "esperto",
    // A verificação de flag continua intacta — mandar `replace` continua sendo
    // obrigatório. O que morre é a proteção EXTRA da voz aprovada: um clique
    // em "substituir" passa a poder trocar a voz do vídeo `8d28fd47`, que
    // custou um slot e uma geração, por outra qualquer.
    file: "backend/src/services/voice/voiceSample.ts",
    find: `export const PROTECTED_VOICE_IDS: readonly string[] = ["wAd9MJ2IK71FGs1FWjIX"];`,
    replace: "export const PROTECTED_VOICE_IDS: readonly string[] = [];",
    expect: "a voz aprovada foi substituída",
  },
  {
    guard: "voz: proteção da voz em uso",
    name: "o caminho ANTIGO volta a sobrescrever a voz",
    kind: "esperto",
    // O caminho novo continua protegido e todas as asserções de política
    // continuam verdes — mas `POST /avatars/:id/reference-video` volta a
    // trocar a voz aprovada sem perguntar, que é onde o defeito morava.
    // Só a asserção que inspeciona o OUTRO arquivo pega isto.
    file: "backend/src/routes/avatars.ts",
    find: "    if (voiceCredential && !substituicaoDeVoz.ok) {",
    replace: "    if (false) {",
    expect: "não protege mais a voz existente antes de clonar",
  },

  // --- GUARDA D: formato e tamanho ---------------------------------------
  {
    guard: "voz: formato e tamanho da amostra",
    name: "texto renomeado para .mp3 é aceito",
    kind: "obvio",
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  if (format === null || !ALLOWED_AUDIO_FORMATS.includes(format)) {",
    replace: "  if (false) {",
    expect: "um arquivo de TEXTO renomeado passou como áudio",
  },
  {
    guard: "voz: formato e tamanho da amostra",
    name: "confia no tipo declarado em vez dos bytes",
    kind: "esperto",
    // A whitelist continua lá e continua sendo consultada. O que muda é a
    // FONTE: passa a decidir pelo `content-type` que o cliente mandou, que é
    // exatamente o que um rename produz corretamente. Um `.txt` renomeado
    // chega com `audio/mpeg` e passa.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  const format = sniffAudioFormat(input.buffer);",
    replace:
      '  const format = (input.declaredMimeType === "audio/mpeg" ? "mp3" : sniffAudioFormat(input.buffer)) as ReturnType<typeof sniffAudioFormat>;',
    expect: "um arquivo de TEXTO renomeado passou como áudio",
  },
  {
    guard: "voz: formato e tamanho da amostra",
    name: "o teto de 10 MB some",
    kind: "obvio",
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  if (input.buffer.length > maxBytes) {",
    replace: "  if (false) {",
    expect: "uma amostra acima do teto foi aceita",
  },

  // --- ITEM 7: sem rótulos de catálogo -----------------------------------
  {
    guard: "voz: clonagem sem rótulo de catálogo",
    name: "labels de idioma entram no corpo da clonagem",
    kind: "obvio",
    file: "backend/src/services/providers/voiceProvider.ts",
    find: '    form.set("name", input.name);',
    replace:
      '    form.set("name", input.name);\n    form.set("labels", JSON.stringify({ language: "en", accent: "american" }));',
    expect: "envia campo de catálogo",
  },

  // --- GATE DE MODO -------------------------------------------------------
  {
    guard: "voz: clonagem respeita o modo",
    name: "a clonagem deixa de desviar em fixture",
    kind: "obvio",
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "  if (isFixtureMode()) return cloneVoiceFixture();",
    replace: "  // desviado",
    expect: "não desvia para fixture",
  },
  // --- 7a: o evento preserva os ids, e a redação de CHAVE continua firme ---
  {
    guard: "voz: o evento de troca preserva os ids",
    name: "volta a logar o voice_id inteiro",
    kind: "obvio",
    // O id inteiro tem 49 caracteres num `fixture-voice-<uuid>`, casa com o
    // padrão genérico de bloco opaco, e o evento volta a sair com os dois
    // campos como ***REDACTED*** — exatamente o defeito medido no E2E-1.
    file: "backend/src/routes/voice.ts",
    find: "          previousVoiceId: voiceIdForLog(avatar.voice_id),",
    replace: "          previousVoiceId: avatar.voice_id,",
    expect: "o id de voz é redigido dentro do próprio evento",
  },
  {
    guard: "voz: o evento de troca preserva os ids",
    name: "o encurtador devolve o id inteiro",
    kind: "esperto",
    // A rota continua chamando `voiceIdForLog`, o import continua lá, e a
    // superfície inspecionada não muda em nada. Só o encurtamento some — e
    // com ele a proteção contra a redação, sem que nada no call site denuncie.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  return `${voiceId.slice(0, 8)}…`;",
    replace: "  return voiceId;",
    expect: "o id de voz é redigido dentro do próprio evento",
  },
  {
    guard: "voz: o evento de troca preserva os ids",
    name: "a redação de CHAVE é afrouxada para deixar o id passar",
    kind: "esperto",
    // O contraponto que impede o conserto errado: alguém poderia "consertar" o
    // evento afrouxando o padrão genérico do sumidouro. Isso faria o id
    // aparecer — e faria uma CHAVE de fornecedor aparecer junto.
    file: "backend/src/services/log/safeLog.ts",
    find: "  { nome: \"opaco\", re: /\\b[A-Za-z0-9+/_-]{40,}={0,2}\\b/g },",
    replace: "  { nome: \"opaco\", re: /\\b[A-Za-z0-9+/_-]{400,}={0,2}\\b/g },",
    expect: "material opaco longo deixou de ser redigido",
  },
  {
    guard: "voz: clonagem respeita o modo",
    name: "a leitura de inventário deixa de desviar em fixture",
    kind: "esperto",
    // `cloneVoice` continua protegida — o caminho caro está intacto e todas as
    // asserções sobre ele passam. O que escapa é a LEITURA, que em fixture
    // passaria a bater na rede com a credencial do tenant. Não gasta dinheiro,
    // e é justamente por isso que passaria despercebido: quebra a garantia de
    // "zero chamadas a fornecedor" que todo bloco deste projeto afirma.
    file: "backend/src/services/providers/voiceProvider.ts",
    find: "  if (isFixtureMode()) return listVoicesFixture();",
    replace: "  // desviado",
    expect: "não desvia para fixture",
  },
];

/**
 * Arquivo de áudio mínimo, construído em memória.
 *
 * WAV PCM porque é o único contêiner cujo cabeçalho dá para escrever à mão em
 * poucas linhas e continuar sendo um arquivo legítimo — a alternativa seria
 * versionar binários de teste, e a fixture de padding já ensinou o custo
 * disso (exige `docker compose build` a cada mudança, e custou uma execução).
 */
function wavFixture(bytesOfAudio: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytesOfAudio, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(88200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytesOfAudio, 40);
  return Buffer.concat([header, Buffer.alloc(bytesOfAudio)]);
}

export async function checkVoiceSamplePolicy(repoRoot: string): Promise<VoiceSampleCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- GUARDA A: duração --------------------------------------------------
  // Os três pontos que importam, e o terceiro é o contraponto: sem ele, uma
  // política que recusasse tudo passaria como se estivesse protegendo.
  const curta = checkSampleDuration(10);
  if (curta.ok) {
    failures.push(
      "voz: uma amostra de 10 s foi ACEITA. É a duração da ordem da que produziu a única voz clonada " +
        "desta conta (15,37 s), cujo resultado fala rápido e com entonação instável. O fornecedor não " +
        "recusa amostra curta — ele entrega um clone pior e consome o slot, que não volta.",
    );
  } else if (!curta.message?.includes("mínimo")) {
    failures.push(
      `voz: a recusa por amostra curta não diz qual é o mínimo. Recebida: "${curta.message}"`,
    );
  }

  const media = checkSampleDuration(75);
  if (!media.ok) {
    failures.push(
      "voz: uma amostra de 75 s foi RECUSADA. A faixa entre o mínimo e o recomendado é de AVISO, não de " +
        "recusa — nada nesta conta mede a diferença entre 60 e 90 s, e transformar em bloqueio uma faixa " +
        "não medida é inventar precisão.",
    );
  } else if (!media.warning) {
    failures.push(
      "voz: uma amostra de 75 s passou SEM aviso. Entre o mínimo e o recomendado a pessoa precisa saber " +
        "que dá para melhorar, senão a faixa recomendada não existe na prática.",
    );
  }

  const longa = checkSampleDuration(120);
  if (!longa.ok || longa.warning) {
    failures.push(
      `voz: uma amostra de 120 s não passou limpa (ok=${longa.ok}, aviso=${String(longa.warning)}). ` +
        "Uma política que avisa sempre é indistinguível de uma que não avalia nada.",
    );
  }

  const semDuracao = checkSampleDuration(null);
  if (semDuracao.ok) {
    failures.push(
      "voz: uma amostra cuja duração NÃO pôde ser medida foi aceita. Arquivo corrompido tem de falhar " +
        "fechado — aceitar consome o slot antes de alguém descobrir que não havia áudio.",
    );
  }

  // O TETO, do FECHAMENTO-1. Ele não é uma opinião sobre quanto tempo é bom
  // gravar: é o teto de bytes do fornecedor dividido pelo custo por segundo do
  // formato de saída, e recusar por aqui é mais barato porque o ffmpeg nem
  // chega a rodar. A recusa precisa dizer o alvo, pelo mesmo motivo da recusa
  // por tamanho: o único controle que a pessoa tem na mão é falar menos tempo.
  const acimaDoTeto = checkSampleDuration(MAX_SAMPLE_SECONDS + 1);
  if (acimaDoTeto.ok) {
    failures.push(
      `voz: uma amostra de ${MAX_SAMPLE_SECONDS + 1} s foi ACEITA, acima do teto de ` +
        `${MAX_SAMPLE_SECONDS} s. Convertida sem perda ela não cabe nos ` +
        `${(VOICE_SAMPLE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB do fornecedor, e a recusa dele ` +
        "chegaria como um 4xx indistinguível dos outros, com a tentativa já gasta.",
    );
  } else if (!acimaDoTeto.message?.includes("máximo")) {
    failures.push(
      `voz: a recusa por amostra longa não diz qual é o máximo. Recebida: "${acimaDoTeto.message}"`,
    );
  }

  notes.push(
    `voz: amostra de 10 s recusada, 75 s aceita com aviso, 120 s aceita limpa, ` +
      `${MAX_SAMPLE_SECONDS + 1} s recusada por exceder o teto, duração ilegível recusada ` +
      `(mínimo ${MIN_SAMPLE_SECONDS}s, recomendado ${RECOMMENDED_SAMPLE_SECONDS}s, máximo ` +
      `${MAX_SAMPLE_SECONDS}s — derivado de ${CLONE_SAMPLE_RATE_HZ} Hz e do teto de bytes)`,
  );

  // --- GUARDA B: slots ----------------------------------------------------
  const cheia = checkVoiceSlots({ used: 10, limit: 10 });
  if (cheia.ok) {
    failures.push(
      "voz: uma conta CHEIA passou pela guarda de slots. A clonagem seria recusada pelo fornecedor " +
        "DEPOIS de a tentativa já ter sido consumida, e a mensagem que o cliente leria não diria o que fazer.",
    );
  } else if (!cheia.message?.includes("painel")) {
    failures.push(
      "voz: a recusa por slots cheios não diz que a limpeza é no painel do fornecedor. Esta aplicação não " +
        `exclui vozes, então sem essa frase a recusa não tem saída. Recebida: "${cheia.message}"`,
    );
  }

  const acima = checkVoiceSlots({ used: 11, limit: 10 });
  if (acima.ok) {
    failures.push("voz: uma conta ACIMA do teto passou pela guarda de slots.");
  }

  const comFolga = checkVoiceSlots({ used: 3, limit: 10 });
  if (!comFolga.ok) {
    failures.push(
      "voz: uma conta com folga (3 de 10) foi barrada. Uma guarda que barra sempre é desligada na " +
        "primeira semana, e aí não protege mais nada.",
    );
  }

  // A CONTAGEM, e não só a comparação. Foi aqui que a guarda B falhou de
  // verdade em 04/08: o teto e o `>=` estavam certos, e mesmo assim uma
  // clonagem legítima foi recusada — porque o número que chegava já vinha
  // errado. Testar a comparação sem testar a contagem é a mesma classe de
  // defeito do LIVE-2 e do GUARDAS-1: o mecanismo certo, alimentado errado.
  //
  // O inventário abaixo tem a forma da resposta real: a biblioteca `premade`
  // do fornecedor misturada com as vozes da pessoa.
  const inventarioReal = [
    { category: "premade" },
    { category: "premade" },
    { category: "premade" },
    { category: "cloned" },
    { category: "professional" },
    { category: "generated" },
  ];
  const ocupam = countOwnedVoices(inventarioReal);
  if (ocupam !== 3) {
    failures.push(
      `voz: a contagem de slots devolveu ${ocupam} para um inventário com 3 vozes da pessoa e 3 ` +
        `\`premade\` da biblioteca do fornecedor. As \`premade\` não são dela e não ocupam slot — ` +
        "somá-las recusou uma clonagem legítima em 04/08 com \"25 de 10 vozes em uso\", numa conta " +
        "que tinha 4. Guarda que acusa uso legítimo se corrige, não se tolera.",
    );
  }

  // O outro lado: `cloned` sozinho não serve de contagem. Voice design e
  // profissional OCUPAM slot, e contar só clones subestimaria o uso — a guarda
  // falharia ABERTO, recusando tarde, com a tentativa já gasta.
  const soClones = inventarioReal.filter((v) => v.category === "cloned").length;
  if (ocupam <= soClones) {
    failures.push(
      `voz: a contagem de slots (${ocupam}) não é maior que a de clones (${soClones}) num inventário ` +
        "que tem voz profissional e de voice design. Essas ocupam slot: contar só `cloned` " +
        "subestima o uso e faz a guarda falhar ABERTO, que é o oposto do que ela protege.",
    );
  }

  const contaVazia = countOwnedVoices([]);
  if (contaVazia !== 0) {
    failures.push(`voz: inventário vazio contou ${contaVazia} voz(es) em uso.`);
  }

  notes.push(
    `voz: 10/10 e 11/10 barrados, 3/10 liberado — e a recusa diz onde liberar o slot; a contagem ` +
      `ignora \`${PREMADE_VOICE_CATEGORY}\` e soma as ${ocupam} da pessoa (clone, profissional e ` +
      "voice design), sem tocar a rede",
  );

  // --- GUARDA C: substituição e voz protegida -----------------------------
  const semVoz = checkVoiceReplacement({ currentVoiceId: null, replace: false });
  if (!semVoz.ok) {
    failures.push(
      "voz: o PRIMEIRO clone de um avatar sem voz foi barrado. Não há nada a substituir — exigir " +
        "confirmação aqui só ensina a pessoa a confirmar sem ler.",
    );
  }

  const semFlag = checkVoiceReplacement({ currentVoiceId: "voz-qualquer", replace: false });
  if (semFlag.ok) {
    failures.push(
      "voz: substituir uma voz existente SEM a flag foi permitido. O id antigo não é guardado em lugar " +
        "nenhum deste sistema, então a substituição é irreversível do nosso lado.",
    );
  }

  const comFlag = checkVoiceReplacement({ currentVoiceId: "voz-qualquer", replace: true });
  if (!comFlag.ok) {
    failures.push(
      "voz: substituir uma voz comum COM a flag foi barrado. A flag existe justamente para tornar a " +
        "substituição possível de propósito; sem esse caminho, regravar a voz seria impossível.",
    );
  }

  const protegida = checkVoiceReplacement({ currentVoiceId: PROTECTED_VOICE_IDS[0], replace: true });
  if (protegida.ok) {
    failures.push(
      `voz: a voz aprovada foi substituída (${PROTECTED_VOICE_IDS[0]}). É a voz do vídeo 8d28fd47, ` +
        "medido e aprovado em 03/08 — ela custou um slot e uma geração, e trocá-la não pode caber num " +
        "clique de tela de upload.",
    );
  }

  // A PORTA da voz protegida: existe, e é estreita.
  //
  // Antes deste bloco a recusa acima era o fim da linha — uma voz aprovada POR
  // ENGANO ficava presa no avatar para sempre, e a única saída de dentro do
  // produto era abandonar o avatar. A porta é digitar o NOME do avatar, e os
  // quatro vetores abaixo são os quatro jeitos de ela deixar de ser porta:
  // não abrir nunca, abrir com qualquer coisa, abrir por prefixo, ou abrir
  // sem a caixa de confirmação que já existia.
  const AVATAR_PROTEGIDO = "TESTE REAL 15:40 01/08";
  const protegidaBase = {
    currentVoiceId: PROTECTED_VOICE_IDS[0],
    replace: true,
    avatarName: AVATAR_PROTEGIDO,
  };

  const comNome = checkVoiceReplacement({ ...protegidaBase, confirmAvatarName: AVATAR_PROTEGIDO });
  if (!comNome.ok) {
    failures.push(
      "voz: a voz protegida recusou MESMO com o nome do avatar digitado corretamente. Sem porta " +
        "nenhuma, uma voz aprovada por engano fica presa no avatar para sempre e a única saída de " +
        "dentro do produto é abandonar o avatar — que é pior que a substituição que se queria evitar.",
    );
  }

  // Grafia: aparar e ignorar caixa. A fricção pretendida é ter de LER o nome
  // na tela, não acertar acento e maiúscula de "TESTE REAL 15:40 01/08".
  const comNomeFolgado = checkVoiceReplacement({
    ...protegidaBase,
    confirmAvatarName: `  ${AVATAR_PROTEGIDO.toLowerCase()}  `,
  });
  if (!comNomeFolgado.ok) {
    failures.push(
      "voz: a porta da voz protegida exigiu a grafia exata, com caixa e espaços. A fricção que ela " +
        "existe para criar é ter de ler o nome do avatar, não vencer uma charada de digitação.",
    );
  }

  const nomeErrado = checkVoiceReplacement({ ...protegidaBase, confirmAvatarName: "outro avatar" });
  if (nomeErrado.ok) {
    failures.push(
      "voz: a porta da voz protegida abriu com o nome ERRADO. Ela pergunta se a pessoa sabe QUAL " +
        "avatar está mexendo; aceitar qualquer texto responde a pergunta por ela.",
    );
  }

  const nomePrefixo = checkVoiceReplacement({
    ...protegidaBase,
    confirmAvatarName: AVATAR_PROTEGIDO.slice(0, 4),
  });
  if (nomePrefixo.ok) {
    failures.push(
      "voz: a porta da voz protegida abriu com um PREFIXO do nome. Quatro caracteres não são ler o " +
        "nome — e uma comparação por início é a forma mais provável de alguém 'facilitar' isto.",
    );
  }

  const semCaixaMasComNome = checkVoiceReplacement({
    ...protegidaBase,
    replace: false,
    confirmAvatarName: AVATAR_PROTEGIDO,
  });
  if (semCaixaMasComNome.ok) {
    failures.push(
      "voz: o nome digitado sozinho substituiu a voz, sem a confirmação de substituição. São duas " +
        "perguntas diferentes — uma sobre o que se perde, outra sobre qual avatar — e a porta nova " +
        "não pode engolir a barreira que já existia.",
    );
  }

  // Sem o nome do avatar na requisição a porta não abre, e a mensagem diz por
  // quê: não dá para confirmar QUAL avatar está sendo trocado sem saber o nome.
  const semNomeNenhum = checkVoiceReplacement({
    currentVoiceId: PROTECTED_VOICE_IDS[0],
    replace: true,
    confirmAvatarName: "qualquer coisa",
  });
  if (semNomeNenhum.ok) {
    failures.push(
      "voz: a voz protegida foi substituída sem que o nome do avatar sequer viesse na requisição. " +
        "Comparar contra nome vazio faz a porta abrir para qualquer texto.",
    );
  }

  notes.push(
    `voz: primeiro clone livre, substituição exige flag, e ${PROTECTED_VOICE_IDS.length} voz(es) ` +
      "protegida(s) recusam com a flag — a porta é digitar o nome do avatar, e ela não abre com " +
      "nome errado, prefixo, nome ausente nem sem a confirmação",
  );

  // --- GUARDA D: formato e tamanho ----------------------------------------
  // O caso central: bytes de texto, nome e tipo de áudio. É exatamente o que
  // um rename produz, e é indistinguível de um mp3 legítimo para qualquer
  // whitelist que olhe só a string.
  const texto = Buffer.from(
    "Isto e um arquivo de texto qualquer, com bytes que nao formam cabecalho de audio nenhum.",
    "utf-8",
  );
  const disfarcado = checkSampleFormat({ buffer: texto, declaredMimeType: "audio/mpeg" });
  if (disfarcado.ok) {
    failures.push(
      "voz: um arquivo de TEXTO renomeado passou como áudio. O tipo declarado vem do cliente e um rename " +
        "o produz corretamente — só os bytes do começo do arquivo não se falsificam assim.",
    );
  }

  const wavOk = checkSampleFormat({ buffer: wavFixture(2048), declaredMimeType: "audio/wav" });
  if (!wavOk.ok) {
    failures.push(
      `voz: um WAV legítimo foi recusado (${wavOk.code}). Guarda que acusa uso legítimo é abandonada, ` +
        "e este projeto já pagou esse preço três vezes.",
    );
  }

  // Um WEBM legítimo tem de passar: é o que o MediaRecorder do navegador grava
  // por padrão, então recusá-lo tornaria a própria tela de captura inútil.
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
  if (sniffAudioFormat(webm) !== "webm") {
    failures.push(
      "voz: o contêiner WEBM não é reconhecido. É o formato que o MediaRecorder do navegador grava por " +
        "padrão — sem ele, a tela de captura não consegue enviar o arquivo que acabou de gravar.",
    );
  }

  const grande = checkSampleFormat({
    buffer: Buffer.concat([Buffer.from("ID3"), Buffer.alloc(VOICE_SAMPLE_MAX_BYTES + 1)]),
    declaredMimeType: "audio/mpeg",
  });
  if (grande.ok) {
    failures.push(
      `voz: uma amostra acima do teto foi aceita. ${VOICE_SAMPLE_MAX_BYTES} bytes é o limite do ` +
        "FORNECEDOR, e enviar acima disso gasta a banda de quem sobe para receber uma recusa no fim.",
    );
  }

  notes.push(
    `voz: texto disfarçado de mp3 recusado por SNIFF de bytes; wav e webm legítimos aceitos; teto de ` +
      `${(VOICE_SAMPLE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB aplicado`,
  );

  // --- ITEM 7 + GATE DE MODO: inspeção do provider ------------------------
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const rel = "backend/src/services/providers/voiceProvider.ts";
  let source: string;
  try {
    source = await readFile(path.join(repoRoot, rel), "utf-8");
  } catch {
    failures.push(`voz: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
    return { failures, notes };
  }
  // Comentários fora ANTES de procurar: este arquivo explica por extenso por
  // que NÃO manda labels, e a palavra "labels" aparece várias vezes nessa
  // explicação. Guarda satisfeita — ou acusada — pelo próprio texto que a
  // descreve já aconteceu cinco vezes neste projeto.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  // Recorte da FUNÇÃO de clonagem, por chaves balanceadas: procurar no arquivo
  // inteiro faria a asserção passar a olhar também a síntese, que é outro
  // contrato — e um `labels` legítimo lá acusaria a clonagem por engano.
  const inicio = code.indexOf("export async function cloneVoice");
  let corpoClone = "";
  if (inicio === -1) {
    failures.push(`voz: não encontrei cloneVoice() em ${rel} — a inspeção ficaria cega.`);
  } else {
    let profundidade = 0;
    let vi = false;
    for (let i = code.indexOf("{", inicio); i < code.length; i += 1) {
      if (code[i] === "{") {
        profundidade += 1;
        vi = true;
      } else if (code[i] === "}") {
        profundidade -= 1;
      }
      if (vi && profundidade === 0) {
        corpoClone = code.slice(inicio, i + 1);
        break;
      }
    }
  }

  for (const campo of CATALOG_LABEL_FIELDS) {
    const usa = new RegExp(`form\\.(set|append)\\(\\s*["'\`]${campo}["'\`]`);
    if (usa.test(corpoClone)) {
      failures.push(
        `voz: a clonagem envia campo de catálogo "${campo}". Rótulos de idioma, sotaque, idade e gênero ` +
          "são metadados de biblioteca e NÃO afetam a síntese — o clone reproduz o que estiver no áudio. " +
          "Um rótulo errado é pior que rótulo nenhum, porque cria uma explicação falsa e plausível para " +
          "um defeito real de pronúncia, e manda a investigação para o lugar errado.",
      );
    }
  }

  // O outro lado da mesma asserção: os campos permitidos continuam sendo
  // enviados. Sem isto, apagar `form.set("files", ...)` deixaria a guarda
  // verde — clonagem sem áudio, mas sem rótulo nenhum.
  for (const campo of ALLOWED_CLONE_FIELDS) {
    const usa = new RegExp(`form\\.(set|append)\\(\\s*["'\`]${campo}["'\`]`);
    if (!usa.test(corpoClone)) {
      failures.push(
        `voz: a clonagem não envia mais o campo obrigatório "${campo}". Uma guarda que só proíbe campos ` +
          "aprova o corpo vazio.",
      );
    }
  }

  notes.push(
    `voz: clonagem envia ${ALLOWED_CLONE_FIELDS.join(" + ")} e nenhum dos ${CATALOG_LABEL_FIELDS.length} ` +
      "campos de catálogo (idioma, sotaque, idade, gênero…)",
  );

  // Gate de modo, ancorado no USO — `if (isFixtureMode()) return X` — e não na
  // menção: `isFixtureMode()` aparece em comentário neste arquivo, e casar o
  // nome solto daria uma guarda que passa sem inspecionar nada.
  const alvosDeModo = [
    { fn: "cloneVoice", desvio: "cloneVoiceFixture" },
    { fn: "listVoices", desvio: "listVoicesFixture" },
  ];
  for (const alvo of alvosDeModo) {
    const desvia = new RegExp(`if\\s*\\(\\s*isFixtureMode\\(\\)\\s*\\)\\s*return\\s+${alvo.desvio}\\(`);
    if (!desvia.test(code)) {
      failures.push(
        `voz: ${alvo.fn}() não desvia para fixture — falta \`if (isFixtureMode()) return ${alvo.desvio}()\`. ` +
          "Clonagem consome um slot irreversível e a leitura de inventário fala com o fornecedor: as duas " +
          "quebram a garantia de zero chamadas que todo bloco deste projeto afirma.",
      );
    }
  }

  notes.push(`voz: ${alvosDeModo.length} caminho(s) de voz desviando para fixture antes da rede`);

  // --- GUARDA C no caminho ANTIGO ----------------------------------------
  // A asserção que separa "o caminho novo é seguro" de "nenhum caminho
  // substitui sem flag". Sem ela, `POST /avatars/:id/reference-video` volta a
  // trocar a voz aprovada sem perguntar, e toda a política acima continua
  // verde — porque ela nunca é consultada por aquela rota.
  const relAvatars = "backend/src/routes/avatars.ts";
  let avatarsSource: string;
  try {
    avatarsSource = await readFile(path.join(repoRoot, relAvatars), "utf-8");
  } catch {
    failures.push(`voz: não consegui ler ${relAvatars} — verificador cego é pior que reprovar.`);
    return { failures, notes };
  }
  const avatarsCode = avatarsSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  if (!/checkVoiceReplacement\(\{/.test(avatarsCode)) {
    failures.push(
      `voz: ${relAvatars} não protege mais a voz existente antes de clonar. Aquela rota faz ` +
        "`UPDATE avatars SET voice_id` e era o caminho em que enviar um vídeo de referência de novo " +
        "trocava a voz aprovada sem perguntar — o id antigo não fica guardado em lugar nenhum.",
    );
  }
  if (!/voiceCredential\s*&&\s*!substituicaoDeVoz\.ok/.test(avatarsCode)) {
    failures.push(
      `voz: ${relAvatars} não protege mais a voz existente antes de clonar — o veredito é calculado e ` +
        "não é consultado. Calcular sem usar é a forma mais silenciosa de guarda inerte.",
    );
  }

  notes.push("voz: o caminho antigo (reference-video) pula a clonagem quando já existe voz, em vez de sobrescrever");

  // --- A porta chega até a TELA -------------------------------------------
  //
  // A porta pode estar perfeita no serviço e não existir para quem opera. Foi
  // esse o estado até aqui: a recusa era definitiva porque a tela não tinha
  // como oferecer saída nenhuma — e um caminho que só existe no `curl` não é
  // saída de produto.
  const relVoice = "backend/src/routes/voice.ts";
  const relTela = "frontend/src/pages/CreateVideo/VoiceSampleRecorder.tsx";
  for (const [rel, exigido, oQueE] of [
    [relVoice, "requiresAvatarName", "a rota não diz à tela que a porta existe"],
    [relVoice, "confirmAvatarName", "a rota não repassa o nome digitado ao veredito"],
    [relTela, "confirm_avatar_name", "a tela não envia o nome digitado"],
    [relTela, "requiresAvatarName", "a tela não lê do CORPO do 409 qual saída oferecer"],
  ] as const) {
    let fonte: string;
    try {
      fonte = await readFile(path.join(repoRoot, rel), "utf-8");
    } catch {
      failures.push(`voz: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      continue;
    }
    if (!fonte.includes(exigido)) {
      failures.push(
        `voz: ${oQueE} — \`${exigido}\` sumiu de ${rel}. A porta da voz protegida pode estar inteira ` +
          "no serviço e não existir para quem opera, que era o estado anterior: a recusa virava " +
          "definitiva por falta de tela, e a voz aprovada por engano ficava presa para sempre.",
      );
    }
  }

  // A decisão de fluxo NÃO pode voltar a ser lida da prosa. A tela escolhia
  // que saída oferecer com `/substitui/i` e `/protegida/i` sobre a mensagem em
  // português — melhorar a redação quebrava o fluxo sem nada acusar.
  try {
    const tela = await readFile(path.join(repoRoot, relTela), "utf-8");
    if (/\/(substitui|protegida)\/i\.test\(\s*err\.message/.test(tela)) {
      failures.push(
        `voz: ${relTela} voltou a decidir a saída lendo a MENSAGEM de erro por regex. A resposta traz ` +
          "`replaceable` e `requiresAvatarName` justamente para isso; decidir por prosa quebra na " +
          "primeira vez que alguém melhora a frase, e quebra em silêncio.",
      );
    }
  } catch {
    /* a leitura acima já reportou */
  }

  for (const idioma of ["pt-BR", "en"]) {
    const arquivo = `frontend/src/locales/${idioma}.json`;
    try {
      const dict = JSON.parse(await readFile(path.join(repoRoot, arquivo), "utf-8")) as Record<string, any>;
      const vs = dict?.createVideo?.voiceSample ?? {};
      for (const chave of ["protectedExplain", "protectedInputLabel"]) {
        if (typeof vs[chave] !== "string" || !vs[chave]) {
          failures.push(
            `voz: \`createVideo.voiceSample.${chave}\` não existe em ${idioma}.json. A tela mostraria ` +
              "o nome da chave onde deveria explicar o que se perde ao substituir a voz protegida.",
          );
        }
      }
    } catch {
      failures.push(`voz: não consegui ler ${arquivo}.`);
    }
  }

  notes.push(
    "voz: a porta da voz protegida chega à tela — a rota anuncia `requiresAvatarName`, a tela envia " +
      "`confirm_avatar_name`, e a escolha da saída vem do corpo do 409, não da prosa",
  );

  // --- 7a: o evento de troca preserva os ids, e a redação segue firme -----
  //
  // Duas asserções que puxam em direções OPOSTAS de propósito. Uma sozinha
  // seria satisfeita pelo conserto errado: afrouxar o padrão genérico do
  // sumidouro faria o id aparecer no evento — e faria uma chave de fornecedor
  // aparecer junto, que é o oposto do que o LOG-1 existe para garantir.
  const idFixture = "fixture-voice-f1f29a46-01f0-4b83-bd5f-3114e5093ccd";
  const idReal = "wAd9MJ2IK71FGs1FWjIX";

  for (const [rotulo, id] of [
    ["fixture", idFixture],
    ["real", idReal],
  ] as const) {
    const curto = voiceIdForLog(id);
    if (curto === null) {
      failures.push(`voz: voiceIdForLog devolveu null para um id ${rotulo} não vazio.`);
      continue;
    }
    if (redactText(curto) !== curto) {
      failures.push(
        `voz: o id de voz é redigido dentro do próprio evento (${rotulo}). ` +
          `"${curto}" saiu como "${redactText(curto)}". O evento voice_id_replaced existe para ` +
          "preservar o id ANTIGO no instante em que ele é sobrescrito — a coluna guarda um valor " +
          "só, e o id antigo não fica em lugar nenhum deste sistema. Redigido, o evento não serve " +
          "para nada.",
      );
    }
    if (!id.startsWith(curto.replace("…", ""))) {
      failures.push(`voz: o id encurtado (${rotulo}) não é prefixo do original — não identifica nada.`);
    }
  }

  // O contraponto: a redação de material opaco longo CONTINUA ativa. Se
  // alguém "consertar" o evento afrouxando o sumidouro, esta asserção quebra.
  const chaveFalsa = "sk-" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0";
  if (redactText(chaveFalsa) === chaveFalsa) {
    failures.push(
      "voz: material opaco longo deixou de ser redigido. Encurtar o id de voz é o conserto certo; " +
        "afrouxar a redação para deixá-lo passar faria uma CHAVE de fornecedor passar junto.",
    );
  }
  const opacoLongo = "Zm9vYmFyYmF6cXV4Y29ycmdlZ3JhdWx0aGVsbG93b3JsZGFiY2RlZmc";
  if (redactText(opacoLongo) === opacoLongo) {
    failures.push(
      "voz: material opaco longo deixou de ser redigido (padrão genérico). É ele que pega chave de " +
        "formato desconhecido — o caso `AQ.` deste projeto começou assim.",
    );
  }

  // E — o que faltava, flagrado pelo arnês — QUEM CHAMA. As asserções acima
  // exercitam `voiceIdForLog` e `redactText` diretamente, e por isso passavam
  // verdes com a rota logando `avatar.voice_id` inteiro: o mecanismo continuava
  // perfeito e o sistema, desprotegido. É a mesma classe de defeito do LIVE-2
  // (helper correto, chamador descoberto) e do GUARDAS-1 (teto testado sem quem
  // o consome). Testar o mecanismo não é testar quem o usa.
  const relVoiceRoute = "backend/src/routes/voice.ts";
  let rotaSource: string;
  try {
    rotaSource = await readFile(path.join(repoRoot, relVoiceRoute), "utf-8");
  } catch {
    failures.push(`voz: não consegui ler ${relVoiceRoute} — verificador cego é pior que reprovar.`);
    return { failures, notes };
  }
  const rotaCode = rotaSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const eventoIdx = rotaCode.indexOf('"voice_id_replaced"');
  if (eventoIdx === -1) {
    failures.push(
      `voz: ${relVoiceRoute} não emite mais o evento voice_id_replaced. Ele é o único registro do id ` +
        "ANTIGO — a coluna guarda um valor só, e depois do UPDATE ele não existe em lugar nenhum.",
    );
  } else {
    const bloco = rotaCode.slice(eventoIdx, eventoIdx + 400);
    for (const campo of ["previousVoiceId", "newVoiceId"]) {
      const usaEncurtador = new RegExp(`${campo}:\\s*voiceIdForLog\\(`).test(bloco);
      if (!usaEncurtador) {
        failures.push(
          `voz: o id de voz é redigido dentro do próprio evento — ${relVoiceRoute} passa \`${campo}\` ` +
            "sem voiceIdForLog(). O id inteiro casa com o padrão genérico de bloco opaco do sumidouro " +
            "e sai como ***REDACTED***, apagando exatamente o que o evento existe para preservar.",
        );
      }
    }
  }

  notes.push(
    `voz: id de troca encurtado (${voiceIdForLog(idFixture)}) atravessa o sumidouro intacto, a ROTA ` +
      "usa o encurtador nos dois campos, e material opaco longo continua sendo redigido",
  );

  // --- 7b: o texto de duração DERIVA da política, não de números fixos ----
  const relRecorder = "frontend/src/pages/CreateVideo/VoiceSampleRecorder.tsx";
  let recorderSource: string;
  try {
    recorderSource = await readFile(path.join(repoRoot, relRecorder), "utf-8");
  } catch {
    failures.push(`voz: não consegui ler ${relRecorder} — verificador cego é pior que reprovar.`);
    return { failures, notes };
  }
  const recorderCode = recorderSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  // Fallback numérico é o defeito: com a política fora do ar, a tela
  // afirmaria com confiança um número que não veio de lugar nenhum — e foi
  // assim que "1:00 a 1:30" virou uma faixa fechada que a política não tem.
  const fallbackFixo = /policy\?\.(min_seconds|recommended_seconds)\s*\?\?\s*\d/.test(recorderCode);
  if (fallbackFixo) {
    failures.push(
      `voz: ${relRecorder} volta a ter número de duração FIXO como retaguarda da política. ` +
        "Sem política, a tela não pode afirmar limite nenhum — afirmar um número que não veio do " +
        "servidor é como o texto passou a prometer uma faixa fechada que a política não tem.",
    );
  }

  // E o texto tem de INTERPOLAR, não citar. Um `hint` sem placeholder é
  // literal por definição.
  for (const loc of ["pt-BR", "en"]) {
    const relLoc = `frontend/src/locales/${loc}.json`;
    let dicionario: any;
    try {
      dicionario = JSON.parse(await readFile(path.join(repoRoot, relLoc), "utf-8"));
    } catch {
      failures.push(`voz: não consegui ler ${relLoc}.`);
      continue;
    }
    const hint: string = dicionario?.createVideo?.voiceSample?.hint ?? "";
    if (!hint.includes("{{min}}") || !hint.includes("{{recommended}}")) {
      failures.push(
        `voz: o texto de duração em ${relLoc} voltou a ser LITERAL — não interpola {{min}} e ` +
          `{{recommended}} da política. Recebido: "${hint}"`,
      );
    }
    if (/\b\d+:\d{2}\b/.test(hint)) {
      failures.push(
        `voz: o texto de duração em ${relLoc} traz um horário fixo ("${hint}"). Ele tem de vir da ` +
          "política; um número escrito à mão diverge dela na primeira mudança e ninguém percebe.",
      );
    }
  }

  notes.push("voz: o texto de duração interpola min/recommended da política, sem número fixo nem fallback");

  // --- G11: a PRÉVIA da voz recém-clonada ---------------------------------
  //
  // O defeito medido: três slots irreversíveis gastos em 09/08 no mesmo
  // avatar, um a cada nove minutos, porque a tela pedia uma decisão sem volta
  // e não mostrava o resultado. A prévia fecha isso — mas ela tem um modo de
  // falhar que NÃO produz sintoma nenhum, e é esse que esta seção existe para
  // pegar.
  //
  // 1) O ID. Sintetizar com `avatar.voice_id` em vez do id recém-clonado
  //    devolve 200, áudio e player. Tudo funciona; só que é a voz ANTIGA, e o
  //    operador aprova uma clonagem que nunca ouviu — pior que não ter prévia,
  //    porque agora ele tem motivo para confiar. Verificar que "houve chamada
  //    ao TTS" não pega isto: a chamada acontece nos dois casos. A asserção
  //    precisa comparar o argumento com o identificador que RECEBE o resultado
  //    de cloneVoice, e é o que ela faz abaixo.
  const previewIdx = rotaCode.indexOf("previewVoiceId(");
  if (previewIdx === -1) {
    failures.push(
      `voz: ${relVoiceRoute} não chama mais previewVoiceId(). Sem prévia, a tela volta a pedir uma ` +
        "decisão irreversível sem mostrar o resultado — o defeito que gastou três slots em 09/08.",
    );
  } else {
    // De qual variável a clonagem devolve o id. Lido do próprio arquivo em vez
    // de assumido: se alguém renomear a variável, a comparação seguinte tem de
    // acompanhar, e não reprovar por engano.
    const clone = /\(\{\s*voiceId\s*\}\s*=\s*await\s+cloneVoice\(/.test(rotaCode);
    if (!clone) {
      failures.push(
        `voz: não achei em ${relVoiceRoute} a desestruturação \`({ voiceId } = await cloneVoice(\`. ` +
          "Sem ela não dá para afirmar QUAL id a prévia recebe, e um verificador cego é pior que reprovar.",
      );
    }
    const arg = rotaCode.slice(previewIdx + "previewVoiceId(".length).match(/^([^)]*)\)/);
    const argumento = arg ? arg[1].trim() : "";
    if (argumento !== "voiceId") {
      failures.push(
        `voz: a prévia é sintetizada com \`${argumento}\`, e não com o id que cloneVoice acabou de ` +
          "devolver (`voiceId`). Se for `avatar.voice_id`, é o id ANTIGO: a chamada responde 200, o " +
          "player toca e sai voz — a voz ERRADA, aprovada como se fosse a nova. Este defeito não tem " +
          "sintoma; só a comparação do argumento o pega.",
      );
    }
  }

  // 2) A FALHA NÃO PODE SER SILENCIOSA. O slot já foi gasto quando a prévia
  //    roda: uma prévia que falha sem dizer nada produz tela de sucesso sem
  //    player, indistinguível de defeito — e o reflexo de quem vê isso é
  //    clonar de novo, que gasta outro slot.
  if (!/preview_error:\s*previewError/.test(rotaCode)) {
    failures.push(
      `voz: ${relVoiceRoute} não devolve mais \`preview_error\` com o motivo. A resposta continua 201 ` +
        "e a tela mostra sucesso sem player e sem explicação — o pior desfecho, porque convida a " +
        "clonar de novo para 'ver se agora vai'.",
    );
  }
  if (!/preview:\s*null/.test(previewUnavailableMessage("x")) && previewUnavailableMessage("x").length < 40) {
    failures.push("voz: a mensagem de prévia indisponível ficou curta demais para dizer o que se perdeu.");
  }
  for (const exigido of ["slot", "Clonar de novo"]) {
    if (!previewUnavailableMessage("motivo").includes(exigido)) {
      failures.push(
        `voz: a mensagem de prévia indisponível não menciona "${exigido}". Ela precisa dizer que a voz ` +
          "EXISTE, que o slot foi consumido, e que clonar de novo não conserta a prévia — sem isso o " +
          "operador reclona.",
      );
    }
  }

  // 3) O AVISO DEPOIS. A informação sobre o custo do slot existia só ANTES de
  //    clonar, e é DEPOIS — olhando um resultado morno — que se decide tentar
  //    outra vez. Foi esse o caminho dos três slots.
  for (const chave of ["result.cloneAgainWarning", "result.done", "result.cloneAgain"]) {
    if (!recorderSource.includes(chave)) {
      failures.push(
        `voz: ${relRecorder} não usa mais \`${chave}\`. O bloco de resultado precisa do player, do ` +
          "botão que só fecha e do aviso de que clonar de novo gasta outro slot irreversível.",
      );
    }
  }
  for (const loc of ["pt-BR", "en"] as const) {
    const relLoc = `frontend/src/locales/${loc}.json`;
    let locSource: string;
    try {
      locSource = await readFile(path.join(repoRoot, relLoc), "utf-8");
    } catch {
      failures.push(`voz: não consegui ler ${relLoc}.`);
      continue;
    }
    const dict = JSON.parse(locSource) as Record<string, any>;
    const aviso = dict?.createVideo?.voiceSample?.result?.cloneAgainWarning ?? "";
    if (typeof aviso !== "string" || aviso.trim().length === 0) {
      failures.push(`voz: ${relLoc} não tem o aviso de que clonar de novo gasta outro slot.`);
      continue;
    }
    // O aviso precisa dizer que a voz atual NÃO é apagada. Sem isso, "gasta
    // outro slot" pode ser lido como troca — e trocar seria indolor.
    const dizIrreversivel = /irrevers|irrevers[íi]vel/i.test(aviso);
    const dizQueNaoApaga = /não é apagada|not deleted|does not delete|não exclui/i.test(aviso);
    if (!dizIrreversivel || !dizQueNaoApaga) {
      failures.push(
        `voz: o aviso de "clonar de novo" em ${relLoc} não diz as duas coisas necessárias — que o slot ` +
          "é irreversível E que a voz atual continua na conta. Sem a segunda, a pessoa lê 'troca' e " +
          "troca parece indolor.",
      );
    }
  }

  // 4) O NOME com carimbo — cinco vozes homônimas foram o que tornou a limpeza
  //    manual arriscada. Exercitado de verdade, não só procurado no texto.
  const carimbado = voiceNameWithTimestamp("Avatar X", new Date("2026-08-09T08:22:02Z"));
  if (carimbado !== "Avatar X · 2026-08-09 08:22") {
    failures.push(`voz: o nome carimbado saiu como "${carimbado}", fora do formato AAAA-MM-DD HH:mm em UTC.`);
  }
  if (voiceNameWithTimestamp("A".repeat(200), new Date()).length > 90) {
    failures.push(
      "voz: o nome carimbado passa de 90 caracteres com avatar de nome longo. O teto do fornecedor não " +
        "é conhecido, e descobri-lo com uma recusa custaria o slot já consumido.",
    );
  }
  if (!/name:\s*voiceNameWithTimestamp\(/.test(rotaCode)) {
    failures.push(
      `voz: ${relVoiceRoute} voltou a clonar sem carimbo no nome. Foi assim que cinco vozes homônimas ` +
        "apareceram na conta, impossíveis de distinguir no painel do fornecedor.",
    );
  }

  notes.push(
    "voz: a prévia é sintetizada com o id RECÉM-CLONADO (comparado com o de cloneVoice), a falha vira " +
      `preview_error sem derrubar o 201, o aviso de slot aparece DEPOIS no resultado, e o nome sai ` +
      `carimbado ("${carimbado}")`,
  );

  // --- G12: a VELOCIDADE DA FALA ------------------------------------------
  //
  // É a velocidade com que o avatar FALA, não a rapidez de produzir o vídeo.
  // 0.85 foi aprovado pelo operador em 09/08; a 1.0 a fala saía rápida demais.
  //
  // O valor existe em DOIS lugares que precisam concordar: o corpo que vai ao
  // fornecedor e a régua que estima o custo. Se divergirem, a tela mostra um
  // preço e a carteira paga outro — e nenhum dos dois lados acusa nada.
  const corpoV2 = buildSynthesisBody("oi", "eleven_multilingual_v2");
  const settingsV2 = corpoV2.voice_settings as { speed?: number } | undefined;
  if (!settingsV2 || settingsV2.speed !== VOICE_SPEED) {
    failures.push(
      `voz: o corpo da síntese não leva \`voice_settings.speed = ${VOICE_SPEED}\` com um modelo que o ` +
        `suporta. Recebi ${JSON.stringify(corpoV2.voice_settings)}. Mandar \`voice_settings\` SEM speed é ` +
        "pior que não mandar nada: ele sobrescreve o que está guardado na voz e devolve tudo ao default " +
        "do fornecedor, jogando fora o 0.85 aprovado.",
    );
  }
  if (VOICE_SPEED !== 0.85) {
    failures.push(
      `voz: a velocidade da fala deixou de ser a medida (${VOICE_SPEED} em vez de 0.85). O 0.85 foi ` +
        "aprovado pelo operador no painel do fornecedor em 09/08, com eleven_multilingual_v2 — a 1.0 a " +
        "fala sai rápida demais. Voltar ao padrão não quebra nada e deixa o vídeo mais barato: parece " +
        "melhoria até alguém ouvir.",
    );
  }
  if (VOICE_SPEED < 0.7 || VOICE_SPEED > 1.2) {
    failures.push(`voz: a velocidade ${VOICE_SPEED} está fora da faixa 0.7–1.2 aceita pelo fornecedor.`);
  }
  // Modelo SEM suporte não pode receber o campo: o fornecedor aceita e ignora
  // em silêncio, que é o pior caso — o mesmo de `expressiveness` com
  // `avatar_iii`.
  const corpoV3 = buildSynthesisBody("oi", "eleven_v3");
  if ("voice_settings" in corpoV3) {
    failures.push(
      "voz: envia speed para um modelo que não o suporta (eleven_v3). O fornecedor aceita e ignora em " +
        "silêncio, e o sintoma seria uma fala mais rápida que ninguém saberia explicar.",
    );
  }
  if (supportsSpeed("eleven_v3")) {
    failures.push("voz: `eleven_v3` foi declarado como suportando speed, e ele não tem o campo.");
  }

  // Os DOIS ramos montam o corpo pela MESMA função. Um corpo montado à mão no
  // fallback só divergiria quando o fallback entrasse — raro e intermitente.
  const provider = await readFile(
    path.join(repoRoot, "backend/src/services/providers/voiceProvider.ts"),
    "utf-8",
  );
  //
  // A âncora conta a MONTAGEM, e não mais a expressão inteira dentro do
  // `body:`. O bloco TRADUCAO-1 passou a guardar o corpo numa variável para
  // poder registrá-lo antes de enviar (`logSynthesisBody`), e a âncora antiga
  // — presa a `body: JSON.stringify(buildSynthesisBody(` — reprovou por essa
  // refatoração, não por defeito. O que precisa continuar verdadeiro é que os
  // dois ramos montem pela MESMA função; onde o resultado é guardado antes de
  // virar JSON é detalhe.
  const chamadas = (provider.match(/=\s*buildSynthesisBody\(text\)/g) ?? []).length;
  if (chamadas !== 2) {
    failures.push(
      `voz: não monta o corpo pela mesma função nos dois ramos de synthesizeSpeech (achei ${chamadas} de 2). ` +
        "O ramo com timestamps responde quase sempre, então um corpo divergente no fallback fica dormindo " +
        "até o dia em que ele entra — e aí a voz muda de ritmo sem nada ter mudado.",
    );
  }

  // E os dois ramos REGISTRAM o que vão mandar. Sem isto, `voice_settings`
  // poderia parar de ir e a única pista seria uma duração diferente — o A7 volta
  // a ser dedução.
  const registros = (provider.match(/logSynthesisBody\(/g) ?? []).length;
  // 3 = a definição da função + as duas chamadas.
  if (registros < 3) {
    failures.push(
      `voz: o corpo enviado ao ElevenLabs deixou de ser registrado nos dois ramos (achei ${registros}, ` +
        "esperado 3 = definição + 2 chamadas). O log de fornecedor grava só a resposta, então sem este " +
        "evento não há como saber se `model_id` e `voice_settings.speed` saíram — e `voice_settings` " +
        "sobrescreve o que está guardado na voz, que é editável no painel do fornecedor sem rastro.",
    );
  }

  // A RÉGUA precisa conhecer a velocidade. Exercitada de verdade, com o caso
  // medido: 194 caracteres são a frase da demo.
  const segundos = estimateSecondsFromChars(194);
  const esperado = 194 / CHARS_PER_SECOND / VOICE_SPEED;
  if (Math.abs(segundos - esperado) > 0.001) {
    failures.push(
      `voz: a régua deixou de dividir pela velocidade — 194 caracteres deram ${segundos.toFixed(3)} s, e a ` +
        `0.85 são ${esperado.toFixed(3)} s. A estimativa volta a 45 unidades onde o fornecedor debita 51: ` +
        "a tela fica coerente consigo mesma e errada contra a carteira, que é o defeito 4 renascendo.",
    );
  }
  // E a constante tem de continuar DERIVADA da medição. Recalibrá-la para
  // embutir a velocidade dá o mesmo número hoje e o errado amanhã.
  const ritmoDerivado =
    SCRIPT_PACING.measuredChars / SCRIPT_PACING.measuredDeliveredSeconds;
  if (Math.abs(CHARS_PER_SECOND - ritmoDerivado) > 1e-9) {
    failures.push(
      `voz: o ritmo deixou de ser derivado da medição (${CHARS_PER_SECOND} contra ${ritmoDerivado}). ` +
        "Embutir a velocidade na constante dá o mesmo resultado hoje e o errado no dia em que a " +
        "velocidade mudar — e ninguém saberia qual dos dois números está errado.",
    );
  }

  notes.push(
    `voz: a fala vai a ${VOICE_SPEED} nos dois ramos pela mesma função, o campo não vai em modelo sem ` +
      `suporte, e a régua divide pela velocidade (194 car → ${segundos.toFixed(3)} s → ` +
      `${Math.trunc(segundos) * 3} un) com o ritmo ainda derivado da medição`,
  );

  return { failures, notes };
}
