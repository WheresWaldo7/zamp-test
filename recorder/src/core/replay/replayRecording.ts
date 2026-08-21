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

  for (const step of steps) {
    const result = await replayStep(step, options);
    results.push(result);
    console.log('[replay]', result);

    if (result.status === 'failed' && !options.continueOnFailure) break;
    if (options.stepDelayMs) await sleep(options.stepDelayMs);
  }

  return results;
}
