/**
 * Gera os arquivos da marca a partir da logo original (assets/brand/logo-original.png).
 *   node scripts/brand-assets.mjs
 * Usa o sharp, que já vem com o Next. Rode de novo sempre que trocar a logo.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "assets/brand/logo-original.png";
const NAVY = "#0a0f2c";
/** Estrela central da logo (quadrado sem letras), usada nos ícones. */
const EMBLEM = { left: 930, top: 60, width: 312, height: 312 };

const emblem = () => sharp(SOURCE).extract(EMBLEM);

function roundedMask(size, radius) {
  return Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`);
}

/** Arquivo .ico com imagens PNG embutidas (formato aceito por todos os navegadores atuais). */
function toIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

// Logo para a interface (next/image gera os tamanhos menores).
await sharp(SOURCE).resize({ width: 1600 }).webp({ quality: 90, alphaQuality: 95 }).toFile("src/assets/brand/logo.webp");

// Ícones: aba do navegador (cantos arredondados), tela inicial do iPhone (opaco) e favicon.ico.
await emblem()
  .resize(256, 256)
  .composite([{ input: roundedMask(256, 56), blend: "dest-in" }])
  .png({ palette: true, quality: 90, compressionLevel: 9 })
  .toFile("src/app/icon.png");
await emblem().resize(180, 180).flatten({ background: NAVY }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile("src/app/apple-icon.png");
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(
  // O .ico exige PNG em RGBA.
  icoSizes.map(async (size) => ({ size, data: await emblem().resize(size, size).flatten({ background: NAVY }).ensureAlpha().png().toBuffer() })),
);
writeFileSync("src/app/favicon.ico", toIco(icoPngs));

// Imagem de compartilhamento (1200×630): logo sobre fundo cósmico.
const W = 1200;
const H = 630;
const background = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="v" cx="78%" cy="20%" r="70%"><stop offset="0" stop-color="#5b2fb8" stop-opacity="0.55"/><stop offset="1" stop-color="#5b2fb8" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="15%" cy="85%" r="70%"><stop offset="0" stop-color="#1f4fd1" stop-opacity="0.5"/><stop offset="1" stop-color="#1f4fd1" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <rect width="${W}" height="${H}" fill="url(#v)"/>
  <rect width="${W}" height="${H}" fill="url(#b)"/>
</svg>`);
const logo = await sharp(SOURCE).resize({ width: 1040 }).png().toBuffer();
const logoMeta = await sharp(logo).metadata();
await sharp(background)
  .composite([{ input: logo, left: Math.round((W - logoMeta.width) / 2), top: Math.round((H - logoMeta.height) / 2) }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile("src/app/opengraph-image.jpg");
writeFileSync("src/app/opengraph-image.alt.txt", "Genshin Draft Arena: draft competitivo de Genshin Impact");

console.log("Arquivos da marca gerados.");
