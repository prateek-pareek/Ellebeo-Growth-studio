import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export type LabLayout = 'cover' | 'split' | 'banner' | 'framed_cta' | 'type_step';

export type LabSlideSpec = {
  layout: LabLayout;
  headline: string;
  subhead?: string;
  pill?: string;
  cta?: string;
  photo: 'before' | 'after' | 'both';
  leftPill?: string;
  rightPill?: string;
};

export type LabPalette = {
  background: string;
  secondary: string;
  depth: string;
  accent: string;
  primary: string;
};

export type LogoPosition = 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';

const LOGO_BOX_W = 240;
const LOGO_BOX_H = 80;
const SAFE = 48;
const BRAND_STRIP = 108;
const MAT = 14;
const SHADOW = 36;

const SIZES: Record<string, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
};

let cachedFontCss: string | null = null;

function serifCss(): string {
  if (cachedFontCss) return cachedFontCss;
  const candidates = [
    path.join(__dirname, '../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    path.join(process.cwd(), 'assets/fonts/PlayfairDisplay-Regular.ttf'),
  ];
  try {
    const fontPath = candidates.find((p) => fs.existsSync(p));
    if (!fontPath) throw new Error('font missing');
    const b64 = fs.readFileSync(fontPath).toString('base64');
    cachedFontCss = `@font-face{font-family:'LabSerif';src:url('data:font/ttf;base64,${b64}') format('truetype');}`;
  } catch {
    cachedFontCss = '';
  }
  return cachedFontCss;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
      if (lines.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length >= 2) {
    const last = lines[lines.length - 1];
    const prev = lines[lines.length - 2];
    if (last.length < maxChars * 0.38 && prev.includes(' ')) {
      const parts = prev.split(' ');
      const moved = parts.pop();
      if (moved && `${moved} ${last}`.length <= maxChars + 2) {
        lines[lines.length - 2] = parts.join(' ');
        lines[lines.length - 1] = `${moved} ${last}`;
      }
    }
  }
  return lines.length ? lines : [text.trim().slice(0, maxChars)];
}

const HEAD_LH = 1.04;
const SUB_LH = 1.38;
const SUB_SIZE = 24;
const PILL_H = 38;
const ACCENT_H = 2;
const TYPE_PAD = 8;

function wrapToWidth(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const avg = fontSize * 0.58;
  const maxChars = Math.max(8, Math.floor(maxWidth / avg));
  return wrap(text, maxChars, maxLines);
}

function fitHeadline(text: string, maxWidth: number, maxHeight: number, startSize: number, minSize = 34, maxLines = 3): { lines: string[]; size: number; height: number } {
  for (let size = startSize; size >= minSize; size -= 2) {
    const lines = wrapToWidth(text, size, maxWidth, maxLines);
    const height = Math.ceil(lines.length * size * HEAD_LH);
    if (height <= maxHeight) return { lines, size, height };
  }
  const lines = wrapToWidth(text, minSize, maxWidth, maxLines);
  return { lines, size: minSize, height: Math.ceil(lines.length * minSize * HEAD_LH) };
}

/** Standardise source — EXIF rotate + sRGB PNG. Colour is not graded. */
export async function prepareLabPhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .toColourspace('srgb')
    .resize({
      width: 2800,
      height: 2800,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 4, quality: 100 })
    .toBuffer();
}

/** Resize only — original colour preserved. Attention crop keeps faces in frame. */
async function coverSlot(buffer: Buffer, w: number, h: number, radius = 0): Promise<Buffer> {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const hiW = width * 2;
  const hiH = height * 2;
  let hi: Buffer;
  try {
    hi = await sharp(buffer)
      .rotate()
      .resize(hiW, hiH, { fit: 'cover', position: sharp.strategy.attention, kernel: sharp.kernel.lanczos3 })
      .toBuffer();
  } catch {
    hi = await sharp(buffer)
      .rotate()
      .resize(hiW, hiH, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
      .toBuffer();
  }
  const fitted = await sharp(hi)
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.85, m1: 0.7, m2: 0.35 })
    .png({ compressionLevel: 6, quality: 100 })
    .toBuffer();
  if (!radius) return fitted;
  const rx = Math.max(2, radius);
  const mask = await rasterSvg(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="white"/></svg>`,
    width,
    height,
  );
  return sharp(fitted)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function rasterSvg(svg: string, w: number, h: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 288 })
    .resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

async function softShadow(w: number, h: number, matW: number, matH: number, rx: number): Promise<Buffer> {
  const pad = Math.round(SHADOW * 0.35);
  const raw = await rasterSvg(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${pad + 4}" y="${pad + 8}" width="${matW}" height="${matH}" rx="${rx}" fill="#1a1410" opacity="0.28"/>
    </svg>`,
    w,
    h,
  );
  return sharp(raw).blur(7).png().toBuffer();
}

/** Paper mat + blurred shadow around an unchanged photo. */
async function framedPhoto(
  buffer: Buffer,
  innerW: number,
  innerH: number,
  radius: number,
  matColor: string,
): Promise<{ img: Buffer; w: number; h: number }> {
  const iw = Math.max(1, Math.round(innerW));
  const ih = Math.max(1, Math.round(innerH));
  const matW = iw + MAT * 2;
  const matH = ih + MAT * 2;
  const w = matW + SHADOW;
  const h = matH + SHADOW;
  const rx = Math.max(6, radius);
  const photoRx = Math.max(2, radius - 8);
  const photo = await coverSlot(buffer, iw, ih, photoRx);
  const shadow = await softShadow(w, h, matW, matH, rx);
  const mat = await rasterSvg(
    `<svg width="${matW}" height="${matH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${matW}" height="${matH}" rx="${rx}" fill="${matColor}"/>
      <rect x="0.75" y="0.75" width="${matW - 1.5}" height="${matH - 1.5}" rx="${rx - 0.5}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1.25"/>
      <rect x="1.5" y="1.5" width="${matW - 3}" height="${matH - 3}" rx="${rx - 1}" fill="none" stroke="#1a1410" stroke-opacity="0.08" stroke-width="1"/>
    </svg>`,
    matW,
    matH,
  );
  const img = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: mat, left: 0, top: 0 },
      { input: photo, left: MAT, top: MAT },
    ])
    .png()
    .toBuffer();
  return { img, w, h };
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  size: number,
  fill: string,
  font: string,
  weight = 400,
  tracking = 0,
  lineHeight = HEAD_LH,
): string {
  const dy = size * lineHeight;
  return lines
    .map((line, i) =>
      `<text x="${x}" y="${y + i * dy}" dominant-baseline="hanging" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${tracking}">${esc(line)}</text>`,
    )
    .join('');
}

function pillWidth(label: string, maxW: number): number {
  const text = label.toUpperCase();
  return Math.max(100, Math.min(maxW, 32 + text.length * 11.4));
}

function pill(x: number, y: number, label: string, bg: string, fg: string, maxW = 340): string {
  const text = label.toUpperCase().slice(0, 22);
  const w = pillWidth(text, maxW);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${PILL_H}" rx="${PILL_H / 2}" fill="${bg}"/>
    <text x="${x + w / 2}" y="${y + PILL_H / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="${fg}" letter-spacing="2.4">${esc(text)}</text>
  `;
}

export async function normalizeLogoLockup(logo: Buffer): Promise<Buffer> {
  const fitted = await sharp(logo)
    .rotate()
    .ensureAlpha()
    .resize({
      width: LOGO_BOX_W,
      height: LOGO_BOX_H,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, quality: 100 })
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const left = Math.max(0, Math.round((LOGO_BOX_W - (meta.width || LOGO_BOX_W)) / 2));
  const top = Math.max(0, Math.round((LOGO_BOX_H - (meta.height || LOGO_BOX_H)) / 2));
  return sharp({
    create: {
      width: LOGO_BOX_W,
      height: LOGO_BOX_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .composite([{ input: fitted, left, top }])
    .png()
    .toBuffer();
}

function logoOrigin(position: LogoPosition, w: number, h: number): { left: number; top: number } {
  const left = position === 'bottom_left' || position === 'top_left' ? SAFE : w - SAFE - LOGO_BOX_W;
  const top = position === 'top_left' || position === 'top_right' ? SAFE : h - SAFE - LOGO_BOX_H;
  return { left, top };
}

export const DEFAULT_LAB_PALETTE: LabPalette = {
  background: '#F6EEE4',
  secondary: '#CBBFB1',
  depth: '#393939',
  accent: '#CBBFB1',
  primary: '#393939',
};

type Rect = { x: number; y: number; w: number; h: number };

function typeColumn(
  canvasW: number,
  canvasH: number,
  topReserve: number,
  bottomReserve: number,
  margin: number,
): Rect {
  return {
    x: margin,
    y: topReserve + margin,
    w: canvasW - margin * 2,
    h: canvasH - topReserve - bottomReserve - margin * 2,
  };
}

export async function renderLabSlide(params: {
  spec: LabSlideSpec;
  aspectRatio: string;
  palette: LabPalette;
  before?: Buffer;
  after?: Buffer;
  logo?: Buffer;
  logoPosition?: LogoPosition;
}): Promise<Buffer> {
  const { w, h } = SIZES[params.aspectRatio] ?? SIZES['4:5'];
  const p = params.palette;
  const stampLogo = !!params.logo;
  const position = params.logoPosition || 'bottom_right';
  const photo = params.spec.photo === 'before' ? params.before : params.after;
  const before = params.before;
  const after = params.after ?? params.before;
  const hero = photo ?? after ?? before;
  if (!hero) throw new Error('No original photo to composite');

  const ink = contrastInk(p.background, p.depth);
  const typePalette: LabPalette = { ...p, depth: ink, primary: contrastInk(p.background, p.primary) };
  const canvas = sharp({
    create: { width: w, height: h, channels: 3, background: p.background },
  }).png();

  const composites: sharp.OverlayOptions[] = [];
  const layout = params.spec.layout;
  const m = Math.round(w * 0.065);
  const topReserve = stampLogo && position.startsWith('top') ? BRAND_STRIP : 0;
  const bottomReserve = stampLogo && position.startsWith('bottom') ? BRAND_STRIP : 0;
  const matColor = paperFrom(p.background);
  const gap = 32;

  let type: Rect = typeColumn(w, h, topReserve, bottomReserve, m);
  let photoA: Rect | null = null;
  let photoB: Rect | null = null;

  if (layout === 'split' && before && after) {
    const typeW = w - m * 2;
    const planned = planCopy(params.spec, typeW, Math.round(h * 0.26), w);
    const typeH = Math.min(Math.round(h * 0.3), planned.stackH + 24);
    type = { x: m, y: topReserve + m, w: typeW, h: typeH };
    const photoTop = type.y + type.h + 16;
    const availH = h - bottomReserve - m - photoTop;
    const frameW = Math.round((w - m * 3) / 2) - SHADOW;
    const frameH = Math.max(240, availH - SHADOW);
    const leftX = m;
    const rightX = m * 2 + frameW + SHADOW;
    const a = await framedPhoto(before, frameW, frameH, 8, matColor);
    const b = await framedPhoto(after, frameW, frameH, 8, matColor);
    composites.push({ input: a.img, left: leftX, top: photoTop }, { input: b.img, left: rightX, top: photoTop });
    photoA = { x: leftX, y: photoTop, w: a.w, h: a.h };
    photoB = { x: rightX, y: photoTop, w: b.w, h: b.h };
  } else if (layout === 'banner') {
    composites.push({ input: await coverSlot(hero, w, h, 0), left: 0, top: 0 });
    const bandH = Math.round(h * 0.36);
    type = {
      x: m,
      y: h - bottomReserve - m - bandH,
      w: w - m * 2,
      h: bandH,
    };
  } else if (layout === 'type_step') {
    const insetW = Math.round(w * 0.4);
    const insetH = Math.round(h * 0.32);
    const framed = await framedPhoto(hero, insetW, insetH, 8, matColor);
    const left = w - m - framed.w;
    const top = h - bottomReserve - m - framed.h;
    composites.push({ input: framed.img, left, top });
    photoA = { x: left, y: top, w: framed.w, h: framed.h };
    type = {
      x: m,
      y: topReserve + m,
      w: Math.min(Math.round(w * 0.58), left - gap - m),
      h: h - topReserve - bottomReserve - m * 2,
    };
  } else {
    const photoOnRight = layout === 'cover';
    const availH = h - topReserve - bottomReserve - m * 2;
    const frameW = Math.round(w * (photoOnRight ? 0.49 : 0.44));
    const frameH = Math.round(Math.min(availH * 0.9, h * 0.7));
    const framed = await framedPhoto(hero, frameW, frameH, 8, matColor);
    const left = photoOnRight ? w - m - framed.w : m;
    const top = Math.round((h - bottomReserve - topReserve - framed.h) / 2) + topReserve;
    composites.push({ input: framed.img, left, top });
    photoA = { x: left, y: top, w: framed.w, h: framed.h };
    if (photoOnRight) {
      type = {
        x: m,
        y: top,
        w: Math.max(200, left - gap - m),
        h: framed.h,
      };
    } else {
      const typeX = left + framed.w + gap;
      type = {
        x: typeX,
        y: top,
        w: Math.max(200, w - m - typeX),
        h: framed.h,
      };
    }
  }

  const svg = buildChromeSvg({
    w, h, spec: params.spec, palette: typePalette, logoPosition: position, showBrandStrip: stampLogo, type, photoA, photoB,
  });
  composites.push({ input: await rasterSvg(svg, w, h), left: 0, top: 0 });

  if (params.logo) {
    const { left, top } = logoOrigin(position, w, h);
    if (layout === 'banner') {
      const plate = await rasterSvg(
        `<svg width="${LOGO_BOX_W + 28}" height="${LOGO_BOX_H + 20}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${LOGO_BOX_W + 28}" height="${LOGO_BOX_H + 20}" rx="10" fill="${p.background}" fill-opacity="0.92"/>
        </svg>`,
        LOGO_BOX_W + 28,
        LOGO_BOX_H + 20,
      );
      composites.push({ input: plate, left: left - 14, top: top - 10 });
    }
    composites.push({ input: params.logo, left, top });
  }

  return canvas.composite(composites).png({ compressionLevel: 8, quality: 100 }).toBuffer();
}

function planCopy(spec: LabSlideSpec, typeW: number, typeH: number, canvasW: number) {
  const layout = spec.layout;
  const startSize = layout === 'banner'
    ? Math.round(canvasW * 0.05)
    : layout === 'type_step'
      ? Math.round(canvasW * 0.068)
      : layout === 'split'
        ? Math.round(canvasW * 0.052)
        : Math.round(canvasW * 0.06);
  const inTypePill = layout !== 'split' && !!spec.pill;
  const inTypeCta = layout !== 'split' && !!spec.cta;
  const accent = layout !== 'banner';
  const sub = spec.subhead ? wrapToWidth(spec.subhead, SUB_SIZE, typeW, 2) : [];
  const chrome = stackHeight({ pill: inTypePill, headH: 0, subLines: sub.length, cta: inTypeCta, accent });
  const head = fitHeadline(
    spec.headline || 'The result',
    typeW,
    Math.max(72, typeH - chrome - TYPE_PAD),
    startSize,
    layout === 'banner' ? 36 : 32,
    layout === 'split' ? 2 : 3,
  );
  return {
    head,
    sub,
    stackH: stackHeight({ pill: inTypePill, headH: head.height, subLines: sub.length, cta: inTypeCta, accent }),
    inTypePill,
    inTypeCta,
    accent,
  };
}

function stackHeight(opts: {
  pill?: boolean;
  headH: number;
  subLines: number;
  cta?: boolean;
  accent?: boolean;
}): number {
  let y = 0;
  if (opts.accent !== false) y += ACCENT_H + 18;
  if (opts.pill) y += PILL_H + 22;
  y += opts.headH;
  if (opts.subLines) y += 16 + Math.ceil(opts.subLines * SUB_SIZE * SUB_LH);
  if (opts.cta) y += 26 + PILL_H;
  return y;
}

function buildTypeStack(opts: {
  x: number;
  y: number;
  w: number;
  spec: LabSlideSpec;
  palette: LabPalette;
  head: { lines: string[]; size: number; height: number };
  sub: string[];
  serif: string;
  sans: string;
  accent?: boolean;
  headFill?: string;
  subFill?: string;
  pillBg?: string;
  pillFg?: string;
}): string {
  const p = opts.palette;
  let y = opts.y;
  let svg = '';
  if (opts.accent !== false) {
    svg += `<rect x="${opts.x}" y="${y}" width="44" height="${ACCENT_H}" fill="${p.accent}"/>`;
    y += ACCENT_H + 18;
  }
  if (opts.spec.pill) {
    svg += pill(opts.x, y, opts.spec.pill, opts.pillBg || p.depth, opts.pillFg || '#fff', opts.w);
    y += PILL_H + 22;
  }
  svg += textLines(opts.head.lines, opts.x, y, opts.head.size, opts.headFill || p.depth, opts.serif, 500, -1.1);
  y += opts.head.height;
  if (opts.sub.length) {
    y += 16;
    svg += textLines(opts.sub, opts.x, y, SUB_SIZE, opts.subFill || p.primary, opts.sans, 400, 0, SUB_LH);
    y += Math.ceil(opts.sub.length * SUB_SIZE * SUB_LH);
  }
  if (opts.spec.cta) {
    y += 26;
    svg += pill(opts.x, y, opts.spec.cta, opts.pillBg || p.depth, opts.pillFg || '#fff', opts.w);
  }
  return svg;
}

function buildChromeSvg(params: {
  w: number;
  h: number;
  spec: LabSlideSpec;
  palette: LabPalette;
  logoPosition: LogoPosition;
  showBrandStrip: boolean;
  type: Rect;
  photoA: Rect | null;
  photoB: Rect | null;
}): string {
  const { w, h, spec, palette: p, logoPosition, showBrandStrip, type, photoA, photoB } = params;
  const stripY = logoPosition.startsWith('top') ? 0 : h - BRAND_STRIP;
  const brandPlate = showBrandStrip
    ? `<rect x="0" y="${stripY}" width="${w}" height="${BRAND_STRIP}" fill="${p.background}"/>`
    : '';
  const serif = "'LabSerif', Georgia, serif";
  const sans = 'Helvetica, Arial, sans-serif';
  const typeW = Math.max(160, type.w);
  const { head, sub, stackH } = planCopy(spec, typeW, type.h, w);

  let extra = '';
  if (spec.layout === 'split') {
    extra += `<line x1="${type.x}" y1="${type.y + type.h - 8}" x2="${type.x + type.w}" y2="${type.y + type.h - 8}" stroke="${p.depth}" stroke-opacity="0.12" stroke-width="1"/>`;
    extra += buildTypeStack({
      x: type.x, y: type.y, w: typeW, spec: { ...spec, pill: undefined, cta: undefined }, palette: p, head, sub, serif, sans,
    });
    if (photoA) extra += pill(photoA.x + MAT + 10, photoA.y + MAT + 10, spec.leftPill || spec.pill || 'LOOK', p.depth, '#fff', Math.min(220, photoA.w - MAT * 2 - 20));
    if (photoB) extra += pill(photoB.x + MAT + 10, photoB.y + MAT + 10, spec.rightPill || 'LOOK', p.depth, '#fff', Math.min(220, photoB.w - MAT * 2 - 20));
  } else if (spec.layout === 'banner') {
    extra += `<rect width="${w}" height="${h}" fill="url(#scrim)"/>`;
    const y = type.y + Math.max(0, type.h - stackH);
    extra += `<g filter="url(#typeShadow)">`;
    extra += buildTypeStack({
      x: type.x, y, w: typeW, spec, palette: p, head, sub, serif, sans,
      accent: false, headFill: '#ffffff', subFill: 'rgba(255,255,255,0.9)',
      pillBg: p.background, pillFg: p.depth,
    });
    extra += `</g>`;
  } else {
    const y = type.y + Math.max(0, Math.round((type.h - stackH) / 2));
    extra += buildTypeStack({ x: type.x, y, w: typeW, spec, palette: p, head, sub, serif, sans });
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>${serifCss()} text{dominant-baseline:hanging}</style>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.depth}" stop-opacity="0"/>
        <stop offset="42%" stop-color="${p.depth}" stop-opacity="0.08"/>
        <stop offset="72%" stop-color="${p.depth}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${p.depth}" stop-opacity="0.82"/>
      </linearGradient>
      <filter id="typeShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>
    ${extra}
    ${brandPlate}
  </svg>`;
}

function rgb(hexColor: string): { r: number; g: number; b: number } {
  const raw = hexColor.replace('#', '');
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(n.slice(0, 2), 16) || 0,
    g: parseInt(n.slice(2, 4), 16) || 0,
    b: parseInt(n.slice(4, 6), 16) || 0,
  };
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function luminance(hexColor: string): number {
  const { r, g, b } = rgb(hexColor);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mixToward(hexColor: string, target: string, t: number): string {
  const a = rgb(hexColor);
  const b = rgb(target);
  return toHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function paperFrom(bg: string): string {
  return mixToward(bg, '#FFFFFF', luminance(bg) > 0.72 ? 0.78 : 0.5);
}

function contrastInk(bg: string, preferred: string): string {
  const bgL = luminance(bg);
  const inkL = luminance(preferred);
  if (Math.abs(bgL - inkL) >= 0.32) return preferred;
  return bgL > 0.55 ? '#1C1917' : '#FAF7F2';
}

function hex(value: unknown, fallback: string): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{3,8}$/.test(withHash) ? withHash : fallback;
}

export function paletteFromBrand(dna: any): LabPalette {
  if (!dna) return { ...DEFAULT_LAB_PALETTE };
  const v2 = typeof dna.brandDnaV2 === 'string' ? safeJson(dna.brandDnaV2) : dna.brandDnaV2;
  const pal = v2?.visual_identity?.palette || {};
  return {
    background: hex(pal.background || dna.backgroundBrandColor, DEFAULT_LAB_PALETTE.background),
    secondary: hex(pal.secondary || dna.secondaryBrandColor, DEFAULT_LAB_PALETTE.secondary),
    depth: hex(pal.depth || dna.depthBrandColor || pal.primary || dna.primaryBrandColor, DEFAULT_LAB_PALETTE.depth),
    accent: hex(pal.accent || dna.accentBrandColor, DEFAULT_LAB_PALETTE.accent),
    primary: hex(pal.primary || dna.primaryBrandColor, DEFAULT_LAB_PALETTE.primary),
  };
}

/** Guided v2 palette is [background, secondary, depth, accent]. */
export function paletteFromGuided(palette: string[] | undefined): LabPalette {
  const [background, secondary, depth, accent] = palette || [];
  return {
    background: hex(background, DEFAULT_LAB_PALETTE.background),
    secondary: hex(secondary, DEFAULT_LAB_PALETTE.secondary),
    depth: hex(depth, DEFAULT_LAB_PALETTE.depth),
    accent: hex(accent, DEFAULT_LAB_PALETTE.accent),
    primary: hex(depth, DEFAULT_LAB_PALETTE.primary),
  };
}

export function logoPositionFromBrand(dna: any): LogoPosition {
  const raw = String(dna.logoPosition || v2Logo(dna) || 'bottom_right');
  if (raw === 'bottom_left' || raw === 'top_right' || raw === 'top_left' || raw === 'bottom_right') return raw;
  return 'bottom_right';
}

function v2Logo(dna: any): string | undefined {
  const v2 = typeof dna.brandDnaV2 === 'string' ? safeJson(dna.brandDnaV2) : dna.brandDnaV2;
  return v2?.logo_position || v2?.visual_identity?.logo_position;
}

function safeJson(value: string): Record<string, any> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
