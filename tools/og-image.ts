// Renders the social share card, assets/og-image.svg, to the 1200x630 PNG that og:image points at.
// Run with `bun tools/og-image.ts` after changing the SVG; the PNG is checked in.
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const assets = join(import.meta.dir, '../assets');
const svg = await Bun.file(join(assets, 'og-image.svg')).text();
const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans Mono' } })
  .render()
  .asPng();
await Bun.write(join(assets, 'og-image.png'), png);
console.log(`assets/og-image.png: ${png.length} bytes`);
