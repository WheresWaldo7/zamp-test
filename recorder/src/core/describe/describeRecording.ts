import type { CapturedAction, CapturedStep, CapturedTarget } from '../types';
import { describeElement } from './describeElement';
import { describeScope } from './scope';
import type { DescribedTarget, RecordingAction, RecordingStep } from './types';

export function describeTarget(target: CapturedTarget): DescribedTarget {
  return {
    candidates: describeElement(target.element),
    frame: target.frame,
    shadowPath: target.shadowPath,
    scope: describeScope(target.element),
  };
}

function describeAction(action: CapturedAction): RecordingAction {
  if (action.type === 'drag') {
    return { type: 'drag', to: describeTarget(action.to) };
  }
  return action;
}

export function describeStep(step: CapturedStep): RecordingStep {
  return {
    id: step.id,
    action: describeAction(step.action),
    target: step.target ? describeTarget(step.target) : null,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  };
}

/** Turns Stage 1's raw captured steps into the actual Recording: every
 *  element reference replaced by its ranked, serializable candidates. */
export function describeRecording(steps: CapturedStep[]): RecordingStep[] {
  return steps.map(describeStep);
}
