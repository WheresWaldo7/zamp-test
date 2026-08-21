import { Recorder } from '../core/recorder';
import { describeStep } from '../core/describe/describeRecording';
import type { RecordingStep } from '../core/describe/types';
import { replayRecording } from '../core/replay/replayRecording';
import type { ReplayOptions, ReplayStepResult } from '../core/replay/types';

// Thin edge adapter: the core Recorder has no idea it's running from a
// pasted <script> tag. Swapping this file for an extension content-script
// entry point later doesn't touch core/ at all.
type RecorderHandle = Recorder & {
  getRecording(): RecordingStep[];
  replay(steps?: RecordingStep[], options?: ReplayOptions): Promise<ReplayStepResult[]>;
};

declare global {
  interface Window {
    __recorder?: RecorderHandle;
  }
}

const recording: RecordingStep[] = [];
const recorder = (window.__recorder ?? new Recorder()) as RecorderHandle;

// Describing has to happen inside this same synchronous callback, not later
// in a batch pass. Recorder.emit() runs during the capture phase — before
// the event reaches its target — so the element being described is still
// exactly as the user left it. A component that replaces its own DOM on
// click (our rating widget removes and recreates its <span> stars) would
// otherwise have already mutated by the time a lazy describe() got to it,
// silently describing the wrong node instead of the one actually clicked.
recorder.onStep = (step) => {
  recording.push(describeStep(step));
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
};

// Defaults to replaying whatever this same session captured, but takes an
// explicit array too — that's how a Recording captured earlier (or
// round-tripped through JSON) gets replayed against a fresh page load.
recorder.replay = (steps = recording, options) => replayRecording(steps, options);

window.__recorder = recorder;
recorder.start();

console.log('[recorder] capture started — window.__recorder.getSteps() / .getRecording() / .replay()');
