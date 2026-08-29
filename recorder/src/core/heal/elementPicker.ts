import { getRealTarget } from '../resolveTarget';

const HIGHLIGHT_ID = '__recorder_pick_highlight';

function createHighlight(): HTMLElement {
  const el = document.createElement('div');
  el.id = HIGHLIGHT_ID;
  Object.assign(el.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #7c3aed',
    background: 'rgba(124, 58, 237, 0.15)',
    borderRadius: '3px',
    zIndex: '2147483646',
    transition: 'all 60ms ease-out',
    display: 'none',
  });
  document.body.appendChild(el);
  return el;
}

function positionHighlight(highlight: HTMLElement, element: Element): void {
  const rect = element.getBoundingClientRect();
  Object.assign(highlight.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

/**
 * Asks the human "which element did you actually mean?" and resolves with
 * whatever they click, or null if they press Escape.
 *
 * The click is captured and then neutralized — preventDefault plus
 * stopImmediatePropagation in the capture phase — because the point of this
 * click is to *identify* an element, not to activate it. Letting it through
 * would fire the app's own handler and advance the very state the paused
 * replay is about to act on.
 *
 * Targets resolve through composedPath()[0] for the same reason capture does:
 * inside a shadow root, event.target is retargeted to the host, and the whole
 * reason we're here is usually that the element is hard to address.
 */
export function pickElement(): Promise<Element | null> {
  return new Promise((resolve) => {
    const highlight = createHighlight();
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';

    const cleanup = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      highlight.remove();
      document.body.style.cursor = previousCursor;
    };

    const onMove = (event: MouseEvent) => {
      const target = getRealTarget(event);
      if (target && target.id !== HIGHLIGHT_ID) positionHighlight(highlight, target);
    };

    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target = getRealTarget(event);
      cleanup();
      resolve(target);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cleanup();
      resolve(null);
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  });
}
