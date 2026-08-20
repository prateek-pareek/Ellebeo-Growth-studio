import { applyRevision, parseCritique } from './design-critic';
import type { LabCompositionInput } from './gemini-lab-compositor';

const authored: LabCompositionInput = {
  photoMode: 'framed',
  photoShape: 'arch',
  photoRegion: { col: 7, row: 1, colSpan: 6, rowSpan: 12 },
  textRegion: { col: 1, row: 4, colSpan: 4, rowSpan: 5 },
  textAlign: 'center',
  typeScale: 'balanced',
  panels: [{ box: { x: 0, y: 0, w: 0.5, h: 1 }, colorRole: 'accent', opacity: 0.4 }],
};

describe('parseCritique', () => {
  it('reads a score and issues', () => {
    const c = parseCritique('{"score":62,"issues":["type sits over the face"]}')!;
    expect(c.score).toBe(62);
    expect(c.issues).toEqual(['type sits over the face']);
    expect(c.revision).toBeUndefined();
  });

  it('reads an applicable revision', () => {
    const c = parseCritique(
      '{"score":55,"issues":["headline wraps to four lines"],"revision":{"textRegion":{"col":1,"row":7,"colSpan":8,"rowSpan":4},"textAlign":"left","typeScale":"dramatic"}}',
    )!;
    expect(c.revision?.textRegion).toEqual({ col: 1, row: 7, colSpan: 8, rowSpan: 4 });
    expect(c.revision?.textAlign).toBe('left');
    expect(c.revision?.typeScale).toBe('dramatic');
  });

  it('tolerates a fenced reply', () => {
    expect(parseCritique('```json\n{"score":90,"issues":[]}\n```')?.score).toBe(90);
  });

  it('discards a region that falls outside the grid', () => {
    const c = parseCritique('{"score":50,"issues":[],"revision":{"textRegion":{"col":9,"row":1,"colSpan":8,"rowSpan":2}}}')!;
    expect(c.revision).toBeUndefined();
  });

  it('discards an invalid alignment rather than passing it through', () => {
    const c = parseCritique('{"score":50,"issues":[],"revision":{"textAlign":"justified"}}')!;
    expect(c.revision).toBeUndefined();
  });

  it('returns null on unparseable output instead of throwing into the render', () => {
    expect(parseCritique('the layout looks fine to me')).toBeNull();
    expect(parseCritique('{"issues":[]}')).toBeNull();
  });

  it('clamps a nonsense score', () => {
    expect(parseCritique('{"score":900,"issues":[]}')?.score).toBe(100);
    expect(parseCritique('{"score":-40,"issues":[]}')?.score).toBe(0);
  });
});

describe('applyRevision', () => {
  it('moves only what the critic named', () => {
    const next = applyRevision(authored, { textRegion: { col: 1, row: 7, colSpan: 8, rowSpan: 4 } })!;
    expect(next.textRegion).toEqual({ col: 1, row: 7, colSpan: 8, rowSpan: 4 });
    // Everything else survives — a revision must not quietly undo decisions
    // made upstream of the critic.
    expect(next.photoRegion).toEqual(authored.photoRegion);
    expect(next.photoShape).toBe('arch');
    expect(next.panels).toEqual(authored.panels);
    expect(next.textAlign).toBe('center');
  });

  it('never introduces a photo region on a poster', () => {
    const poster: LabCompositionInput = { photoMode: 'typographic', textRegion: { col: 1, row: 1, colSpan: 10, rowSpan: 5 } };
    const next = applyRevision(poster, { photoRegion: { col: 1, row: 6, colSpan: 6, rowSpan: 5 } })!;
    expect(next.photoRegion).toBeUndefined();
  });

  it('never places a photo region on a full-bleed composition', () => {
    const bleed: LabCompositionInput = { photoMode: 'full_bleed', textRegion: { col: 1, row: 9, colSpan: 10, rowSpan: 3 } };
    const next = applyRevision(bleed, { photoRegion: { col: 2, row: 2, colSpan: 5, rowSpan: 5 } })!;
    expect(next.photoRegion).toBeUndefined();
  });

  it('drops a stale raw box so the new region actually wins', () => {
    const withBox: LabCompositionInput = {
      photoMode: 'framed',
      typeBox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      photoBox: { x: 0.5, y: 0.1, w: 0.4, h: 0.6 },
    };
    const next = applyRevision(withBox, {
      textRegion: { col: 1, row: 8, colSpan: 8, rowSpan: 4 },
      photoRegion: { col: 1, row: 1, colSpan: 12, rowSpan: 6 },
    })! as Record<string, unknown>;
    expect(next.typeBox).toBeUndefined();
    expect(next.photoBox).toBeUndefined();
  });

  it('is a no-op without a revision', () => {
    expect(applyRevision(authored, undefined)).toBe(authored);
    expect(applyRevision(undefined, { textAlign: 'left' })).toBeUndefined();
  });
});
