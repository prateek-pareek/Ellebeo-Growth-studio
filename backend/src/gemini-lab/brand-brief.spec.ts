import { buildCopyPrompt } from './gemini-lab.service';
import { coerceGuidedDraft } from './guided-dna/contract';

/**
 * These three fields were captured by the wizard and then never read, so a
 * studio answered questions that changed nothing. A UK salon got US spelling;
 * a TikTok-only salon got an Instagram caption; a salon that named its
 * suburbs got copy that never mentioned them.
 */
function promptFor(over: any) {
  const profile = coerceGuidedDraft({
    ...over,
    meta: { completedAt: new Date().toISOString(), source: 'guided_v2' },
  });
  return buildCopyPrompt({
    brandDna: null,
    guidedProfile: profile as any,
    template: null,
    extraNotes: over.__idea,
    plan: [{ index: 0, label: 'Post', layout: 'cover', photo: 'before', zoneType: null }] as any,
    kindA: 'look',
    kindB: null,
  });
}

describe('brand fields that used to be discarded', () => {
  it('speaks to the audience the studio actually serves', () => {
    // genderFocus was collected by the wizard and never reached the model.
    expect(promptFor({ audience: { genderFocus: 'MEN' } })).toMatch(/speaking to men/i);
    expect(promptFor({ audience: { genderFocus: 'WOMEN' } })).toMatch(/speaking to women/i);
    expect(promptFor({ audience: { genderFocus: 'ALL' } })).toMatch(/inclusive/i);
  });

  it('tells the writer what its words will be set in', () => {
    const prompt = promptFor({ identity: { mood: 'BOLD_LUXE' } });
    expect(prompt).toMatch(/will be set in Cinzel/i);
  });

  it("carries the studio's own idea as the brief, not as a trailing note", () => {
    const prompt = promptFor({ __idea: 'we just got a new curly-hair specialist' });
    expect(prompt).toMatch(/THE STUDIO'S OWN IDEA FOR THIS POST/);
    expect(prompt).toMatch(/new curly-hair specialist/);
    // It must be interpreted through the brand rather than pasted out.
    expect(prompt).toMatch(/voice, mood and aesthetic/i);
    // And it must not reappear as the old weak trailing "Notes:" line.
    expect(prompt).not.toContain("Notes: we just got");
  });

  it('writes in the studio own spelling', () => {
    expect(promptFor({ config: { languageVariant: 'UK' } })).toMatch(/British English/i);
    expect(promptFor({ config: { languageVariant: 'US' } })).toMatch(/American English/i);
    expect(promptFor({ config: { languageVariant: 'AU' } })).toMatch(/Australian English/i);
  });

  it('writes the caption for the platform it is going to', () => {
    const tiktok = promptFor({ config: { platforms: { instagram: false, facebook: false, tiktok: true } } });
    expect(tiktok).toMatch(/TikTok/);
    expect(tiktok).toMatch(/one or two short lines/i);

    const facebook = promptFor({ config: { platforms: { instagram: false, facebook: true, tiktok: false } } });
    expect(facebook).toMatch(/Facebook/);
    expect(facebook).toMatch(/no more than 2 hashtags/i);

    const insta = promptFor({ config: { platforms: { instagram: true, facebook: true, tiktok: false } } });
    expect(insta).toMatch(/Instagram first/i);
  });

  it('grounds the copy in the areas the studio actually serves', () => {
    const p = promptFor({ offering: { serviceAreas: ['Newtown', 'Surry Hills'] } });
    expect(p).toMatch(/Newtown, Surry Hills/);
    expect(p).toMatch(/never invent a suburb/i);
  });

  it('says nothing about place when no area was given', () => {
    expect(promptFor({ offering: { serviceAreas: [] } })).not.toMatch(/never invent a suburb/i);
  });
});
