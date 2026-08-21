import type { CapturedTarget } from './types';

// event.target gets retargeted to the shadow host when a listener sits
// outside the shadow tree — composedPath()[0] is the one place that still
// tells you the actual element the user touched.
export function getRealTarget(event: Event): Element | null {
  const first = event.composedPath()[0];
  return first instanceof Element ? first : null;
}

// Shared with replay: the same descriptor is used to both record a
// frame/shadow host at capture time and re-find that same host later, so the
// two sides can never drift apart.
export function describeHostSegment(element: Element): string {
  return element.id ? `#${element.id}` : element.tagName.toLowerCase();
}

export function getShadowPath(element: Element): string[] {
  const path: string[] = [];
  let node: Node = element;
  let root = node.getRootNode();
  while (root instanceof ShadowRoot) {
    path.unshift(describeHostSegment(root.host));
    node = root.host;
    root = node.getRootNode();
  }
  return path;
}

export function getFramePath(element: Element): string[] {
  const path: string[] = [];
  try {
    let view = element.ownerDocument.defaultView;
    while (view && view.frameElement) {
      path.unshift(describeHostSegment(view.frameElement));
      view = view.frameElement.ownerDocument.defaultView;
    }
  } catch {
    // Cross-origin frame access throws a SecurityError — an explicit cut
    // (same-origin policy), so just stop walking rather than fail capture.
  }
  return path;
}

export function toCapturedTarget(element: Element): CapturedTarget {
  return {
    element,
    frame: getFramePath(element),
    shadowPath: getShadowPath(element),
  };
}

export function resolveTarget(event: Event): CapturedTarget | null {
  const element = getRealTarget(event);
  return element ? toCapturedTarget(element) : null;
}
