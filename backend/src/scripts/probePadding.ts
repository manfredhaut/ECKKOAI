/**
 * Mede o preenchimento de um ou mais arquivos e imprime o resultado.
 *
 *   docker compose exec backend npx tsx src/scripts/probePadding.ts <arquivo>...
 *
 * Ferramenta de operação, não de teste: é com ela que se responde "esse vídeo
 * do fornecedor veio com barra?" sem abrir um editor.
 */
import { probePadding } from "../services/video/paddingProbe.js";

async function main(): Promise<void> {
  const arquivos = process.argv.slice(2);
  if (arquivos.length === 0) {
    console.error("uso: probePadding.ts <arquivo> [arquivo...]");
    process.exit(2);
  }

  for (const f of arquivos) {
    const r = await probePadding(f);
    const nome = f.split("/").pop() ?? f;
    console.log(`\n=== ${nome}`);
    console.log(`  veredito     ${r.verdict}`);
    console.log(`  quadro       ${r.frame.width}×${r.frame.height}  (proporção ${r.frameAspect.toFixed(3)})`);
    console.log(`  conteúdo     ${r.content.width}×${r.content.height}  (proporção ${r.contentAspect.toFixed(3)})`);
    console.log(`  preenchido   ${(r.paddingFraction * 100).toFixed(1)}%`);
    console.log(`  recorte      ${r.crop ? `x=${r.crop.x} y=${r.crop.y} ${r.crop.width}×${r.crop.height}` : "nenhum"}`);
    console.log(`  motivo       ${r.reason}`);
  }
}

main().catch((err) => {
  console.error("sonda falhou:", err);
  process.exit(1);
});
