/**
 * Invariantes de REPRODUÇÃO de vídeo dentro do produto.
 *
 * O defeito congelado aqui foi medido na Fase 0 do bloco 5D: o único lugar do
 * produto que reproduzia um vídeo era o passo 6 do wizard, cujo resultado vive
 * num `useState` — sair de /create ou dar F5 tornava o vídeo inalcançável. A
 * Biblioteca listava onze vídeos com uma única ação, "Baixar", de modo que VER
 * o que se acabou de gerar exigia sair do produto e abrir o arquivo num player
 * externo.
 *
 * Textual, e não comportamental: provar reprodução de verdade exigiria
 * navegador, sessão e um artefato — a Fase 1 fez isso à mão e MEDIU
 * (readyState 4, 360×640, aspect-ratio 9/16). O que a guarda impede é a
 * REMOÇÃO silenciosa: alguém simplificar a Biblioteca de volta para uma lista
 * de downloads, ou o player perder a proporção e voltar a esticar um 9:16 num
 * quadro 16:9, sem que nada reprove.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";

export interface PlaybackCheckResult {
  failures: string[];
  notes: string[];
}

export const MUTANTS: Mutant[] = [
  {
    guard: "reprodução: a Biblioteca reproduz",
    name: "a Biblioteca volta a ser uma lista de downloads",
    kind: "obvio",
    file: "frontend/src/pages/Content/ContentPage.tsx",
    find: "              <VideoPlayer video={playingVideo} />",
    replace: "              <span />",
    expect: "não usa <VideoPlayer>",
  },
  {
    guard: "reprodução: a proporção é respeitada",
    name: "o player volta a desenhar todo vídeo no mesmo quadro",
    kind: "esperto",
    // O player continua existindo, continua reproduzindo, e a Biblioteca
    // continua usando-o — só o `aspectRatio` sai. Um 9:16 volta a ser
    // esticado num quadro horizontal, e nada na estrutura da tela muda.
    file: "frontend/src/features/VideoPlayer.tsx",
    find: "          aspectRatio: cssRatio,",
    replace: "",
    expect: "não aplica a proporção",
  },
  {
    guard: "reprodução: todo player avisa quando é simulação",
    name: "o aviso de simulação some do player, mas o import fica",
    kind: "esperto",
    // O mais perigoso numa apresentação: o vídeo continua tocando, bonito, e
    // nada diz que ele é um artefato de fixture.
    //
    // Este é o mutante (a) do checklist de ancoragem: remove o USO e preserva
    // a MENÇÃO. A primeira versão desta guarda procurava `SimulatedNotice` no
    // arquivo inteiro, e o `import { SimulatedNotice }` — que este mutante NÃO
    // toca — bastava para satisfazê-la. O gate passava verde com o defeito
    // aplicado.
    file: "frontend/src/features/VideoPlayer.tsx",
    find: "      <SimulatedNotice simulated={video.simulated} />",
    replace: "",
    expect: "não avisa quando o vídeo é simulado",
  },
  {
    guard: "reprodução: todo player avisa quando é simulação",
    name: "o aviso fica renderizado, mas preso em false",
    kind: "esperto",
    // Mutante (b). A superfície que a guarda ancorada no uso inspeciona não
    // muda em nada: `<SimulatedNotice` continua no JSX, no mesmo lugar. Só a
    // LIGAÇÃO com o fato gravado na linha some, e o aviso nunca mais aparece
    // — nem para um vídeo de fixture.
    file: "frontend/src/features/VideoPlayer.tsx",
    find: "<SimulatedNotice simulated={video.simulated} />",
    replace: "<SimulatedNotice simulated={false} />",
    expect: "não liga o aviso ao fato gravado no vídeo",
  },
  {
    guard: "reprodução: todo player avisa quando é simulação",
    name: "a condição do aviso é invertida",
    kind: "esperto",
    // Mutante (c), e o pior dos três: o aviso continua existindo e continua
    // aparecendo, então a tela parece honesta. Só que aparece exatamente nos
    // vídeos REAIS e some nos simulados — a mentira invertida do VIDEO-0.
    file: "frontend/src/features/VideoPlayer.tsx",
    find: "<SimulatedNotice simulated={video.simulated} />",
    replace: "<SimulatedNotice simulated={!video.simulated} />",
    expect: "não liga o aviso ao fato gravado no vídeo",
  },
  {
    guard: "reprodução: o selo da Biblioteca segue o vídeo, não o ambiente",
    name: "o selo da Biblioteca perde a ligação e passa a seguir o modo global",
    kind: "esperto",
    // O selo continua lá, a lista continua igual. Sem a prop, `SimulatedBadge`
    // cai no modo do AMBIENTE — e como a apresentação roda em fixture, TODO
    // vídeo da Biblioteca passa a exibir SIMULADO, inclusive o único que é
    // real. É a mentira que o `credit_ledger.simulated` e o `videos.simulated`
    // existem para impedir, na tela onde ela seria vista.
    file: "frontend/src/pages/Content/ContentPage.tsx",
    find: "<SimulatedBadge compact simulated={v.simulated} />",
    replace: "<SimulatedBadge compact />",
    expect: "não liga o selo da Biblioteca ao fato gravado no vídeo",
  },
];

const PLAYER = "frontend/src/features/VideoPlayer.tsx";
const BIBLIOTECA = "frontend/src/pages/Content/ContentPage.tsx";

/** Comentários fora: guardas deste projeto já acusaram o texto que as explicava. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * A marca de simulação está LIGADA ao fato gravado na linha do vídeo?
 *
 * Verificar que o elemento aparece no JSX prova que ele existe, não que ele
 * diz a verdade. `simulated={false}` desliga o aviso; `simulated={!v.simulated}`
 * o inverte; omitir a prop o faz seguir o modo do AMBIENTE, e em fixture isso
 * carimba SIMULADO no único vídeo real da tela. Nas três mutações o elemento
 * continua exatamente onde estava.
 *
 * A forma exigida é `simulated={<algo>.simulated}` — um acesso ao campo, e nada
 * mais. Aceitar qualquer expressão deixaria `false` passar; exigir o nome
 * literal `video.simulated` reprovaria uma renomeação de variável, e guarda que
 * acusa manutenção legítima é abandonada (achado C do GUARDAS-1).
 */
const LIGACAO_ESPERADA = /^\s*[A-Za-z_$][\w$]*\.simulated\s*$/;

function verificarLigacao(
  fonte: string,
  arquivo: string,
  componente: string,
  rotulo: string,
  failures: string[],
): void {
  const uso = fonte.match(new RegExp(`<${componente}\\b([^>]*)>`));
  const props = uso?.[1] ?? "";
  const prop = props.match(/simulated=\{([^}]*)\}/);

  if (!prop || !LIGACAO_ESPERADA.test(prop[1])) {
    const visto = prop ? `\`simulated={${prop[1].trim()}}\`` : "a prop `simulated` ausente";
    failures.push(
      `reprodução: ${arquivo} não liga o ${rotulo} ao fato gravado no vídeo — encontrei ${visto}. ` +
        `O <${componente}> continua renderizado, então a tela parece correta, mas a marca deixa de ` +
        "seguir `videos.simulated` e passa a mentir: ou nunca aparece, ou aparece no vídeo errado, " +
        "ou segue o modo do ambiente e carimba SIMULADO numa geração real.",
    );
  }
}

export async function checkVideoPlaybackPolicy(repoRoot: string): Promise<PlaybackCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const ler = async (rel: string): Promise<string | null> => {
    try {
      return semComentarios(await readFile(path.join(repoRoot, rel), "utf-8"));
    } catch {
      failures.push(`reprodução: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
      return null;
    }
  };

  const player = await ler(PLAYER);
  const biblioteca = await ler(BIBLIOTECA);
  if (!player || !biblioteca) return { failures, notes };

  // 1. O player reproduz de verdade.
  if (!/<video\b/.test(player)) {
    failures.push(
      `reprodução: ${PLAYER} não renderiza <video> — não reproduz vídeo nenhum. Sem isso, ver o ` +
        "resultado volta a exigir baixar o arquivo e abri-lo fora do produto.",
    );
  }

  // 2. E respeita a proporção.
  if (!/aspectRatio/.test(player)) {
    failures.push(
      `reprodução: ${PLAYER} não aplica a proporção do vídeo (aspectRatio). Um 9:16 passa a ser ` +
        "desenhado no mesmo quadro de um 16:9 — o vídeo vertical aparece esticado, e o formato que o " +
        "bloco FORMATO-1 existe para honrar deixa de ser visível na tela.",
    );
  }

  // 3. E avisa quando é simulação.
  //
  // Ancorado no USO em JSX (`<SimulatedNotice`), nunca no nome: a primeira
  // versão procurava `SimulatedNotice` no arquivo, e o arnês a flagrou INERTE
  // — removida a renderização, o `import { SimulatedNotice }` continuava lá e
  // satisfazia a busca. O gate passou verde com o defeito aplicado, que numa
  // apresentação seria fixture tocando sem aviso nenhum. É a quinta vez que
  // uma guarda deste projeto casa a menção em vez do uso.
  //
  // Ancorar no uso, porém, ainda não basta: `simulated={false}` e
  // `simulated={!video.simulated}` preservam o elemento no JSX, intacto, e
  // desligam ou invertem o aviso. Presença e LIGAÇÃO são proposições
  // diferentes, e uma guarda que verifica só a primeira volta a ser inerte
  // contra as duas mutações que mais parecem manutenção inocente.
  if (!/<SimulatedNotice\b/.test(player)) {
    failures.push(
      `reprodução: ${PLAYER} não avisa quando o vídeo é simulado. Numa apresentação, um artefato de ` +
        "fixture tocando sem aviso é indistinguível de uma geração real.",
    );
  } else {
    verificarLigacao(player, PLAYER, "SimulatedNotice", "aviso", failures);
  }

  // 4. A Biblioteca usa o player — e não uma cópia local.
  if (!/<VideoPlayer\b/.test(biblioteca)) {
    failures.push(
      `reprodução: ${BIBLIOTECA} não usa <VideoPlayer>. A Biblioteca é onde o vídeo continua existindo ` +
        "depois que o wizard é fechado; sem player ali, o resultado só é alcançável por download.",
    );
  }

  // 4b. E o selo da lista segue o VÍDEO, não o ambiente.
  //
  // Sem a prop, `SimulatedBadge` cai no modo global. Na apresentação — que roda
  // em fixture — isso carimba SIMULADO em todo vídeo da Biblioteca, inclusive
  // no único que foi gerado de verdade. É a mesma classe de mentira do VIDEO-0,
  // só que invertida, e é a tela onde ela seria vista.
  if (!/<SimulatedBadge\b/.test(biblioteca)) {
    failures.push(
      `reprodução: ${BIBLIOTECA} não marca os vídeos simulados na lista. Um artefato de fixture e uma ` +
        "geração real passam a ocupar a mesma linha, sem nada que os distinga.",
    );
  } else {
    verificarLigacao(biblioteca, BIBLIOTECA, "SimulatedBadge", "selo da Biblioteca", failures);
  }

  // 5. E o download continua existindo — reproduzir não substitui levar embora.
  if (!/download/.test(player) && !/download/.test(biblioteca)) {
    failures.push(
      "reprodução: nem o player nem a Biblioteca oferecem download. Assistir dentro do produto não " +
        "substitui baixar o arquivo para publicar.",
    );
  }

  notes.push(
    "reprodução: a Biblioteca reproduz com <VideoPlayer>, que respeita a proporção e mantém o download",
  );
  notes.push(
    "reprodução: 2 marca(s) de simulação (player e Biblioteca) ancoradas no USO em JSX e LIGADAS a `.simulated` — " +
      "presença e ligação são conferidas em separado",
  );
  return { failures, notes };
}
