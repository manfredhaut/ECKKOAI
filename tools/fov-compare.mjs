// tools/fov-compare.mjs — corte vs recomposição. Custo zero, só leitura.
// uso: node tools/fov-compare.mjs <master16x9.mp4> <master9x16.mp4>
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
        // fração da altura do conteúdo que fica ACIMA do sujeito
        headroom:+(er.a/bh).toFixed(4),
        // fração da altura ocupada pelo sujeito
        sujeitoV:+((er.z-er.a)/bh).toFixed(4),
        // fração da largura ocupada pelo sujeito
        sujeitoH:+((ec.z-ec.a)/p.w).toFixed(4)
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

const hA = A.amostras.map(x=>x.headroom), hB = B.amostras.map(x=>x.headroom);
const okA = agree(hA,0.04), okB = agree(hB,0.04);
const mA = hA.reduce((s,v)=>s+v,0)/hA.length, mB = hB.reduce((s,v)=>s+v,0)/hB.length;
const d = mB-mA;

console.log('\nheadroom 16:9 =', mA.toFixed(4), okA?'(3 quadros concordam)':'(DIVERGEM)');
console.log('headroom 9:16 =', mB.toFixed(4), okB?'(3 quadros concordam)':'(DIVERGEM)');
console.log('delta =', d.toFixed(4));
if (!okA || !okB) console.log('VEREDITO: pending — os quadros nao concordam, nao conclua.');
else if (Math.abs(d) <= 0.03) console.log('VEREDITO: CORTE — extensao vertical preservada.');
else if (d > 0.03) console.log('VEREDITO: RECOMPOSICAO — o 9:16 tem mais campo vertical.');
else console.log('VEREDITO: anomalo — o 9:16 tem MENOS campo vertical que o 16:9.');
