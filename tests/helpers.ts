import type { Page } from '@playwright/test';

/** The order this suite records against. The dataset is seeded, so this row
 *  sits at a known position on every load — which is what makes replaying
 *  against a virtualized list testable at all. */
export const TARGET_ORDER = 'ORD-1006';

export interface RecordedStep {
  id: string;
  action: { type: string; value?: string };
  target: { candidates: { kind: string; value: string; score: number }[] } | null;
}

export interface StepResult {
  stepId: string;
  status: 'done' | 'healed' | 'skipped' | 'failed';
  matchedCandidate?: { kind: string; value: string; score: number };
  error?: string;
}

/** Rows are addressed by class prefix because v1 and v2 deliberately share no
 *  class names — the renaming is the thing under test. */
export const ROW_SELECTOR = '[class*="_row_"], [class*="recordLine"]';

/**
 * Where in the row the click lands, which turns out to decide whether the
 * step survives a refactor at all:
 *
 *   'cell'  — on the order-id text, which yields a durable `text:"ORD-1006"`
 *             candidate that no amount of restyling touches.
 *   'blank' — on the row's own padding, where the only identities available
 *             are a generated class name and a position, both of which v2
 *             destroys.
 *
 * Both are things a real user does. Testing only the first would overstate
 * how well this works; testing only the second would understate it.
 */
export type RowClickTarget = 'cell' | 'blank';

export async function gotoApp(page: Page, variant: 'v1' | 'v2' = 'v1'): Promise<void> {
  await page.goto(variant === 'v2' ? '/?v2' : '/');
  await page.waitForFunction(() => Boolean((window as never as { __recorder?: unknown }).__recorder));
  await dismissCookieBanner(page);
}

/**
 * The banner shows on roughly half of loads by design. It is dismissed before
 * recording rather than recorded, so the suite exercises replay resilience
 * rather than re-testing the app's own randomness.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await accept.waitFor({ state: 'detached' }).catch(() => {});
  }
}

/** Records the canonical flow: open an order, change its status, set a
 *  rating, save. Chosen because it spans a role-addressable control, a
 *  shadow-DOM element, and a row whose identity depends on where it's hit. */
export async function recordCanonicalFlow(page: Page, rowTarget: RowClickTarget): Promise<RecordedStep[]> {
  await page.evaluate(() => {
    const r = (window as never as { __recorder: { clear(): void; startRecording(): void } }).__recorder;
    r.clear();
    r.startRecording();
  });

  const row = page.locator(ROW_SELECTOR).filter({ hasText: TARGET_ORDER }).first();
  if (rowTarget === 'cell') {
    await row.getByText(TARGET_ORDER, { exact: true }).click();
  } else {
    // Near the top-left edge: inside the row, outside every cell.
    await row.click({ position: { x: 20, y: 3 } });
  }

  await page.locator('#order-status').selectOption('shipped');
  await page.locator('x-rating .star').nth(4).click();
  await page.getByRole('button', { name: 'Save order' }).click();

  return page.evaluate(() => {
    const r = (window as never as {
      __recorder: { stopRecording(): void; getRecording(): unknown[] };
    }).__recorder;
    r.stopRecording();
    return r.getRecording();
  }) as Promise<RecordedStep[]>;
}

/**
 * Replays a recording against the current page.
 *
 * `reload: false` because the test drives navigation itself, and
 * `stepDelayMs: 0` because the pacing exists for a human watching.
 * `healWith` supplies the element a person would have pointed at, standing in
 * for the click the picker would otherwise wait for.
 */
export async function replay(
  page: Page,
  steps: RecordedStep[],
  options: { healWith?: string } = {},
): Promise<{ results: StepResult[]; steps: RecordedStep[] }> {
  return page.evaluate(
    async ({ steps, healWith }) => {
      const recorder = (window as never as {
        __recorder: { replay(steps: unknown[], options: unknown): Promise<unknown> };
      }).__recorder;

      const results = await recorder.replay(steps, {
        reload: false,
        stepDelayMs: 0,
        onHeal: healWith
          ? async () =>
              Array.from(document.querySelectorAll(healWith.selector)).find((el) =>
                (el.textContent ?? '').includes(healWith.text),
              ) ?? null
          : undefined,
      });

      // Healing rewrites steps in place, but "in place" is inside the page —
      // the array the test handed in was structured-cloned on the way over,
      // so the corrected version has to be handed back for a later run to
      // benefit from it. In the product this is a non-issue: the recording
      // lives in the page and is persisted there.
      return { results, steps };
    },
    { steps, healWith: options.healWith ? { selector: ROW_SELECTOR, text: options.healWith } : null },
  ) as Promise<{ results: StepResult[]; steps: RecordedStep[] }>;
}

export async function readAppState(page: Page) {
  return page.evaluate(() => ({
    status: (document.getElementById('order-status') as HTMLSelectElement | null)?.value ?? null,
    stars: Array.from(document.querySelector('x-rating')?.shadowRoot?.querySelectorAll('.star') ?? [])
      .map((s) => s.textContent)
      .join(''),
    drawerSubtitle:
      document.querySelector('[class*="drawer"] [class*="subtitle"], [class*="detailPane"] [class*="orderMeta"]')
        ?.textContent ?? null,
  }));
}

/** Focus and blur are recorded on purpose (validation commonly fires on
 *  blur), but they are incidental to *what the flow does* — and exactly which
 *  ones a real browser emits varies with how a control is reached. Assertions
 *  about the shape of a flow use the effectful steps. */
export function effectfulSteps(steps: RecordedStep[]): RecordedStep[] {
  return steps.filter((s) => s.action.type !== 'focus' && s.action.type !== 'blur');
}
