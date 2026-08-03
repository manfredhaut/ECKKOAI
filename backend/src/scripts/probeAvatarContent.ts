/**
 * Estágio 0 do catálogo de conteúdo nativo: mede, por avatar, quanta imagem o
 * fornecedor de fato entrega — e deduz quanta tarja cada formato produziria.
 *
 * SÓ LEITURA. Não escreve no banco, não toca em arquivo, não chama fornecedor.
 *
 * Duas regras de seleção decidem se o número significa alguma coisa, e as duas
 * foram descobertas ao escrever isto:
 *
 * 1. **Vídeo simulado é fixture, não é o avatar.** As fixtures têm geometria
 *    própria (640×360, 360×640, …) e nada a ver com a foto que treinou o
 *    avatar. Medir uma e atribuir ao avatar produziria um catálogo inteiro de
 *    números plausíveis e falsos, que é pior que catálogo nenhum.
 *
 * 2. **A medição tem de ser do artefato do FORNECEDOR, nunca do nosso
 *    derivado.** Desde o repontamento de 2026-08-03, o `output_url` do vídeo
 *    mais recente do avatar "Mário" aponta a cópia já recortada pelo 5F.
 *    Sondá-la devolveria `clean` — verdade sobre o arquivo servido, e mentira
 *    sobre o que o fornecedor entrega. Enquanto `video_variants` não estiver
 *    populada (a chave única do 5E não comporta duas variantes 9:16), a
 *    procedência é reconstruída pelo sufixo do nome.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pool } from "../db/pool.js";
import { probePadding } from "../services/video/paddingProbe.js";

/** Sufixo que o 5F dá às cópias derivadas. Ver regra 2 acima. */
const DERIVED_SUFFIX = /-5f-recortado-[0-9]+x[0-9]+(?=\.mp4$)/;

/**
 * As proporções que a API do fornecedor oferece. `auto` fica de fora: não é um
 * formato, é a ausência de escolha — e foi ela que produziu o vídeo horizontal
 * do LIVE-1 sem ninguém ter decidido nada.
 */
const FORMATS: Array<{ label: string; ratio: number }> = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "5:4", ratio: 5 / 4 },
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "9:16", ratio: 9 / 16 },
];

/**
 * Fração do quadro que vira tarja ao encaixar um conteúdo de proporção `rc`
 * dentro de um quadro de proporção `rf`, sem cortar e sem ampliar.
 *
 * Não depende da resolução: a âncora de lado curto do fornecedor decide o
 * TAMANHO do quadro, não a fração ocupada. Por isso pedir 720p ou 1080p não
 * muda um único ponto percentual desta tabela — e a tarifa é por segundo, não
 * por pixel.
 */
export function paddingFractionFor(contentAspect: number, frameAspect: number): number {
  const menor = Math.min(contentAspect, frameAspect);
  const maior = Math.max(contentAspect, frameAspect);
  return 1 - menor / maior;
}

/**
 * O modelo acima é uma dedução; esta é a única amarra dele à realidade.
 *
 * O master 9:16 de 02/08 foi MEDIDO com 57,8% de tarja sobre conteúdo 4:3. Se
 * a conta não reproduzir esse número, ela está errada — e um catálogo montado
 * sobre ela seria confiante e falso.
 */
function validarModelo(): { ok: boolean; esperado: number; obtido: number } {
  const obtido = paddingFractionFor(4 / 3, 9 / 16) * 100;
  return { ok: Math.abs(obtido - 57.8) < 0.1, esperado: 57.8, obtido };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function aproxRatio(r: number): string {
  const conhecidos: Array<[string, number]> = [
    ["4:3", 4 / 3], ["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1],
    ["4:5", 4 / 5], ["5:4", 5 / 4], ["3:4", 3 / 4], ["3:2", 3 / 2],
  ];
  for (const [nome, valor] of conhecidos) {
    if (Math.abs(r - valor) < 0.005) return `${nome} exato`;
  }
  return "—";
}

async function main() {
  const slug = process.argv[2] ?? "dev-c77a5b";

  const modelo = validarModelo();
  console.log("=".repeat(78));
  console.log("VALIDAÇÃO DO MODELO (obrigatória antes de qualquer tabela)");
  console.log(`  conteúdo 4:3 em quadro 9:16 → previsto ${modelo.obtido.toFixed(2)}% · MEDIDO em 02/08: ${modelo.esperado}%`);
  console.log(`  ${modelo.ok ? "OK — o modelo reproduz a medição" : "FALHOU — modelo inválido, pare aqui"}`);
  if (!modelo.ok) process.exit(1);

  const { rows: avatares } = await pool.query<{
    id: string; name: string; tenant_id: string;
  }>(
    `select a.id, a.name, a.tenant_id
       from avatars a
      where a.tenant_id = (select id from tenants where slug = $1)
      order by a.name`,
    [slug],
  );

  console.log();
  console.log("=".repeat(78));
  console.log(`TENANT ${slug} — ${avatares.length} avatar(es)`);

  const semVideo: string[] = [];
  const semArquivoLocal: string[] = [];

  for (const av of avatares) {
    // Só vídeo REAL (regra 1) e com artefato no nosso disco: URL de fornecedor
    // expira, e duas deste tenant já devolvem 403.
    const { rows: videos } = await pool.query<{
      id: string; output_url: string; created_at: Date; aspect_ratio: string | null;
    }>(
      `select id, output_url, created_at, aspect_ratio
         from videos
        where avatar_id = $1
          and status = 'ready'
          and simulated = false
          and output_url like '/uploads/%'
        order by created_at desc`,
      [av.id],
    );

    if (!videos.length) {
      semVideo.push(av.name);
      continue;
    }

    // Todos os vídeos reais, não só o mais recente: quando o mesmo avatar tem
    // gerações em proporções diferentes, comparar as medições separa "este
    // avatar é 4:3" de "o fornecedor emoldura ao pedir 9:16" — que é a
    // pergunta da Parte B, aqui respondida sem gastar nada.
    console.log();
    console.log("-".repeat(78));
    console.log(`AVATAR: ${av.name}  (${videos.length} vídeo(s) real(is) com artefato local)`);

    for (const video of videos) {
    // Regra 2: desfaz o sufixo do derivado para chegar ao artefato do fornecedor.
    const servido = video.output_url;
    const doFornecedor = servido.replace(DERIVED_SUFFIX, "");
    const usouOriginal = doFornecedor !== servido;
    const arquivo = path.join("/app", doFornecedor);

    console.log();
    console.log(`  VÍDEO ${video.id.slice(0, 8)} · ${video.created_at.toISOString().slice(0, 10)} · pedido: ${video.aspect_ratio ?? "(sem aspect_ratio — default 16:9 da conta)"}`);
    console.log(`    arquivo : ${path.basename(arquivo)}`);
    if (usouOriginal) {
      console.log("              ^ output_url aponta a cópia derivada do 5F;");
      console.log("                a sonda usa o artefato DO FORNECEDOR (regra 2)");
    }

    if (!existsSync(arquivo)) {
      semArquivoLocal.push(av.name);
      console.log("    RESULTADO: arquivo ausente no disco — nada a medir");
      continue;
    }

    const r = await probePadding(arquivo);
    console.log(`    veredito: ${r.verdict.toUpperCase()}`);
    console.log(`    quadro  : ${r.frame.width}×${r.frame.height} (${r.frameAspect.toFixed(4)})`);
    console.log(`    conteúdo: ${r.content.width}×${r.content.height} (${r.contentAspect.toFixed(4)} · ${aproxRatio(r.contentAspect)})`);
    console.log(`    tarja   : ${pct(r.paddingFraction)}  [MEDIDO]`);

      if (r.verdict !== "padded") {
        console.log(`    motivo  : ${r.reason}`);
      }

      console.log("    tarja por formato — DEDUZIDO da proporção do conteúdo:");
      const linhas = FORMATS.map((f) => ({
        label: f.label,
        frac: paddingFractionFor(r.contentAspect, f.ratio),
      })).sort((a, b) => a.frac - b.frac);

      const cells = linhas.map((l, i) => `${l.label} ${pct(l.frac)}${i === 0 ? " ←" : ""}`);
      console.log(`      ${cells.join("  |  ")}`);

      if (linhas.every((l) => l.frac >= 0.005)) {
        console.log("      NENHUM formato oferecido é nativo para este conteúdo.");
      }
    }
  }

  console.log();
  console.log("=".repeat(78));
  console.log(`avatares SEM vídeo real medível: ${semVideo.length}${semVideo.length ? ` — ${semVideo.join(", ")}` : ""}`);
  if (semArquivoLocal.length) {
    console.log(`avatares cujo artefato sumiu do disco: ${semArquivoLocal.join(", ")}`);
  }
  console.log("Para esses a sonda não tem o que medir: o conteúdo nativo só se");
  console.log("conhece depois da primeira geração, que é justamente o gasto que");
  console.log("o catálogo existiria para orientar.");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
