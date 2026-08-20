/** Gemini Lab–only Brand DNA v2. Do not import from the /generate pipeline. */

import * as dns from 'dns/promises';
import * as net from 'net';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import {
  CLIENT_TYPES,
  ESSENCE_WORDS,
  GENDER_FOCUS,
  MOODS,
  OBJECTIVES,
  SERVICES_BY_CATEGORY,
  SERVICE_CATEGORIES,
  type EssenceWord,
  type GenderFocus,
  type MoodId,
  type ObjectiveId,
  type ServiceCategory,
} from './contract';

const TEXT_MODEL = 'gemini-2.5-flash';
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 1_500_000;
const MAX_PROMPT_CHARS = 6000;

export type WebsiteScanResult = {
  brandName: string;
  mood: MoodId;
  essence: EssenceWord[];
  serviceCategory: ServiceCategory | '';
  services: string[];
  ageMin: number;
  ageMax: number;
  genderFocus: GenderFocus;
  clientTypes: string[];
  objective: ObjectiveId;
  storySentence: string;
};

/** Basic SSRF guard: only plain http(s) to a public hostname/IP. */
async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported.');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('That URL is not reachable from here.');
  }
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map((a) => a.address);
  } catch {
    throw new Error('Could not resolve that domain.');
  }
  for (const address of addresses) {
    if (isPrivateOrLoopback(address)) {
      throw new Error('That URL is not reachable from here.');
    }
  }
  return url;
}

function isPrivateOrLoopback(address: string): boolean {
  if (net.isIP(address) === 0) return true;
  if (address === '::1' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthStudioBrandScan/1.0)' },
    });
    if (!res.ok) throw new Error(`Site responded with ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text')) {
      throw new Error('That URL did not return a web page.');
    }
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) break;
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  } finally {
    clearTimeout(timeout);
  }
}

/** Strips scripts/styles/tags down to visible text + title/meta description — no DOM-parsing dependency, matches this codebase's plain-fetch style. */
function cleanHtml(html: string): { title: string; description: string; text: string } {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || '';
  const description =
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() || '';
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = withoutNoise
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROMPT_CHARS);
  return { title, description, text };
}

export async function scanWebsiteForBrandDna(rawUrl: string): Promise<WebsiteScanResult> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on this server');

  const url = await assertSafeUrl(rawUrl);
  const html = await fetchHtml(url);
  const { title, description, text } = cleanHtml(html);
  if (!text && !title) throw new Error('Could not read any content from that page.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: TEXT_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          brandName: { type: SchemaType.STRING, description: 'The business/brand name' },
          mood: { type: SchemaType.STRING, format: 'enum', enum: [...MOODS], description: 'Best-fit brand mood' },
          essence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING, format: 'enum', enum: [...ESSENCE_WORDS] }, description: 'Up to 3 essence words' },
          serviceCategory: { type: SchemaType.STRING, format: 'enum', enum: [...SERVICE_CATEGORIES], description: 'Primary service category' },
          services: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Services offered, matching known ids for the chosen category where possible' },
          ageMin: { type: SchemaType.NUMBER },
          ageMax: { type: SchemaType.NUMBER },
          genderFocus: { type: SchemaType.STRING, format: 'enum', enum: [...GENDER_FOCUS] },
          clientTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING, format: 'enum', enum: [...CLIENT_TYPES] } },
          objective: { type: SchemaType.STRING, format: 'enum', enum: [...OBJECTIVES], description: 'Best-fit content objective' },
          storySentence: { type: SchemaType.STRING, description: '1-2 sentence brand story in third person, no invented claims' },
        },
        required: ['brandName', 'mood', 'essence', 'serviceCategory', 'services', 'ageMin', 'ageMax', 'genderFocus', 'clientTypes', 'objective', 'storySentence'],
      },
    },
  });

  const prompt = [
    `You are reading a business website to build its brand profile for a social-content tool. Infer, don't invent facts you can't support.`,
    `Page title: ${title || '(none)'}`,
    `Meta description: ${description || '(none)'}`,
    `Page text:\n${text}`,
  ].join('\n\n');

  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text()) as Partial<WebsiteScanResult>;

  const serviceCategory = (SERVICE_CATEGORIES as readonly string[]).includes(String(parsed.serviceCategory))
    ? (parsed.serviceCategory as ServiceCategory)
    : '';
  const knownServices = serviceCategory ? SERVICES_BY_CATEGORY[serviceCategory] : [];
  const services = Array.isArray(parsed.services)
    ? parsed.services.map((s) => String(s)).filter((s) => knownServices.includes(s)).slice(0, 6)
    : [];

  return {
    brandName: String(parsed.brandName || title || '').slice(0, 120),
    mood: (MOODS as readonly string[]).includes(String(parsed.mood)) ? (parsed.mood as MoodId) : 'SOFT_GLAM',
    essence: Array.isArray(parsed.essence)
      ? parsed.essence.map((w) => String(w).toUpperCase()).filter((w): w is EssenceWord => (ESSENCE_WORDS as readonly string[]).includes(w)).slice(0, 3)
      : [],
    serviceCategory,
    services,
    ageMin: Math.min(65, Math.max(18, Number(parsed.ageMin) || 25)),
    ageMax: Math.min(65, Math.max(18, Number(parsed.ageMax) || 45)),
    genderFocus: (GENDER_FOCUS as readonly string[]).includes(String(parsed.genderFocus)) ? (parsed.genderFocus as GenderFocus) : 'WOMEN',
    clientTypes: Array.isArray(parsed.clientTypes)
      ? parsed.clientTypes.map((t) => String(t)).filter((t) => (CLIENT_TYPES as readonly string[]).includes(t)).slice(0, 5)
      : [],
    objective: (OBJECTIVES as readonly string[]).includes(String(parsed.objective)) ? (parsed.objective as ObjectiveId) : 'PREMIUM_CLIENTS',
    storySentence: String(parsed.storySentence || '').slice(0, 400),
  };
}
