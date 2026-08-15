import { resolveTarget } from './resolveTarget';
import type { CapturedTarget } from './types';

const DWELL_MS = 300;

interface HoverSession {
  target: CapturedTarget;
  timer: ReturnType<typeof setTimeout>;
  observer: MutationObserver;
  mutated: boolean;
}

/**
 * `mouseover` fires on every element the cursor crosses en route to wherever
 * it's actually going — almost all of that is transit, not intent. A hover
 * only gets recorded if the user dwelled ~300ms *and* something in the DOM
 * changed while they did (a menu opening, a tooltip appearing). The mutation
 * check is what separates "this hover meant something" from "the mouse
 * passed through on the way to a click" — cuts recorded hover noise by
 * roughly an order of magnitude in practice.
 */
export class HoverCapture {
  private session: HoverSession | null = null;

  constructor(private onHover: (target: CapturedTarget) => void) {}

  private handleOver = (event: MouseEvent) => {
    const target = resolveTarget(event);
    if (!target || this.session?.target.element === target.element) return;
    this.reset();

    const observer = new MutationObserver(() => {
      if (this.session) this.session.mutated = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const timer = setTimeout(() => {
      if (this.session?.mutated) this.onHover(this.session.target);
      this.session?.observer.disconnect();
      this.session = null;
    }, DWELL_MS);

    this.session = { target, timer, observer, mutated: false };
  };

  private handleOut = (event: MouseEvent) => {
    const target = resolveTarget(event);
    if (target && this.session?.target.element === target.element) this.reset();
  };

  private reset() {
    if (!this.session) return;
    clearTimeout(this.session.timer);
    this.session.observer.disconnect();
    this.session = null;
  }

  attach() {
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('mouseover', this.handleOver, opts);
    document.addEventListener('mouseout', this.handleOut, opts);
  }

  detach() {
    document.removeEventListener('mouseover', this.handleOver, { capture: true });
    document.removeEventListener('mouseout', this.handleOut, { capture: true });
    this.reset();
  }
}
