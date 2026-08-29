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
  variables: { name: string; kind: 'target' | 'value'; stepIndex: number; examples: string[] }[];
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

/** Status badge currently shown for an order in the table. */
async function statusOf(page: import('@playwright/test').Page, orderId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const row = Array.from(document.querySelectorAll('[class*="_row_"], [class*="recordLine"]')).find((el) =>
      (el.textContent ?? '').includes(id),
    );
    return (row?.textContent ?? '').match(/(pending|processing|shipped|delivered|cancelled)/)?.[1] ?? null;
  }, orderId);
}

async function runProcess(page: import('@playwright/test').Page, runs: string[][]) {
  return page.evaluate(
    (runs) =>
      (window as never as { __recorder: { runProcess(r: string[][]): Promise<unknown[][]> } }).__recorder.runProcess(
        runs,
      ),
    runs,
  ) as Promise<{ status: string }[][]>;
}

test('carries the process out for inputs the user never touched', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  // The user does two by hand — enough for the process to be learned.
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  const untouched = ['ORD-1002', 'ORD-1003', 'ORD-1004'];
  for (const id of untouched) {
    expect(await statusOf(page, id), `${id} before`).not.toBe('processing');
  }

  const results = await runProcess(page, untouched.map((id) => [id]));

  expect(results).toHaveLength(3);
  expect(results.flat().every((step) => step.status === 'done')).toBe(true);

  for (const id of untouched) {
    expect(await statusOf(page, id), `${id} after`).toBe('processing');
  }
});

test('acts only on the inputs it was given', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  const before = await statusOf(page, 'ORD-1005');
  await runProcess(page, [['ORD-1002']]);

  expect(await statusOf(page, 'ORD-1002')).toBe('processing');
  // An order that was never mentioned is left exactly as it was — the
  // process applies to what it was handed, not to whatever is nearby.
  expect(await statusOf(page, 'ORD-1005')).toBe(before);
});

test('substitutes the right row rather than the position it learned', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  // The template was recorded against the first row. Its structural
  // candidate still resolves cleanly on this page — to the wrong order — so
  // substitution has to drop it rather than let the fallthrough act on it.
  await runProcess(page, [['ORD-1009']]);

  expect(await statusOf(page, 'ORD-1009')).toBe('processing');
});

test('substitutes a varying value as well as a varying target', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  // Two passes with different statuses, so both the order and the status are
  // learned as inputs.
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'shipped');

  const process = (await learned(page))!;
  const order = process.variables.findIndex((v) => v.kind === 'target');
  const status = process.variables.findIndex((v) => v.kind === 'value');
  expect(order).toBeGreaterThanOrEqual(0);
  expect(status).toBeGreaterThanOrEqual(0);

  const run: string[] = [];
  run[order] = 'ORD-1004';
  run[status] = 'delivered';
  await runProcess(page, [run]);

  expect(await statusOf(page, 'ORD-1004')).toBe('delivered');
});

test('recognises the process when each pass clicks a different column', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  // Nobody aims for the same cell twice. Opening an order by its id on one
  // pass and by its company name on the next is the same intention, and only
  // one of those cells carries a CSS-Module class — so a shape built from the
  // class saw two unrelated actions and learned nothing.
  for (const column of [0, 1]) {
    await page.evaluate((column) => {
      const row = document.querySelectorAll('[class*="_row_"]')[0];
      (row.querySelectorAll('span')[column] as HTMLElement).click();
    }, column);
    await page.locator('#order-status').selectOption('shipped');
    await page.getByRole('button', { name: 'Save order' }).click();
  }

  const process = await learned(page);
  expect(process).not.toBeNull();
  expect(process!.occurrences).toBe(2);
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

test('starts the process at the step that picks the order, not mid-cycle', async ({ page }) => {
  await gotoApp(page, 'v1');

  // The user opens an order first and only then presses Record, so what gets
  // watched is "set status, save, open the next one" — the same cycle, but
  // rotated. Replayed literally, run one would edit whatever order happened to
  // be on screen, which is not the order the user asked for.
  await page.locator(ROW_SELECTOR).filter({ hasText: 'ORD-1000' }).first().getByText('ORD-1000', { exact: true }).click();
  await watch(page);

  await page.locator('#order-status').selectOption('processing');
  await page.getByRole('button', { name: 'Save order' }).click();
  await processOrder(page, 'ORD-1001', 'processing');
  await processOrder(page, 'ORD-1002', 'processing');

  const process = (await learned(page))!;
  expect(process).not.toBeNull();

  // The learned process begins by choosing the order.
  const [variable] = process.variables;
  expect(variable.kind).toBe('target');
  expect(variable.stepIndex).toBe(0);
  expect(variable.examples[0]).toBe('ORD-1001');

  // And it acts on what it is handed, leaving a bystander alone.
  const before = await statusOf(page, 'ORD-1007');
  await runProcess(page, [['ORD-1006']]);
  expect(await statusOf(page, 'ORD-1006')).toBe('processing');
  expect(await statusOf(page, 'ORD-1007')).toBe(before);
});

test('runs the process against a filtered list that shrinks as it goes', async ({ page }) => {
  await gotoApp(page, 'v1');

  // The user's actual flow: filter the table down to one status, then work
  // through what's left. Every save moves an order out of the filter, so the
  // set of rows shifts under replay between one step and the next — the run
  // has to keep hitting the orders it was given, not the positions they were
  // in when it started.
  await page.locator('select').first().selectOption('processing');
  const visible = await page.locator(ROW_SELECTOR).evaluateAll((rows) =>
    rows.map((r) => (r.textContent ?? '').match(/ORD-\d+/)?.[0]).filter(Boolean).slice(0, 4),
  );
  expect(visible.length).toBeGreaterThanOrEqual(4);

  await watch(page);
  await processOrder(page, visible[0]!, 'shipped');
  await processOrder(page, visible[1]!, 'shipped');

  const results = await runProcess(page, [[visible[2]!], [visible[3]!]]);

  // No step may report "did not become actionable" for a row that was on
  // screen the whole time.
  expect(results.flat().map((step) => step.status)).not.toContain('failed');

  // Both are gone from the processing filter, which is only true if their
  // status actually changed.
  expect(await statusOf(page, visible[2]!)).toBeNull();
  expect(await statusOf(page, visible[3]!)).toBeNull();
});

test('learns one pass of the cycle, not two of them glued together', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  for (const id of ['ORD-1000', 'ORD-1001', 'ORD-1002', 'ORD-1003']) {
    await processOrder(page, id, 'processing');
  }

  // Four passes of a three-step cycle cover twelve steps two ways: three
  // steps done four times, or six steps done twice. Both fit the recording;
  // only one is the process. Reading it as six means one input does two
  // orders — and the second is one the user never named.
  const process = (await learned(page))!;
  expect(process.steps).toHaveLength(3);
  expect(process.occurrences).toBe(4);

  // One input, one order. Reading the cycle as six steps processed the row
  // below as well.
  await runProcess(page, [['ORD-1050']]);
  expect(await statusOf(page, 'ORD-1050')).toBe('processing');
  expect(await statusOf(page, 'ORD-1051')).not.toBe('processing');
});

test('takes the input from the row, not the cell the user happened to click', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);

  // Nobody aims at the same cell twice. Here one pass lands on the total and
  // the next on the status, so the clicked elements read "$317.60" and
  // "cancelled" — two texts that name nothing anyone could ask for. What was
  // being chosen both times is the row.
  for (const [row, column] of [[0, 4], [1, 5]] as const) {
    await page.evaluate(([row, column]) => {
      const cells = document.querySelectorAll('[class*="_row_"]')[row].querySelectorAll('span');
      (cells[Math.min(column, cells.length - 1)] as HTMLElement).click();
    }, [row, column]);
    await page.locator('#order-status').selectOption('processing');
    await page.getByRole('button', { name: 'Save order' }).click();
  }

  const process = (await learned(page))!;
  const [variable] = process.variables;
  expect(variable.kind).toBe('target');
  expect(variable.name).toBe('ORD…');
  expect(variable.examples).toEqual(['ORD-1000', 'ORD-1001']);

  // And the order id is enough to run it, even though no recorded candidate
  // ever mentioned one.
  const results = await runProcess(page, [['ORD-1044']]);
  expect(results.flat().map((step) => step.status)).not.toContain('failed');
  expect(await statusOf(page, 'ORD-1044')).toBe('processing');
  expect(await statusOf(page, 'ORD-1050')).not.toBe('processing');
});
