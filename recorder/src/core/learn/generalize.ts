import type { DescribedTarget, RecordingStep } from '../describe/types';
import { describeStepForHuman } from '../heal/describeForHuman';
import { targetPosition, targetText } from './signature';
import type { DetectedPattern } from './detectRepetition';

export interface ProcessVariable {
  /** Position in the process this varies at. */
  stepIndex: number;
  /** `target`   — the process was performed on a different thing each time.
   *  `value`    — the same field was filled with something different each time.
   *  `position` — the same *kind* of thing, but a different one of several
   *               identical siblings: the fourth star rather than the fifth.
   *               A last resort, for elements with no other identity. */
  kind: 'target' | 'value' | 'position';
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

/**
 * Whether every run had one of these, not just the first.
 *
 * Checking only the first run treated "present once, missing once" as
 * variation, and produced an input with a blank example — then substituted
 * against the one value it did have. A rating star reads "☆" uniquely on an
 * order rated four and ambiguously on one rated three, so the same click
 * produced a usable text on one pass and nothing on the next. Something a
 * run could not describe is not something that run chose.
 */
function everyRunHasOne(values: (string | null)[]): boolean {
  return values.every((value) => value !== null);
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
  kind: 'target' | 'value' | 'position',
  index: number,
  examples: string[],
): string {
  // A position is a number among identical things, so neither the values nor
  // the element have a name to offer. Say what it is instead.
  if (kind === 'position') return index === 0 ? 'which one' : `which one ${index + 1}`;

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
    const namesTheInstance = everyRunHasOne(texts) && !allSame(texts);

    if (namesTheInstance) {
      const examples = texts.map((t) => t ?? '');
      variables.push({
        stepIndex,
        kind: 'target',
        name: nameFor(step, 'target', variables.length, examples),
        examples,
      });
    }

    // Only when nothing better identified it. A table row's structural path
    // also carries an index that differs between runs, but the row already has
    // a name of its own — asking for the row *and* its position would be two
    // questions about one thing.
    if (!namesTheInstance) {
      const positions = instances.map(targetPosition);
      const asText = positions.map((position) => (position === null ? null : String(position)));
      if (everyRunHasOne(asText) && !allSame(asText)) {
        variables.push({
          stepIndex,
          kind: 'position',
          name: nameFor(step, 'position', variables.filter((v) => v.kind === 'position').length, []),
          examples: asText.map((t) => t ?? ''),
        });
      }
    }

    const values = instances.map(actionValue);
    if (everyRunHasOne(values) && !allSame(values)) {
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
    steps: pruneToConstant(pattern.occurrences, variables),
    variables,
    occurrences: pattern.occurrences.length,
  };
}

/**
 * Keeps only the ways of describing a target that held on every run.
 *
 * The template is one run, so it carries that run's specifics even where they
 * were never the point. Dragging four views to the end of a list drops onto a
 * different neighbour every time — "Shipped today", then "All orders" — while
 * the position, last in the list, never changes. Keep the text and the process
 * means "drop it next to Shipped today", which stops being true the moment the
 * list reorders. Keep only what every run agreed on and it means "drop it at
 * the end", which is what the person was doing.
 *
 * The target carrying a variable is left alone: that one is *supposed* to
 * differ per run, and substitution rewrites it.
 */
function pruneToConstant(occurrences: RecordingStep[][], variables: ProcessVariable[]): RecordingStep[] {
  const [template] = occurrences;
  // A position varies by design too, so its candidates must survive intact —
  // pruning to what every run agreed on would drop the very index that moves.
  const varies = new Set(
    variables.filter((v) => v.kind === 'target' || v.kind === 'position').map((v) => v.stepIndex),
  );

  return template.map((step, stepIndex) => {
    const instances = occurrences.map((occurrence) => occurrence[stepIndex]);

    const target = varies.has(stepIndex)
      ? step.target
      : constantOf(step.target, instances.map((instance) => instance.target));

    const action =
      step.action.type === 'drag'
        ? {
            ...step.action,
            to:
              constantOf(
                step.action.to,
                instances.map((instance) => (instance.action.type === 'drag' ? instance.action.to : null)),
              ) ?? step.action.to,
          }
        : step.action;

    return { ...step, target, action };
  });
}

/** Drops candidates that any run described differently. Returns the original
 *  untouched if nothing survives — a target with no candidates can't be found
 *  at all, which is worse than one described too specifically. */
function constantOf(
  template: DescribedTarget | null,
  instances: (DescribedTarget | null)[],
): DescribedTarget | null {
  if (!template || instances.some((instance) => !instance)) return template;

  const others = instances.slice(1) as DescribedTarget[];
  const kept = template.candidates.filter((candidate) =>
    others.every((other) =>
      other.candidates.some((c) => c.kind === candidate.kind && c.value === candidate.value),
    ),
  );

  // A scope has to survive the same test, and it is the stronger claim of the
  // two — replay resolves by it before falling back to candidates. Dropping
  // varying candidates while keeping a scope that named one particular
  // neighbour would pin the step to that neighbour by the back door, which is
  // the whole thing this is meant to prevent.
  const scopeVaries =
    template.scope !== undefined &&
    !others.every((other) => other.scope?.text === template.scope?.text);

  const pruned: DescribedTarget = {
    ...template,
    candidates: kept.length > 0 ? kept : template.candidates,
  };
  if (scopeVaries) delete pruned.scope;

  return pruned;
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
