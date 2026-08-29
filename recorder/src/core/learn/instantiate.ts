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
  return candidates
    .filter((candidate) => candidate.kind !== 'struct' || candidate.value.includes(from))
    .map((candidate) =>
      candidate.value.includes(from)
        ? { ...candidate, value: candidate.value.split(from).join(to) }
        : candidate,
    );
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
  return { ...step, target: { ...step.target, candidates: retarget(step.target.candidates, from, value) } };
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
