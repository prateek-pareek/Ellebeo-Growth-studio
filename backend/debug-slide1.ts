/**
 * debug-slide1.ts — Run with: npx ts-node debug-slide1.ts
 * Tests the universal_dynamic_base → universal_dynamic_deco pipeline for desktop_course_hero
 * to confirm whether the client photo shows through the SVG overlay.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Minimal inline versions of the functions we need to test
async function test() {
  const w = 1080;
  const h = 1080;
  const bgColor = '#C9BFB2'; // the beige background color

  // Step 1: Create a solid RED test photo to see if it shows through
  const redPhoto = await sharp({
    create: { width: 460, height: 276, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).png().toBuffer();

  // Step 2: Build the base image — same as universal_dynamic_base for desktop_monitor_mockup
  const backgroundCanvas = sharp({
    create: { width: w, height: h, channels: 3, background: bgColor },
  });

  const top = Math.round(h * 0.28) + 10; // ~312
  const left = 40 + 10; // = 50

  console.log(`Placing red photo at top=${top}, left=${left}, width=460, height=276`);

  const baseImage = backgroundCanvas.composite([{ input: redPhoto, top, left }]);
  const baseBuffer = await baseImage.png().toBuffer();

  // Save base image to check
  fs.writeFileSync(path.join(__dirname, 'debug_base.png'), baseBuffer);
  console.log('✅ Saved debug_base.png — should show red rectangle at ~(50, 312) on beige background');

  // Step 3: Create the iMac SVG overlay (same as desktop_monitor_mockup + universal_dynamic_deco)
  const svgString = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="premium_shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="15" flood-color="#000000" flood-opacity="0.25"/>
        </filter>
      </defs>

      <!-- iMac Desktop Monitor Frame (bezel-only: screen area is transparent so client photo shows through) -->
      <g transform="translate(40, ${h * 0.28})">
        <!-- Outer monitor border ring only — fill none so the photo underneath is visible through the screen -->
        <rect x="0" y="0" width="480" height="320" rx="14" fill="none" stroke="#CBD5E1" stroke-width="12" />
        <!-- Inner screen border accent -->
        <rect x="10" y="10" width="460" height="276" rx="4" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
        <!-- Bottom chin of the monitor (below the screen) -->
        <rect x="0" y="296" width="480" height="24" rx="0" fill="#D1D9E6" />
        <rect x="0" y="308" width="480" height="12" rx="0" fill="#CBD5E1" />
        <!-- Stand -->
        <path d="M 200 320 L 280 320 L 295 375 L 185 375 Z" fill="#CBD5E1" />
        <rect x="170" y="372" width="140" height="6" rx="3" fill="#94A3B8" />
      </g>

      <!-- Test text -->
      <text x="700" y="300" font-size="48" fill="#000000" font-family="sans-serif">HELLO</text>
    </svg>
  `;

  // Render SVG at 300 DPI
  const svgBuffer = await sharp(Buffer.from(svgString), { density: 300 })
    .resize(w, h)
    .png()
    .toBuffer();

  // Check SVG buffer transparency
  const svgMeta = await sharp(svgBuffer).metadata();
  console.log(`SVG buffer: channels=${svgMeta.channels}, hasAlpha=${svgMeta.hasAlpha}, format=${svgMeta.format}`);

  fs.writeFileSync(path.join(__dirname, 'debug_svg.png'), svgBuffer);
  console.log('✅ Saved debug_svg.png — should show iMac frame on TRANSPARENT background');

  // Step 4: Composite SVG over the MATERIALIZED base image buffer
  // This is the correct way — always toBuffer() first, then composite on top
  const baseBufferForComposite = await sharp({
    create: { width: w, height: h, channels: 3, background: bgColor },
  }).composite([{ input: redPhoto, top, left }])
    .png()
    .toBuffer();

  const final = await sharp(baseBufferForComposite)
    .composite([{ input: svgBuffer, blend: 'over' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(__dirname, 'debug_final.png'), final);
  console.log('✅ Saved debug_final.png — should show red photo VISIBLE inside iMac frame screen area');
  console.log('');
  console.log('If debug_final.png shows beige (no red), the SVG has an opaque white/beige background!');
  console.log('If debug_final.png shows red through the iMac screen, the pipeline is working correctly.');
}

test().catch(console.error);
