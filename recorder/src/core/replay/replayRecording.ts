import type { RecordingStep } from '../describe/types';
import { replayStep } from './replayStep';
import type { ReplayOptions, ReplayStepResult } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function replayRecording(
  steps: RecordingStep[],
  options: ReplayOptions = {},
): Promise<ReplayStepResult[]> {
  const results: ReplayStepResult[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    options.onStepStart?.(step, index);

    const result = await replayStep(step, options);
    results.push(result);
    options.onStepResult?.(result, index);
    console.log('[replay]', result);

    // continueOnFailure exists so one cosmetic miss doesn't abandon a whole
    // run. It must not apply to the step that picks the instance: every step
    // after it is written to act on "the thing that is open now", so carrying
    // on past it means setting a status and saving whatever happens to be on
    // screen — an order nobody asked for. A run that cannot find its subject
    // has nothing left worth doing.
    if (result.status === 'failed' && (!options.continueOnFailure || step.instanceTarget)) break;
    if (options.stepDelayMs) await sleep(options.stepDelayMs);
  }

  return results;
}
