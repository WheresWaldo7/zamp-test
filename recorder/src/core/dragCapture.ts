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
    if (!target) return;
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

  private handleUp = (event: PointerEvent) => {
    if (!this.state || event.pointerId !== this.state.pointerId) return;
    const { from, maxDistance } = this.state;
    this.state = null;
    if (maxDistance < DRAG_THRESHOLD_PX) return;

    const dropElement = document.elementFromPoint(event.clientX, event.clientY);
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
