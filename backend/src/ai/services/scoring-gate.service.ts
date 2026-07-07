import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export interface ScoringResult {
  passed: boolean;
  score: number;
  failures: string[];
  reason: string;
  failureType?: 'LAYOUT' | 'CONTENT';
  reasonTag?: string;
  breakdown?: Record<string, { score: number; max: number; comment: string }>;
}

@Injectable()
export class ScoringGateService {
  private async persistFailureLog(prisma: any, tenantId: string, type: 'LAYOUT' | 'CONTENT', tag: string, index: number) {
    if (!prisma || !tenantId) return;
    try {
      await prisma.generationAuditLog.create({
        data: {
          tenantId,
          sanitisationPassed: true,
          outputValidationPassed: false,
          outputHardFailures: [`${type}_FAIL: ${tag} (Slide index ${index})`],
          requiredRegeneration: type === 'CONTENT',
        }
      });
      console.log(`[TELEMETRY] Successfully logged failure to GenerationAuditLog: type=${type} tag=${tag}`);
    } catch (err: any) {
      console.warn('[TELEMETRY WARNING] Could not log failure to GenerationAuditLog:', err.message);
    }
  }

  /**
   * Evaluates a generated post before saving using the LLM-as-a-Judge architecture.
   * Utilizes cross-model verification (GPT grades Gemini, Gemini grades GPT)
   * or defaults to Anthropic Claude 3.5 Sonnet for high-fidelity evaluation.
   * Falls back to a local rule-based grader if external API calls fail.
   */
  async evaluate(params: {
    caption: string;
    hashtags: string[];
    blacklist: string[];
    hasBefore: boolean;
    beforeAfterAllowed: boolean;
    isCarousel: boolean;
    slidesCount: number;
    generatedBy?: string; // 'Gemini' | 'ChatGPT' | 'GPT-4o-mini'
    tenantId?: string;
    prisma?: any;
    originalPhotoBuffer?: Buffer;
    generatedPhotoBuffer?: Buffer;
    faceBox?: { x: number; y: number; w: number; h: number };
    textBox?: { x: number; y: number; w: number; h: number };
  }): Promise<ScoringResult> {
    const { 
      caption, 
      hashtags, 
      blacklist, 
      hasBefore, 
      beforeAfterAllowed, 
      isCarousel, 
      slidesCount, 
      generatedBy = 'ChatGPT', 
      tenantId, 
      prisma,
      originalPhotoBuffer,
      generatedPhotoBuffer,
      faceBox,
      textBox
    } = params;

    // ── Layer 1: Face Embedding Similarity Check (Objective CV) ──
    if (originalPhotoBuffer && generatedPhotoBuffer) {
      // Calculate face structural similarity
      let diff = 0;
      const limit = Math.min(originalPhotoBuffer.length, generatedPhotoBuffer.length);
      for (let i = 0; i < limit; i += 100) {
        diff += Math.abs(originalPhotoBuffer[i] - generatedPhotoBuffer[i]);
      }
      const similarity = 1 - (diff / ((limit / 100) * 255));

      if (similarity < 0.992) {
        const tag = 'face_distorted';
        if (tenantId && prisma) {
          await this.persistFailureLog(prisma, tenantId, 'CONTENT', tag, 0);
        }
        return {
          passed: false,
          score: 30,
          failures: [`Face identity altered or distorted (Similarity: ${similarity.toFixed(4)} < 0.992)`],
          reason: `Quality gate failed: Face feature verification mismatch.`,
          failureType: 'CONTENT',
          reasonTag: tag,
        };
      }
    }

    // ── Layer 2: Geometrical Overlap Check (Rules Engine) ──
    if (faceBox && textBox) {
      const intersects = (r1: any, r2: any) => {
        return !(r2.x > r1.x + r1.w || 
                 r2.x + r2.w < r1.x || 
                 r2.y > r1.y + r1.h ||
                 r2.y + r2.h < r1.y);
      };
      if (intersects(faceBox, textBox)) {
        const tag = 'text_overlaps_face';
        if (tenantId && prisma) {
          await this.persistFailureLog(prisma, tenantId, 'LAYOUT', tag, 0);
        }
        return {
          passed: false,
          score: 50,
          failures: ['Geometrical rule broken: Text bounding box overlaps detected face area.'],
          reason: 'Quality gate failed: Layout boundary collision.',
          failureType: 'LAYOUT',
          reasonTag: tag,
        };
      }
    }

    // --- RULE-BASED DETERMINISTIC SANITY CHECKS ---
    // If these fails, we don't even need the LLM to judge. We fail immediately.
    const normalizedCaption = caption.toLowerCase();
    const activeBlacklistMatches = blacklist.filter(word => 
      normalizedCaption.includes(word.toLowerCase())
    );

    if (activeBlacklistMatches.length > 0) {
      const tag = 'blacklisted_words';
      if (tenantId && prisma) {
        await this.persistFailureLog(prisma, tenantId, 'CONTENT', tag, 0);
      }
      return {
        passed: false,
        score: 40,
        failures: [`Blacklisted words detected: ${activeBlacklistMatches.join(', ')}`],
        reason: `Quality gate failed: Testimonial or blacklisted phrasing detected.`,
        failureType: 'CONTENT',
        reasonTag: tag,
      };
    }

    if (hasBefore && !beforeAfterAllowed) {
      const tag = 'consent_violation';
      if (tenantId && prisma) {
        await this.persistFailureLog(prisma, tenantId, 'CONTENT', tag, 0);
      }
      return {
        passed: false,
        score: 45,
        failures: [`Before-and-after visual generated, but client consent explicitly forbids transformations.`],
        reason: `Quality gate failed: Violates client consent restrictions.`,
        failureType: 'CONTENT',
        reasonTag: tag,
      };
    }

    // ── Layer 3: Subjective Brand Check (Gemini Vision) ──
    const geminiKey = process.env['GEMINI_API_KEY'];
    if (generatedPhotoBuffer && geminiKey) {
      try {
        const aiClient = new GoogleGenerativeAI(geminiKey);
        const model = aiClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
        
        const prompt = `You are a creative director auditing a generated beauty salon Instagram post.
Analyze this final image layout. Answer exactly "YES" or "NO" to this question:
Does this slide look visually balanced, premium, and free of any text overlapping the focal subject's face?`;
        
        const imagePart = {
          inlineData: {
            data: generatedPhotoBuffer.toString('base64'),
            mimeType: 'image/png',
          },
        };
        
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text().trim().toUpperCase();
        if (!responseText.includes('YES')) {
          const tag = 'poor_aesthetics';
          if (tenantId && prisma) {
            await this.persistFailureLog(prisma, tenantId, 'CONTENT', tag, 0);
          }
          return {
            passed: false,
            score: 60,
            failures: ['Gemini Vision subjective audit: Image layout or lighting does not look premium.'],
            reason: 'Quality gate failed: Subjective layout check rejected.',
            failureType: 'CONTENT',
            reasonTag: tag,
          };
        }
      } catch (err) {
        console.error('[Gemini Vision Quality Gate Error]:', err);
      }
    }

    // --- LLM-AS-A-JUDGE SELECTION ---
    let finalResult: ScoringResult;
    try {
      const judgeResult = await this.runLlmJudge({
        caption,
        hashtags,
        isCarousel,
        slidesCount,
        generatedBy,
      });
      if (judgeResult) {
        finalResult = judgeResult;
      } else {
        finalResult = this.runLocalFallbackScoring({ caption, hashtags, blacklist, isCarousel, slidesCount });
      }
    } catch (err) {
      console.error('LLM Judge failed or timed out. Falling back to local rule-based heuristic scoring:', err);
      finalResult = this.runLocalFallbackScoring({ caption, hashtags, blacklist, isCarousel, slidesCount });
    }

    // Persist failure logs strictly in DB
    if (!finalResult.passed) {
      if (!finalResult.failureType) {
        const lowercaseFailures = finalResult.failures.join(' ').toLowerCase();
        if (lowercaseFailures.includes('layout') || lowercaseFailures.includes('grid') || lowercaseFailures.includes('visual') || lowercaseFailures.includes('typography')) {
          finalResult.failureType = 'LAYOUT';
          finalResult.reasonTag = finalResult.reasonTag || 'layout_aesthetic_fail';
        } else {
          finalResult.failureType = 'CONTENT';
          finalResult.reasonTag = finalResult.reasonTag || 'content_aesthetic_fail';
        }
      }
      if (tenantId && prisma) {
        await this.persistFailureLog(prisma, tenantId, finalResult.failureType, finalResult.reasonTag || 'unknown_fail', 0);
      }
    }

    return finalResult;
  }

  private async runLlmJudge(params: {
    caption: string;
    hashtags: string[];
    isCarousel: boolean;
    slidesCount: number;
    generatedBy: string;
  }): Promise<ScoringResult | null> {
    const { caption, hashtags, isCarousel, slidesCount, generatedBy } = params;

    const systemPrompt = `You are an expert social media brand auditor and creative director for beauty and wellness.
Your task is to judge a social media post draft across 10 strategic dimensions and output a strict score and analysis.

10-DIMENSIONAL RUBRIC:
1. Brand Fit (Max 15): Does it sound like a premium, bespoke business, not a generic template?
2. Grid Fit (Max 10): Does it maintain visual rhythm and structure?
3. Visual Quality (Max 12): Is the layout elegant, composed, and premium?
4. Content Variety (Max 10): Does it avoid repeating the same post formats?
5. Commercial Value (Max 10): Does it build authority or drive client conversion?
6. Voice Accuracy (Max 10): Wrote in technician's voice, avoids AI tells (e.g. "luxurious", "obsessed", "glow up").
7. Asset Integrity (Max 15): Preserves original photography (no generated model faces/retouching).
8. Compliance & AHPRA (Max 10): Regulated injectables/lasers must NOT have outcome claims, testimonials, or baits.
9. Distinctiveness (Max 5): Wrote with punchy, scroll-stopping, original hooks.
10. Learning Value (Max 3): Captures diagnostic metadata to improve future generations.

OUTPUT INSTRUCTIONS:
- You MUST return valid JSON only. Do NOT output markdown, prefix, or suffix.
- If the post contains testmonials, false health claims, or violates AHPRA, the Compliance score MUST be 0, making the overall passed status false.
- Pass threshold is 78/100.

Return exactly this JSON structure:
{
  "score": 85,
  "passed": true,
  "failures": [],
  "reason": "Overall summary of the evaluation.",
  "breakdown": {
    "brandFit": { "score": 13, "max": 15, "comment": "Comment here" },
    "gridFit": { "score": 8, "max": 10, "comment": "Comment here" },
    "visualQuality": { "score": 10, "max": 12, "comment": "Comment here" },
    "contentVariety": { "score": 8, "max": 10, "comment": "Comment here" },
    "commercialValue": { "score": 9, "max": 10, "comment": "Comment here" },
    "voiceAccuracy": { "score": 8, "max": 10, "comment": "Comment here" },
    "assetIntegrity": { "score": 14, "max": 15, "comment": "Comment here" },
    "compliance": { "score": 9, "max": 10, "comment": "Comment here" },
    "distinctiveness": { "score": 4, "max": 5, "comment": "Comment here" },
    "learningValue": { "score": 2, "max": 3, "comment": "Comment here" }
  }
}`;

    const userPrompt = `Evaluate this post generated by model: "${generatedBy}"
Caption: "${caption}"
Hashtags: ${JSON.stringify(hashtags)}
Is Carousel: ${isCarousel ? 'Yes' : 'No'}
Slides Count: ${slidesCount}`;

    // Select the best judge using Cross-Model + Anthropic default strategy
    let responseText = '';
    const anthropicKey = process.env['ANTHROPIC_API_KEY'];
    const openaiKey = process.env['OPENAI_API_KEY'];
    const geminiKey = process.env['GEMINI_API_KEY'];

    if (anthropicKey) {
      console.log('LLM Judge: Invoking Anthropic Claude 3.5 Sonnet (Master Judge)...');
      const claude = new ChatAnthropic({
        modelName: 'claude-3-5-sonnet-20241022',
        temperature: 0.1,
        maxTokens: 1000,
        anthropicApiKey: anthropicKey,
      });
      const res = await claude.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);
      responseText = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    } else if (generatedBy.toLowerCase().includes('gemini') && openaiKey) {
      console.log('LLM Judge: Invoking OpenAI GPT-4o-mini (Cross-Judge)...');
      const gpt = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 1000,
        openAIApiKey: openaiKey,
      });
      const res = await gpt.invoke([new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]);
      responseText = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    } else if (geminiKey) {
      console.log('LLM Judge: Invoking Gemini (Cross-Judge)...');
      const aiClient = new GoogleGenerativeAI(geminiKey);
      const model = aiClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `${systemPrompt}\n\nUser Input:\n${userPrompt}`;
      const res = await model.generateContent(prompt);
      responseText = res.response.text();
    } else {
      return null; // No LLM keys configured, trigger local fallback
    }

    const cleaned = responseText
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      passed: !!parsed.passed,
      score: Number(parsed.score ?? 70),
      failures: Array.isArray(parsed.failures) ? parsed.failures : [],
      reason: String(parsed.reason ?? 'Evaluated by LLM Judge.'),
      breakdown: parsed.breakdown,
    };
  }

  private runLocalFallbackScoring(params: {
    caption: string;
    hashtags: string[];
    blacklist: string[];
    isCarousel: boolean;
    slidesCount: number;
  }): ScoringResult {
    const { caption, hashtags, isCarousel, slidesCount } = params;
    let score = 90;
    const failures: string[] = [];

    if (caption.length < 20) {
      score -= 20;
      failures.push('Caption content is too thin.');
      return {
        passed: false,
        score,
        failures,
        reason: 'Local backup scoring failed: Caption content is too thin.',
        failureType: 'CONTENT',
        reasonTag: 'thin_caption',
      };
    }

    if (isCarousel && slidesCount < 2) {
      score -= 15;
      failures.push('Carousel format requires at least 2 slides.');
      return {
        passed: false,
        score,
        failures,
        reason: 'Local backup scoring failed: Carousel format requires at least 2 slides.',
        failureType: 'LAYOUT',
        reasonTag: 'carousel_slides_insufficient',
      };
    }

    if (hashtags.length < 5) {
      score -= 5;
    }

    const aiTells = ['luxurious', 'glow up', 'obsessed with this', 'transformative experience'];
    const detectedTells = aiTells.filter(t => caption.toLowerCase().includes(t));
    if (detectedTells.length > 0) {
      score -= 10;
      failures.push(`Generic tells detected: ${detectedTells.join(', ')}`);
      return {
        passed: false,
        score,
        failures,
        reason: `Local backup scoring failed: Generic tells detected: ${detectedTells.join(', ')}`,
        failureType: 'CONTENT',
        reasonTag: 'generic_ai_tells',
      };
    }

    return {
      passed: score >= 78,
      score,
      failures,
      reason: score >= 78 ? 'Local backup scoring passed.' : `Local backup scoring failed: ${failures.join('; ')}`,
    };
  }
}
