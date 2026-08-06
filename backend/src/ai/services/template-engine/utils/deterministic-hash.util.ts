import { createHash } from 'crypto';

/**
 * Deterministically selects an option from an array based on a consistent hash of the input parameters.
 * This guarantees variety across different slides or tenants without ever using Math.random().
 */
export function selectDeterministically<T>(
  options: T[],
  hashInputs: {
    tenantId: string;
    slideIndex: number;
    goal?: string;
    mood?: string;
    pillar?: string;
  }
): T {
  if (options.length === 0) {
    throw new Error('Options array cannot be empty');
  }

  // Create a consistent, unique string from the inputs
  const hashString = [
    hashInputs.tenantId,
    hashInputs.slideIndex,
    hashInputs.goal || 'default_goal',
    hashInputs.mood || 'default_mood',
    hashInputs.pillar || 'default_pillar',
  ].join('|');

  // Generate a numerical hash value using MD5 (or any consistent hashing mechanism)
  const hash = createHash('md5').update(hashString).digest('hex');
  
  // Convert a portion of the hex hash to an integer
  const hashInt = parseInt(hash.substring(0, 8), 16);

  // Use modulo to map the hash to an index in the options array
  const selectedIndex = hashInt % options.length;

  return options[selectedIndex];
}
