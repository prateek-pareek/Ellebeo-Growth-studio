import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import * as https from 'https';
import * as http from 'http';

interface MoodboardAnalysisResult {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  accentColor: string;
  depthColor: string;
  lightingStyle: string;
  texturePreference: string;
  compositionStyle: string;
  styleVibe: string;
}

export async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fileToGenerativePart(buffer: Buffer, mimeType: string) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };
}

@Injectable()
export class MoodboardExtractorService {
  constructor(private readonly prisma: PrismaService) {}

  async analyseMoodboards(tenantId: string, imageUrls: string[]): Promise<any> {
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('No moodboard image URLs provided');
    }

    const geminiKey = process.env['GEMINI_API_KEY'];
    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            primaryColor: { type: SchemaType.STRING, description: 'Hex code for dominant/primary brand color (e.g. #2C3A2E)' },
            secondaryColor: { type: SchemaType.STRING, description: 'Hex code for supporting brand color (e.g. #C28D75)' },
            backgroundColor: { type: SchemaType.STRING, description: 'Hex code for clean background canvas color (e.g. #F7F4EF)' },
            accentColor: { type: SchemaType.STRING, description: 'Hex code for callouts/action highlights (e.g. #D4A373)' },
            depthColor: { type: SchemaType.STRING, description: 'Hex code for text/heading contrast (e.g. #1E1E1C)' },
            lightingStyle: { type: SchemaType.STRING, description: 'Brief description of lighting, e.g. soft daylight, moody shadows, clean bright' },
            texturePreference: { type: SchemaType.STRING, description: 'Core textures visible, e.g. linen, travertine, glossy dewy' },
            compositionStyle: { type: SchemaType.STRING, description: 'Visual structure style, e.g. negative space, macro zoom, off-center' },
            styleVibe: {
              type: SchemaType.STRING,
              description: 'Select exactly one matching aesthetic vibe from: quiet_luxury, editorial_beauty, clinical_minimalist, warm_wellness, high_fashion, polished_commercial, soft_feminine, bold_campaign, natural_organic, contemporary_cool',
            },
          },
          required: [
            'primaryColor',
            'secondaryColor',
            'backgroundColor',
            'accentColor',
            'depthColor',
            'lightingStyle',
            'texturePreference',
            'compositionStyle',
            'styleVibe',
          ],
        },
      },
    });

    const analyses: MoodboardAnalysisResult[] = [];

    for (const url of imageUrls) {
      try {
        console.log(`[MOODBOARD ANALYSER] Processing moodboard reference image: ${url}`);
        const buffer = await downloadImageAsBuffer(url);
        const imagePart = fileToGenerativePart(buffer, 'image/jpeg');

        const prompt = `Analyze this moodboard design inspiration image. Extract the core palette colors, textures, lighting style, compositional crop structures, and map the visual energy to one of the ten primary style vibes.`;
        const response = await model.generateContent([prompt, imagePart]);
        const text = response.response.text();
        const parsed = JSON.parse(text) as MoodboardAnalysisResult;
        analyses.push(parsed);
      } catch (err: any) {
        console.error(`[MOODBOARD ANALYSER ERROR] Failed to process image ${url}:`, err.message);
      }
    }

    if (analyses.length === 0) {
      throw new Error('All moodboard images failed to analyze');
    }

    // Aggregate traits from analyzed moodboards (Zero hardcodings - averages dynamic attributes)
    const totalCount = analyses.length;
    
    // Choose most common aesthetic vibe
    const vibeCounts: Record<string, number> = {};
    analyses.forEach((a) => {
      vibeCounts[a.styleVibe] = (vibeCounts[a.styleVibe] || 0) + 1;
    });
    const sortedVibes = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1]);
    const finalVibe = sortedVibes[0]?.[0] || 'quiet_luxury';

    // Averages/compiles color lists and text descriptions
    const primaryColors = analyses.map(a => a.primaryColor);
    const secondaryColors = analyses.map(a => a.secondaryColor);
    const backgroundColors = analyses.map(a => a.backgroundColor);
    const accentColors = analyses.map(a => a.accentColor);
    const depthColors = analyses.map(a => a.depthColor);

    const selectMiddleColor = (colors: string[]) => colors[Math.floor(colors.length / 2)] || '#161616';

    const finalPrimary = selectMiddleColor(primaryColors);
    const finalSecondary = selectMiddleColor(secondaryColors);
    const finalBackground = selectMiddleColor(backgroundColors);
    const finalAccent = selectMiddleColor(accentColors);
    const finalDepth = selectMiddleColor(depthColors);

    const uniqueList = (list: string[]) => Array.from(new Set(list.filter(Boolean)));

    const lightingList = uniqueList(analyses.map(a => a.lightingStyle));
    const textureList = uniqueList(analyses.map(a => a.texturePreference));
    const compList = uniqueList(analyses.map(a => a.compositionStyle));

    // Update Brand DNA record — preserving technician-defined fields
    const currentDna = await this.prisma.brandDNA.findFirst({
      where: { tenantId, isCurrent: true },
    });

    if (!currentDna) {
      throw new Error(`Current Brand DNA record not found for tenant: ${tenantId}`);
    }

    // Compile extracted tags as moodboard labels to inject into AI prompt context without overwriting manual settings
    const compiledLabels = uniqueList([
      finalVibe,
      ...lightingList,
      ...textureList,
      ...compList,
    ]);

    const updated = await this.prisma.brandDNA.update({
      where: { id: currentDna.id },
      data: {
        // Only fill empty/unset branding colors (technician manual selections are preserved)
        primaryBrandColor: currentDna.primaryBrandColor || finalPrimary,
        secondaryBrandColor: currentDna.secondaryBrandColor || finalSecondary,
        backgroundBrandColor: currentDna.backgroundBrandColor || finalBackground,
        accentBrandColor: currentDna.accentBrandColor || finalAccent,
        depthBrandColor: currentDna.depthBrandColor || finalDepth,

        // Only fill empty/unset preferences
        lightingPreference: currentDna.lightingPreference || lightingList.join(', '),
        texturePreference: currentDna.texturePreference || textureList.join(', '),
        compositionStyle: currentDna.compositionStyle || compList.join(', '),
        
        // Always store extracted vibe details in moodboard fields to be injected into prompt builder
        moodboardUrls: imageUrls,
        moodboardLabels: compiledLabels,
        
        // Append the vibe to visual rankings if empty
        visualRanking: currentDna.visualRanking && currentDna.visualRanking.length > 0 
          ? currentDna.visualRanking 
          : [finalVibe],
      },
    });

    console.log(`[MOODBOARD ANALYSER SUCCESS] Brand DNA visual settings analyzed and merged successfully for tenant ${tenantId}.`);
    return updated;
  }
}
