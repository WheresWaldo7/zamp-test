import type { RecordingStep } from '../describe/types';
import { meaningfulSteps, stepSignature } from './signature';

/** How many times a shape must recur before it counts as a process rather
 *  than a coincidence. Two is a pair; three is a habit. */
const MIN_OCCURRENCES = 2;

/** A single step repeated over and over is usually someone clicking around,
 *  not a procedure worth automating. */
const MIN_PATTERN_LENGTH = 2;

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
      let count = 1;
      while (matchesAt(signatures, start, start + count * length, length)) count++;
      if (count < MIN_OCCURRENCES) continue;

      // Prefer whichever pattern accounts for the most of what the user did.
      // Between a short shape repeated many times and a longer one repeated
      // fewer, coverage is the honest tiebreak: it is the amount of work the
      // user would not have to do again.
      const coverage = length * count;
      const bestCoverage = best ? best.length * best.count : 0;
      if (coverage > bestCoverage || (coverage === bestCoverage && best && length > best.length)) {
        best = { start, length, count };
      }
    }
  }

  if (!best) return null;

  const occurrences: RecordingStep[][] = [];
  for (let i = 0; i < best.count; i++) {
    const from = best.start + i * best.length;
    occurrences.push(candidates.slice(from, from + best.length));
  }

  return {
    signature: signatures.slice(best.start, best.start + best.length),
    occurrences,
  };
}

function matchesAt(signatures: string[], from: number, at: number, length: number): boolean {
  if (at + length > signatures.length) return false;
  for (let i = 0; i < length; i++) {
    if (signatures[from + i] !== signatures[at + i]) return false;
  }
  return true;
}
