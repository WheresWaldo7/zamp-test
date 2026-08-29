import { resolveTarget, toCapturedTarget } from './resolveTarget';
import { HoverCapture } from './hoverCapture';
import { DragCapture } from './dragCapture';
import type { CapturedAction, CapturedStep, CapturedTarget } from './types';

const INPUT_DEBOUNCE_MS = 500;
const SCROLL_DEBOUNCE_MS = 200;
/** Long enough to outlast the click the browser fires after a drag's
 *  pointerup, short enough never to reach an unrelated later click. */
const SUPPRESS_CLICK_MS = 50;

const LISTENER_OPTS = { capture: true, passive: true } as const;

export class Recorder {
  private steps: CapturedStep[] = [];
  private counter = 0;
  private listening = false;

  private pendingInput: CapturedStep | null = null;
  private inputTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollSessions = new Map<Element, { step: CapturedStep; timer: ReturnType<typeof setTimeout> }>();
  private suppressClick = false;
  private suppressClickTimer = 0;

  private readonly hover = new HoverCapture(
    (target) => this.emit({ type: 'hover' }, target),
    (element) => this.isIgnored(element),
  );
  private readonly drag = new DragCapture({
    onDrag: (from, to) => this.emit({ type: 'drag', to }, from),
    suppressNextClick: () => {
      // The trailing click arrives in a later *task* than pointerup, so a
      // microtask checkpoint drains long before it — the flag was always back
      // to false by the time it mattered, and every drag was recorded as a
      // drag plus a click on whatever ancestor the press and release shared.
      // A process made of one drag then looked like two steps, and asked for
      // two inputs to run.
      //
      // So the flag is consumed by the click itself, with a timer only as a
      // fallback for the libraries that cancel the click outright.
      this.suppressClick = true;
      window.clearTimeout(this.suppressClickTimer);
      this.suppressClickTimer = window.setTimeout(() => {
        this.suppressClick = false;
      }, SUPPRESS_CLICK_MS);
    },
    isIgnored: (element) => this.isIgnored(element),
  });

  private readonly originalPushState = history.pushState.bind(history);
  private readonly originalReplaceState = history.replaceState.bind(history);

  onStep: ((step: CapturedStep) => void) | null = null;

  /** Set by the adapter so the recorder never records interactions with the
   *  recorder's own UI. Core deliberately has no idea what that UI is — it
   *  just knows some elements aren't part of the app being recorded. */
  shouldIgnore: ((element: Element) => boolean) | null = null;

  private isIgnored(element: Element): boolean {
    return this.shouldIgnore?.(element) ?? false;
  }

  /** Every handler goes through this rather than resolveTarget directly, so
   *  the ignore rule can't be forgotten in one branch. */
  private resolve(event: Event): CapturedTarget | null {
    const target = resolveTarget(event);
    if (!target) return null;
    return this.isIgnored(target.element) ? null : target;
  }

  start() {
    if (this.listening) return;
    this.listening = true;

    document.addEventListener('click', this.handleClick, LISTENER_OPTS);
    document.addEventListener('input', this.handleInput, LISTENER_OPTS);
    document.addEventListener('change', this.handleChange, LISTENER_OPTS);
    document.addEventListener('submit', this.handleSubmit, LISTENER_OPTS);
    document.addEventListener('focusin', this.handleFocusIn, LISTENER_OPTS);
    document.addEventListener('focusout', this.handleFocusOut, LISTENER_OPTS);
    // 'scroll' doesn't bubble, but a capture-phase listener still sees it on
    // the way down to the target — same trick that makes this work for focus/blur.
    document.addEventListener('scroll', this.handleScroll, LISTENER_OPTS);
    window.addEventListener('popstate', this.handlePopState);
    this.patchHistory();

    this.hover.attach();
    this.drag.attach();
  }

  stop() {
    if (!this.listening) return;
    this.listening = false;

    document.removeEventListener('click', this.handleClick, { capture: true });
    document.removeEventListener('input', this.handleInput, { capture: true });
    document.removeEventListener('change', this.handleChange, { capture: true });
    document.removeEventListener('submit', this.handleSubmit, { capture: true });
    document.removeEventListener('focusin', this.handleFocusIn, { capture: true });
    document.removeEventListener('focusout', this.handleFocusOut, { capture: true });
    document.removeEventListener('scroll', this.handleScroll, { capture: true });
    window.removeEventListener('popstate', this.handlePopState);
    this.unpatchHistory();

    this.hover.detach();
    this.drag.detach();
    this.finalizePendingInput();
  }

  getSteps(): CapturedStep[] {
    return [...this.steps];
  }

  clear() {
    this.steps = [];
  }

  private nextId(): string {
    return `step_${this.counter++}`;
  }

  private emit(action: CapturedAction, target: CapturedTarget | null): CapturedStep {
    const step: CapturedStep = {
      id: this.nextId(),
      action,
      target,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.steps.push(step);
    console.log('[recorder]', step);
    this.onStep?.(step);
    return step;
  }

  private handleClick = (event: MouseEvent) => {
    if (this.suppressClick) {
      // A drag on this same interaction already emitted a step. Consume the
      // flag rather than leaving it set, so it can never swallow a real click.
      this.suppressClick = false;
      window.clearTimeout(this.suppressClickTimer);
      return;
    }
    const target = this.resolve(event);
    if (!target) return;

    // Clicking a <label for="x"> fires a click on the label, then a second,
    // separate trusted click on the control it wraps. Recording both would
    // show one intention as two clicks, so the label's own click is dropped
    // and the control's click (which follows synchronously) stands for it.
    if (target.element instanceof HTMLLabelElement && target.element.control) return;

    // Opening and picking from a <select> costs two clicks, and neither can
    // ever be replayed: the picker is drawn by the browser/OS, has no DOM
    // representation, and doesn't respond to a synthetic click. The 'change'
    // step that follows carries the entire intention — "set status to
    // pending" — so recording the clicks would only add steps that are
    // guaranteed to do nothing. Same reasoning as coalescing keystrokes:
    // keep the intent, drop the mechanics.
    if (target.element instanceof HTMLSelectElement) return;

    this.emit({ type: 'click' }, target);
  };

  private handleInput = (event: Event) => {
    const target = this.resolve(event);
    if (!target) return;
    const el = target.element;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return;

    if (this.pendingInput?.target?.element === el) {
      (this.pendingInput.action as Extract<CapturedAction, { type: 'input' }>).value = el.value;
      this.pendingInput.updatedAt = Date.now();
    } else {
      this.finalizePendingInput();
      this.pendingInput = this.emit({ type: 'input', value: el.value }, target);
    }

    // Typing "acme corp" is one step, not nine keystrokes — only finalize
    // once the user pauses, blurs, or moves to a different field.
    if (this.inputTimer) clearTimeout(this.inputTimer);
    this.inputTimer = setTimeout(() => this.finalizePendingInput(), INPUT_DEBOUNCE_MS);
  };

  private finalizePendingInput() {
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
      this.inputTimer = null;
    }
    this.pendingInput = null;
  }

  private handleChange = (event: Event) => {
    const target = this.resolve(event);
    if (!target) return;
    const el = target.element;

    if (el instanceof HTMLSelectElement) {
      this.finalizePendingInput();
      this.emit({ type: 'change', value: el.value }, target);
      return;
    }
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      this.emit({ type: 'change', value: String(el.checked) }, target);
    }
    // Text inputs/textareas already finalize through the input-debounce
    // path; a trailing 'change' here would just duplicate that step.
  };

  private handleSubmit = (event: Event) => {
    const target = this.resolve(event);
    if (!target) return;
    this.emit({ type: 'submit' }, target);
  };

  private handleFocusIn = (event: FocusEvent) => {
    const target = this.resolve(event);
    if (!target) return;
    if (this.pendingInput && this.pendingInput.target?.element !== target.element) {
      this.finalizePendingInput();
    }
    this.emit({ type: 'focus' }, target);
  };

  private handleFocusOut = (event: FocusEvent) => {
    const target = this.resolve(event);
    if (!target) return;
    if (this.pendingInput?.target?.element === target.element) this.finalizePendingInput();
    this.emit({ type: 'blur' }, target);
  };

  private handleScroll = (event: Event) => {
    const raw = event.target;
    const element = raw === document ? (document.scrollingElement ?? document.documentElement) : raw;
    if (!(element instanceof Element)) return;
    if (this.isIgnored(element)) return;

    const existing = this.scrollSessions.get(element);
    if (existing) {
      clearTimeout(existing.timer);
      const action = existing.step.action as Extract<CapturedAction, { type: 'scroll' }>;
      action.scrollTop = element.scrollTop;
      action.scrollLeft = element.scrollLeft;
      existing.step.updatedAt = Date.now();
      existing.timer = setTimeout(() => this.scrollSessions.delete(element), SCROLL_DEBOUNCE_MS);
      return;
    }

    const target = toCapturedTarget(element);
    const step = this.emit(
      { type: 'scroll', scrollTop: element.scrollTop, scrollLeft: element.scrollLeft },
      target,
    );
    const timer = setTimeout(() => this.scrollSessions.delete(element), SCROLL_DEBOUNCE_MS);
    this.scrollSessions.set(element, { step, timer });
  };

  private handlePopState = () => {
    this.emit({ type: 'navigation', url: location.href }, null);
  };

  private patchHistory() {
    const emitNavigation = () => this.emit({ type: 'navigation', url: location.href }, null);
    history.pushState = (...args: Parameters<History['pushState']>) => {
      this.originalPushState(...args);
      emitNavigation();
    };
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      this.originalReplaceState(...args);
      emitNavigation();
    };
  }

  private unpatchHistory() {
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;
  }
}
