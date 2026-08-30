import { describeTarget } from '../describe/describeRecording';
import type { DescribedTarget, RecordingStep } from '../describe/types';
import { toCapturedTarget } from '../resolveTarget';

/**
 * Re-describes a step against the element a human just pointed at.
 *
 * The frame and shadow paths are recomputed too, not carried over — the
 * whole premise of re-pointing is that the original description no longer
 * locates the right thing, and the replacement may well live somewhere
 * structurally different (that's exactly the case when a button moves into
 * a new container between app versions).
 */
export function describeFromElement(element: Element): DescribedTarget {
  return describeTarget(toCapturedTarget(element));
}

/** Patches the step in place so the correction survives for the rest of the
 *  run, and so the caller's recording array reflects it without a re-copy. */
export function healStepTarget(step: RecordingStep, element: Element): DescribedTarget {
  const target = describeFromElement(element);
  step.target = target;
  step.updatedAt = Date.now();
  return target;
}

export function healDragDestination(step: RecordingStep, element: Element): DescribedTarget {
  const target = describeFromElement(element);
  if (step.action.type === 'drag') step.action.to = target;
  step.updatedAt = Date.now();
  return target;
}
