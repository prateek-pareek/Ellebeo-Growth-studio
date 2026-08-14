import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { AssembledPrompt } from '../types/chain-output.types';

export interface StrategistOutput {
  hookSentence: string;
  caption: string;
  hashtags: string[];
  keyClinicalFocus: string;
  callToAction: string;
  brandVoiceConfidenceScore: number;
}

export class BrandStrategistChain {
  async generate(params: {
    assembledPrompt: AssembledPrompt;
    brandDNABlacklist: string[];
    llmConfig?: any;
    angle?: 'technical' | 'empathetic';
  }): Promise<StrategistOutput> {
    const { assembledPrompt, brandDNABlacklist, llmConfig, angle = 'technical' } = params;

    const systemPrompt = `${assembledPrompt.systemPrompt}

You are an elite, senior Brand Strategist and Copywriter for beauty, salon, and medical aesthetics professionals.
Your goal is to write copywriting that sounds authoritative, clinical, yet warm and client-empathetic.
${angle === 'technical'
        ? 'ANGLE: Focus heavily on technical precision, clinical details, treatment science, and direct value.'
        : 'ANGLE: Focus heavily on client empathy, addressing anxieties, structural truth, and professional warmth.'}

Avoid generic AI tells like "luxurious", "obsessed", "glow up", or "transformative experience". Instead, focus on technical precision and direct value.
Never generate fake client names. If name is not provided, do not use any client names.

CRITICAL LENGTH DISCIPLINE: The message below contains a "## LENGTH REQUIREMENT" section — treat that as a HARD CAP on the "caption" field, not a suggestion. A senior strategist's actual skill is compression: choosing the ONE most valuable technical/clinical detail and cutting everything else, never stacking multiple details into extra sentences or paragraphs just because they're relevant. Being "technical" means precise word choice, not longer copy.

OUTPUT INSTRUCTIONS:
- You must reply in valid JSON format only.
- Do NOT output any markdown tags (like \`\`\`json), prefix, or suffix.
- Keep output values strictly clinical and aligned with the practitioner's signature system.
- CRITICAL: You MUST escape all newlines within your JSON string values as \\n. NEVER output a literal newline inside a string value.

JSON Schema:
{
  "hookSentence": "A scroll-stopping opening hook sentence.",
  "caption": "The main caption copy body, structured with technical expertise and clinical proof.",
  "callToAction": "A soft, professional invitation call-to-action.",
  "hashtags": ["list", "of", "clean", "hashtags"],
  "keyClinicalFocus": "Brief note on what clinical or aesthetic value this post prioritizes.",
  "brandVoiceConfidenceScore": 0.95
}`;

    const openaiKey = process.env.GEMINI_API_KEY;
    if (!openaiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment');
    }

    const gpt = new ChatGoogleGenerativeAI({
      model: llmConfig?.modelId || 'gemini-flash-latest',
      temperature: 0.7,
      maxOutputTokens: 8192,
      apiKey: openaiKey,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const res = await gpt.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(assembledPrompt.userPrompt),
    ]);

    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    let cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    try {
      let obj: Record<string, any>;
      try {
        obj = JSON.parse(cleaned);
      } catch (parseError) {
        const sanitized = cleaned
          .replace(/\n/g, '\\n')
          .replace(/{\\n/g, '{\n')
          .replace(/\\n}/g, '\n}')
          .replace(/",\\n/g, '",\n')
          .replace(/\\n *"/g, '\n  "');
        obj = JSON.parse(sanitized);
      }

      // Validate blacklist matches
      const normalizedCaption = String(obj.caption || '').toLowerCase();
      const matches = brandDNABlacklist.filter(word => normalizedCaption.includes(word.toLowerCase()));
      if (matches.length > 0) {
        throw new Error(`Strategist output contains blacklisted words: ${matches.join(', ')}`);
      }

      return {
        hookSentence: String(obj.hookSentence || ''),
        caption: String(obj.caption || ''),
        hashtags: Array.isArray(obj.hashtags) ? obj.hashtags.map(String) : [],
        keyClinicalFocus: String(obj.keyClinicalFocus || ''),
        callToAction: String(obj.callToAction || ''),
        brandVoiceConfidenceScore: Number(obj.brandVoiceConfidenceScore || 0.8),
      };
    } catch (err: any) {
      const metadata = res.response_metadata ? JSON.stringify(res.response_metadata) : 'No metadata';
      throw new Error(`Failed to parse Strategist output: ${err.message}. Metadata: ${metadata}. Raw output: ${cleaned}`);
    }
  }
}
