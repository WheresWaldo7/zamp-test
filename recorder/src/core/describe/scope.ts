import { attrStrategy } from './strategies';
import type { TargetScope } from './types';

/** How far up from the clicked element to look for the repeated unit. A row
 *  or a card is a handful of levels above the thing you actually click. */
const MAX_CLIMB = 6;

/** The target is the repeated unit itself rather than something inside it —
 *  what you get for clicking a row's own padding instead of one of its cells. */
export const CONTAINER_ITSELF = -1;

/** Text long enough to identify something but short enough to be a field
 *  rather than a whole row's worth of content. */
const MIN_TEXT = 2;
const MAX_TEXT = 80;

/**
 * The text that picks this unit out from the others.
 *
 * Derived, not assumed: an order id identifies a row because it appears in
 * exactly one of them, while "Pending" appears in dozens and a company name
 * can appear in four. Checking which of a row's fields is unique among its
 * peers finds the id column without anyone having to say which column that
 * is — and correctly finds nothing on a list where no field is unique.
 */
function identifyingText(container: Element, peers: Element[]): string | null {
  const leaves = Array.from(container.querySelectorAll('*')).filter((el) => el.children.length === 0);

  // A unit whose text sits directly on it — a chip, a tag, a plain list item —
  // has no inner element to read, so it speaks for itself. Without this such a
  // unit got no scope at all and fell back to being identified by text that
  // merely happened to be unique across the whole page, which "Pending" is not
  // when every pending row also says it.
  if (leaves.length === 0) leaves.push(container);

  for (const leaf of leaves) {
    const text = (leaf.textContent ?? '').trim();
    if (text.length < MIN_TEXT || text.length > MAX_TEXT) continue;

    const holders = peers.filter((peer) => (peer.textContent ?? '').includes(text));
    if (holders.length === 1) return text;
  }
  return null;
}

/**
 * Finds the repeated unit a target sits inside — the row, the card, the list
 * item — and how to tell this one from its neighbours.
 *
 * This exists because of an inversion between what a click *is* and what it
 * *means*. Clicking the total cell of a row and clicking its status cell are
 * both "open that order", but the text under the cursor is "$317.60" one time
 * and "cancelled" the next. Take the anchor from the element itself and the
 * process ends up parameterised by a price — a value that names nothing the
 * user could ask for, and that appears on rows they never mentioned.
 *
 * A repeated unit is recognised as several same-shaped siblings, not merely a
 * selector that matches twice somewhere on the page. That distinction is what
 * keeps a drawer or a toolbar — whose contents also change between runs — from
 * being mistaken for a list, which would turn a fixed step like "click Save"
 * into a per-run input.
 */
export function describeScope(element: Element): TargetScope | undefined {
  // Starts at the element, not its parent. A click lands on the row itself as
  // often as on a cell inside it — anywhere in its padding will do — and
  // looking only at ancestors missed exactly those clicks. The row then had no
  // scope and no usable text of its own, so nothing appeared to vary between
  // passes, the process was learned as having no inputs at all, and the order
  // typed into the box was quietly ignored while it repeated itself on the row
  // it happened to record.
  let node: Element | null = element;

  for (let depth = 0; node && depth <= MAX_CLIMB; depth++, node = node.parentElement) {
    const container = attrStrategy.describe(node);
    if (!container) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    const peers = Array.from(parent.children).filter((child) => attrStrategy.describe(child) === container);
    if (peers.length < 2) continue;

    const text = identifyingText(node, peers);
    if (!text) continue;

    // Position within the unit, for the common case where nothing about the
    // element itself separates it from the same cell of another row. Every
    // descendant, not just the leaves, so the index means the same thing on
    // the way back out.
    let index = CONTAINER_ITSELF;
    if (node !== element) {
      index = Array.from(node.querySelectorAll('*')).indexOf(element);
      if (index < 0) continue;
    }

    return { container, text, index };
  }

  return undefined;
}
