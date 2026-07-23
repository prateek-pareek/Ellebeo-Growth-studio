/**
 * debug-slide2.ts — diagnose the compositing pipeline
 */
import sharp from 'sharp';
import fs from 'fs';

async function test() {
  const w = 1080;
  const h = 1080;
  const bgColor = '#C9BFB2';

  // Step 1: Red photo at 460x276
  const redPhoto = await sharp({
    create: { width: 460, height: 276, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).png().toBuffer();

  const top = Math.round(h * 0.28) + 10; // 312
  const left = 50;

  // Step 2: Build base image (channels=3, no alpha)
  const baseImg = await sharp({
    create: { width: w, height: h, channels: 3, background: bgColor },
  }).composite([{ input: redPhoto, top, left }]).png().toBuffer();

  const baseMeta = await sharp(baseImg).metadata();
  console.log('Base image metadata:', { channels: baseMeta.channels, hasAlpha: baseMeta.hasAlpha, format: baseMeta.format });

  // Step 3: Check what happens when we composite a fully transparent PNG over base
  const transparentPng = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).png().toBuffer();

  const transparentMeta = await sharp(transparentPng).metadata();
  console.log('Transparent PNG metadata:', { channels: transparentMeta.channels, hasAlpha: transparentMeta.hasAlpha });

  // Step 4: Composite transparent PNG over red-on-beige base
  const resultTransparent = await sharp(baseImg)
    .composite([{ input: transparentPng, blend: 'over' }])
    .png()
    .toBuffer();

  fs.writeFileSync('debug_transparent_overlay.png', resultTransparent);
  console.log('✅ Saved debug_transparent_overlay.png — should STILL show red photo if transparent overlay works');

  // Step 5: Test with an SVG that is purely transparent (no elements)
  const emptySvg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="900" y="100" font-size="40" fill="black" font-family="sans-serif">TEST</text>
  </svg>`;

  const svgBuf = await sharp(Buffer.from(emptySvg), { density: 300 })
    .resize(w, h)
    .png()
    .toBuffer();
  
  const svgMeta = await sharp(svgBuf).metadata();
  console.log('SVG PNG metadata:', { channels: svgMeta.channels, hasAlpha: svgMeta.hasAlpha });

  // Step 6: Composite SVG over base
  const resultSvg = await sharp(baseImg)
    .composite([{ input: svgBuf, blend: 'over' }])
    .png()
    .toBuffer();

  fs.writeFileSync('debug_svg_overlay.png', resultSvg);
  console.log('✅ Saved debug_svg_overlay.png — should show red photo with TEST text on top');
  
  console.log('\nIf red photo is NOT visible in debug_svg_overlay.png, there is a Sharp compositing channel mismatch bug');
}

test().catch(console.error);
