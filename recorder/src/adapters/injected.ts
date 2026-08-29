import { Recorder } from '../core/recorder';
import { describeStep } from '../core/describe/describeRecording';
import type { RecordingStep } from '../core/describe/types';
import { pickElement } from '../core/heal/elementPicker';
import { waitForQuiescence } from '../core/replay/quiescence';
import { replayRecording } from '../core/replay/replayRecording';
import type { ReplayOptions, ReplayStepResult } from '../core/replay/types';
import { Panel, type PanelLayout } from '../ui/panel';

/** Adapter-level options. Reloading is a page concern, not something the
 *  replay engine should know how to do. */
type RunOptions = ReplayOptions & {
  /** Reload before replaying so the run starts from the app's initial state.
   *  Defaults to true; pass false to replay against the page as it stands. */
  reload?: boolean;
};

// Thin edge adapter: the core Recorder has no idea it's running from a
// pasted <script> tag, and core/replay has no idea a panel exists. Swapping
// this file for an extension content-script entry point later doesn't touch
// core/ at all.
type RecorderHandle = Recorder & {
  getRecording(): RecordingStep[];
  replay(steps?: RecordingStep[], options?: RunOptions): Promise<ReplayStepResult[]>;
  /** Programmatic equivalents of the panel's Record/Stop buttons. The panel
   *  lives in a closed shadow root, so it is deliberately unreachable from
   *  page scripts — anything automated (or tested) needs a way in that
   *  doesn't depend on synthesizing clicks through that boundary. */
  startRecording(): void;
  stopRecording(): void;
  isRecording(): boolean;
  /** Same rationale: the panel is unreachable from page scripts by design,
   *  so collapsing or repositioning it needs a sanctioned entry point. */
  panel: {
    collapse(collapsed: boolean): void;
    moveTo(left: number, top: number): void;
    layout(): { collapsed: boolean; top: number; left: number; height: number };
  };
};

declare global {
  interface Window {
    __recorder?: RecorderHandle;
  }
}

// A recording that evaporates on reload can't answer the question this
// whole project exists to answer — "does this still work against a changed
// page?" — because getting to the changed page *is* a navigation. Persisting
// to localStorage is what makes record-on-v1 / replay-on-v2 a two-click
// demo instead of a copy-paste-the-JSON chore.
const STORAGE_KEY = '__recorder_recording';

// Replay reloads the page first, so the intent to replay has to outlive the
// navigation that carries it out.
const PENDING_REPLAY_KEY = '__recorder_pending_replay';

// Same reasoning as the recording itself: replay reloads the page, so any
// arrangement the user made — collapsed, dragged aside — has to outlive the
// navigation, or every run resets the view they set up to watch it.
const PANEL_LAYOUT_KEY = '__recorder_panel_layout';

function loadPanelLayout(): PanelLayout | undefined {
  try {
    const raw = localStorage.getItem(PANEL_LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as PanelLayout) : undefined;
  } catch {
    return undefined;
  }
}

function persistPanelLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Non-essential: losing the layout is cosmetic, losing the run is not.
  }
}

function loadPersisted(): RecordingStep[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(steps: RecordingStep[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
  } catch {
    // Storage full or blocked — the in-memory recording still works for
    // this page, which is the more important half.
  }
}

const recording: RecordingStep[] = loadPersisted();
const recorder = (window.__recorder ?? new Recorder()) as RecorderHandle;

let isRecording = false;
let isReplaying = false;

function setRecording(next: boolean): void {
  if (next === isRecording) return;
  isRecording = next;
  if (next) recorder.start();
  else recorder.stop();
  panel.setRecording(next);
}

const panel = new Panel({
  onToggleRecord: () => setRecording(!isRecording),
  onReplay: () => {
    void runReplay();
  },
  onClear: () => {
    recorder.clear();
    persist(recording);
    panel.render(recording);
  },
  onLayoutChange: persistPanelLayout,
}, loadPanelLayout());
panel.mount();

// Without this the panel's own buttons would be captured as steps — the
// recorder listens on document, and the panel is in the same document.
recorder.shouldIgnore = (element) => panel.owns(element);

// Describing has to happen inside this same synchronous callback, not later
// in a batch pass. Recorder.emit() runs during the capture phase — before
// the event reaches its target — so the element being described is still
// exactly as the user left it. A component that replaces its own DOM on
// click (our rating widget removes and recreates its <span> stars) would
// otherwise have already mutated by the time a lazy describe() got to it,
// silently describing the wrong node instead of the one actually clicked.
recorder.onStep = (step) => {
  recording.push(describeStep(step));
  persist(recording);
  panel.render(recording);
};
recorder.getRecording = () => recording;

// Recorder.clear() only knows about its own Stage 1 state — it has no idea
// this adapter is keeping a second, described list alongside it. Wrapping
// clear() here (rather than teaching Recorder about `recording`) keeps that
// knowledge at the edge, where the describe-specific state actually lives.
const clearSteps = recorder.clear.bind(recorder);
recorder.clear = () => {
  clearSteps();
  recording.length = 0;
  persist(recording);
};

/**
 * The heal handler is the whole reason core/replay takes an `onHeal` hook
 * instead of owning this itself: pausing to ask a person is a UI concern,
 * and the replay engine stays testable without one.
 *
 * Recording is suspended while the human points, so their diagnostic click
 * doesn't get captured as a new step in the very recording being repaired.
 */
const healHandler: NonNullable<ReplayOptions['onHeal']> = async (request) => {
  panel.showHealPrompt(request.description);
  try {
    return await pickElement();
  } finally {
    panel.hideHealPrompt();
  }
};

async function runReplay(steps: RecordingStep[] = recording, options: RunOptions = {}) {
  if (isReplaying) return [];

  // A recording describes a journey from the app's initial state. Replaying
  // it against the page as the recording *left* it starts from the wrong
  // place — the drawer is already open, the filter already typed — so the
  // steps act on a screen they were never recorded against.
  //
  // Nothing generic can "undo" an arbitrary app's state, but reloading is
  // the one reset every web app agrees on. The current URL is reloaded
  // rather than the URL recording began at, so replaying a v1 recording
  // against ?v2 stays on v2 — which is the entire point of that comparison.
  if (options.reload !== false && steps === recording) {
    sessionStorage.setItem(PENDING_REPLAY_KEY, '1');
    location.reload();
    return [];
  }

  isReplaying = true;

  // A run has to start from a clean slate visually, or leftover statuses
  // from the previous run read as results for this one.
  panel.render(steps);
  panel.setBusy(true);

  // Replaying while recording would capture the replayed actions as new
  // steps, which is a fast way to corrupt the recording you're testing.
  setRecording(false);

  try {
    return await replayRecording(steps, {
      continueOnFailure: true,
      stepDelayMs: 600,
      onHeal: healHandler,
      isOverlay: (element) => panel.owns(element),
      onStepStart: (_step, index) => panel.setStepStatus(index, 'running'),
      onStepResult: (result, index) => panel.applyResult(index, result, steps[index]),
      ...options,
    });
  } finally {
    // Healing rewrites steps in place, so a run that needed a human is only
    // actually fixed if that correction outlives the page.
    if (steps === recording) persist(recording);
    panel.setBusy(false);
    isReplaying = false;
  }
}

recorder.replay = (steps = recording, options) => runReplay(steps, options);
recorder.startRecording = () => setRecording(true);
recorder.stopRecording = () => setRecording(false);
recorder.isRecording = () => isRecording;
recorder.panel = {
  collapse: (collapsed) => {
    panel.setCollapsed(collapsed);
    persistPanelLayout(panel.getPersistableLayout());
  },
  moveTo: (left, top) => {
    panel.moveTo(left, top);
    persistPanelLayout(panel.getPersistableLayout());
  },
  layout: () => panel.getLayout(),
};

window.__recorder = recorder;
panel.setRecording(false);
panel.render(recording);

// Picking up the reload half of the replay. The flag is cleared before the
// run rather than after, so a step that throws can't leave the page
// reloading and re-replaying forever.
if (sessionStorage.getItem(PENDING_REPLAY_KEY)) {
  sessionStorage.removeItem(PENDING_REPLAY_KEY);
  if (recording.length > 0) {
    panel.setBusy(true);
    void waitForQuiescence().then(() => runReplay(recording, { reload: false }));
  }
}

console.log('[recorder] ready — use the panel, or window.__recorder.getRecording() / .replay()');
