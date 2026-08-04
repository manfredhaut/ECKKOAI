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

export interface VoiceSampleCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
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

  notes.push(
    `voz: primeiro clone livre, substituição exige flag, e ${PROTECTED_VOICE_IDS.length} voz(es) ` +
      "protegida(s) recusam mesmo COM a flag",
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

  return { failures, notes };
}
