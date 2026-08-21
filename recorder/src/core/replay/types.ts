import type { SelectorCandidate } from '../describe/types';

export type ReplayStatus = 'done' | 'skipped' | 'failed';

export interface ReplayStepResult {
  stepId: string;
  status: ReplayStatus;
  /** Which candidate actually resolved the element — the evidence that the
   *  ranking function's ordering held up against the live DOM. */
  matchedCandidate?: SelectorCandidate;
  error?: string;
}

export interface ReplayOptions {
  actionTimeoutMs?: number;
  /** Keep going after a non-optional failure instead of stopping the run.
   *  Off by default: without Stage 4's healing in place yet, a step that
   *  can't find its target usually means every step after it is now
   *  operating on the wrong state too. */
  continueOnFailure?: boolean;
  /** Pause this long after each step before starting the next. Purely for a
   *  human watching the run — real replay has no reason to wait once a step
   *  is done, so this defaults to 0. */
  stepDelayMs?: number;
}
