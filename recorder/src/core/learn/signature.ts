import type { DescribedTarget, RecordingAction, RecordingStep } from '../describe/types';

/**
 * A step's *shape*, with everything instance-specific removed.
 *
 * This is the whole basis of learning a process rather than recording a
 * session. Two runs of "mark an order processed" touch different rows, set
 * different values, and click different stars — so comparing steps by their
 * selectors would say every run was unrelated. Comparing them by shape says
 * they are the same procedure, and the bits that differ are what the
 * procedure takes as input.
 *
 * The ranking below is "what stays the same across instances", which is not
 * the same as replay's ranking of "what survives a refactor":
 *
 *   role      — `combobox[name="Status"]` is identical every time.
 *   class/id  — a CSS-Module class is shared by every row's id cell, so it
 *               generalises across rows precisely *because* it is generic.
 *   structure — tag path with positional indices stripped, since the index
 *               is usually the thing that varies (row 7 vs row 12).
 *
 * Visible text is deliberately never used: it is the most instance-specific
 * thing on the element, and the best selector for replaying one step is the
 * worst descriptor for recognising a repeated one.
 */
function shapeOfTarget(target: DescribedTarget): string {
  const role = target.candidates.find((c) => c.kind === 'role');
  const struct = target.candidates.find((c) => c.kind === 'struct');
  const attr = target.candidates.find((c) => c.kind === 'attr');

  const shape =
    role?.value ??
    // Structure before class, because a class is only shared by *some* of the
    // things a person treats as equivalent. Clicking a row's id cell and
    // clicking its company cell are the same intention — open that order —
    // but only the id cell carries a CSS-Module class, so preferring the class
    // gave the two clicks different shapes and the repetition went unnoticed.
    // With positional indices stripped, both are `… > div > span`: the same
    // kind of element in the same place, which is what "same step" means here.
    struct?.value.replace(/:nth-of-type\(\d+\)/g, '') ??
    attr?.value ??
    'unknown';

  const scope = target.shadowPath.length > 0 ? `@${target.shadowPath.join('>')}` : '';
  return `${shape}${scope}`;
}

/** Values are excluded on purpose: "set status to shipped" and "set status to
 *  processing" are the same step of the same process, differing only in what
 *  the process was given to work with. */
export function stepSignature(step: RecordingStep): string {
  const action: RecordingAction = step.action;
  if (action.type === 'navigation') return 'navigation';
  if (!step.target) return action.type;

  const base = `${action.type}|${shapeOfTarget(step.target)}`;
  return action.type === 'drag' ? `${base}=>${shapeOfTarget(action.to)}` : base;
}

/**
 * Steps that describe *how* a user got somewhere rather than *what they did*.
 * A person scrolls to find a row and tabs between fields differently on every
 * repetition, so leaving these in would make two runs of the same process
 * look different. They're excluded from pattern matching and re-added when
 * the process is replayed.
 */
const INCIDENTAL_ACTIONS = new Set(['scroll', 'hover', 'focus', 'blur']);

export function isIncidental(step: RecordingStep): boolean {
  return INCIDENTAL_ACTIONS.has(step.action.type);
}

export function meaningfulSteps(steps: RecordingStep[]): RecordingStep[] {
  return steps.filter((step) => !isIncidental(step));
}

/**
 * What a step was performed against, if that can be named. This is the part
 * that differs between runs of the same process, which makes it both the
 * process's input and the marker for where a cycle begins.
 *
 * The row's identity wins over the clicked element's own text, because a
 * person aiming at a row does not aim at the same cell twice. Clicking the
 * total on one pass and the status on the next makes the element texts
 * "$317.60" and "cancelled" — two values that name nothing anyone could ask
 * for. The row those cells belong to is the thing being chosen, and its id is
 * what the user would type.
 */
export function targetText(step: RecordingStep): string | null {
  const scope = step.target?.scope;
  if (scope) return scope.text;

  const text = step.target?.candidates.find((c) => c.kind === 'text');
  return text ? text.value.replace(/^text:"|"$/g, '') : null;
}
