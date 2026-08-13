import { JsonRepairError, extractJsonText, repairJson } from './json-repair';

describe('repairJson', () => {
  it('parses clean JSON', () => {
    expect(repairJson('{"hook":"Hi"}')).toEqual({ hook: 'Hi' });
  });

  it('strips markdown fences and trailing commas', () => {
    const raw = '```json\n{"hook":"Glow", "scenes":[{"index":0},],}\n```';
    expect(repairJson(raw)).toEqual({ hook: 'Glow', scenes: [{ index: 0 }] });
  });

  it('extracts the object from surrounding prose', () => {
    expect(extractJsonText('Sure!\n{"hook":"Book in"}\nThanks')).toBe('{"hook":"Book in"}');
    expect(repairJson('Here you go: {"hook":"Book in"} done')).toEqual({ hook: 'Book in' });
  });

  it('throws when nothing is salvageable', () => {
    expect(() => repairJson('not json at all')).toThrow(JsonRepairError);
  });
});
