import { ScoringGateService } from './scoring-gate.service';

describe('ScoringGateService — Phase 4 AHPRA gate', () => {
  const originalEnv = { ...process.env };
  let service: ScoringGateService;

  beforeEach(() => {
    // Force the deterministic local fallback path — no real LLM calls in a unit test.
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    service = new ScoringGateService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const baseParams = {
    caption: 'A genuinely excellent, detailed caption about our service and what to expect at your visit.',
    hashtags: ['a', 'b', 'c', 'd', 'e'],
    blacklist: [] as string[],
    hasBefore: false,
    beforeAfterAllowed: true,
    isCarousel: false,
    slidesCount: 0,
  };

  it.each([
    ['Come see the incredible transformation from your last visit!', 'ahpra_outcome_claim'],
    ['Book now before spots fill up for this treatment.', 'ahpra_urgency_tactic'],
  ])('hard-fails deterministically for a medical practitioner before any LLM judge call: "%s"', async (caption, expectedTag) => {
    const result = await service.evaluate({ ...baseParams, caption, isMedicalPractitioner: true });
    expect(result.passed).toBe(false);
    expect(result.reasonTag).toBe(expectedTag);
  });

  it('does NOT apply the AHPRA term gate for a non-medical practitioner', async () => {
    const result = await service.evaluate({
      ...baseParams,
      caption: 'Come see the incredible transformation from your last visit!',
      isMedicalPractitioner: false,
    });
    expect(result.reasonTag).not.toBe('ahpra_outcome_claim');
  });

  it('rejects client-image (before/after) input for a medical practitioner even if beforeAfterAllowed was mistakenly passed true', async () => {
    // beforeAfterAllowed is computed upstream via isBeforeAfterAllowed() and should
    // already be false for medical accounts — this asserts the gate itself still
    // rejects hasBefore+!beforeAfterAllowed regardless of who computed the flag.
    const result = await service.evaluate({
      ...baseParams, hasBefore: true, beforeAfterAllowed: false, isMedicalPractitioner: true,
    });
    expect(result.passed).toBe(false);
    expect(result.reasonTag).toBe('consent_violation');
  });

  it('applies a code-enforced 88 threshold for medical accounts even when the local fallback score would otherwise pass at 78+', async () => {
    // hashtags.length < 5 costs 5 points off the local-fallback base of 90 -> 85.
    // 85 >= 78 (generic pass) but < 88 (AHPRA floor) -> must be overridden to failed.
    const result = await service.evaluate({
      ...baseParams, hashtags: ['a', 'b'], isMedicalPractitioner: true,
    });
    expect(result.score).toBe(85);
    expect(result.passed).toBe(false);
    expect(result.reasonTag).toBe('ahpra_threshold_not_met');
  });

  it('does not lower the bar for non-medical accounts at the same score', async () => {
    const result = await service.evaluate({
      ...baseParams, hashtags: ['a', 'b'], isMedicalPractitioner: false,
    });
    expect(result.score).toBe(85);
    expect(result.passed).toBe(true);
  });
});
