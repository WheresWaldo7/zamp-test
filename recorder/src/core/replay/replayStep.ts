import type { DescribedTarget, RecordingStep } from '../describe/types';
import { describeStepForHuman } from '../heal/describeForHuman';
import { healDragDestination, healStepTarget } from '../heal/healStep';
import { waitForActionable, NotActionableError } from './actionability';
import { findTarget, type FoundTarget } from './findTarget';
import { waitForQuiescence } from './quiescence';
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

/**
 * Finds a target, and if every candidate has been exhausted, gives the
 * caller's heal handler a chance to have a human point at the right element
 * instead. A successful re-point rewrites the step's candidates in place, so
 * the correction holds for the rest of the run rather than being re-asked on
 * every repetition.
 */
async function resolveWithHealing(
  step: RecordingStep,
  target: DescribedTarget,
  role: 'target' | 'dragDestination',
  options: ReplayOptions,
): Promise<{ found: FoundTarget | null; healed: boolean; findMs: number; healMs: number }> {
  const startedAt = performance.now();
  const found = await findTarget(target);
  const findMs = performance.now() - startedAt;

  if (found) return { found, healed: false, findMs, healMs: 0 };
  if (!options.onHeal) return { found: null, healed: false, findMs, healMs: 0 };

  const healStartedAt = performance.now();

  // Finding nothing usually means findTarget just finished scrolling every
  // container hunting for the element and put them all back. It restores the
  // scroll positions, but a virtualized list re-renders a tick later — so at
  // this exact moment the DOM can still be showing rows from wherever the
  // probe wandered to. Asking a human to point at the right element while the
  // page is mid-settle is asking them to point at something that is about to
  // move.
  await waitForQuiescence(150, 1000);

  const picked = await options.onHeal({
    step,
    role,
    description: describeStepForHuman(step.action, target),
  });
  const healMs = performance.now() - healStartedAt;
  if (!picked) return { found: null, healed: false, findMs, healMs };

  const patched = role === 'target' ? healStepTarget(step, picked) : healDragDestination(step, picked);
  return {
    // A re-pointed element is, by definition, whatever the human indicated —
    // so it is index 0 of a freshly generated list, not a fallthrough.
    found: { element: picked, candidate: patched.candidates[0], candidateIndex: 0 },
    healed: true,
    findMs,
    healMs,
  };
}

export async function replayStep(step: RecordingStep, options: ReplayOptions = {}): Promise<ReplayStepResult> {
  const startedAt = performance.now();
  const elapsed = () => performance.now() - startedAt;
  const noTime = { findMs: 0, healMs: 0, actionableMs: 0, actionMs: 0 };

  if (step.action.type === 'navigation') {
    performNavigation(step.action.url);
    return { stepId: step.id, status: 'done', timings: { ...noTime, totalMs: elapsed() } };
  }

  if (!step.target) {
    return {
      stepId: step.id,
      status: 'failed',
      error: 'step has no target',
      timings: { ...noTime, totalMs: elapsed() },
    };
  }

  const { found, healed, findMs, healMs } = await resolveWithHealing(step, step.target, 'target', options);
  if (!found) {
    const timings = { ...noTime, findMs, healMs, totalMs: elapsed() };
    if (step.optional) return { stepId: step.id, status: 'skipped', timings };
    return {
      stepId: step.id,
      status: 'failed',
      error: 'no candidate resolved to a unique element',
      timings,
    };
  }

  // Finding an element in the DOM doesn't mean it's within the viewport —
  // a virtualized row can be mounted (so it matches a candidate) while
  // sitting well outside the visible scroll area. elementFromPoint hit-tests
  // only the viewport, so without this, actionability's hittable check
  // fails forever on something that's really just scrolled out of view.
  found.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  const actionableStartedAt = performance.now();
  try {
    await waitForActionable(found.element, {
      timeoutMs: options.actionTimeoutMs,
      isOverlay: options.isOverlay,
    });
  } catch (error) {
    const timings = {
      ...noTime,
      findMs,
      healMs,
      actionableMs: performance.now() - actionableStartedAt,
      totalMs: elapsed(),
    };
    if (step.optional) return { stepId: step.id, status: 'skipped', timings };
    const message = error instanceof NotActionableError ? error.message : String(error);
    return { stepId: step.id, status: 'failed', error: message, timings };
  }
  const actionableMs = performance.now() - actionableStartedAt;

  let healedDestination = false;

  // Deliberately outside the action timing: this is the highlight being held
  // for a human to see, not work the system had to do.
  await options.onBeforeAction?.(found.element, step);
  const actionStartedAt = performance.now();

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
      const destination = await resolveWithHealing(step, step.action.to, 'dragDestination', options);
      if (!destination.found) {
        return {
          stepId: step.id,
          status: 'failed',
          error: 'drag destination not found',
          timings: {
            findMs: findMs + destination.findMs,
            healMs: healMs + destination.healMs,
            actionableMs,
            actionMs: performance.now() - actionStartedAt,
            totalMs: elapsed(),
          },
        };
      }
      healedDestination = destination.healed;
      destination.found.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      // Shown for the drop target too, so a drag reads as a move between
      // two places rather than a jump with an unexplained destination.
      await options.onBeforeAction?.(destination.found.element, step);
      await performDrag(found.element, destination.found.element);
      break;
    }
  }

  return {
    stepId: step.id,
    status: healed || healedDestination ? 'healed' : 'done',
    matchedCandidate: found.candidate,
    candidateIndex: found.candidateIndex,
    timings: {
      findMs,
      healMs,
      actionableMs,
      actionMs: performance.now() - actionStartedAt,
      totalMs: elapsed(),
    },
  };
}
