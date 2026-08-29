import type { RecordingStep, SelectorCandidate } from '../describe/types';
import type { LearnedProcess, ProcessVariable } from './generalize';

/**
 * Rewrites a step to act on a different instance.
 *
 * The delicate part is what to do with the candidates that *don't* mention the
 * old value. A structural path like `… > div:nth-of-type(1) > span` described
 * the first row, and it will still resolve perfectly on a page where the
 * intended target is the fourth — so leaving it in place would let the
 * fallthrough quietly click the wrong row and report success. Dropping it
 * means the step can fail and ask for help instead, which is the behaviour
 * worth having: a wrong action taken confidently is worse than an action not
 * taken.
 *
 * Generic candidates like a shared CSS-Module class are left alone. They match
 * every row, so replay skips them as ambiguous rather than acting on them.
 */
function retarget(candidates: SelectorCandidate[], from: string, to: string): SelectorCandidate[] {
  // Only candidates that actually name the instance survive. A candidate that
  // doesn't mention it — a shared CSS-Module class, a structural path — cannot
  // distinguish this row from any other, so it is not a weaker way of finding
  // the right thing; it is a way of finding the wrong thing. Keeping it means
  // the fallthrough can act on whatever sits at the remembered position and
  // report success. Better to be left with nothing and ask.
  return candidates
    .filter((candidate) => candidate.value.includes(from))
    .map((candidate) => ({ ...candidate, value: candidate.value.split(from).join(to) }));
}

function applyVariable(step: RecordingStep, variable: ProcessVariable, value: string): RecordingStep {
  const from = variable.examples[0];
  if (from === value) return step;

  if (variable.kind === 'value') {
    const action = step.action;
    if (action.type !== 'input' && action.type !== 'change') return step;
    return { ...step, action: { ...action, value } };
  }

  if (!step.target) return step;

  const candidates = retarget(step.target.candidates, from, value);

  // When the step was recorded inside a list, re-pointing is not a string
  // substitution at all — it is naming a different row. The candidates
  // describe a cell of the row that was recorded, and which cell that was is
  // an accident of where the user's cursor landed; the row is the thing being
  // chosen. Moving the scope moves the search, so the same cell of the right
  // row is found even when nothing about the recorded cell mentions the id.
  const scope = step.target.scope;
  if (scope) {
    return {
      ...step,
      instanceTarget: true,
      target: { ...step.target, scope: { ...scope, text: value }, candidates },
    };
  }

  return { ...step, instanceTarget: true, target: { ...step.target, candidates } };
}

/**
 * Builds one run of a learned process from a set of inputs.
 *
 * Steps that take an input are copied, because each run acts on something
 * different and a correction made for one run must not leak into the next.
 * Steps that don't are passed through by reference on purpose: they are the
 * same element every time, so if replay has to ask a human where the Save
 * button went, that answer should be learned once and hold for the whole
 * batch rather than being asked ten times.
 */
export function instantiateProcess(process: LearnedProcess, values: string[]): RecordingStep[] {
  return process.steps.map((step, index) => {
    const variables = process.variables.filter((variable) => variable.stepIndex === index);
    if (variables.length === 0) return step;

    return variables.reduce((current, variable) => {
      const value = values[process.variables.indexOf(variable)];
      return value === undefined ? current : applyVariable(current, variable, value);
    }, step);
  });
}
