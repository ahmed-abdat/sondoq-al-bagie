/**
 * Generates the PWA and favicon icons from the official logo (public/logo.jpg). Run: pnpm icons
 * The logo is a round badge on white, so icons keep the white background.
 * Maskable icons shrink the badge into the 80% safe zone.
 */
import sharp from "sharp";

const SRC = process.env.ICON_SRC ?? "public/logo.jpg";
const OUT = process.env.ICON_OUT ?? ".";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function icon(size: number, file: string, safeZone = 1) {
  const inner = Math.round(size * safeZone);
  const badge = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: WHITE })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: badge, gravity: "center" }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
}

await icon(192, "public/icons/icon-192.png");
await icon(512, "public/icons/icon-512.png");
await icon(192, "public/icons/maskable-192.png", 0.8);
await icon(512, "public/icons/maskable-512.png", 0.8);
await icon(180, "src/app/apple-icon.png");
await icon(64, "src/app/icon.png");
console.log("icons written");
