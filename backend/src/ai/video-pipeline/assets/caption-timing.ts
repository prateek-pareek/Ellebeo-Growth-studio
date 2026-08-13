export const WORDS_PER_SECOND = 2.5;
export const WORDS_PER_CUE = 5;

export interface CaptionCue {
  start: number;
  durationSeconds: number;
  text: string;
}

export function splitVoiceoverWords(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean);
}

export function estimateVoiceoverSeconds(script: string, wordsPerSecond = WORDS_PER_SECOND): number {
  return Math.max(1, splitVoiceoverWords(script).length / wordsPerSecond);
}

export function alignCaptionsToVoiceover(
  script: string,
  durationSeconds: number,
  options: { wordsPerCue?: number } = {},
): CaptionCue[] {
  const words = splitVoiceoverWords(script);
  if (words.length === 0 || durationSeconds <= 0) return [];

  const wordsPerCue = options.wordsPerCue ?? WORDS_PER_CUE;
  const timePerWord = durationSeconds / words.length;
  const cues: CaptionCue[] = [];

  for (let i = 0; i < words.length; i += wordsPerCue) {
    const chunk = words.slice(i, i + wordsPerCue);
    const start = roundTime(i * timePerWord);
    const duration = roundTime(chunk.length * timePerWord);
    cues.push({ start, durationSeconds: duration, text: chunk.join(' ') });
  }

  const last = cues[cues.length - 1];
  if (last) {
    last.durationSeconds = roundTime(Math.max(0.1, durationSeconds - last.start));
  }
  return cues;
}

export function captionTextForWindow(
  cues: CaptionCue[],
  windowStart: number,
  windowEnd: number,
): string | null {
  const overlapping = cues.filter((cue) => {
    const cueEnd = cue.start + cue.durationSeconds;
    return cue.start < windowEnd && cueEnd > windowStart;
  });
  if (overlapping.length === 0) return null;
  return overlapping.map((cue) => cue.text).join(' ');
}

function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}
