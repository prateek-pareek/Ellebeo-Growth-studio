import { alignCaptionsToVoiceover, splitVoiceoverWords } from './caption-timing';

const SCRIPT = 'Skin literacy starts with a consult not a promise today';

describe('alignCaptionsToVoiceover', () => {
  it('covers the VO timeline without gaps or overlaps', () => {
    const duration = 8;
    const cues = alignCaptionsToVoiceover(SCRIPT, duration, { wordsPerCue: 5 });
    const words = splitVoiceoverWords(SCRIPT);

    expect(cues[0]!.start).toBe(0);
    const reconstructed = cues.map((cue) => cue.text).join(' ');
    expect(reconstructed).toBe(words.join(' '));

    for (let i = 1; i < cues.length; i++) {
      const prev = cues[i - 1]!;
      expect(cues[i]!.start).toBeCloseTo(prev.start + prev.durationSeconds, 5);
    }
    const last = cues[cues.length - 1]!;
    expect(last.start + last.durationSeconds).toBeCloseTo(duration, 5);
  });

  it('assigns more time to later cues when the last group is shorter', () => {
    const cues = alignCaptionsToVoiceover('one two three four five six', 6, { wordsPerCue: 5 });
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('one two three four five');
    expect(cues[1]!.text).toBe('six');
    expect(cues[1]!.start + cues[1]!.durationSeconds).toBe(6);
  });
});
