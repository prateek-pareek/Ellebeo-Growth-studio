import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

// The "Intermediate Knowledge" Schema inspired by GPT
interface IExtractedKnowledge {
  layoutFamily: {
    value: string; // e.g., "editorial", "minimal", "luxury", "clinical"
    confidence: number;
  };
  visualLanguage: {
    style: string;
    energy: string;
    tone: string;
    industry: string;
  };
  composition: {
    primaryFocus: string;
    secondaryFocus: string;
    readingFlow: string;
    balance: string; // "symmetrical", "asymmetrical"
    negativeSpace: string; // "large", "minimal", "balanced"
  };
  typography: {
    headlineStyle: string;
    hierarchy: string;
    tracking: string;
    lineBreakStrategy: string;
    contrast: string;
  };
  decorations: Array<{
    type: string; // "paper_tape", "badge", "shadow"
    purpose: string;
    emotion: string;
  }>;
  designRules: string[]; // "If portrait is left, leave 20% negative space on right"
}

async function run() {
  console.log("Starting Phase 4: Full Dataset Vision AI Knowledge Extraction");
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const manifestPath = path.join(__dirname, 'unique_layouts.json');
  const outputPath = path.join(__dirname, 'extracted_knowledge.json');

  if (!fs.existsSync(manifestPath)) {
    console.error("Manifest not found. Please run Phase 1 first.");
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Load existing results to avoid reprocessing and save API costs
  let results: { hash: string, knowledge: IExtractedKnowledge }[] = [];
  if (fs.existsSync(outputPath)) {
    try {
      results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      console.log(`Loaded ${results.length} previously extracted layouts.`);
    } catch(e) {
      console.warn("Could not parse existing output, starting fresh.");
    }
  }

  const processedHashes = new Set(results.map(r => r.hash));
  
  // Filter manifest for items we haven't processed yet
  const remainingBatch = manifest.filter((item: any) => !processedHashes.has(item.hash));
  console.log(`Selected ${remainingBatch.length} layouts remaining for extraction.`);

  if (remainingBatch.length === 0) {
    console.log("All layouts processed!");
    return;
  }

  const systemPrompt = `You are an elite, Senior AI Art Director and UI/UX Architect for AI Growth Studio.
Your job is NOT to extract rigid coordinates (like x:10, y:20).
Your job is to extract the **Procedural Design Intelligence** and psychological reasoning behind the provided Canva layout.

We are building a generative engine that will recreate this style dynamically. 
Analyze the image and provide the deep design semantics.

Output MUST be a strictly formatted JSON object matching this schema exactly:
{
  "layoutFamily": {
    "value": "e.g., editorial, minimalist_quote, luxury_split, clinical_hero, before_after, transformation, text_only, magazine",
    "confidence": 0.95
  },
  "visualLanguage": {
    "style": "e.g., editorial, minimal, organic, clinical",
    "energy": "e.g., calm, energetic, clinical",
    "tone": "e.g., luxury, youthful, premium",
    "industry": "e.g., medical aesthetics, beauty, wellness, fitness"
  },
  "composition": {
    "primaryFocus": "e.g., photo of face",
    "secondaryFocus": "e.g., headline text",
    "readingFlow": "e.g., Z-pattern, F-pattern, center-down, diagonal",
    "balance": "e.g., symmetrical, asymmetrical",
    "negativeSpace": "e.g., tiny, moderate, large"
  },
  "typography": {
    "headlineStyle": "e.g., fashion_serif, bold_sans, mixed",
    "hierarchy": "e.g., hero headline with small tagline",
    "tracking": "e.g., wide, tight, normal",
    "lineBreakStrategy": "e.g., balanced, forced orphans for style",
    "contrast": "e.g., high, low, medium"
  },
  "decorations": [
    {
      "type": "e.g., paper_tape, geometric_badge, drop_shadow, blob, divider, arrow, polaroid",
      "purpose": "e.g., highlight the call to action",
      "emotion": "e.g., handmade, premium, clinical"
    }
  ],
  "designRules": [
    "Rule 1: e.g., Always leave at least 20% negative space opposite the subject.",
    "Rule 2: e.g., If the portrait is centered, reduce heading width to prevent overlap.",
    "Rule 3: e.g., Anchor the button or CTA to the bottom left of the primary text block."
  ]
}

Think like a Senior Art Director explaining the template to a junior developer. Ensure your designRules are actionable instructions for a future layout compiler.`;

  for (let i = 0; i < remainingBatch.length; i++) {
    const item = remainingBatch[i];
    const imagePath = item.base_image;
    if (!fs.existsSync(imagePath)) {
      console.warn(`Image not found: ${imagePath}`);
      continue;
    }

    console.log(`[${i+1}/${remainingBatch.length}] Analyzing Hash [${item.hash}]...`);
    
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64Image}`, detail: "high" }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.2
      });

      const jsonStr = response.choices[0]?.message?.content;
      if (jsonStr) {
        const extracted = JSON.parse(jsonStr) as IExtractedKnowledge;
        results.push({ hash: item.hash, knowledge: extracted });
        console.log(`  -> Family: ${extracted.layoutFamily.value} (Confidence: ${extracted.layoutFamily.confidence})`);
        
        // Save incrementally every time so we don't lose progress if it crashes!
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
      }
    } catch (e) {
      console.error(`  -> Error calling Vision AI on ${item.hash}:`, (e as any).message);
      // Brief pause on error to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nSuccess! Phase 4 Full Dataset Extraction complete.`);
  console.log(`Extracted Design Knowledge saved to: ${outputPath}`);
}

run().catch(console.error);
