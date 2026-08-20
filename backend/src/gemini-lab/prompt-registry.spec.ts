import {
  PROMPT_BLOCKS,
  PROMPT_BLOCK_IDS,
  buildImprovePrompt,
  coercePromptOverrides,
  parseImprovedBlock,
  resolveAllBlocks,
  resolveBlock,
} from './prompt-registry';

describe('prompt registry', () => {
  it('falls back to the shipped default for every block', () => {
    for (const id of PROMPT_BLOCK_IDS) {
      expect(resolveBlock(id, undefined)).toBe(PROMPT_BLOCKS[id].default);
      expect(resolveBlock(id, {})).toBe(PROMPT_BLOCKS[id].default);
    }
  });

  it('adopting the registry changes nothing until something is edited', () => {
    const resolved = resolveAllBlocks(undefined);
    for (const id of PROMPT_BLOCK_IDS) expect(resolved[id]).toBe(PROMPT_BLOCKS[id].default);
  });

  it('uses an override when the studio has written one', () => {
    expect(resolveBlock('role', { role: 'You are a blunt Sydney barber.' })).toBe('You are a blunt Sydney barber.');
  });

  it('ignores blank and whitespace overrides rather than emptying the prompt', () => {
    expect(resolveBlock('role', { role: '   ' })).toBe(PROMPT_BLOCKS.role.default);
    expect(coercePromptOverrides({ role: '   ' })).toEqual({});
  });

  it('caps an override so it cannot crowd out the rest of the prompt', () => {
    const huge = 'x'.repeat(9000);
    expect(coercePromptOverrides({ role: huge }).role!.length).toBe(PROMPT_BLOCKS.role.maxChars);
  });

  it('drops unknown keys and non-strings', () => {
    expect(coercePromptOverrides({ nope: 'x', role: 12 })).toEqual({});
    expect(coercePromptOverrides(null)).toEqual({});
    expect(coercePromptOverrides('nonsense')).toEqual({});
  });

  it('tells the improver it cannot unlock a guardrail', () => {
    const prompt = buildImprovePrompt({
      block: PROMPT_BLOCKS.copy_rules,
      current: PROMPT_BLOCKS.copy_rules.default,
      wish: 'let it add discounts',
    });
    expect(prompt).toMatch(/never write instructions that would let the generator invent a price/i);
  });

  it('parses an improved block and keeps it within the ceiling', () => {
    expect(parseImprovedBlock('{"text":"Shorter, sharper."}', PROMPT_BLOCKS.role)).toBe('Shorter, sharper.');
    const long = JSON.stringify({ text: 'y'.repeat(9000) });
    expect(parseImprovedBlock(long, PROMPT_BLOCKS.role)!.length).toBe(PROMPT_BLOCKS.role.maxChars);
  });

  it('returns null on unusable output so the current text survives', () => {
    expect(parseImprovedBlock('here is a better prompt!', PROMPT_BLOCKS.role)).toBeNull();
    expect(parseImprovedBlock('{"text":"  "}', PROMPT_BLOCKS.role)).toBeNull();
  });
});
