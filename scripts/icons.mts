/**
 * Generates the PWA and favicon icons from the official logo (public/logo.jpg). Run: pnpm icons
 * - "any" icons: the round badge cut out on a transparent background (clean on any launcher/splash).
 * - maskable icons: the badge inside the 80% safe zone on white (Android crops to a circle/squircle).
 * - apple-touch / favicon: opaque white (iOS fills transparency with black).
 * - shortcut icons: a white glyph on the logo green, for the manifest shortcuts.
 */
import sharp from "sharp";

const SRC = process.env.ICON_SRC ?? "public/logo.jpg";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const GREEN = "#237a3b";

async function badge(size: number) {
  return sharp(SRC).resize(size, size, { fit: "contain", background: WHITE }).toBuffer();
}

/** Opaque square: the badge centred at `safeZone` of the size, on white. */
async function opaque(size: number, file: string, safeZone = 1) {
  const inner = await badge(Math.round(size * safeZone));
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: inner, gravity: "center" }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(file);
}

/** Round badge cut out of the white square (the logo's outer ring sits at ~98% of the width). */
async function round(size: number, file: string) {
  const r = size / 2;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r * 0.985}" fill="#fff"/></svg>`,
  );
  await sharp(await badge(size))
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(file);
}

/** Lucide-style glyph (24x24 viewBox paths) in white on a green rounded square. */
async function shortcut(size: number, file: string, paths: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="6" fill="${GREEN}"/>
  <g transform="translate(4.8 4.8) scale(0.6)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>`;
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(file);
}

const USERS =
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
const SHIELD =
  '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>';

await round(192, "public/icons/icon-192.png");
await round(512, "public/icons/icon-512.png");
await opaque(192, "public/icons/maskable-192.png", 0.8);
await opaque(512, "public/icons/maskable-512.png", 0.8);
await shortcut(96, "public/icons/shortcut-members.png", USERS);
await shortcut(96, "public/icons/shortcut-committee.png", SHIELD);
await opaque(180, "src/app/apple-icon.png");
await opaque(64, "src/app/icon.png");
console.log("icons written");
