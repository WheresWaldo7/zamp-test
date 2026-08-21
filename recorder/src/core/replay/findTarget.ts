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
}

/** Tries each candidate best-first; a candidate that misses or now matches
 *  more than one element is skipped rather than trusted, since Stage 2 only
 *  guaranteed it was unique at *capture* time. */
function tryFindInRoot(root: ParentNode, candidates: SelectorCandidate[]): FoundTarget | null {
  for (const candidate of candidates) {
    const strategy = STRATEGY_BY_KIND[candidate.kind];
    const matches = findByStrategy(strategy, root, candidate.value);
    if (matches.length === 1) return { element: matches[0], candidate };
  }
  return null;
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
    const found = tryFindInRoot(direct, target.candidates);
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
    found = tryFindInRoot(root, target.candidates);
  }

  if (!found) {
    scrollers.forEach((scroller, i) => {
      scroller.scrollTop = originalScrollTops[i];
    });
  }

  return found;
}
