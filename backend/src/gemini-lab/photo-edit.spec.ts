import { canEditPhoto, editedDisclosure, instructionIsInScope } from './photo-edit';

/**
 * Editing is open by default — retouching is ordinary studio practice. Two
 * narrow cases remain, both involving someone other than the studio: a
 * before/after is what a client books on, and altered treatment images are
 * restricted advertising.
 */
describe('photo editing', () => {
  it('allows any edit on an ordinary shot', () => {
    for (const kind of ['look', 'bts', 'detail'] as const) {
      expect([kind, canEditPhoto({ kind }).ok]).toEqual([kind, true]);
      for (const i of ['smooth her skin', 'make the hair look fuller', 'remove the clutter']) {
        expect([kind, i, instructionIsInScope(i, kind).ok]).toEqual([kind, i, true]);
      }
    }
  });

  it('allows scenic edits on a before/after', () => {
    for (const i of [
      'remove the clutter behind her',
      'brighten the room',
      'fix the lighting',
      'crop it tighter',
      'tidy the bench',
    ]) {
      expect([i, instructionIsInScope(i, 'after').ok]).toEqual([i, true]);
    }
  });

  it('refuses edits to the subject of a before/after', () => {
    for (const i of ['smooth her skin', 'make the hair look fuller', 'whiten the teeth']) {
      const r = instructionIsInScope(i, 'before');
      expect([i, r.ok]).toEqual([i, false]);
      if (!r.ok) expect(r.reason).toMatch(/before or after/i);
    }
  });

  it('under medical compliance, protects treatment photos only', () => {
    // A before or after IS a treatment outcome: altering one is restricted
    // advertising, so it stays refused.
    for (const kind of ['before', 'after'] as const) {
      const r = canEditPhoto({ kind, medicalCompliance: true });
      expect([kind, r.ok]).toEqual([kind, false]);
      if (!r.ok) expect(r.reason).toMatch(/advertising/i);
    }
  });

  it('does not stop a clinic editing its own ordinary photos', () => {
    // This used to refuse every edit on every photo the moment compliance was
    // switched on, so a clinic could not put a sticker on its own promo shot
    // or tidy the background of a room. That protected nobody.
    for (const kind of ['look', 'bts', 'detail'] as const) {
      const r = canEditPhoto({ kind, medicalCompliance: true });
      expect([kind, r.ok]).toEqual([kind, true]);
    }
  });

  it('asks for an instruction rather than editing on an empty one', () => {
    expect(instructionIsInScope('   ').ok).toBe(false);
  });

  it('records what was changed, so nothing downstream calls it original', () => {
    expect(editedDisclosure('  tidy the background  ')).toBe('AI-edited: "tidy the background"');
  });
});
