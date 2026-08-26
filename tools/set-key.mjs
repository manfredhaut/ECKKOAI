#!/usr/bin/env node
/**
 * Grava uma chave de plataforma no .env sem que ela apareça na tela.
 *
 *   npm run set-key
 *
 * Existe porque a alternativa é abrir o .env num editor e colar o valor — o
 * que deixa a chave visível na tela, no scrollback do terminal, e sujeita a
 * um `git add -A` distraído. Aqui o valor entra por stdin com o eco
 * desligado, vai direto para o arquivo, e a confirmação mostra só os 4
 * últimos caracteres.
 *
 * Sem dependências: roda com o Node do sistema, sem npm install e sem
 * precisar do container de pé.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");

/**
 * Lista fechada, de propósito. Evita dois acidentes: gravar num nome com
 * erro de digitação (que ninguém leria nunca) e usar esta ferramenta para
 * editar variáveis que não são segredo.
 */
const KEYS = [
  { name: "PLATFORM_GOOGLE_API_KEY", desc: "Google — roteiro e copiloto do tenant" },
  { name: "PLATFORM_COPILOT_API_KEY", desc: "Anthropic — copiloto público e do admin" },
  { name: "PLATFORM_EMBEDDING_API_KEY", desc: "Google — só embeddings" },
  { name: "PLATFORM_HEYGEN_API_KEY", desc: "HeyGen da plataforma (ainda não consumida por código)" },
  // CORRIGIDO em 25/08: dizia "ainda não consumida por código", e não é mais
  // verdade — ela é lida em config.ts e declarada em platformCredentials.ts.
  // No ambiente local ela está VAZIA (medido: len=0), e a chave em uso vem de
  // `api_credentials` por tenant; "vazia" e "não consumida" são coisas
  // diferentes, e a segunda ensinava a ignorar a variável.
  { name: "PLATFORM_ELEVENLABS_API_KEY", desc: "ElevenLabs da plataforma (lida por config.ts; vazia no ambiente local)" },
];

const NEWLINE = "\n";
const CR = "\r";
const EOT = "";
const ETX = "";
const DEL = "";
const BS = "\b";

function last4(value) {
  return value.length <= 4 ? "*".repeat(value.length) : `…${value.slice(-4)}`;
}

/** Estado atual de cada variável, sem revelar valor. */
function currentState(envText) {
  const state = new Map();
  for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) state.set(m[1], m[2]);
  }
  return state;
}

/**
 * Substitui a linha existente ou acrescenta uma nova — nunca duplica.
 *
 * Duplicata importa: o `.env` é resolvido pela ÚLTIMA ocorrência, então uma
 * linha repetida faria a gravação parecer sem efeito se a antiga ficasse
 * embaixo. O sintoma seria "gravei e não mudou nada", que é caríssimo de
 * diagnosticar.
 */
function upsert(envText, name, value) {
  const lines = envText.split(/\r?\n/);
  const re = new RegExp(`^${name}=`);
  let replaced = false;

  const out = lines.map((line) => {
    if (re.test(line)) {
      replaced = true;
      return `${name}=${value}`;
    }
    return line;
  });

  if (!replaced) {
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    out.push("", `${name}=${value}`);
  }
  return out.join(NEWLINE) + NEWLINE;
}

/**
 * Lê uma linha de stdin, opcionalmente sem eco.
 *
 * Leitura direta em vez de `readline`: esconder o que se digita exige
 * controlar o eco, e a forma suportada é o raw mode do TTY. A alternativa
 * comum — sobrescrever `_writeToOutput` do readline — usa API privada e, na
 * prática, travou a leitura quando stdin não era um terminal.
 *
 * Sem TTY (entrada por pipe) não existe eco nosso a desligar: quem escreveu
 * no pipe já imprimiu o texto. O aviso em main() torna isso explícito, em
 * vez de fingir um sigilo que ali não existe.
 */
/**
 * Sobra da leitura anterior.
 *
 * Necessário porque stdin não entrega um caractere por vez quando a entrada
 * vem de um pipe: chega tudo num chunk só. Sem guardar o excedente, a
 * primeira leitura consome a linha inteira e descarta o resto, e a segunda
 * fica esperando dados que já passaram — o programa trava sem gravar nada.
 * Num terminal isso não aparece (a digitação chega tecla a tecla), o que
 * torna o defeito invisível justamente no uso manual.
 */
let pending = "";

function readLine(promptText, { secret = false } = {}) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const isTTY = Boolean(stdin.isTTY);
    const hideEcho = secret && isTTY;

    process.stdout.write(promptText);

    let value = "";

    const finish = () => {
      if (hideEcho) stdin.setRawMode(false);
      stdin.removeListener("data", onData);
      stdin.pause();
      process.stdout.write(NEWLINE);
      resolve(value);
    };

    /** Consome caracteres; devolve true quando a linha terminou. */
    const consume = (chunk) => {
      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i];
        if (ch === NEWLINE || ch === CR || ch === EOT) {
          pending = chunk.slice(i + 1);
          return true;
        }
        if (ch === ETX) {
          if (hideEcho) stdin.setRawMode(false);
          process.stdout.write(NEWLINE);
          process.exit(130);
        }
        if (ch === DEL || ch === BS) {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
        // Em raw mode o terminal não ecoa sozinho; para o campo NÃO secreto
        // o eco tem de ser nosso, senão a pessoa digita às cegas.
        if (!secret && isTTY) process.stdout.write(ch);
      }
      return false;
    };

    // Resolve já, se a linha inteira coube no que sobrou da leitura anterior.
    if (pending) {
      const buffered = pending;
      pending = "";
      if (consume(buffered)) {
        if (hideEcho) stdin.setRawMode(false);
        process.stdout.write(NEWLINE);
        resolve(value);
        return;
      }
    }

    const onData = (chunk) => {
      if (consume(chunk)) finish();
    };

    if (hideEcho) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

async function main() {
  if (!existsSync(ENV_PATH)) {
    console.error(`${NEWLINE}  Não encontrei ${ENV_PATH}.`);
    console.error(`  Copie o .env.example para .env antes de gravar uma chave.${NEWLINE}`);
    process.exit(1);
  }

  const envText = readFileSync(ENV_PATH, "utf-8");
  const state = currentState(envText);

  console.log(`${NEWLINE}  Chaves de plataforma (o valor nunca é exibido):${NEWLINE}`);
  KEYS.forEach((k, i) => {
    const raw = state.get(k.name);
    console.log(`   ${i + 1}) ${k.name}`);
    console.log(`      ${k.desc}`);
    console.log(`      estado: ${raw ? `configurada (${last4(raw)})` : "ausente"}${NEWLINE}`);
  });

  if (!process.stdin.isTTY) {
    console.log("  AVISO: stdin não é um terminal — o eco não pode ser desligado aqui.");
    console.log(`         Num terminal de verdade o valor não aparece na tela.${NEWLINE}`);
  }

  const choice = (await readLine("  Qual variável? (número, ou nome completo): ")).trim();
  const picked = KEYS[Number(choice) - 1] ?? KEYS.find((k) => k.name === choice.toUpperCase());

  if (!picked) {
    console.error(`${NEWLINE}  Escolha inválida. Nada foi gravado.${NEWLINE}`);
    process.exit(1);
  }

  const value = (
    await readLine(`  Cole o valor de ${picked.name} (não será exibido): `, { secret: true })
  ).trim();

  if (!value) {
    console.error(`  Valor vazio. Nada foi gravado.${NEWLINE}`);
    process.exit(1);
  }

  writeFileSync(ENV_PATH, upsert(envText, picked.name, value), "utf-8");

  console.log(`${NEWLINE}  ✓ ${picked.name} gravada em .env — termina em ${last4(value)}`);
  console.log(`    (o valor não foi impresso, e o .env está no .gitignore)${NEWLINE}`);
  console.log(`  Para o backend enxergar a variável nova:${NEWLINE}`);
  console.log(`      docker compose up -d backend${NEWLINE}`);
  console.log("    `docker compose restart backend` NÃO basta: restart reaproveita o");
  console.log(`    container com o ambiente antigo. É preciso recriá-lo.${NEWLINE}`);
}

main().catch((err) => {
  // Nunca imprime o erro cru: uma exceção de escrita pode carregar o
  // conteúdo da linha, e a linha contém a chave.
  console.error(`${NEWLINE}  Falhou ao gravar:`, err.code ?? err.name ?? "erro desconhecido");
  process.exit(1);
});
