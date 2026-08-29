import type { RecordingStep } from '../describe/types';
import { meaningfulSteps, stepSignature, targetText } from './signature';

/** How many times a shape must recur before it counts as a process rather
 *  than a coincidence. Two is a pair; three is a habit. */
const MIN_OCCURRENCES = 2;

/**
 * One action repeated is a process only when the action changes something.
 *
 * Opening one order after another is reading; the tool offering to take that
 * over would be interrupting someone who is just looking around. Dragging one
 * item after another into place is work, and each drag is a whole unit of it —
 * so insisting a process be at least two steps long would describe four drags
 * as "two drags, done twice" and demand two items every time it ran.
 */
const MIN_PATTERN_LENGTH = 1;

const CONSEQUENTIAL_ACTIONS = new Set(['drag', 'input', 'change', 'submit']);

function worthAutomatingAlone(step: RecordingStep): boolean {
  return CONSEQUENTIAL_ACTIONS.has(step.action.type);
}

export interface DetectedPattern {
  /** The shape of the process: one signature per step. */
  signature: string[];
  /** Each time the user performed it, as the actual recorded steps. */
  occurrences: RecordingStep[][];
}

/**
 * Finds the strongest repeated run of actions in what the user has done.
 *
 * Deliberately only looks for *consecutive* repetition. A process someone is
 * grinding through — process this order, then the next, then the next — shows
 * up back to back, and requiring that is what keeps unrelated actions that
 * merely happen to recur across a session from being mistaken for a
 * procedure.
 */
export function detectRepetition(steps: RecordingStep[]): DetectedPattern | null {
  const candidates = meaningfulSteps(steps);
  const signatures = candidates.map(stepSignature);
  if (signatures.length < MIN_PATTERN_LENGTH * MIN_OCCURRENCES) return null;

  let best: { start: number; length: number; count: number } | null = null;

  for (let start = 0; start < signatures.length; start++) {
    const maxLength = Math.floor((signatures.length - start) / MIN_OCCURRENCES);

    for (let length = MIN_PATTERN_LENGTH; length <= maxLength; length++) {
      if (length === 1 && !worthAutomatingAlone(candidates[start])) continue;

      let count = 1;
      while (matchesAt(signatures, start, start + count * length, length)) count++;
      if (count < MIN_OCCURRENCES) continue;

      // Prefer whichever pattern accounts for the most of what the user did.
      // Between a short shape repeated many times and a longer one repeated
      // fewer, coverage is the honest tiebreak: it is the amount of work the
      // user would not have to do again.
      //
      // When coverage ties, take the *shorter* pattern. Four passes of a
      // three-step cycle cover twelve steps either way: as three steps done
      // four times, or as six steps done twice. Both describe the recording
      // perfectly, but only the first describes the process. Choosing the
      // longer one teaches the tool that "the process" is two orders' worth
      // of work, so asking it to do one order does two — and the second is
      // an order the user never named.
      const coverage = length * count;
      const bestCoverage = best ? best.length * best.count : 0;
      if (coverage > bestCoverage || (coverage === bestCoverage && best && length < best.length)) {
        best = { start, length, count };
      }
    }
  }

  if (!best) return null;

  const aligned = alignToInstanceStep(candidates, best);

  const occurrences: RecordingStep[][] = [];
  for (let i = 0; i < aligned.count; i++) {
    const from = aligned.start + i * aligned.length;
    occurrences.push(candidates.slice(from, from + aligned.length));
  }

  return {
    signature: signatures.slice(best.start, best.start + best.length),
    occurrences,
  };
}

/**
 * Rotates the detected cycle so it begins with the step that says *which*
 * thing the run is about.
 *
 * A repeat of A-B-C is structurally indistinguishable from a repeat of
 * B-C-A, and if the recording happened to start mid-cycle — the user opened
 * an order and only then pressed Record — the second is what gets found. That
 * version is not merely untidy: it means "set the status, save, then open the
 * next order", so the very first run edits whatever happened to be on screen
 * and the user's chosen input is only opened at the end. It quietly modifies
 * something nobody asked it to.
 *
 * The step whose target text differs between occurrences is the one that
 * picks the instance, so a cycle that starts there reads the way the work
 * actually goes: choose the thing, then act on it.
 */
function alignToInstanceStep(
  candidates: RecordingStep[],
  best: { start: number; length: number; count: number },
): { start: number; length: number; count: number } {
  for (let rotation = 0; rotation < best.length; rotation++) {
    const start = best.start + rotation;
    const count = Math.floor((candidates.length - start) / best.length);
    if (count < MIN_OCCURRENCES) continue;

    const texts = Array.from({ length: count }, (_, i) => targetText(candidates[start + i * best.length]));
    if (texts[0] !== null && new Set(texts).size > 1) {
      return { start, length: best.length, count };
    }
  }
  return best;
}

function matchesAt(signatures: string[], from: number, at: number, length: number): boolean {
  if (at + length > signatures.length) return false;
  for (let i = 0; i < length; i++) {
    if (signatures[from + i] !== signatures[at + i]) return false;
  }
  return true;
}
