import { STRATEGIES, findByStrategy, MACHINE_GENERATED_RE, type Strategy } from './strategies';
import type { SelectorCandidate } from './types';

const TOP_N = 3;

/**
 * score = baseWeight(strategy)
 *       − 20 if the value looks machine-generated
 *       − 5  per level of structural depth (struct candidates only — depth
 *            isn't a meaningful penalty for a role/label/text descriptor)
 *       − 40 if it currently matches more than one element
 *
 * The uniqueness check is what makes this more than a fixed priority list:
 * a `text:"Acme Corp"` candidate that matches 56 table rows sinks below a
 * structural fallback that (accidentally) resolves to exactly one element.
 */
function scoreCandidate(strategy: Strategy, value: string, root: ParentNode): number {
  let score = strategy.baseWeight;

  if (MACHINE_GENERATED_RE.test(value)) score -= 20;

  if (strategy.kind === 'struct') {
    const depth = value.split('>').length;
    score -= 5 * depth;
  }

  const matches = findByStrategy(strategy, root, value);
  if (matches.length > 1) score -= 40;

  return score;
}

export function describeElement(element: Element): SelectorCandidate[] {
  const root = element.getRootNode() as ParentNode;
  const candidates: SelectorCandidate[] = [];

  for (const strategy of STRATEGIES) {
    const value = strategy.describe(element);
    if (!value) continue;
    candidates.push({ kind: strategy.kind, value, score: scoreCandidate(strategy, value, root) });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, TOP_N);
}
