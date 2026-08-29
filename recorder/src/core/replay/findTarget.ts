import { describeHostSegment } from '../resolveTarget';
import { findByStrategy, STRATEGY_BY_KIND } from '../describe/strategies';
import type { DescribedTarget, SelectorCandidate } from '../describe/types';

const MAX_SCROLL_ATTEMPTS = 8;
const SCROLL_RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findHostBySegment(root: ParentNode, segment: string): Element | null {
  const all = root.querySelectorAll('*');
  for (const el of all) {
    if (describeHostSegment(el) === segment) return el;
  }
  return null;
}

/** Walks the recorded frame/shadow-host chain to reach the root the
 *  candidates were actually scored against. Returns null if any segment of
 *  the chain (a since-removed iframe or shadow host) can't be found. */
function descendToRoot(target: DescribedTarget): ParentNode | null {
  let root: ParentNode = document;

  for (const segment of target.frame) {
    const frameEl = findHostBySegment(root, segment);
    const contentDoc = (frameEl as HTMLIFrameElement | null)?.contentDocument;
    if (!contentDoc) return null;
    root = contentDoc;
  }

  for (const segment of target.shadowPath) {
    const host = findHostBySegment(root, segment);
    if (!host?.shadowRoot) return null;
    root = host.shadowRoot;
  }

  return root;
}

export interface FoundTarget {
  element: Element;
  candidate: SelectorCandidate;
  /** Rank of the winning candidate. 0 is the top choice; higher means the
   *  fallthrough was needed, which is worth logging rather than hiding. */
  candidateIndex: number;
}

/** Tries each candidate best-first; a candidate that misses or now matches
 *  more than one element is skipped rather than trusted, since Stage 2 only
 *  guaranteed it was unique at *capture* time. */
function tryFindInRoot(root: ParentNode, candidates: SelectorCandidate[]): FoundTarget | null {
  for (const [candidateIndex, candidate] of candidates.entries()) {
    const strategy = STRATEGY_BY_KIND[candidate.kind];
    const matches = findByStrategy(strategy, root, candidate.value);
    if (matches.length === 1) return { element: matches[0], candidate, candidateIndex };
  }
  return null;
}

/**
 * Resolves a target by finding its row first, then looking inside it.
 *
 * This is what makes "do it for ORD-1044" mean anything. The recorded
 * candidates describe a cell of whichever row the user happened to click, so
 * on their own they either miss entirely or — worse — still match the row
 * that was recorded. Narrowing to the one unit that carries the requested
 * text and searching within it asks the right question: not "where was this
 * element", but "where is the same part of this other row".
 *
 * Requires exactly one match. An ambiguous name is not a licence to guess
 * which of several rows the user meant.
 */
function findScoped(root: ParentNode, target: DescribedTarget): FoundTarget | null {
  const scope = target.scope;
  if (!scope) return null;

  let containers: Element[];
  try {
    containers = Array.from(root.querySelectorAll(scope.container));
  } catch {
    return null;
  }

  const matching = containers.filter((container) => (container.textContent ?? '').includes(scope.text));
  if (matching.length !== 1) return null;
  const container = matching[0];

  // A candidate that survived re-pointing names the instance, so if one
  // resolves inside the right row it is the best answer available.
  const byCandidate = tryFindInRoot(container, target.candidates);
  if (byCandidate) return byCandidate;

  // Otherwise: the same position in this row as the recorded element held in
  // its own. An index is meaningless across a page and exact within a row.
  const element = Array.from(container.querySelectorAll('*'))[scope.index];
  if (!element) return null;

  return {
    element,
    candidate: { kind: 'struct', value: `${scope.container} containing "${scope.text}" › #${scope.index}`, score: 0 },
    candidateIndex: 0,
  };
}

/** Scope first when the step has one, since it is the only thing that knows
 *  which row was asked for. Falling back to the candidates afterwards is safe
 *  because re-pointing already dropped every candidate that could match a row
 *  other than the requested one. */
function resolveIn(root: ParentNode, target: DescribedTarget): FoundTarget | null {
  return findScoped(root, target) ?? tryFindInRoot(root, target.candidates);
}

function findScrollableContainers(): Element[] {
  return Array.from(document.querySelectorAll('*')).filter((el) => el.scrollHeight > el.clientHeight + 50);
}

/**
 * A virtualized row that isn't currently mounted won't match any candidate —
 * not because the candidate is wrong, but because the element genuinely
 * isn't in the DOM yet. Nudging every scrollable container forward and
 * retrying (bounded, so a truly-missing element still fails) re-queries by
 * the row's actual content each time, never by a remembered index.
 */
export async function findTarget(target: DescribedTarget): Promise<FoundTarget | null> {
  const direct = descendToRoot(target);
  if (direct) {
    const found = resolveIn(direct, target);
    if (found) return found;
  }

  // A miss here is just as likely to mean "not virtualized content at all"
  // (a dismissed banner, a step that's simply wrong) as "not mounted yet".
  // Scrolling on a hunch is fine; leaving the page scrolled somewhere new
  // after that hunch didn't pan out is not — it would silently corrupt the
  // starting position for every step that runs after this one. Restoring
  // each container's original position on failure keeps the nudge a pure
  // probe with no side effect when it doesn't find anything.
  const scrollers = findScrollableContainers();
  const originalScrollTops = scrollers.map((scroller) => scroller.scrollTop);

  let found: FoundTarget | null = null;
  for (let attempt = 0; attempt < MAX_SCROLL_ATTEMPTS && !found; attempt++) {
    let progressed = false;
    for (const scroller of scrollers) {
      if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) {
        scroller.scrollTop += scroller.clientHeight * 0.8;
        progressed = true;
      }
    }
    if (!progressed) break;

    await sleep(SCROLL_RETRY_DELAY_MS);
    const root = descendToRoot(target);
    if (!root) continue;
    found = resolveIn(root, target);
  }

  if (!found) {
    scrollers.forEach((scroller, i) => {
      scroller.scrollTop = originalScrollTops[i];
    });
  }

  return found;
}
