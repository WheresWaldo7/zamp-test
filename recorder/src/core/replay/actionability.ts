const POLL_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 3000;

export class NotActionableError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function isVisible(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function sameRect(a: DOMRect, b: DOMRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// Checked across two real animation frames, not two poll ticks — a
// transitioning element can easily hold still for 100ms between polls
// while still mid-animation between frames.
async function isStableNow(element: Element): Promise<boolean> {
  const before = element.getBoundingClientRect();
  await nextFrame();
  const after = element.getBoundingClientRect();
  return sameRect(before, after);
}

function isEnabled(element: Element): boolean {
  const disabledProp = (element as { disabled?: boolean }).disabled;
  if (disabledProp === true) return false;
  return element.getAttribute('aria-disabled') !== 'true';
}

// document.elementFromPoint always hit-tests the top document, which
// retargets to the shadow host for anything inside a shadow tree — a
// ShadowRoot has its own elementFromPoint that hit-tests within it instead.
function hitTestRoot(element: Element): DocumentOrShadowRoot {
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root : document;
}

function isHittable(element: Element, rect: DOMRect): boolean {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hit = hitTestRoot(element).elementFromPoint(cx, cy);
  return hit !== null && (hit === element || element.contains(hit));
}

export interface ActionabilityOptions {
  timeoutMs?: number;
}

/**
 * Polls instead of sleeping: visible (non-empty box), stable (same box
 * across two animation frames), enabled, and hittable (nothing — like an
 * invisible overlay — currently sits on top of it). All four must pass in
 * the same poll tick before the action is allowed to run.
 */
export async function waitForActionable(element: Element, options: ActionabilityOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rect = element.getBoundingClientRect();
    if (isVisible(rect) && isEnabled(element) && isHittable(element, rect) && (await isStableNow(element))) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new NotActionableError(`Element did not become actionable within ${timeoutMs}ms`);
}
