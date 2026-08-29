import type { DescribedTarget, RecordingAction, SelectorCandidate } from '../describe/types';

const ACTION_VERB: Record<RecordingAction['type'], string> = {
  click: 'Click',
  input: 'Type into',
  change: 'Set',
  submit: 'Submit',
  focus: 'Focus',
  blur: 'Blur',
  scroll: 'Scroll',
  navigation: 'Navigate',
  hover: 'Hover over',
  drag: 'Drag',
};

/** Turns a machine-shaped candidate back into something a person can look
 *  for on screen. The point is to let a human answer "which element did you
 *  mean?" without reading selector syntax. */
function candidatePhrase(candidate: SelectorCandidate): string {
  const { kind, value } = candidate;

  if (kind === 'role') {
    const match = /^(\w+)\[name="(.*)"\]$/.exec(value);
    if (match) return `the ${match[1]} labelled “${match[2]}”`;
  }
  if (kind === 'label') {
    const match = /^(?:label|placeholder):"(.*)"$/.exec(value);
    if (match) return `the field labelled “${match[1]}”`;
  }
  if (kind === 'text') {
    const match = /^text:"(.*)"$/.exec(value);
    if (match) return `the element reading “${match[1]}”`;
  }
  if (kind === 'attr') return `the element matching ${value}`;
  return `the element at ${value}`;
}

export function describeTargetForHuman(target: DescribedTarget): string {
  const best = target.candidates[0];
  const phrase = best ? candidatePhrase(best) : 'an element we can no longer describe';
  const where = target.shadowPath.length > 0 ? ` (inside <${target.shadowPath.join('> <')}>)` : '';
  return `${phrase}${where}`;
}

export function describeStepForHuman(action: RecordingAction, target: DescribedTarget | null): string {
  const verb = ACTION_VERB[action.type] ?? 'Act on';
  if (!target) return verb;
  const suffix =
    action.type === 'input' || action.type === 'change' ? ` to “${(action as { value: string }).value}”` : '';
  return `${verb} ${describeTargetForHuman(target)}${suffix}`;
}
