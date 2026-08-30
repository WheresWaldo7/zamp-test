const FADE_MS = 120;

/**
 * A box drawn over whatever replay is about to touch.
 *
 * Replay is otherwise invisible: values change and rows open with no
 * indication of *where* the action landed, which makes a run impossible to
 * follow and a wrong-element match impossible to spot by eye. Highlighting
 * the resolved element just before acting turns the run into something a
 * person can actually watch — and is the only way to see, for instance,
 * that a native <select> was targeted, since its OS-drawn popup can never
 * be reproduced.
 *
 * `pointer-events: none` matters for more than cosmetics: it keeps the box
 * out of hit-testing entirely, so highlighting an element can't be what
 * makes the actionability check believe something is covering it.
 */
export class Highlighter {
  private readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.setAttribute('data-recorder-ui', '');
    Object.assign(this.el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      border: '2px solid #7c3aed',
      background: 'rgba(124, 58, 237, 0.16)',
      borderRadius: '3px',
      boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.25)',
      zIndex: '2147483646',
      opacity: '0',
      transition: `opacity ${FADE_MS}ms ease-out, top ${FADE_MS}ms, left ${FADE_MS}ms, width ${FADE_MS}ms, height ${FADE_MS}ms`,
      display: 'none',
    });
  }

  mount(): void {
    document.body.appendChild(this.el);
  }

  show(element: Element): void {
    const rect = element.getBoundingClientRect();
    Object.assign(this.el.style, {
      display: 'block',
      opacity: '1',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  hide(): void {
    this.el.style.opacity = '0';
    setTimeout(() => {
      if (this.el.style.opacity === '0') this.el.style.display = 'none';
    }, FADE_MS);
  }
}
