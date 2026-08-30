import type { CandidateKind } from './types';

export interface Strategy {
  kind: CandidateKind;
  baseWeight: number;
  /** Returns this strategy's descriptor for `element`, or null if not applicable. */
  describe(element: Element): string | null;
}

// Every strategy's uniqueness check reuses its own `describe` — an element
// "matches" a candidate value if describing it produces that same value.
// That guarantees find() can never disagree with the describe() a candidate
// came from, without needing a second, parallel query implementation.
export function findByStrategy(strategy: Strategy, root: ParentNode, value: string): Element[] {
  const matches: Element[] = [];
  root.querySelectorAll('*').forEach((el) => {
    if (strategy.describe(el) === value) matches.push(el);
  });
  return matches;
}

const IMPLICIT_INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  submit: 'button',
  button: 'button',
};

function getRole(element: Element): string | null {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;

  switch (element.tagName) {
    case 'BUTTON':
      return 'button';
    case 'A':
      return element.hasAttribute('href') ? 'link' : null;
    case 'SELECT':
      return 'combobox';
    case 'TEXTAREA':
      return 'textbox';
    case 'INPUT': {
      const type = (element as HTMLInputElement).type;
      return IMPLICIT_INPUT_ROLES[type] ?? 'textbox';
    }
    default:
      return null;
  }
}

// A simplified accessible-name computation (real ARIA accname resolution
// has more steps) — good enough to rank candidates, not to pass a11y audits.
function getAccessibleName(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }

  if ('labels' in element) {
    const labels = (element as HTMLInputElement).labels;
    if (labels && labels.length > 0) {
      const text = Array.from(labels)
        .map((label) => label.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (text) return text;
    }
  }

  if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) {
    const text = element.textContent?.trim();
    if (text) return text;
  }

  const placeholder = element.getAttribute('placeholder')?.trim();
  if (placeholder) return placeholder;

  const title = element.getAttribute('title')?.trim();
  if (title) return title;

  const alt = element.getAttribute('alt')?.trim();
  if (alt) return alt;

  return null;
}

export const roleStrategy: Strategy = {
  kind: 'role',
  baseWeight: 100,
  describe(element) {
    const role = getRole(element);
    const name = getAccessibleName(element);
    return role && name ? `${role}[name="${name}"]` : null;
  },
};

export const labelStrategy: Strategy = {
  kind: 'label',
  baseWeight: 85,
  describe(element) {
    if ('labels' in element) {
      const labels = (element as HTMLInputElement).labels;
      if (labels && labels.length > 0) {
        const text = Array.from(labels)
          .map((label) => label.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        if (text) return `label:"${text}"`;
      }
    }
    const placeholder = element.getAttribute('placeholder')?.trim();
    return placeholder ? `placeholder:"${placeholder}"` : null;
  },
};

export const textStrategy: Strategy = {
  kind: 'text',
  baseWeight: 70,
  describe(element) {
    // A short, mostly-leaf text node is a stable label; a big container's
    // concatenated text is not something a human would ever describe an
    // element by, so it's excluded rather than scored low.
    if (element.children.length > 5) return null;
    const text = element.textContent?.replace(/\s+/g, ' ').trim();
    if (!text || text.length === 0 || text.length > 60) return null;
    return `text:"${text}"`;
  },
};

// CSS-module class names come out looking like `_button_9bw61_31` — this is
// exactly the pattern the scoring step needs to recognize and penalize.
const MACHINE_GENERATED_RE = /_[a-z0-9]{4,}_[a-z0-9]{2,}$/i;

export const attrStrategy: Strategy = {
  kind: 'attr',
  baseWeight: 55,
  describe(element) {
    const name = element.getAttribute('name');
    if (name) return `[name="${name}"]`;

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

    const alt = element.getAttribute('alt');
    if (alt) return `[alt="${alt}"]`;

    if (element.id) return `#${element.id}`;

    // Last resort within this strategy: a class name, even though it's
    // usually machine-generated — the scoring step is what sinks it, not
    // an exclusion here, so the ranking function's judgment stays visible.
    const firstClass = element.classList[0];
    return firstClass ? `.${firstClass}` : null;
  },
};

// An element sitting directly inside a shadow root has no parentElement —
// its parent is the ShadowRoot, which is a DocumentFragment, not an Element.
// Stopping there would describe every such element as a bare tag name, which
// is how all five identical rating stars ended up sharing the descriptor
// "span" and becoming impossible to tell apart. A ShadowRoot still exposes
// `children`, so it works fine as an indexing parent; the describe walk just
// has to be willing to step onto it.
type StructuralParent = Element | ShadowRoot;

function structuralParent(node: Element): StructuralParent | null {
  if (node.parentElement) return node.parentElement;
  const parent = node.parentNode;
  return parent instanceof ShadowRoot ? parent : null;
}

export const structStrategy: Strategy = {
  kind: 'struct',
  baseWeight: 20,
  describe(element) {
    const parts: string[] = [];
    let node: Element = element;
    let depth = 0;

    while (depth < 6) {
      const parent = structuralParent(node);
      if (!parent) {
        parts.unshift(node.tagName.toLowerCase());
        break;
      }
      const tagName = node.tagName;
      const sameTagSiblings = Array.from(parent.children).filter((c) => c.tagName === tagName);
      const segment =
        sameTagSiblings.length > 1
          ? `${tagName.toLowerCase()}:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`
          : tagName.toLowerCase();
      parts.unshift(segment);

      // A shadow root is the top of its own tree — the path is already
      // scoped to it (replay descends via shadowPath), so stop rather than
      // climbing out into the host document.
      if (parent instanceof ShadowRoot) break;
      if (parent.id) {
        parts.unshift(`#${parent.id}`);
        break;
      }
      node = parent;
      depth++;
    }
    return parts.join(' > ');
  },
};

export const STRATEGIES: Strategy[] = [roleStrategy, labelStrategy, textStrategy, attrStrategy, structStrategy];

// Replay needs to go the other direction: given a candidate's `kind`, find
// the same strategy that produced it, so it can re-run find() against the
// live DOM using the exact matching logic the candidate was scored with.
export const STRATEGY_BY_KIND: Record<CandidateKind, Strategy> = Object.fromEntries(
  STRATEGIES.map((strategy) => [strategy.kind, strategy]),
) as Record<CandidateKind, Strategy>;

export { MACHINE_GENERATED_RE };
