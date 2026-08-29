import type { RecordingStep } from '../describe/types';
import { describeStepForHuman } from '../heal/describeForHuman';
import { targetText } from './signature';
import type { DetectedPattern } from './detectRepetition';

export interface ProcessVariable {
  /** Position in the process this varies at. */
  stepIndex: number;
  /** `target` — the process was performed on a different thing each time.
   *  `value`  — the same field was filled with something different each time. */
  kind: 'target' | 'value';
  name: string;
  /** What it was on each run, in order. These are the examples the process
   *  was learned from, and the first evidence that it *is* a process. */
  examples: string[];
}

export interface LearnedProcess {
  name: string;
  /** The first run, kept as the template to replay. */
  steps: RecordingStep[];
  variables: ProcessVariable[];
  occurrences: number;
}

/** The text a step was performed against, if it has one — the part that
 *  differs between runs of the same process. */
function actionValue(step: RecordingStep): string | null {
  const action = step.action;
  return action.type === 'input' || action.type === 'change' ? action.value : null;
}

function allSame(values: (string | null)[]): boolean {
  return values.every((v) => v === values[0]);
}

/** What the examples have in common. "ORD-1000" and "ORD-1001" share "ORD-",
 *  which is usually the most recognisable name the data itself can offer. */
function commonPrefix(values: string[]): string {
  if (values.length < 2) return '';
  return values.slice(1).reduce((prefix, value) => {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++;
    return prefix.slice(0, i);
  }, values[0]);
}

/**
 * Names a variable after something the user would recognise: the shared shape
 * of the values themselves, then the control's own label, and only then a
 * position. A generic name is better than a guessed specific one, but
 * "ORD-…" beats both when the data says it plainly.
 */
function nameFor(
  step: RecordingStep,
  kind: 'target' | 'value',
  index: number,
  examples: string[],
): string {
  // Trailing digits and separators are part of the values, not the name:
  // two samples share "ORD-100", three share "ORD-10", and neither is what
  // the thing is called. Trimming them back to "ORD" gives a name that
  // doesn't drift as more examples arrive.
  const shared = commonPrefix(examples).replace(/[\d\W_]+$/, '').trim();
  if (shared.length >= 2) return `${shared}…`;

  const role = step.target?.candidates.find((c) => c.kind === 'role');
  const named = role?.value.match(/name="(.+)"/)?.[1];
  if (named) return named;

  const label = step.target?.candidates.find((c) => c.kind === 'label');
  const labelled = label?.value.match(/"(.+)"/)?.[1];
  if (labelled) return labelled;

  return `${kind}${index + 1}`;
}

/**
 * Turns "the user did this three times" into "this is the process, and these
 * are the things it takes as input".
 *
 * Detection and parameterisation are the same computation: comparing the runs
 * tells you both that a shape recurred *and* which parts of it were different
 * each time. Anything identical across every run is part of the procedure;
 * anything that varied is an input to it.
 */
export function generalize(pattern: DetectedPattern): LearnedProcess {
  const [template] = pattern.occurrences;
  const variables: ProcessVariable[] = [];

  template.forEach((step, stepIndex) => {
    const instances = pattern.occurrences.map((occurrence) => occurrence[stepIndex]);

    const texts = instances.map(targetText);
    if (texts[0] !== null && !allSame(texts)) {
      const examples = texts.map((t) => t ?? '');
      variables.push({
        stepIndex,
        kind: 'target',
        name: nameFor(step, 'target', variables.length, examples),
        examples,
      });
    }

    const values = instances.map(actionValue);
    if (values[0] !== null && !allSame(values)) {
      const examples = values.map((v) => v ?? '');
      variables.push({
        stepIndex,
        kind: 'value',
        name: nameFor(step, 'value', variables.length, examples),
        examples,
      });
    }
  });

  return {
    name: nameProcess(template, variables),
    steps: template,
    variables,
    occurrences: pattern.occurrences.length,
  };
}

/**
 * Named after the step that says what the process is *for*.
 *
 * A step that sets a value the user typed the same way every time is the
 * closest thing to a statement of intent — "set Status to processing" is the
 * point, while the clicks around it are how you get there. Naming after the
 * final click instead produces "Click Save order", which describes every
 * process that ends in a save and distinguishes none of them.
 */
function nameProcess(template: RecordingStep[], variables: ProcessVariable[]): string {
  const variesAt = new Set(variables.filter((v) => v.kind === 'value').map((v) => v.stepIndex));

  const intent = template.find(
    (step, index) =>
      (step.action.type === 'change' || step.action.type === 'input') && !variesAt.has(index),
  );

  const chosen = intent ?? template[template.length - 1];
  return describeStepForHuman(chosen.action, chosen.target);
}
