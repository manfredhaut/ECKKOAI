/**
 * Política da amostra de voz — as quatro guardas da captura, todas PURAS.
 *
 * Este arquivo não faz rede, não toca disco e não fala com o banco. É
 * deliberado: clonagem consome um slot IRREVERSÍVEL da conta do fornecedor
 * (não existe caminho de exclusão neste produto — ver LACUNA_SEM_EXCLUSAO
 * abaixo), então as decisões que barram uma clonagem precisam ser
 * exercitáveis por uma guarda sem que nada seja gasto para prová-las.
 *
 * A ordem em que a rota aplica estas verificações importa e está escrita em
 * `routes/voice.ts`: as baratas primeiro, a que faz rede por último.
 */

/**
 * GUARDA A — duração mínima da amostra.
 *
 * 60 s é PISO, não recomendação. O motivo está medido nesta conta: a única voz
 * clonada com sucesso deste projeto (`wAd9MJ2IK71FGs1FWjIX`, o avatar "Mário")
 * foi treinada com uma amostra de **15,37 s** — ffprobe no wav de referência,
 * bloco 5D — e o resultado é um clone que fala rápido e com prosódia instável.
 * A tela da época declarava 30 s como piso e não impedia nada: o arquivo curto
 * passou, o fornecedor aceitou, e o defeito só apareceu ao ouvir.
 *
 * É a forma de defeito mais cara deste caminho, porque o fornecedor NÃO recusa
 * amostra curta — ele entrega um clone pior, cobra o slot, e o slot não volta.
 * Recusar aqui custa zero; descobrir depois custa um slot mais o tempo de
 * regravar.
 *
 * Entre 60 e 90 s a amostra é aceita COM AVISO, e não recusada: a orientação
 * publicada do fornecedor coloca a faixa boa em 1–2 minutos, mas nada nesta
 * conta mede a diferença entre 60 e 90 s. Transformar em recusa uma faixa que
 * não medimos seria inventar precisão — o aviso diz o que se sabe e deixa a
 * escolha com quem gravou.
 */
export const MIN_SAMPLE_SECONDS = 60;
export const RECOMMENDED_SAMPLE_SECONDS = 90;

/**
 * GUARDA D — teto de tamanho.
 *
 * 10 MB é o limite do FORNECEDOR, não uma escolha nossa: é o que a tela de
 * upload dele declara. Está aqui como constante única para que nenhuma outra
 * camada invente um segundo número — a divergência entre dois tetos só
 * apareceria com o arquivo já enviado, no 413.
 *
 * NOTA de folga, para quem for mexer: a rota transcodifica a amostra para mp3
 * mono 128 kbps antes de enviar (`normalizeVoiceSample`), e nesse formato 120 s
 * ocupam ~1,9 MB. Ou seja, o teto que morde na prática é o do arquivo QUE
 * CHEGA — um WAV de 2 minutos tem ~10,6 MB e é recusado aqui, mesmo cabendo
 * folgado depois de convertido. Mantido assim de propósito: o teto declarado é
 * o do fornecedor, e afrouxá-lo com base na conversão faria a recusa depender
 * de um passo que ainda não aconteceu.
 */
export const VOICE_SAMPLE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * GUARDA C — vozes que nenhum caminho substitui sem flag explícita.
 *
 * `wAd9MJ2IK71FGs1FWjIX` é a voz do vídeo `8d28fd47`, a passada live de 15 s
 * medida em 03/08 e aprovada. Ela custou um slot, custou a geração, e é o
 * ativo que a apresentação usa.
 *
 * O caminho antigo (`POST /avatars/:id/reference-video`) faz
 * `UPDATE avatars SET voice_id = ...` incondicional: enviar um vídeo de
 * referência de novo troca a voz aprovada por outra, sem perguntar e sem
 * possibilidade de voltar — o id antigo não é guardado em lugar nenhum.
 *
 * A proteção é por VALOR e não por avatar de propósito: se a voz for repontada
 * para outro avatar amanhã, a proteção viaja junto com ela. Proteger "o avatar
 * do Mário" deixaria de proteger no dia em que o id mudasse de dono, que é
 * justamente quando a confusão é maior.
 */
export const PROTECTED_VOICE_IDS: readonly string[] = ["wAd9MJ2IK71FGs1FWjIX"];

/**
 * GUARDA B — slots de voz da conta.
 *
 * O teto REAL não é legível com a chave em uso: `GET /v1/user/subscription`,
 * que traria `voice_limit`, responde **401** por falta da permissão
 * `user_read` (medido no LIVE-3). Então o teto entra por ambiente, com um
 * default declarado — e o número de vozes USADAS é sempre lido do fornecedor,
 * nunca suposto.
 *
 * A assimetria é intencional: o lado que pode ser medido é medido, e só o que
 * não pode é declarado. Um teto declarado alto demais falha aberto (o
 * fornecedor recusa e nós perdemos uma tentativa); baixo demais falha fechado
 * (recusamos antes de tentar). Falhar fechado é preferível quando o recurso
 * protegido é irreversível.
 */
export const DEFAULT_VOICE_SLOT_LIMIT = 10;

export function voiceSlotLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.ELEVENLABS_VOICE_SLOTS;
  if (!raw) return DEFAULT_VOICE_SLOT_LIMIT;
  const value = Number(raw);
  // Valor inválido cai no default em vez de virar NaN — `used >= NaN` é sempre
  // falso, o que desligaria a guarda em silêncio. Mesmo raciocínio de
  // uploadLimits.ts e do limiter de login.
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_VOICE_SLOT_LIMIT;
}

/**
 * LACUNA REGISTRADA, e ela é a razão de a GUARDA B existir.
 *
 * Esta aplicação NÃO tem caminho de exclusão de voz. Não há rota, botão nem
 * script que chame `DELETE /v1/voices/{voice_id}`; `grep` por esse endpoint no
 * repositório inteiro devolve zero. Consequência prática: cada clonagem
 * consome um slot que só pode ser liberado pelo painel web do fornecedor, por
 * uma pessoa, fora deste sistema.
 *
 * Por isso a guarda de slots recusa ANTES de chamar `/v1/voices/add` em vez de
 * deixar o fornecedor recusar: a recusa dele é indistinguível de outros 4xx na
 * nossa camada, e a mensagem que o cliente leria não diria o que fazer. Aqui
 * ela diz — inclusive que a limpeza é no painel, porque não temos como fazê-la.
 */
export const LACUNA_SEM_EXCLUSAO =
  "Este aplicativo não exclui vozes: não existe chamada a DELETE /v1/voices/{voice_id} em nenhum caminho. " +
  "Liberar um slot exige entrar no painel do ElevenLabs.";

/**
 * ITEM 7 — a clonagem NÃO envia rótulos de catálogo.
 *
 * `labels` (idioma, sotaque, idade, gênero, "use case") são metadados de
 * CATÁLOGO: servem para filtrar vozes na biblioteca do fornecedor, e não
 * entram na síntese. O clone reproduz o que estiver no áudio — se a amostra é
 * em português com sotaque paulista, é isso que sai, tenha ou não um label
 * dizendo "english".
 *
 * Por que isto é uma guarda e não uma omissão: um label errado é PIOR que
 * nenhum, porque cria uma explicação falsa e plausível para um defeito real.
 * Se a voz clonada sair com pronúncia estranha, um `labels: {language: "en"}`
 * no corpo faz qualquer pessoa concluir "está marcada como inglês, é por isso"
 * — e o tempo vai para o lugar errado, enquanto a causa verdadeira (o
 * `model_id` da síntese, ou o próprio áudio) continua intocada.
 *
 * O lugar onde idioma DE FATO importa é a síntese, e lá ele está registrado
 * como lacuna aberta: o corpo de `/v1/text-to-speech` não manda
 * `language_code` (auditoria de 03/08).
 */
export const CATALOG_LABEL_FIELDS: readonly string[] = [
  "labels",
  "language",
  "accent",
  "age",
  "gender",
  "use_case",
  "description",
];

/** Campos que a clonagem PODE enviar. Qualquer outro é violação. */
export const ALLOWED_CLONE_FIELDS: readonly string[] = ["name", "files"];

// --------------------------------------------------------------------------
// Detecção de formato — por BYTES, nunca pelo que o cliente declarou
// --------------------------------------------------------------------------

/**
 * O `mimetype` e a extensão vêm do cliente e são falsificáveis: renomear
 * `notas.txt` para `voz.mp3` produz um multipart perfeitamente bem formado,
 * com `content-type: audio/mpeg`, que uma whitelist de string aceita sem
 * piscar. O que não se falsifica com um rename é o começo do arquivo.
 *
 * Por isso a whitelist é de FORMATO DETECTADO, e a checagem é sobre os bytes.
 * O tipo declarado é usado só para a mensagem de erro.
 */
export type AudioFormat = "mp3" | "wav" | "ogg" | "webm" | "m4a" | "flac";

export const ALLOWED_AUDIO_FORMATS: readonly AudioFormat[] = [
  "mp3",
  "wav",
  "ogg",
  "webm",
  "m4a",
  "flac",
];

function bytesAre(buffer: Buffer, offset: number, ascii: string): boolean {
  if (buffer.length < offset + ascii.length) return false;
  return buffer.toString("latin1", offset, offset + ascii.length) === ascii;
}

/**
 * Devolve o formato detectado, ou `null` quando os bytes não correspondem a
 * nenhum contêiner de áudio conhecido.
 *
 * `webm` está na lista porque é o que o `MediaRecorder` do navegador grava por
 * padrão (webm/opus) — sem ele, a tela de captura deste bloco não conseguiria
 * enviar o próprio arquivo que acabou de gravar.
 */
export function sniffAudioFormat(buffer: Buffer): AudioFormat | null {
  if (buffer.length < 12) return null;

  // ID3v2 (mp3 com tags) ou frame sync MPEG (0xFF seguido de 0xE_ ou 0xF_).
  if (bytesAre(buffer, 0, "ID3")) return "mp3";
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "mp3";

  if (bytesAre(buffer, 0, "RIFF") && bytesAre(buffer, 8, "WAVE")) return "wav";
  if (bytesAre(buffer, 0, "OggS")) return "ogg";
  if (bytesAre(buffer, 0, "fLaC")) return "flac";

  // Matroska/WebM: EBML header 1A 45 DF A3.
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }

  // ISO-BMFF (m4a/mp4): a caixa `ftyp` começa no offset 4.
  if (bytesAre(buffer, 4, "ftyp")) return "m4a";

  return null;
}

// --------------------------------------------------------------------------
// Vereditos
// --------------------------------------------------------------------------

export interface SampleVerdict {
  ok: boolean;
  /** Código estável para a tela decidir o que fazer. */
  code?:
    | "no_file"
    | "sample_not_audio"
    | "sample_too_large"
    | "sample_too_short"
    | "voice_protected"
    | "voice_exists"
    | "voice_slots_full";
  /** Frase em pt-BR que o cliente lê. Diz o que houve E o que fazer. */
  message?: string;
  /** Aceito, mas com ressalva — nunca bloqueia. */
  warning?: string;
}

const OK: SampleVerdict = { ok: true };

/** "1:15" — para ler numa tela, não para calcular. */
export function formatSeconds(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** GUARDA D — formato e tamanho. */
export function checkSampleFormat(input: {
  buffer: Buffer;
  declaredMimeType: string | null;
  maxBytes?: number;
}): SampleVerdict {
  const maxBytes = input.maxBytes ?? VOICE_SAMPLE_MAX_BYTES;

  const format = sniffAudioFormat(input.buffer);
  if (format === null || !ALLOWED_AUDIO_FORMATS.includes(format)) {
    return {
      ok: false,
      code: "sample_not_audio",
      message:
        `O arquivo enviado não é áudio reconhecível${
          input.declaredMimeType ? ` (declarado como ${input.declaredMimeType})` : ""
        }. ` +
        `Formatos aceitos: ${ALLOWED_AUDIO_FORMATS.join(", ")}. ` +
        "Renomear a extensão de um arquivo não muda o conteúdo dele.",
    };
  }

  if (input.buffer.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    const enviado = (input.buffer.length / (1024 * 1024)).toFixed(1).replace(".", ",");
    return {
      ok: false,
      code: "sample_too_large",
      message:
        `A amostra tem ${enviado} MB e o limite do provedor de voz é ${mb} MB. ` +
        "Grave em qualidade menor (mono, 128 kbps já basta) ou envie um trecho mais curto.",
    };
  }

  return OK;
}

/** GUARDA A — duração. */
export function checkSampleDuration(durationSeconds: number | null): SampleVerdict {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return {
      ok: false,
      code: "sample_not_audio",
      message:
        "Não foi possível medir a duração da amostra — o arquivo pode estar corrompido ou incompleto. " +
        "Grave novamente e envie.",
    };
  }

  if (durationSeconds < MIN_SAMPLE_SECONDS) {
    return {
      ok: false,
      code: "sample_too_short",
      message:
        `A amostra tem ${formatSeconds(durationSeconds)} e o mínimo é ` +
        `${formatSeconds(MIN_SAMPLE_SECONDS)}. Amostra curta produz um clone que fala rápido e com ` +
        "entonação instável — foi o que aconteceu com a voz gravada com 15 segundos nesta conta. " +
        `A clonagem consome um slot que não pode ser devolvido, então ela é recusada aqui em vez de ` +
        "gastar o slot com um resultado ruim.",
    };
  }

  if (durationSeconds < RECOMMENDED_SAMPLE_SECONDS) {
    return {
      ok: true,
      warning:
        `A amostra tem ${formatSeconds(durationSeconds)}. Funciona, mas o provedor recomenda de ` +
        `${formatSeconds(RECOMMENDED_SAMPLE_SECONDS)} a 2:00 de fala limpa para o melhor resultado.`,
    };
  }

  return OK;
}

/** GUARDA C — substituição de voz existente, e proteção da voz aprovada. */
export function checkVoiceReplacement(input: {
  currentVoiceId: string | null;
  replace: boolean;
}): SampleVerdict {
  const atual = input.currentVoiceId;
  if (!atual) return OK;

  if (!input.replace) {
    return {
      ok: false,
      code: "voice_exists",
      message:
        "Este avatar já tem uma voz clonada. Enviar outra amostra criaria uma voz nova e " +
        "substituiria a atual, que não pode ser recuperada depois. Para substituir de propósito, " +
        "confirme a substituição.",
    };
  }

  // A flag foi enviada — mas para a voz protegida ela não basta por si só:
  // aqui a recusa é definitiva por esta rota. Trocar a voz do vídeo aprovado é
  // decisão que não deve caber a um clique numa tela de upload.
  if (PROTECTED_VOICE_IDS.includes(atual)) {
    return {
      ok: false,
      code: "voice_protected",
      message:
        "Esta é a voz usada no vídeo já aprovado e ela está protegida contra substituição. " +
        "Clone a voz nova em outro avatar e repontar depois, se for mesmo o caso — assim a voz " +
        "aprovada continua existindo enquanto a nova é avaliada.",
    };
  }

  return OK;
}

/** GUARDA B — slots. */
export function checkVoiceSlots(input: { used: number; limit: number }): SampleVerdict {
  if (input.used >= input.limit) {
    return {
      ok: false,
      code: "voice_slots_full",
      message:
        `A conta do provedor de voz está com ${input.used} de ${input.limit} vozes em uso. ` +
        `Uma clonagem agora seria recusada pelo provedor depois de já ter consumido a tentativa. ` +
        LACUNA_SEM_EXCLUSAO,
    };
  }
  return OK;
}
