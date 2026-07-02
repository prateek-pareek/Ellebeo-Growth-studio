import { ChatOpenAI } from '@langchain/openai';
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

OUTPUT INSTRUCTIONS:
- You must reply in valid JSON format only.
- Do NOT output any markdown tags (like \`\`\`json), prefix, or suffix.
- Keep output values strictly clinical and aligned with the practitioner's signature system.

JSON Schema:
{
  "hookSentence": "A scroll-stopping opening hook sentence.",
  "caption": "The main caption copy body, structured with technical expertise and clinical proof.",
  "callToAction": "A soft, professional invitation call-to-action.",
  "hashtags": ["list", "of", "clean", "hashtags"],
  "keyClinicalFocus": "Brief note on what clinical or aesthetic value this post prioritizes.",
  "brandVoiceConfidenceScore": 0.95
}`;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not defined in the environment');
    }

    const gpt = new ChatOpenAI({
      modelName: llmConfig?.modelId || 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1024,
      openAIApiKey: openaiKey,
    });

    const res = await gpt.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(assembledPrompt.userPrompt),
    ]);

    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    try {
      const obj = JSON.parse(cleaned) as Record<string, any>;

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
      throw new Error(`Failed to parse Strategist output: ${err.message}. Raw output: ${cleaned}`);
    }
  }
}
