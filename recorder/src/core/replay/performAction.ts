function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function center(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function performClick(element: Element): void {
  // `.click()` covers focus + the full mousedown/mouseup/click sequence in
  // one call, and React listens for the native event regardless of
  // isTrusted — dispatching the sequence by hand would just re-derive what
  // the platform already does correctly.
  (element as HTMLElement).click();
}

// React tracks an input's previous value on an internal `_valueTracker` and
// dedupes if the new value looks the same as what it already saw — plain
// `input.value = x` never reaches that tracker, so onChange silently never
// fires. Going through the native setter keeps the tracker (and thus React)
// in sync, and `bubbles: true` matters because React 17+ delegates listeners
// at the root container rather than the element itself.
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function performInput(element: Element, value: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeValue(element, value);
  }
}

export function performChange(element: Element, value: string): void {
  if (element instanceof HTMLSelectElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
    setter?.call(element, value === 'true');
    element.dispatchEvent(new Event('click', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function performSubmit(element: Element): void {
  if (element instanceof HTMLFormElement) {
    element.requestSubmit();
    return;
  }
  element.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

export function performFocus(element: Element): void {
  (element as HTMLElement).focus?.();
}

export function performBlur(element: Element): void {
  (element as HTMLElement).blur?.();
}

export function performScroll(element: Element, scrollTop: number, scrollLeft: number): void {
  element.scrollTop = scrollTop;
  element.scrollLeft = scrollLeft;
  element.dispatchEvent(new Event('scroll', { bubbles: true }));
}

export function performNavigation(url: string): void {
  const target = new URL(url, location.href);
  if (target.origin === location.origin) {
    history.pushState({}, '', target.pathname + target.search + target.hash);
  } else {
    location.href = url;
  }
}

// This drives JS-driven hover menus correctly (mouseover is what React's
// onMouseEnter is actually built from). It cannot drive a CSS-only
// `:hover` — that's rendering-engine state, not an event, and no amount of
// dispatching applies `.menu:hover { display: block }`. Only real input
// through the browser's own pipeline sets it, which is exactly the
// capability we gave up by not delegating to CDP (see plan.md).
export function performHover(element: Element): void {
  const { x, y } = center(element);
  const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window };
  element.dispatchEvent(new PointerEvent('pointerover', opts));
  element.dispatchEvent(new MouseEvent('mouseover', opts));
  element.dispatchEvent(new MouseEvent('mouseenter', opts));
  element.dispatchEvent(new MouseEvent('mousemove', opts));
}

function firePointer(type: string, element: Element | Document, x: number, y: number, buttons: number): void {
  element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
    }),
  );
}

const DRAG_INTERPOLATION_STEPS = 8;

// The path is synthesized here, not replayed from recorded coordinates —
// capture only ever stored the source and destination (see dragCapture.ts).
// A single jump from A to B won't register as a drag: dnd-kit's
// PointerSensor (like most drag libraries) has a minimum-distance activation
// constraint specifically to tell a drag from a click, so the move has to
// pass through intermediate points for the library to ever see it start.
export async function performDrag(from: Element, to: Element): Promise<void> {
  const start = center(from);
  const end = center(to);

  firePointer('pointerdown', from, start.x, start.y, 1);
  for (let i = 1; i <= DRAG_INTERPOLATION_STEPS; i++) {
    const t = i / DRAG_INTERPOLATION_STEPS;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    firePointer('pointermove', document, x, y, 1);
    await sleep(16);
  }
  firePointer('pointerup', to, end.x, end.y, 0);
}
