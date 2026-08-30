import type { RecordingStep } from '../describe/types';
import { describeStepForHuman } from '../heal/describeForHuman';
import type { ReplayStepResult, ReplayStatus } from './types';

export interface RunLogRow {
  step: number;
  id: string;
  status: ReplayStatus;
  what: string;
  /** Which candidate won, and where it sat in the ranking. `#0` is the
   *  top-ranked one; anything else means the fallthrough was needed. */
  matchedVia: string;
  score: number | null;
  findMs: number;
  actionableMs: number;
  totalMs: number;
}

export interface RunLog {
  rows: RunLogRow[];
  summary: {
    steps: number;
    done: number;
    healed: number;
    skipped: number;
    failed: number;
    /** Steps resolved by something other than their top-ranked candidate.
     *  A recording that leans on fallthrough still works, but it is closer
     *  to needing a human than the pass/fail count alone suggests. */
    fellThrough: number;
    totalMs: number;
    /** Human time spent re-pointing, kept out of the totals it would
     *  otherwise dominate and make meaningless. */
    healMs: number;
  };
}

const round = (n: number) => Math.round(n);

/**
 * Turns a run into something that explains itself: not just which steps
 * passed, but which candidate each one resolved through, how far down the
 * ranking it had to go, and where the time went.
 *
 * The point is that a green run can still be a warning — if half the steps
 * resolved via their third candidate, the recording is one refactor away
 * from stopping to ask for help, and nothing in a pass/fail count says so.
 */
export function buildRunLog(steps: RecordingStep[], results: ReplayStepResult[]): RunLog {
  const byId = new Map(steps.map((step) => [step.id, step]));

  const rows: RunLogRow[] = results.map((result, index) => {
    const step = byId.get(result.stepId);
    const timings = result.timings;
    return {
      step: index + 1,
      id: result.stepId,
      status: result.status,
      what: step ? describeStepForHuman(step.action, step.target) : result.stepId,
      matchedVia: result.matchedCandidate
        ? `${result.matchedCandidate.kind} #${result.candidateIndex ?? 0}`
        : (result.error ?? '—'),
      score: result.matchedCandidate?.score ?? null,
      findMs: round(timings?.findMs ?? 0),
      actionableMs: round(timings?.actionableMs ?? 0),
      totalMs: round(timings?.totalMs ?? 0),
    };
  });

  const count = (status: ReplayStatus) => results.filter((r) => r.status === status).length;
  const sum = (pick: (r: ReplayStepResult) => number) => results.reduce((total, r) => total + pick(r), 0);

  return {
    rows,
    summary: {
      steps: results.length,
      done: count('done'),
      healed: count('healed'),
      skipped: count('skipped'),
      failed: count('failed'),
      fellThrough: results.filter((r) => (r.candidateIndex ?? 0) > 0).length,
      totalMs: round(sum((r) => r.timings?.totalMs ?? 0)),
      healMs: round(sum((r) => r.timings?.healMs ?? 0)),
    },
  };
}
