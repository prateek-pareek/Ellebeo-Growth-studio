import { findCliches, auditCopy, buildRepairPrompt, applyRepair, CLICHES } from './cliche';

/**
 * Every phrase here was produced by this pipeline while the prompt explicitly
 * forbade it. That is the reason this module exists rather than another
 * paragraph of instruction.
 */
describe('catching filler the prompt could not prevent', () => {
  it('finds the phrases a real run produced', () => {
    expect(findCliches('Dreaming of effortlessly beautiful, sun-kissed strands?')).toEqual(
      expect.arrayContaining(['dreaming of', 'effortlessly']),
    );
    expect(findCliches('Step into a world of luxury hair treatment.')).toContain('step into a world');
    expect(findCliches('Our bespoke colour will enhance your natural beauty')).toEqual(
      expect.arrayContaining(['bespoke', 'enhance your natural beauty']),
    );
    expect(findCliches("Your hair tells a story. We'll make it a masterpiece.")).toEqual(
      expect.arrayContaining(['tells a story', 'masterpiece']),
    );
  });

  it('leaves ordinary writing alone', () => {
    expect(findCliches('Grown out on purpose. Six weeks, still full.')).toEqual([]);
    expect(findCliches('Balayage, hand-painted, Tuesday to Thursday.')).toEqual([]);
    expect(findCliches('Books open for August.')).toEqual([]);
  });

  it('does not trip on longer words that merely contain a banned one', () => {
    // "discovery" and "radiantly" must survive a list carrying "discover" and
    // "radiant", or the repair pass starts rewriting good lines.
    expect(findCliches('the discovery call is free')).toEqual([]);
    expect(findCliches('radiantly is not a word we ban outright')).toEqual([]);
  });

  it('matches across whatever spacing the model used', () => {
    expect(findCliches('dreaming   of a change')).toContain('dreaming of');
  });

  it('reports which field of a post is at fault', () => {
    const problems = auditCopy({
      headline: 'Grown out on purpose',
      hook: 'Discover your best self',
      body: 'Hand-painted through the mid-lengths.',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].field).toBe('hook');
    expect(problems[0].found).toEqual(expect.arrayContaining(['discover', 'your best self']));
  });
});

describe('repairing only what failed', () => {
  it('asks for the failing lines and names the phrases to remove', () => {
    const copy = { headline: 'Effortless Radiant Balayage', body: 'Hand-painted, root to end.' };
    const prompt = buildRepairPrompt({ copy, problems: auditCopy(copy) });
    expect(prompt).toContain('Effortless Radiant Balayage');
    // The clean line must not be handed over for rewriting.
    expect(prompt).not.toContain('Hand-painted, root to end.');
    expect(prompt).toMatch(/remove: .*effortless/i);
  });

  it('never lets a repair invent a fact', () => {
    const copy = { headline: 'Stunning colour' };
    const prompt = buildRepairPrompt({ copy, problems: auditCopy(copy) });
    expect(prompt).toMatch(/Do not add a price, a date, a discount or a client quote/i);
  });

  it('takes the rewrite and keeps everything it did not touch', () => {
    const copy = { headline: 'Stunning colour', body: 'Hand-painted through the mid-lengths.' };
    const next = applyRepair(copy, '{"headline":"Grown out on purpose"}');
    expect(next.headline).toBe('Grown out on purpose');
    expect(next.body).toBe('Hand-painted through the mid-lengths.');
  });

  it('refuses a repair that swaps one cliché for another', () => {
    const copy = { headline: 'Stunning colour' };
    const next = applyRepair(copy, '{"headline":"Gorgeous radiant colour"}');
    expect(next.headline).toBe('Stunning colour');
  });

  it('keeps the original when the reply is not usable', () => {
    const copy = { headline: 'Stunning colour' };
    expect(applyRepair(copy, 'sorry, I cannot do that').headline).toBe('Stunning colour');
    expect(applyRepair(copy, '{"headline":"   "}').headline).toBe('Stunning colour');
  });

  it('reads a reply wrapped in a code fence', () => {
    const copy = { headline: 'Stunning colour' };
    const next = applyRepair(copy, '```json\n{"headline":"Six weeks, still full"}\n```');
    expect(next.headline).toBe('Six weeks, still full');
  });
});

describe('the list itself', () => {
  it('carries no duplicates', () => {
    expect(new Set(CLICHES).size).toBe(CLICHES.length);
  });
});
