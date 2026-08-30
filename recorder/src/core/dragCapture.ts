import { resolveTarget, toCapturedTarget } from './resolveTarget';
import type { CapturedTarget } from './types';

// dnd-kit's PointerSensor (and most drag libraries) require the pointer to
// clear a small activation distance before treating a gesture as a drag
// rather than a click. Mirror that here so an ordinary click never gets
// misrecorded as a zero-distance drag.
const DRAG_THRESHOLD_PX = 8;

interface DragState {
  pointerId: number;
  from: CapturedTarget;
  startX: number;
  startY: number;
  maxDistance: number;
}

interface DragCaptureOptions {
  onDrag: (from: CapturedTarget, to: CapturedTarget) => void;
  /** Called when a real drag is confirmed, so the caller can drop the
   *  trailing native `click` event the browser still fires on pointerup. */
  suppressNextClick: () => void;
  /** Lets the caller exclude elements that aren't part of the app being
   *  recorded — the recorder's own UI, for instance. */
  isIgnored?: (element: Element) => boolean;
}

/**
 * Storing every intermediate pointermove would record mechanics, not
 * intent — hundreds of coordinates nobody replays faithfully anyway. Only
 * the source and destination matter; the path is synthesized at replay time.
 */
export class DragCapture {
  private state: DragState | null = null;

  constructor(private options: DragCaptureOptions) {}

  private handleDown = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const target = resolveTarget(event);
    if (!target || this.options.isIgnored?.(target.element)) return;
    this.state = {
      pointerId: event.pointerId,
      from: target,
      startX: event.clientX,
      startY: event.clientY,
      maxDistance: 0,
    };
  };

  private handleMove = (event: PointerEvent) => {
    if (!this.state || event.pointerId !== this.state.pointerId) return;
    const distance = Math.hypot(event.clientX - this.state.startX, event.clientY - this.state.startY);
    this.state.maxDistance = Math.max(this.state.maxDistance, distance);
  };

  /**
   * By the time the pointer is released, the drag library has moved the
   * dragged element under the cursor — so the topmost element at the drop
   * point is the thing being dragged, not the thing it's being dropped on.
   * Taking that at face value records "drop Pending onto Pending": a drag
   * whose destination is its own source, which replays as a no-op.
   *
   * Looking past the dragged element (and anything inside it) in the hit
   * stack finds what is actually underneath, which is the real target.
   */
  private findDropTarget(x: number, y: number, source: Element): Element | null {
    for (const element of document.elementsFromPoint(x, y)) {
      if (element === source || source.contains(element)) continue;
      if (this.options.isIgnored?.(element)) continue;
      return this.nearestSibling(element, source, x, y) ?? element;
    }
    return null;
  }

  /**
   * A release a few pixels into the padding between two items hit-tests to
   * their container, but that is not what the drag library concluded: dnd-kit
   * and its peers resolve a drop against the item rectangles they track, so
   * the same gesture still reorders. Recording the container loses the only
   * part of the drop that carried meaning, and replays as a no-op — the drag
   * reports success and nothing moves.
   *
   * So when the hit is a container holding several items shaped like the one
   * being dragged, take whichever of those the pointer is actually nearest.
   * That is the same question the library asked.
   */
  private nearestSibling(container: Element, source: Element, x: number, y: number): Element | null {
    const items = Array.from(container.children).filter(
      (child) => child !== source && child.tagName === source.tagName,
    );
    if (items.length < 2) return null;

    let best: Element | null = null;
    let bestDistance = Infinity;

    for (const item of items) {
      if (this.options.isIgnored?.(item)) continue;
      const rect = item.getBoundingClientRect();
      const distance = Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }

    return best;
  }

  private handleUp = (event: PointerEvent) => {
    if (!this.state || event.pointerId !== this.state.pointerId) return;
    const { from, maxDistance } = this.state;
    this.state = null;
    if (maxDistance < DRAG_THRESHOLD_PX) return;

    const dropElement = this.findDropTarget(event.clientX, event.clientY, from.element);
    const to = dropElement ? toCapturedTarget(dropElement) : from;

    this.options.suppressNextClick();
    this.options.onDrag(from, to);
  };

  attach() {
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerdown', this.handleDown, opts);
    document.addEventListener('pointermove', this.handleMove, opts);
    document.addEventListener('pointerup', this.handleUp, opts);
  }

  detach() {
    document.removeEventListener('pointerdown', this.handleDown, { capture: true });
    document.removeEventListener('pointermove', this.handleMove, { capture: true });
    document.removeEventListener('pointerup', this.handleUp, { capture: true });
    this.state = null;
  }
}
