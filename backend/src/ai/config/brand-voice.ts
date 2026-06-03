// ============================================================================
// brand-voice.ts — Shared Brand Voice Fragment for Visual-Concept Chains
// Carousel, Story, and Reel-shot chains use this so their overlay/shot text
// matches the technician's tone, vocabulary, and blacklist — not generic copy.
// ============================================================================

export interface BrandVoiceContext {
  primaryTone?: string;
  secondaryTone?: string;
  preferredVocabulary?: string[];
  blacklistedWords?: string[];
  emojiPolicy?: string;          // 'none' | 'minimal' | 'moderate' | 'frequent'
  clientTerminology?: string;    // e.g. "clients", "babes", "guests"
}

const tone = (v?: string) => (v ? v.replace(/_/g, ' ') : '');

/**
 * Builds a compact brand-voice instruction block for chains that only render
 * short on-image text (overlays, shot directions). Returns '' when no voice
 * data is available so the prompt stays clean.
 */
export function buildBrandVoiceBlock(v?: BrandVoiceContext): string {
  if (!v) return '';
  const lines: string[] = [];

  if (v.primaryTone) {
    lines.push(`- Voice: write every word in a ${tone(v.primaryTone)}${v.secondaryTone ? `, ${tone(v.secondaryTone)}` : ''} tone — this is the technician's real voice, not generic marketing.`);
  }
  if (v.clientTerminology) {
    lines.push(`- Refer to clients as "${v.clientTerminology}".`);
  }
  if (v.preferredVocabulary?.length) {
    lines.push(`- Favour their words where natural: ${v.preferredVocabulary.slice(0, 12).join(', ')}.`);
  }
  if (v.blacklistedWords?.length) {
    lines.push(`- NEVER use these words: ${v.blacklistedWords.join(', ')}.`);
  }

  switch (v.emojiPolicy) {
    case 'none':
      lines.push('- Emojis: never use emojis in any text.');
      break;
    case 'frequent':
      lines.push('- Emojis: 1 relevant emoji per overlay is welcome.');
      break;
    case 'moderate':
      lines.push('- Emojis: at most 1 emoji per overlay, only where natural.');
      break;
    case 'minimal':
      lines.push('- Emojis: avoid emojis unless one genuinely fits.');
      break;
  }

  if (lines.length === 0) return '';
  return `BRAND VOICE (apply to every line of text you write):\n${lines.join('\n')}`;
}

/** Extracts a BrandVoiceContext from a loose BrandDNA-shaped record. */
export function extractBrandVoice(dna: Record<string, any>): BrandVoiceContext {
  return {
    primaryTone: dna['primaryTone'],
    secondaryTone: dna['secondaryTone'],
    preferredVocabulary: dna['vocabularyPreferred'] ?? dna['preferredVocabulary'],
    blacklistedWords: dna['vocabularyBlacklist'] ?? dna['blacklistedWords'],
    emojiPolicy: dna['emojiPolicy'],
    clientTerminology: dna['clientTerminology'],
  };
}
