/**
 * FRACIONAMENTO DO ROTEIRO EM BLOCOS DE ANIMAÇÃO — tier Normal, BLOCO
 * FRACOES-1 (28/08/2026). Implementa o item 1 de
 * `docs-internal/plano-fracoes-2026-08-28.md` (mesmo plano, não replanejado).
 *
 * ┌─ Por que existe, em uma frase ────────────────────────────────────────────┐
 * │ `wan/v2.6/image-to-video/flash` não anima mais que 15 s por chamada       │
 * │ (`PIPELINE_DURACAO_MAXIMA`), e este pipeline não emenda clipes DENTRO de  │
 * │ uma chamada — então um vídeo mais longo precisa de VÁRIAS chamadas, cada  │
 * │ uma cobrindo um pedaço do roteiro.                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que por FRASE, e não por contagem bruta de caracteres ───────────────┐
 * │ Cortar no meio de uma frase produziria um bloco de animação cuja fala     │
 * │ (na narração, que roda DEPOIS, sobre o vídeo inteiro já concatenado)      │
 * │ atravessa a emenda entre dois clipes gerados por chamadas SEPARADAS do    │
 * │ motor — o corte ficaria em silêncio, mas na fronteira errada do texto.    │
 * │ Empacotar por frase garante que cada bloco tem folga (a régua de          │
 * │ caracteres já é pessimista) e nunca decide onde cortar uma frase.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O que este módulo NÃO faz ────────────────────────────────────────────────┐
 * │ Não decide o TEXTO que vai a `animar()` — o Wan não recebe o roteiro,      │
 * │ recebe a Interpretação (`promptDeDirecao`), a mesma em todos os blocos.    │
 * │ O que este módulo decide é só QUANTOS blocos e de QUE DURAÇÃO cada um —    │
 * │ o texto de cada bloco fica no retorno só para log/depuração.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import {
  PIPELINE_DURACAO_MAXIMA,
  PIPELINE_MAX_CHARS_POR_DURACAO,
  PIPELINE_CHARS_PER_SECOND,
  PIPELINE_RITMO_DISPERSAO,
  escolherDuracao,
  type PipelineDuration,
} from "./pipelineDuration.js";

/** 8 blocos de 15 s — o teto de duração do tier Normal com fracionamento. */
export const NORMAL_MAX_BLOCOS = 8;

/** `NORMAL_MAX_BLOCOS × PIPELINE_DURACAO_MAXIMA` — 120 s. Nunca digitado solto. */
export const NORMAL_MAX_TARGET_SECONDS = NORMAL_MAX_BLOCOS * PIPELINE_DURACAO_MAXIMA;

/**
 * O teto de caracteres para uma DURAÇÃO-ALVO qualquer do tier Normal (até
 * `NORMAL_MAX_TARGET_SECONDS`) — item 1 do fechamento do tier Normal
 * (28/08/2026). MESMA fórmula de `PIPELINE_MAX_CHARS_POR_DURACAO` (a régua
 * pessimista do ritmo, `PIPELINE_CHARS_PER_SECOND`/`PIPELINE_RITMO_DISPERSAO`),
 * generalizada para qualquer segundo em vez de só 5/10/15.
 *
 * É uma ESTIMATIVA — o teto EXATO, que de fato decide se um roteiro passa ou
 * é recusado, é `fracionarRoteiro()`: ele empacota por FRASE, e duas frases
 * de tamanhos diferentes que somam o mesmo total de caracteres podem
 * produzir números de blocos diferentes (uma frase de 141 caracteres sozinha
 * já fecha um bloco de 15s com 1 caractere de folga; a mesma folga somada de
 * frases menores rende mais). Esta função existe para a TELA poder mostrar
 * um número ANTES de o roteiro existir — o mesmo papel que
 * `PIPELINE_MAX_CHARS_POR_DURACAO` já cumpre para um bloco só.
 */
export function maxCharsForNormalTarget(targetSeconds: number): number {
  const segundos = Math.max(0, Math.min(targetSeconds, NORMAL_MAX_TARGET_SECONDS));
  return Math.floor((segundos * PIPELINE_CHARS_PER_SECOND) / (1 + PIPELINE_RITMO_DISPERSAO));
}

export class ScriptFractioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptFractioningError";
  }
}

export interface BlocoDeAnimacao {
  /** Só para log/depuração — `animar()` não consome este texto. */
  texto: string;
  duracaoEscolhida: PipelineDuration;
}

/**
 * Frases, por `.`, `!`, `?` ou `…` — o delimitador fica GRUDADO na frase
 * anterior. Não é um separador de linguagem natural completo (não trata
 * abreviações como "Sr." ou números decimais) — é uma aproximação
 * deliberadamente simples, documentada como limitação conhecida, não como
 * comportamento silencioso.
 */
function dividirEmFrases(script: string): string[] {
  const normalizado = script.trim();
  if (!normalizado) return [];
  const partes = normalizado.match(/[^.!?…]+[.!?…]*/g) ?? [normalizado];
  return partes.map((p) => p.trim()).filter(Boolean);
}

/**
 * Empacota as frases em blocos, cada um cabendo em `PIPELINE_DURACAO_MAXIMA`
 * (142 caracteres) — greedy: acumula frase a frase até a próxima não caber,
 * fecha o bloco com a MENOR duração que comporta o que foi acumulado
 * (`escolherDuracao`), e recomeça.
 *
 * RECUSA, nunca corta, quando uma frase ÚNICA excede o teto do maior bloco —
 * mesma regra que `conferirRoteiro` já aplicava ao roteiro inteiro antes
 * desta rodada, agora aplicada por frase.
 */
export function fracionarRoteiro(script: string): BlocoDeAnimacao[] {
  const tetoMaiorBloco = PIPELINE_MAX_CHARS_POR_DURACAO[PIPELINE_DURACAO_MAXIMA];
  const frases = dividirEmFrases(script);
  if (frases.length === 0) {
    throw new ScriptFractioningError(
      "fracionamento: o roteiro está vazio — não há frase nenhuma para virar bloco de animação.",
    );
  }

  const blocos: BlocoDeAnimacao[] = [];
  let acumulado = "";

  for (const frase of frases) {
    if (frase.length > tetoMaiorBloco) {
      throw new ScriptFractioningError(
        `fracionamento: uma frase de ${frase.length} caracteres excede o teto de ${tetoMaiorBloco} ` +
          `caracteres (${PIPELINE_DURACAO_MAXIMA} s, o maior bloco que o Wan aceita por chamada). ` +
          "Frase não é cortada no meio — encurte-a ou divida-a em duas frases.",
      );
    }

    const candidato = acumulado ? `${acumulado} ${frase}` : frase;
    if (candidato.length <= tetoMaiorBloco) {
      acumulado = candidato;
      continue;
    }

    // A frase nova não cabe no bloco atual: fecha o bloco com o que já
    // tinha (na MENOR duração que o comporta), e a frase que não coube
    // inaugura o próximo bloco.
    const duracaoDoFechado = escolherDuracao(acumulado.length);
    if (duracaoDoFechado === null) {
      // Impossível pela invariante do laço (acumulado sempre <= tetoMaiorBloco
      // até este ponto), mas TypeScript não sabe disso — falha nomeada em vez
      // de deixar `blocos.push` receber `null`.
      throw new ScriptFractioningError("fracionamento: estado interno inválido — bloco acumulado sem duração.");
    }
    blocos.push({ texto: acumulado, duracaoEscolhida: duracaoDoFechado });
    acumulado = frase;
  }

  if (acumulado) {
    const duracaoDoUltimo = escolherDuracao(acumulado.length);
    if (duracaoDoUltimo === null) {
      throw new ScriptFractioningError("fracionamento: estado interno inválido — último bloco sem duração.");
    }
    blocos.push({ texto: acumulado, duracaoEscolhida: duracaoDoUltimo });
  }

  if (blocos.length > NORMAL_MAX_BLOCOS) {
    const segundosNecessarios = blocos.reduce((soma, b) => soma + b.duracaoEscolhida, 0);
    throw new ScriptFractioningError(
      `fracionamento: o roteiro exige ${blocos.length} blocos (~${segundosNecessarios} s no pior caso), ` +
        `acima do teto de ${NORMAL_MAX_BLOCOS} blocos (${NORMAL_MAX_TARGET_SECONDS} s) do tier Normal. ` +
        "Nada foi pedido a fornecedor nenhum: a recusa acontece antes da primeira chamada paga. " +
        "Encurte o roteiro ou divida-o em mais de um vídeo.",
    );
  }

  return blocos;
}

/** Soma das durações escolhidas — o total de vídeo silencioso que os blocos produzem. */
export function segundosTotaisDosBlocos(blocos: BlocoDeAnimacao[]): number {
  return blocos.reduce((soma, b) => soma + b.duracaoEscolhida, 0);
}
