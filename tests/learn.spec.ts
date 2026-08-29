import { expect, test } from '@playwright/test';
import { ROW_SELECTOR, gotoApp } from './helpers';

/**
 * The brief is "learn a user's process by watching them". These pin the
 * watching half: nobody presses a button that says "this is a process", and
 * the tool has to work out both that a shape recurred and which parts of it
 * were different each time.
 */

interface LearnedProcess {
  name: string;
  occurrences: number;
  steps: unknown[];
  variables: { name: string; kind: 'target' | 'value'; examples: string[] }[];
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

/** One pass of the process a person would otherwise grind through by hand:
 *  open an order, set its status, save. */
async function processOrder(page: import('@playwright/test').Page, orderId: string, status: string) {
  await page.locator(ROW_SELECTOR).filter({ hasText: orderId }).first().getByText(orderId, { exact: true }).click();
  await page.locator('#order-status').selectOption(status);
  await page.getByRole('button', { name: 'Save order' }).click();
}

async function learned(page: import('@playwright/test').Page): Promise<LearnedProcess | null> {
  return page.evaluate(
    () => (window as never as { __recorder: { getLearnedProcess(): unknown } }).__recorder.getLearnedProcess(),
  ) as Promise<LearnedProcess | null>;
}

async function watch(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const r = (window as never as { __recorder: { clear(): void; startRecording(): void } }).__recorder;
    r.clear();
    r.startRecording();
  });
}

test('notices nothing from a single pass', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  await processOrder(page, 'ORD-1000', 'processing');

  // Doing something once is just doing something. Claiming a process here
  // would mean interrupting the user constantly.
  expect(await learned(page)).toBeNull();
});

test('learns the process after watching it twice', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  const process = await learned(page);
  expect(process).not.toBeNull();
  expect(process!.occurrences).toBe(2);
  expect(process!.steps).toHaveLength(3);
});

test('works out that the order is the input and the status is not', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');
  await processOrder(page, 'ORD-1002', 'processing');

  const process = (await learned(page))!;
  expect(process.occurrences).toBe(3);

  // Exactly one thing varied: which order. The status was the same every
  // time, so it belongs to the procedure rather than being asked for.
  expect(process.variables).toHaveLength(1);
  const [variable] = process.variables;
  expect(variable.kind).toBe('target');
  expect(variable.examples).toEqual(['ORD-1000', 'ORD-1001', 'ORD-1002']);

  // Named from the data rather than by position, and stable as more
  // examples arrive.
  expect(variable.name).toBe('ORD…');

  // Named after what the process is for, not the click it happens to end on.
  expect(process.name).toContain('Status');
  expect(process.name).toContain('processing');
});

test('treats a value that changes every time as a second input', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'shipped');
  await processOrder(page, 'ORD-1002', 'delivered');

  const process = (await learned(page))!;
  expect(process.occurrences).toBe(3);

  // Same shape, but now two things vary, and the status is one of them.
  expect(process.variables).toHaveLength(2);
  expect(process.variables.map((v) => v.kind).sort()).toEqual(['target', 'value']);

  const status = process.variables.find((v) => v.kind === 'value')!;
  expect(status.examples).toEqual(['processing', 'shipped', 'delivered']);
});

test('does not mistake unrelated actions for a process', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  // Poking around: three different orders opened, nothing done to them.
  for (const id of ['ORD-1000', 'ORD-1001', 'ORD-1002']) {
    await page.locator(ROW_SELECTOR).filter({ hasText: id }).first().getByText(id, { exact: true }).click();
  }

  // A single step repeated is someone browsing, not a procedure worth
  // offering to take over.
  expect(await learned(page)).toBeNull();
});
