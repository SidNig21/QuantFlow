import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const buildDir = join(repoRoot, "build");
const sourcePngPath = join(buildDir, "icon-source.png");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const MASTER_SIZE = 1024;
// Windows 11 app icons use a rounded square; ~22% radius matches the squircle in the art.
const CORNER_RADIUS_RATIO = 0.22;

if (!existsSync(sourcePngPath)) {
	throw new Error(`Missing ${sourcePngPath}`);
}

// 1. Trim the white canvas around the squircle artwork.
const trimmed = await sharp(sourcePngPath)
	.trim({ threshold: 20 })
	.png()
	.toBuffer();

// 2. Center-crop to a perfect square.
const { width = 0, height = 0 } = await sharp(trimmed).metadata();
const side = Math.min(width, height);
const squared = await sharp(trimmed)
	.extract({
		left: Math.floor((width - side) / 2),
		top: Math.floor((height - side) / 2),
		width: side,
		height: side,
	})
	.resize(MASTER_SIZE, MASTER_SIZE, { kernel: sharp.kernel.lanczos3 })
	.png()
	.toBuffer();

// 3. Cut transparent rounded corners so no white fringe survives.
const radius = Math.round(MASTER_SIZE * CORNER_RADIUS_RATIO);
const mask = Buffer.from(
	`<svg width="${MASTER_SIZE}" height="${MASTER_SIZE}">` +
	`<rect x="0" y="0" width="${MASTER_SIZE}" height="${MASTER_SIZE}" rx="${radius}" ry="${radius}" fill="#fff"/>` +
	`</svg>`,
);

const masterPng = await sharp(squared)
	.composite([{ input: mask, blend: "dest-in" }])
	.png()
	.toBuffer();

writeFileSync(join(buildDir, "icon.png"), masterPng);
console.log(`Wrote build/icon.png (${MASTER_SIZE}x${MASTER_SIZE})`);

// 4. Downscale for the multi-size Windows ICO.
const icoImages = [];
for (const size of ICO_SIZES) {
	icoImages.push(
		await sharp(masterPng)
			.resize(size, size, { kernel: sharp.kernel.lanczos3 })
			.png()
			.toBuffer(),
	);
}

writeFileSync(join(buildDir, "icon.ico"), await toIco(icoImages));
console.log(`Wrote build/icon.ico (${ICO_SIZES.join(", ")}px)`);
