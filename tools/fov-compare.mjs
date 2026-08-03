// tools/fov-compare.mjs — sonda de geometria de quadro. Custo zero, só leitura.
// uso: node tools/fov-compare.mjs <master16x9.mp4> <master9x16.mp4>
//
// ESTE SCRIPT NÃO DECIDE corte vs recomposição. Ele já tentou, e errou.
// O INSTRUMENTO DO VEREDITO É tools/scale-match.mjs.
//
// O QUE VALE AQUI: barFrac (fração de barra de preenchimento), conteudo e
// razaoConteudo. São medições diretas de perfil de luminância, conferidas
// contra fixture de preenchimento conhecido na guarda do 5F.
// Sanidade no par de masters do FOV-1: 57,8% de barra e razão 1,3333 (4:3).
//
// O QUE NÃO VALE: headroom, sujeitoV e sujeitoH, marcados _NAO_CONFIAVEL na
// tabela. Eles derivam de `edges()`, que devolve o primeiro/último ponto com
// desvio-padrão acima de um limiar relativo — e nestes masters isso é mobília e
// parede, não a pessoa. Prova de que não isolam sujeito nenhum: o bounding box
// que eles chamam de sujeito muda de proporção 1,80 → 0,94 entre dois vídeos da
// MESMA sala. Com eles, o veredito saía "anômalo", contradizendo a medição por
// casamento de escala. Ficam expostos porque são o insumo de um diagnóstico
// futuro (onde a borda de luminância está), nunca de um veredito de campo.
//
// O limiar EDGE_K não foi ajustado para produzir veredito nenhum: a métrica foi
// desqualificada. Ajustar limiar até o resultado agradar é como se fabrica uma
// medição falsa que passa por boa.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SAMPLES = [0.15, 0.5, 0.85];   // mesmos instantes da sonda do 5F
const BAR_MEAN = 235, BAR_STD = 4;   // barra = clara e uniforme
const EDGE_K = 0.25;                 // limiar relativo do perfil

function probe(f) {
  const o = execFileSync('ffprobe', ['-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height,sample_aspect_ratio,display_aspect_ratio',
    '-show_entries','format=duration','-of','json', f]).toString();
  const j = JSON.parse(o), s = j.streams[0];
  return { w:+s.width, h:+s.height, sar:s.sample_aspect_ratio,
           dar:s.display_aspect_ratio, dur:+j.format.duration };
}

function gray(f, t, w, h, dir, tag) {
  const raw = join(dir, tag + '.raw');
  execFileSync('ffmpeg', ['-v','error','-ss', String(t), '-i', f,
    '-frames:v','1','-pix_fmt','gray','-f','rawvideo','-y', raw]);
  const b = readFileSync(raw);
  if (b.length !== w*h) throw new Error(tag+': '+b.length+' != '+w*h);
  return b;
}

function statsRow(b, w, y) {
  let s=0, q=0;
  for (let x=0; x<w; x++) { const v=b[y*w+x]; s+=v; q+=v*v; }
  const m=s/w; return { mean:m, std:Math.sqrt(Math.max(0,q/w-m*m)) };
}
function statsCol(b, w, x, y0, y1) {
  let s=0, q=0; const n=y1-y0;
  for (let y=y0; y<y1; y++) { const v=b[y*w+x]; s+=v; q+=v*v; }
  const m=s/n; return { mean:m, std:Math.sqrt(Math.max(0,q/n-m*m)) };
}

// banda de conteúdo: descarta linhas de barra (claras e uniformes)
function band(b, w, h) {
  const bar = [];
  for (let y=0; y<h; y++) { const r=statsRow(b,w,y);
    bar.push(r.mean>BAR_MEAN && r.std<BAR_STD); }
  let y0=0; while (y0<h && bar[y0]) y0++;
  let y1=h; while (y1>y0 && bar[y1-1]) y1--;
  return { y0, y1, barFrac: bar.filter(Boolean).length/h };
}

// primeiro/último índice acima do limiar relativo do perfil
function edges(prof) {
  const mn=Math.min(...prof), mx=Math.max(...prof);
  const th=mn+EDGE_K*(mx-mn);
  let a=0; while (a<prof.length && prof[a]<th) a++;
  let z=prof.length; while (z>a && prof[z-1]<th) z--;
  return { a, z };
}

function measure(f, tag) {
  const p = probe(f);
  const dir = mkdtempSync(join(tmpdir(),'fov-'));
  const out = [];
  try {
    for (const s of SAMPLES) {
      const t = p.dur*s;
      const b = gray(f, t, p.w, p.h, dir, tag+'-'+s);
      const bd = band(b, p.w, p.h);
      const bh = bd.y1-bd.y0;
      const rows=[]; for (let y=bd.y0;y<bd.y1;y++) rows.push(statsRow(b,p.w,y).std);
      const cols=[]; for (let x=0;x<p.w;x++) cols.push(statsCol(b,p.w,x,bd.y0,bd.y1).std);
      const er = edges(rows), ec = edges(cols);
      out.push({
        t:+t.toFixed(3),
        barFrac:+(bd.barFrac*100).toFixed(1),
        conteudo: p.w+'x'+bh,
        razaoConteudo:+(p.w/bh).toFixed(4),
        // As três abaixo NÃO medem o sujeito — ver o cabeçalho. O sufixo está
        // no nome de propósito: é onde o aviso é lido, já que a tabela costuma
        // ser copiada para fora sem o cabeçalho vir junto.
        headroom_NAO_CONFIAVEL:+(er.a/bh).toFixed(4),
        sujeitoV_NAO_CONFIAVEL:+((er.z-er.a)/bh).toFixed(4),
        sujeitoH_NAO_CONFIAVEL:+((ec.z-ec.a)/p.w).toFixed(4)
      });
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
  return { probe:p, amostras:out };
}

function agree(vals, tol) {
  return Math.max(...vals)-Math.min(...vals) <= tol;
}

const [a,b] = process.argv.slice(2);
if (!a || !b) { console.error('uso: node tools/fov-compare.mjs <16x9> <9x16>'); process.exit(2); }
const A = measure(a,'a'), B = measure(b,'b');
console.log('MASTER 16:9', a); console.log(A.probe); console.table(A.amostras);
console.log('MASTER 9:16', b); console.log(B.probe); console.table(B.amostras);

// Preenchimento é estático: os três quadros têm de concordar. Fronteira que se
// move entre quadros é imagem sendo confundida com barra — mesmo critério da
// sonda do 5F, e o único juízo que este script está em posição de emitir.
for (const [rot, X] of [['16:9', A], ['9:16', B]]) {
  const bf = X.amostras.map(x=>x.barFrac);
  const m = bf.reduce((s,v)=>s+v,0)/bf.length;
  console.log(`\npreenchimento ${rot} = ${m.toFixed(1)}% ` +
    (agree(bf,0.5) ? '(3 quadros concordam)'
                   : '(DIVERGEM — não conclua, pode ser imagem, não barra)'));
  console.log(`  conteúdo ${X.amostras[0].conteudo} · razão ` +
    `${X.amostras[0].razaoConteudo}`);
}

console.log('\nCorte vs recomposição NÃO se responde aqui. Rode:');
console.log(`  node tools/scale-match.mjs ${process.argv[2]} ${process.argv[3]} --ss <seg>`);
