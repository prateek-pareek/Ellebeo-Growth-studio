import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI();

// Configuration
const BATCH_SIZE = 5; // Process 5 templates per request to stay well within context limits
const INPUT_FILE = path.join(__dirname, '../src/ai/config/template-library.json');
const OUTPUT_FILE = path.join(__dirname, '../src/ai/config/staging-compiled-layouts.json');

// Strict Zod-like JSON schema definition for GPT-4o-mini
const layoutSchema = {
  name: "CompiledLayouts",
  strict: true,
  schema: {
    type: "object",
    properties: {
      compiled_templates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            schemaVersion: { type: "string", enum: ["1.0"] },
            layoutVersion: { type: "string", enum: ["1.0"] },
            type: { type: "string", enum: ["hero", "stack", "grid", "sidebar"] },
            layers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string", enum: ["image", "decoration", "text"] },
                  zIndex: { type: "number" },
                  mask: { type: ["string", "null"], enum: ["rectangle", "circle", "arch", "die_cut", "split", "polaroid", null] },
                  paddingPercent: { type: ["number", "null"] },
                  component: { type: ["string", "null"], enum: ["wax_seal", "ticket_notches", "film_sprockets", "gallery_frame", "masking_tape", "gold_accents", "glass_card", "3d_ribbon", "metric_panel", "editorial_sidebar", "status_chip", "divider", "chapter_tabs", null] },
                  anchor: { type: ["string", "null"], enum: ["center", "top_left", "top_right", "top_center", "bottom_left", "bottom_right", "bottom_center", "bottom_edge", "corners", "edges", "middle_left", "middle_right", null] },
                  offsetPercent: { type: ["number", "null"] },
                  role: { type: ["string", "null"], enum: ["heading", "tagline", "watermark", "footnote", "body", null] },
                  alignment: { type: ["string", "null"], enum: ["left", "center", "right", null] },
                  maxWidthPercent: { type: ["number", "null"] }
                },
                required: ["id", "type", "zIndex", "mask", "paddingPercent", "component", "anchor", "offsetPercent", "role", "alignment", "maxWidthPercent"],
                additionalProperties: false
              }
            }
          },
          required: ["id", "schemaVersion", "layoutVersion", "type", "layers"],
          additionalProperties: false
        }
      }
    },
    required: ["compiled_templates"],
    additionalProperties: false
  }
};

const SYSTEM_PROMPT = `You are a Principal UI Engineer translating natural language design templates into a strict JSON Layout DSL.
You will be given a batch of templates. For each template, generate the exact "layers" array representing its visual structure and select a global layout "type" primitive (hero, stack, grid, sidebar).
- Always include an image layer (zIndex: 10). Determine its mask based on the description (default to rectangle, paddingPercent: 0 for full bleed).
- Analyze the semantic meaning of the template. If it implies data/stats, use the "metric_panel" component. If editorial, use "editorial_sidebar" or "divider". Use exact 'component' enum values.
- Always include a text layer (zIndex: 30) for heading and/or tagline, anchoring them where the description says.

Translate the semantic descriptions strictly into our primitive schema. Do NOT hallucinate mask or component types. Think like an architect generating React component props.
`;

async function main() {
  console.log('--- Starting Offline Layout Compiler (GPT-4o-mini) ---');

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set.');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const templateKeys = Object.keys(rawData).filter(k => k !== '_meta');
  
  console.log(`Found ${templateKeys.length} templates to compile.`);

  const allCompiled: Record<string, any> = {};
  
  // Process all templates in the library
  const targetKeys = templateKeys;
  
  for (let i = 0; i < targetKeys.length; i += BATCH_SIZE) {
    const batchKeys = targetKeys.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchKeys.length} templates)...`);
    
    const batchInput = batchKeys.map(k => ({
      id: k,
      description: rawData[k]
    }));

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(batchInput, null, 2) }
        ],
        response_format: {
          type: "json_schema",
          json_schema: layoutSchema
        },
        temperature: 0.1
      });

      const jsonStr = response.choices[0].message.content;
      if (!jsonStr) throw new Error("Empty response from OpenAI");

      const parsed = JSON.parse(jsonStr);
      
      for (const tpl of parsed.compiled_templates) {
        allCompiled[tpl.id] = {
          schemaVersion: tpl.schemaVersion,
          layoutVersion: tpl.layoutVersion,
          id: tpl.id,
          layers: tpl.layers
        };
      }
      
      console.log(`✅ Successfully compiled ${batchKeys.length} templates.`);
    } catch (err) {
      console.error(`❌ Failed to compile batch:`, err);
    }
  }

  // Load any existing compiled layouts so we don't overwrite them
  let finalOutput = {};
  const EXISTING_FILE = path.join(__dirname, '../src/ai/config/compiled-layouts.v1.json');
  if (fs.existsSync(EXISTING_FILE)) {
    finalOutput = JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf-8'));
  }
  
  // Merge newly compiled ones
  Object.assign(finalOutput, allCompiled);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
  console.log(`\n🎉 Compilation complete! Saved output to staging-compiled-layouts.json`);
}

main().catch(console.error);
