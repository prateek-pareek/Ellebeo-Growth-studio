// ============================================================================
// moodboard-vision.chain.ts — GPT-4o Vision pass on brand moodboard images
// Reads the actual uploaded reference images and extracts their visual language
// (lighting, palette feel, composition, texture, mood) as a prompt-ready block.
// Non-fatal: if vision fails for any image the orchestrator continues without it.
// ============================================================================

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const MAX_IMAGES = 3; // Cost cap — never more than 3 moodboard images per generation

export class MoodboardVisionChain {
  private model: ChatGoogleGenerativeAI | null = null;

  private getModel(): ChatGoogleGenerativeAI {
    if (!this.model) {
      if (!process.env['GEMINI_API_KEY']) {
        throw new Error('GEMINI_API_KEY required for moodboard vision analysis');
      }
      this.model = new ChatGoogleGenerativeAI({
        model: 'gemini-pro-latest',
        temperature: 0.1,
        maxOutputTokens: 8192,
        apiKey: process.env['GEMINI_API_KEY'],
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      });
    }
    return this.model;
  }

  async analyse(moodboardUrls: string[], moodboardLabels: string[] = []): Promise<string> {
    const urls = moodboardUrls.slice(0, MAX_IMAGES).filter(Boolean);
    if (urls.length === 0) return '';

    const labelContext = moodboardLabels.length > 0
      ? `The professional described these references as: ${moodboardLabels.slice(0, MAX_IMAGES).join(' / ')}.`
      : '';

    const systemPrompt =
      `You are a senior art director interpreting visual moodboard references for a beauty brand. ` +
      `Your output will be injected directly into an image generation prompt. ` +
      `Write in directive language — as if briefing a photographer or image model on what to replicate.`;

    const humanMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text:
            `Analyse ${urls.length === 1 ? 'this moodboard reference image' : `these ${urls.length} moodboard reference images`} and describe ` +
            `their shared visual aesthetic in 2–3 sentences. ${labelContext}\n\n` +
            `Describe ONLY the visual language — not the subject matter. Specifically:\n` +
            `- How light falls (quality, direction, temperature)\n` +
            `- How the colour palette feels (warm/cool/neutral, saturated/muted, what tones dominate)\n` +
            `- How space and composition are used (tight crop / environmental / negative space / asymmetry)\n` +
            `- What textures or materials are present in the environment\n` +
            `- The overall mood and atmosphere in one phrase\n\n` +
            `Return a single plain-text paragraph starting with "Visual reference direction:". No JSON, no bullets, no headings.`,
        },
        ...urls.map((url) => ({
          type: 'image_url' as const,
          image_url: { url, detail: 'low' as const },
        })),
      ],
    });

    const response = await this.getModel().invoke([
      new SystemMessage(systemPrompt),
      humanMessage,
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : String(response.content);

    return content.trim();
  }

  /**
   * Intent-Based Extractor: Analyzes a single image for a specific intent (e.g. 'lighting', 'texture').
   * Used during the setup-time background job to cache specific traits.
   */
  async analyseSingleIntent(url: string, intent: string): Promise<string> {
    if (!url) return '';

    const systemPrompt =
      `You are a senior art director interpreting a visual moodboard reference for a beauty brand. ` +
      `I am providing you with ONE reference image. Your goal is to extract ONLY the visual information related to: ${intent.toUpperCase()}. ` +
      `Ignore all other elements of the image (subject matter, unrelated aesthetics). ` +
      `Write in clear, directive language, describing the ${intent} perfectly in 1-2 short sentences. ` +
      `Return a single plain-text string starting with "${intent.charAt(0).toUpperCase() + intent.slice(1)}:". No JSON, no bullets.`;

    const humanMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `Analyze this image and describe ONLY its ${intent}.`,
        },
        {
          type: 'image_url' as const,
          image_url: { url, detail: 'low' as const },
        },
      ],
    });

    const response = await this.getModel().invoke([
      new SystemMessage(systemPrompt),
      humanMessage,
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : String(response.content);

    return content.trim();
  }
}
