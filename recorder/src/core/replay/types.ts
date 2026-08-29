import type { RecordingStep, SelectorCandidate } from '../describe/types';

export type ReplayStatus = 'done' | 'healed' | 'skipped' | 'failed';

export interface ReplayStepResult {
  stepId: string;
  status: ReplayStatus;
  /** Which candidate actually resolved the element — the evidence that the
   *  ranking function's ordering held up against the live DOM. */
  matchedCandidate?: SelectorCandidate;
  error?: string;
}

export interface HealRequest {
  step: RecordingStep;
  /** Which half of the step needs re-pointing: the element being acted on,
   *  or (for a drag) the place it's being dropped. */
  role: 'target' | 'dragDestination';
  /** Plain-language version of what replay was looking for, so whoever is
   *  asked to re-point knows what they're looking for. */
  description: string;
}

/** Returns the element the human pointed at, or null if they declined —
 *  in which case the step fails as it would have without healing. */
export type HealHandler = (request: HealRequest) => Promise<Element | null>;

export interface ReplayOptions {
  actionTimeoutMs?: number;
  /** Keep going after a non-optional failure instead of stopping the run. */
  continueOnFailure?: boolean;
  /** Pause this long after each step before starting the next. Purely for a
   *  human watching the run — real replay has no reason to wait once a step
   *  is done, so this defaults to 0. */
  stepDelayMs?: number;
  /** Called when every candidate has been exhausted, instead of failing
   *  outright. Left undefined, replay behaves exactly as it did before
   *  healing existed — core has no opinion about how the question gets
   *  asked, which is what keeps the UI out of it. */
  onHeal?: HealHandler;
  /** Notified as each step starts, so a step list can show live progress. */
  onStepStart?: (step: RecordingStep, index: number) => void;
  onStepResult?: (result: ReplayStepResult, index: number) => void;
  /** Marks elements belonging to the recorder's own UI so they don't count
   *  as occluding the page during actionability checks. */
  isOverlay?: (element: Element) => boolean;
}
