import type { RecordingStep } from '../core/describe/types';
import { describeStepForHuman } from '../core/heal/describeForHuman';
import type { ReplayStepResult } from '../core/replay/types';
import { PANEL_STYLES } from './panelStyles';

/**
 * Status is modelled as an explicit state machine rather than a pile of
 * booleans, because the interesting transitions are the ones a pile of
 * booleans makes representable-but-wrong: 'healed' is a success that a
 * human had to rescue, and it must stay visually distinct from a clean
 * 'done' or the whole point of the healing demo is lost.
 */
export type StepStatus = 'pending' | 'running' | 'done' | 'healed' | 'skipped' | 'failed';

/** Where the user put the panel and whether they collapsed it. Replay
 *  reloads the page, so without persisting this the panel would spring back
 *  to expanded-and-top-right on every run — undoing the arrangement the user
 *  chose precisely so they could watch that run. */
export interface PanelLayout {
  collapsed: boolean;
  left: number | null;
  top: number | null;
}

export interface PanelCallbacks {
  onToggleRecord: () => void;
  onReplay: () => void;
  onClear: () => void;
  /** Fired only on deliberate changes — a collapse toggle or the end of a
   *  drag — not on every pointermove. */
  onLayoutChange?: (layout: PanelLayout) => void;
}

interface StepRow {
  root: HTMLElement;
  status: HTMLElement;
  meta: HTMLElement;
  error: HTMLElement;
}

export class Panel {
  /** The host stays in the light DOM (it has to, to be rendered at all) but
   *  everything inside lives in a *closed* shadow root: the victim app's CSS
   *  can't reach in and restyle the panel, and the panel's own styles can't
   *  leak out and change what's being recorded. It's also the same feature
   *  documented as a recording limitation in the cut list — closed roots are
   *  unreachable from outside, which is exactly why it's the right choice
   *  for a tool that must not be part of what it observes. */
  readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly panelEl: HTMLElement;
  private readonly headerEl: HTMLElement;
  private readonly stepsEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly emptyEl: HTMLElement;
  private readonly recordBtn: HTMLButtonElement;
  private readonly replayBtn: HTMLButtonElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly healEl: HTMLElement;
  private readonly healDescEl: HTMLElement;

  private rows: StepRow[] = [];
  private collapsed = false;

  constructor(
    private callbacks: PanelCallbacks,
    private initialLayout?: PanelLayout,
  ) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-recorder-ui', '');
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = PANEL_STYLES;
    this.shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="header">
        <span class="caret">▾</span>
        <span class="title">Recorder</span>
        <span class="count">0 steps</span>
      </div>
      <div class="controls">
        <button data-act="record" class="primary">Record</button>
        <button data-act="replay">Replay</button>
        <button data-act="clear">Clear</button>
      </div>
      <div class="steps"></div>
      <div class="empty">Nothing recorded yet.<br />Press Record and use the app.</div>
      <div class="heal hidden">
        <div class="heal-title">Can't find this element</div>
        <div class="heal-desc"></div>
        <div class="heal-hint">Click the right element on the page — or press Esc to skip.</div>
      </div>
    `;
    this.shadow.appendChild(panel);

    this.panelEl = panel;
    this.headerEl = panel.querySelector('.header')!;
    this.stepsEl = panel.querySelector('.steps')!;
    this.countEl = panel.querySelector('.count')!;
    this.emptyEl = panel.querySelector('.empty')!;
    this.recordBtn = panel.querySelector('[data-act="record"]')!;
    this.replayBtn = panel.querySelector('[data-act="replay"]')!;
    this.clearBtn = panel.querySelector('[data-act="clear"]')!;
    this.healEl = panel.querySelector('.heal')!;
    this.healDescEl = panel.querySelector('.heal-desc')!;

    this.recordBtn.addEventListener('click', () => this.callbacks.onToggleRecord());
    this.replayBtn.addEventListener('click', () => this.callbacks.onReplay());
    this.clearBtn.addEventListener('click', () => this.callbacks.onClear());

    this.setupHeaderInteractions();
    this.setCollapsed(this.initialLayout?.collapsed ?? false);
  }

  /**
   * The header does double duty: drag to move, click to collapse. They're
   * distinguished by distance rather than by giving collapse its own button,
   * so a small accidental wobble while clicking still collapses instead of
   * silently doing nothing.
   */
  private setupHeaderInteractions(): void {
    const DRAG_THRESHOLD_PX = 4;
    let origin: { x: number; y: number; top: number; left: number } | null = null;
    let moved = false;

    const onPointerMove = (event: PointerEvent) => {
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      moved = true;
      this.panelEl.dataset.dragging = 'true';

      // Clamped so the panel can't be dragged off-screen and stranded —
      // always leave the header grabbable.
      const rect = this.panelEl.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - 40);
      this.panelEl.style.left = `${Math.min(Math.max(0, origin.left + dx), maxLeft)}px`;
      this.panelEl.style.top = `${Math.min(Math.max(0, origin.top + dy), maxTop)}px`;
      this.panelEl.style.right = 'auto';
    };

    const onPointerUp = (event: PointerEvent) => {
      this.headerEl.releasePointerCapture?.(event.pointerId);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      delete this.panelEl.dataset.dragging;
      if (!moved) this.setCollapsed(!this.collapsed);
      origin = null;
      this.emitLayoutChange();
    };

    this.headerEl.addEventListener('pointerdown', (event: PointerEvent) => {
      const rect = this.panelEl.getBoundingClientRect();
      origin = { x: event.clientX, y: event.clientY, top: rect.top, left: rect.left };
      moved = false;
      this.headerEl.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
    });
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.panelEl.dataset.collapsed = String(collapsed);
  }

  /** Position comes from the inline style rather than the measured rect: an
   *  untouched panel is anchored with `right`, and recording a measured
   *  `left` for it would silently pin it there and break that anchoring. */
  getPersistableLayout(): PanelLayout {
    const inlineLeft = this.panelEl.style.left;
    return {
      collapsed: this.collapsed,
      left: inlineLeft === '' ? null : parseFloat(inlineLeft),
      top: inlineLeft === '' ? null : parseFloat(this.panelEl.style.top),
    };
  }

  private emitLayoutChange(): void {
    this.callbacks.onLayoutChange?.(this.getPersistableLayout());
  }

  moveTo(left: number, top: number): void {
    const rect = this.panelEl.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - 40);
    this.panelEl.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    this.panelEl.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
    this.panelEl.style.right = 'auto';
  }

  /** A panel parked near the right edge would be stranded off-screen by a
   *  window shrink, with no header left to grab it by. */
  private clampIntoView = () => {
    if (this.panelEl.style.left === '') return;
    this.moveTo(parseFloat(this.panelEl.style.left), parseFloat(this.panelEl.style.top));
  };

  /** Exposed for the same reason the record controls are: the panel lives in
   *  a closed shadow root, so nothing outside can inspect or drive it. */
  getLayout(): { collapsed: boolean; top: number; left: number; height: number } {
    const rect = this.panelEl.getBoundingClientRect();
    return { collapsed: this.collapsed, top: rect.top, left: rect.left, height: rect.height };
  }

  mount(): void {
    document.body.appendChild(this.host);
    window.addEventListener('resize', this.clampIntoView);

    // Position is restored after mounting rather than in the constructor:
    // moveTo clamps against the panel's measured width, and an unmounted
    // element measures as zero.
    const { left, top } = this.initialLayout ?? {};
    if (typeof left === 'number' && typeof top === 'number') this.moveTo(left, top);
  }

  /** True for the panel itself and anything inside it. Clicks on a closed
   *  shadow root's contents surface to outside listeners as the host, so
   *  checking the host covers the whole panel. */
  owns(element: Element): boolean {
    return element === this.host || this.host.contains(element);
  }

  setRecording(recording: boolean): void {
    this.recordBtn.textContent = recording ? 'Stop' : 'Record';
    this.recordBtn.classList.toggle('recording', recording);
    this.recordBtn.classList.toggle('primary', !recording);
  }

  setBusy(busy: boolean): void {
    this.replayBtn.disabled = busy;
    this.clearBtn.disabled = busy;
    this.recordBtn.disabled = busy;
    this.replayBtn.textContent = busy ? 'Replaying…' : 'Replay';
  }

  render(steps: RecordingStep[]): void {
    this.stepsEl.textContent = '';
    this.rows = [];
    this.countEl.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
    this.emptyEl.classList.toggle('hidden', steps.length > 0);

    steps.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = 'step';
      row.dataset.status = 'pending';

      const best = step.target?.candidates[0];
      row.innerHTML = `
        <span class="idx">${index + 1}</span>
        <span class="body">
          <span class="desc"></span>
          <span class="meta"></span>
          <span class="err"></span>
        </span>
        <span class="status" data-status="pending">pending</span>
      `;
      row.querySelector('.desc')!.textContent = describeStepForHuman(step.action, step.target);
      const meta = row.querySelector('.meta') as HTMLElement;
      if (best) meta.textContent = `${best.kind} · ${best.value} (${best.score})`;
      const error = row.querySelector('.err') as HTMLElement;
      error.classList.add('hidden');

      this.stepsEl.appendChild(row);
      this.rows.push({
        root: row,
        status: row.querySelector('.status') as HTMLElement,
        meta,
        error,
      });
    });
  }

  setStepStatus(index: number, status: StepStatus): void {
    const row = this.rows[index];
    if (!row) return;
    row.root.dataset.status = status;
    row.status.dataset.status = status;
    row.status.textContent = status;
    if (status === 'running') row.root.scrollIntoView({ block: 'nearest' });
  }

  applyResult(index: number, result: ReplayStepResult, step: RecordingStep): void {
    this.setStepStatus(index, result.status);
    const row = this.rows[index];
    if (!row) return;

    if (result.matchedCandidate) {
      const { kind, value, score } = result.matchedCandidate;
      // The candidate's rank matters as much as which one won: `#0` means the
      // best guess held, anything higher means the fallthrough saved it.
      const rank = `#${result.candidateIndex ?? 0}`;
      const took = result.timings ? ` · ${Math.round(result.timings.totalMs)}ms` : '';
      row.meta.textContent = `${kind} ${rank} · ${value} (${score})${took}`;
    }
    if (result.status === 'healed') {
      row.root.querySelector('.desc')!.textContent = describeStepForHuman(step.action, step.target);
    }
    if (result.error) {
      row.error.textContent = result.error;
      row.error.classList.remove('hidden');
    } else {
      row.error.classList.add('hidden');
    }
  }

  showHealPrompt(description: string): void {
    this.healDescEl.textContent = description;
    this.healEl.classList.remove('hidden');
  }

  hideHealPrompt(): void {
    this.healEl.classList.add('hidden');
  }
}
