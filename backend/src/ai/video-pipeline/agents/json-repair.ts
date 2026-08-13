export class JsonRepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonRepairError';
  }
}

export function extractJsonText(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s.replace(/,\s*([}\]])/g, '$1');
}

export function repairJson(raw: string): unknown {
  try {
    return JSON.parse(extractJsonText(raw));
  } catch {
    throw new JsonRepairError('Could not repair JSON output');
  }
}
