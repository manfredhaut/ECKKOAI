// tools/scale-match.mjs — casamento de escala entre dois enquadramentos da MESMA
// cena. É ESTE o instrumento do veredito FOV-1 (recomposição vs corte).
// Custo zero: só leitura de arquivo local, nenhuma chamada a fornecedor.
//
// uso: node tools/scale-match.mjs <ref> <candidato> [--ss <segundos>]
//
// POR QUE ISTO, E NÃO O headroom DO fov-compare.mjs
// O detector de bordas por desvio-padrão daquele script marca o primeiro ponto
// com variação de luminância — que nestes masters é mobília e parede, não a
// pessoa. Ele devolveu veredito "anômalo" e o bounding box que chama de sujeito
// muda de proporção entre os dois arquivos (1,80 → 0,94), sinal de que não isola
// ninguém. Aqui a premissa é outra e verificável: os dois arquivos mostram a
// MESMA sala, logo existe UM fator de escala que faz um casar com o outro, e
// esse fator responde à pergunta sem precisar segmentar pessoa nenhuma.
//
// COMO LER O RESULTADO
// Se o conteúdo do candidato precisar ser ampliado até a largura da referência
// para casar (escala ≈ 1,000×), os dois têm o MESMO campo horizontal e a
// diferença entre eles é vertical: RECOMPOSIÇÃO. Escala < 1 significa que o
// candidato mostra menos mundo na horizontal: CORTE.
//
// PREMISSA QUE O SCRIPT NÃO VERIFICA: que a cena é a mesma. Se os arquivos
// vierem de avatares ou salas diferentes, o mínimo encontrado não tem
// significado. O erro médio no mínimo é o que dá para inspecionar: um casamento
// legítimo destaca-se dos vizinhos (medido no FOV-1: 4,14 contra 4,82 e 6,00).
//
// BARRA DE PREENCHIMENTO: é descontada antes de casar, pelo mesmo critério do
// fov-compare (barra = clara e uniforme). Casar sobre o quadro cheio compararia
// barra branca com parede e produziria um fator sem sentido. Passar um arquivo
// já recortado no conteúdo também funciona — a detecção só não acha barra.
//
// O INSTANTE IMPORTA, e é por isso que --ss existe: em t=0 estes masters não
// casam (erro 39, num platô sem mínimo) porque um deles ainda está entrando na
// fala. Amostre um instante do meio. Um casamento que não se destaca dos
// vizinhos é resultado a descartar, não a interpretar.
//
// REPRODUÇÃO DO VEREDITO FOV-1 (o par de masters do avatar Mário, mesma sala):
//   node tools/scale-match.mjs \
//     uploads/c77a5b8a-.../61caaab1-....mp4 \
//     uploads/c77a5b8a-.../5f77229e-....mp4 --ss 8.5
// Esperado: barra 57,8% · razão 1,3333 · 1280 px · 1,000x · dx=0 dy=120
//           · erro 4,09 contra 4,78 no vizinho · RECOMPOSIÇÃO.
// CUIDADO: o master 16:9 é o de 33,696 s (61caaab1), NÃO o de 3,372 s do LIVE-1
// (0a0193b8), que é de outra cena — com ele o erro fica em 51+ e o veredito sai
// espúrio. Os dois têm 1280x720, então a dimensão não os distingue.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BAR_MEAN = 235, BAR_STD = 4;   // mesmos limiares do fov-compare/sonda 5F
const REDUCE = 4;                    // reduzir corta ruído de compressão e
                                     // torna a busca por deslocamento barata

const argv = process.argv.slice(2);
const ssIdx = argv.indexOf('--ss');
const SS = ssIdx >= 0 ? Number(argv[ssIdx + 1]) : 0;
const [ref, cand] = argv.filter((a, i) =>
  !a.startsWith('--') && !(ssIdx >= 0 && i === ssIdx + 1));

if (!ref || !cand) {
  console.error('uso: node tools/scale-match.mjs <ref> <candidato> [--ss <seg>]');
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'scale-'));

function probe(f) {
  const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', f]).toString();
  const s = JSON.parse(o).streams[0];
  return { w: +s.width, h: +s.height };
}

/** Quadro em luminância crua, opcionalmente recortado e sempre reescalado. */
function grayAt(file, w, h, crop) {
  const out = join(dir, `g${Math.random().toString(36).slice(2)}.raw`);
  const vf = (crop ? crop + ',' : '') +
    `scale=${w}:${h}:flags=lanczos,format=gray`;
  execFileSync('ffmpeg', ['-v', 'error', '-ss', String(SS), '-i', file,
    '-vf', vf, '-frames:v', '1', '-f', 'rawvideo', '-y', out]);
  return readFileSync(out);
}

/** Faixa vertical de conteúdo: descarta linhas de barra (claras e uniformes). */
function contentBand(file) {
  const p = probe(file);
  const b = grayAt(file, p.w, p.h, null);
  const isBar = [];
  for (let y = 0; y < p.h; y++) {
    let s = 0, q = 0;
    for (let x = 0; x < p.w; x++) { const v = b[y * p.w + x]; s += v; q += v * v; }
    const m = s / p.w;
    isBar.push(m > BAR_MEAN && Math.sqrt(Math.max(0, q / p.w - m * m)) < BAR_STD);
  }
  let y0 = 0; while (y0 < p.h && isBar[y0]) y0++;
  let y1 = p.h; while (y1 > y0 && isBar[y1 - 1]) y1--;
  const barFrac = isBar.filter(Boolean).length / p.h;
  const ch = y1 - y0;
  return {
    w: p.w, h: ch, frame: `${p.w}x${p.h}`, barFrac,
    // crop só quando há barra de fato; sem isso um arquivo limpo passaria por
    // um filtro extra sem necessidade
    crop: barFrac > 0.005 ? `crop=${p.w}:${ch}:0:${y0}` : null,
  };
}

const R = contentBand(ref);
const C = contentBand(cand);

const RW = Math.round(R.w / REDUCE), RH = Math.round(R.h / REDUCE);
const base = grayAt(ref, RW, RH, R.crop);
const razaoCand = C.w / C.h;

console.log(`REFERÊNCIA  ${ref}`);
console.log(`  quadro ${R.frame} · conteúdo ${R.w}x${R.h} · barra ` +
  `${(R.barFrac * 100).toFixed(1)}% · grade de busca ${RW}x${RH}`);
console.log(`CANDIDATO   ${cand}`);
console.log(`  quadro ${C.frame} · conteúdo ${C.w}x${C.h} · barra ` +
  `${(C.barFrac * 100).toFixed(1)}% · razão ${razaoCand.toFixed(4)}`);
console.log(`instante amostrado: ${SS}s\n`);

/** Erro médio absoluto entre a referência e um recorte do candidato. */
function mae(c, cw, ch, dx, dy) {
  let soma = 0, n = 0;
  for (let y = 0; y < RH; y += 2) {
    const sy = y + dy;
    if (sy < 0 || sy >= ch) continue;
    for (let x = 0; x < RW; x += 2) {
      const sx = x + dx;
      if (sx < 0 || sx >= cw) continue;
      soma += Math.abs(base[y * RW + x] - c[sy * cw + sx]);
      n++;
    }
  }
  // Exige sobreposição substancial: um recorte minúsculo teria erro baixo por
  // não ter quase nada a errar.
  return n < RW * RH * 0.12 ? Infinity : soma / n;
}

// A grade de escalas é centrada na largura da própria referência, para que o
// caso "mesmo campo horizontal" caia exatamente num ponto testado. Amarrá-la a
// números absolutos faria o mínimo verdadeiro escapar entre dois passos.
const STEP = Math.max(2, Math.round(R.w / 64));
const resultados = [];
for (let k = -Math.round(0.30 * R.w / STEP); k <= Math.round(0.56 * R.w / STEP); k++) {
  const L = R.w + k * STEP;
  if (L <= 0) continue;
  // O candidato é reamostrado como se tivesse L px de largura no mundo da
  // referência, e então reduzido pelos mesmos REDUCE.
  const cw = Math.round((L / R.w) * RW);
  const ch = Math.round(cw / razaoCand);
  if (cw < 40) continue;
  const c = grayAt(cand, cw, ch, C.crop);

  let melhor = { err: Infinity, dx: 0, dy: 0 };
  for (let dy = -Math.round(ch * 0.6); dy <= Math.round(ch * 0.6); dy += 2) {
    for (let dx = -Math.round(cw * 0.4); dx <= Math.round(cw * 0.4); dx += 2) {
      const e = mae(c, cw, ch, dx, dy);
      if (e < melhor.err) melhor = { err: e, dx, dy };
    }
  }
  resultados.push({ L, cw, ...melhor });
}

resultados.sort((a, b) => a.err - b.err);
console.log('largura_equiv | escala_vs_ref | erro_medio | deslocamento');
for (const r of resultados.slice(0, 8)) {
  console.log(
    `${String(r.L).padStart(5)} px    | ${(r.L / R.w).toFixed(3)}x       | ` +
    `${r.err.toFixed(2)}      | dx=${r.dx} dy=${r.dy}`,
  );
}

const best = resultados[0];
const razao = best.L / R.w;
// Os deslocamentos são medidos na grade reduzida; devolvê-los no mundo da
// referência é o que permite conferir contra a geometria (no FOV-1, dy=120 é
// exatamente metade de 960-720).
const dyRef = best.dy * REDUCE, dxRef = best.dx * REDUCE;

console.log();
console.log(`MELHOR CASAMENTO: o conteúdo do candidato equivale a ${best.L} px`);
console.log(`de largura no mundo da referência (que tem ${R.w}).`);
console.log(`deslocamento no mundo da referência: dx=${dxRef} dy=${dyRef}`);
console.log(`margem sobre o vizinho: ${resultados[1]
  ? (resultados[1].err - best.err).toFixed(2) : 'n/d'} de erro médio`);

if (Math.abs(razao - 1) < 0.06) {
  console.log('=> MESMO campo horizontal. A diferença entre os dois é VERTICAL.');
  console.log('=> VEREDITO: RECOMPOSIÇÃO.');
} else if (razao > 1) {
  console.log(`=> o candidato mostra ${((razao - 1) * 100).toFixed(0)}% MENOS ` +
    'campo horizontal (a cena aparece maior nele, logo cabe menos mundo).');
  console.log('=> VEREDITO: CORTE na horizontal.');
} else {
  console.log(`=> o candidato mostra ${((1 / razao - 1) * 100).toFixed(0)}% ` +
    'MAIS campo horizontal.');
  console.log('=> VEREDITO: campo horizontal AMPLIADO.');
}

rmSync(dir, { recursive: true, force: true });
