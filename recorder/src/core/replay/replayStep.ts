import type { RecordingStep } from '../describe/types';
import { waitForActionable, NotActionableError } from './actionability';
import { findTarget } from './findTarget';
import {
  performClick,
  performInput,
  performChange,
  performSubmit,
  performFocus,
  performBlur,
  performScroll,
  performNavigation,
  performHover,
  performDrag,
} from './performAction';
import type { ReplayOptions, ReplayStepResult } from './types';

export async function replayStep(step: RecordingStep, options: ReplayOptions = {}): Promise<ReplayStepResult> {
  if (step.action.type === 'navigation') {
    performNavigation(step.action.url);
    return { stepId: step.id, status: 'done' };
  }

  if (!step.target) {
    return { stepId: step.id, status: 'failed', error: 'step has no target' };
  }

  const found = await findTarget(step.target);
  if (!found) {
    if (step.optional) return { stepId: step.id, status: 'skipped' };
    return { stepId: step.id, status: 'failed', error: 'no candidate resolved to a unique element' };
  }

  // Finding an element in the DOM doesn't mean it's within the viewport —
  // a virtualized row can be mounted (so it matches a candidate) while
  // sitting well outside the visible scroll area. elementFromPoint hit-tests
  // only the viewport, so without this, actionability's hittable check
  // fails forever on something that's really just scrolled out of view.
  found.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  try {
    await waitForActionable(found.element, { timeoutMs: options.actionTimeoutMs });
  } catch (error) {
    if (step.optional) return { stepId: step.id, status: 'skipped' };
    const message = error instanceof NotActionableError ? error.message : String(error);
    return { stepId: step.id, status: 'failed', error: message };
  }

  switch (step.action.type) {
    case 'click':
      performClick(found.element);
      break;
    case 'input':
      performInput(found.element, step.action.value);
      break;
    case 'change':
      performChange(found.element, step.action.value);
      break;
    case 'submit':
      performSubmit(found.element);
      break;
    case 'focus':
      performFocus(found.element);
      break;
    case 'blur':
      performBlur(found.element);
      break;
    case 'scroll':
      performScroll(found.element, step.action.scrollTop, step.action.scrollLeft);
      break;
    case 'hover':
      performHover(found.element);
      break;
    case 'drag': {
      const dragTo = await findTarget(step.action.to);
      if (!dragTo) {
        return { stepId: step.id, status: 'failed', error: 'drag destination not found' };
      }
      dragTo.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      await performDrag(found.element, dragTo.element);
      break;
    }
  }

  return { stepId: step.id, status: 'done', matchedCandidate: found.candidate };
}
