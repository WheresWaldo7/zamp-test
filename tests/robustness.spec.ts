import { expect, test } from '@playwright/test';
import { ROW_SELECTOR, gotoApp } from './helpers';

/**
 * Flows nobody designed for.
 *
 * The suites next door test the ideas: that a process can be recognised, that
 * a selector survives a refactor. They were written alongside the design, and
 * so they mostly ask whether it does what it was built to do. These were
 * written the other way round — by sitting down and trying to break it — and
 * most of them failed the first time they ran. What they have in common is
 * that they are all things a person would plausibly do on their first sitting
 * without being told not to.
 */

interface Rec {
  clear(): void;
  startRecording(): void;
  getRecording(): { action: { type: string } }[];
  getLearnedProcess(): unknown;
  runProcess(runs: string[][]): Promise<{ status: string; error?: string }[][]>;
}
declare global { interface Window { __recorder: Rec } }

interface Learned {
  steps: unknown[];
  occurrences: number;
  variables: { kind: string; examples: string[] }[];
}

async function watch(page: import('@playwright/test').Page) {
  await page.evaluate(() => { window.__recorder.clear(); window.__recorder.startRecording(); });
}
async function learned(page: import('@playwright/test').Page): Promise<Learned | null> {
  return page.evaluate(() => window.__recorder.getLearnedProcess()) as Promise<Learned | null>;
}
async function run(page: import('@playwright/test').Page, runs: string[][]) {
  return page.evaluate((r) => window.__recorder.runProcess(r), runs);
}
async function statusOf(page: import('@playwright/test').Page, id: string) {
  return page.evaluate((id) => {
    const row = Array.from(document.querySelectorAll('[class*="_row_"], [class*="recordLine"]'))
      .find((el) => (el.textContent ?? '').includes(id));
    return (row?.textContent ?? '').match(/(pending|processing|shipped|delivered|cancelled)/)?.[1] ?? null;
  }, id);
}
async function openOrder(page: import('@playwright/test').Page, id: string) {
  await page.locator(ROW_SELECTOR).filter({ hasText: id }).first().getByText(id, { exact: true }).first().click();
}
async function processOrder(page: import('@playwright/test').Page, id: string, status: string) {
  await openOrder(page, id);
  await page.locator('#order-status').selectOption(status);
  await page.getByRole('button', { name: 'Save order' }).click();
}
async function setStars(page: import('@playwright/test').Page, n: number) {
  await page.evaluate((n) => {
    const el = document.querySelector('x-rating') as HTMLElement;
    (el.shadowRoot!.querySelectorAll('.star')[n - 1] as HTMLElement).click();
  }, n);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
});

test('an input that is not on the page fails, and changes nothing', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  const before = await statusOf(page, 'ORD-1002');
  const results = await run(page, [['ORD-9999']]);

  expect(results.flat().some((s) => s.status === 'failed')).toBe(true);
  expect(await statusOf(page, 'ORD-1002')).toBe(before);
});

test('a second run touches only what it was given', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  await run(page, [['ORD-1002']]);
  const snapshot = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="_row_"]'))
    .map((r) => (r.textContent ?? '').match(/ORD-\d+|pending|processing|shipped|delivered|cancelled/g)?.join(':')));

  await run(page, [['ORD-1003']]);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="_row_"]'))
    .map((r) => (r.textContent ?? '').match(/ORD-\d+|pending|processing|shipped|delivered|cancelled/g)?.join(':')));

  const changed = after.filter((row, i) => row !== snapshot[i]);
  expect(await statusOf(page, 'ORD-1003')).toBe('processing');
  // Only ORD-1003 may differ between the two snapshots.
  expect(changed.filter((c) => c && !c.includes('ORD-1003'))).toEqual([]);
});

test('work repeated with a gap in between is not a process', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'processing');
  await page.locator('input[placeholder*="Filter"]').fill('acme');
  await page.waitForTimeout(600);
  await page.locator('input[placeholder*="Filter"]').fill('');
  await page.waitForTimeout(600);
  await processOrder(page, 'ORD-1001', 'processing');

  // Two passes of the real work, but not back to back — and in between, two
  // perfectly ordinary searches. Consecutive-only matching is what stops the
  // searches being read as the process, and a one-step process is restricted
  // to drags for the same reason: two searches in a row is how everybody uses
  // a search box, and announcing it as a procedure would be noise that also
  // outranks the actual work happening around it.
  expect(await learned(page)).toBeNull();
});

test('a recording started part-way down the list', async ({ page }) => {
  await gotoApp(page, 'v1');
  await page.evaluate(() => { (document.querySelector('[class*="scrollContainer"]') as HTMLElement).scrollTop = 3000; });
  await page.waitForTimeout(300);
  const ids = (await page.evaluate(() => Array.from(document.querySelectorAll('[class*="_row_"]'))
    .map((r) => (r.textContent ?? '').match(/ORD-\d+/)?.[0]).filter(Boolean))) as string[];

  await watch(page);
  await processOrder(page, ids[0], 'processing');
  await processOrder(page, ids[1], 'processing');

  const p = await learned(page);
  expect(p).not.toBeNull();

  const results = await run(page, [[ids[3]]]);
  expect(await statusOf(page, ids[3])).toBe('processing');
});

test('a run is not recorded as more of the process', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  const before = await page.evaluate(() => window.__recorder.getRecording().length);
  await run(page, [['ORD-1002']]);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__recorder.getRecording().length);

  expect(after).toBe(before);
});


test('a process that sets a rating actually sets it', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  for (const id of ['ORD-1000', 'ORD-1001']) {
    await openOrder(page, id);
    await setStars(page, 5);
    await page.getByRole('button', { name: 'Save order' }).click();
  }
  const p = await learned(page);
  expect(p).not.toBeNull();

  const results = await run(page, [['ORD-1002']]);

  await openOrder(page, 'ORD-1002');
  await page.waitForTimeout(200);
  const stars = await page.evaluate(() => {
    const el = document.querySelector('x-rating') as HTMLElement & { value: number };
    return { filled: Array.from(el.shadowRoot!.querySelectorAll('.star')).filter((s) => s.textContent === '★').length, value: el.value };
  });
  expect(stars.value).toBe(5);
});

test('an order far down the virtualized list is still found', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await openOrder(page, 'ORD-1000'); await page.locator('#order-status').selectOption('processing');
  await page.getByRole('button', { name: 'Save order' }).click();
  await openOrder(page, 'ORD-1001'); await page.locator('#order-status').selectOption('processing');
  await page.getByRole('button', { name: 'Save order' }).click();

  // ORD-1140 is nowhere near the top; it is not mounted at all.
  const results = await run(page, [['ORD-1140']]);
  expect(results.flat().every((s) => s.status !== 'failed')).toBe(true);
  expect(await statusOf(page, 'ORD-1140')).toBe('processing');
});

test('a batch of five in one go', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await openOrder(page, 'ORD-1000'); await page.locator('#order-status').selectOption('shipped');
  await page.getByRole('button', { name: 'Save order' }).click();
  await openOrder(page, 'ORD-1001'); await page.locator('#order-status').selectOption('shipped');
  await page.getByRole('button', { name: 'Save order' }).click();

  const ids = ['ORD-1002', 'ORD-1003', 'ORD-1004', 'ORD-1005', 'ORD-1006'];
  const results = await run(page, ids.map((id) => [id]));
  for (const id of ids) expect(await statusOf(page, id), id).toBe('shipped');
});

test('the same input twice in one batch', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await openOrder(page, 'ORD-1000'); await page.locator('#order-status').selectOption('shipped');
  await page.getByRole('button', { name: 'Save order' }).click();
  await openOrder(page, 'ORD-1001'); await page.locator('#order-status').selectOption('shipped');
  await page.getByRole('button', { name: 'Save order' }).click();

  const results = await run(page, [['ORD-1002'], ['ORD-1002']]);
  expect(await statusOf(page, 'ORD-1002')).toBe('shipped');
});

test('a hover menu used twice is not mistaken for a process', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Export/ }).hover();
    await page.waitForTimeout(400);
    await page.getByText('Export as CSV', { exact: true }).click();
    await page.waitForTimeout(200);
  }
  const types = await page.evaluate(() => window.__recorder.getRecording().map((s) => s.action.type));
  expect(types).toContain('click');

  // Opening a menu and picking the same item twice is not a procedure worth
  // taking over — it names things without changing them.
  expect(await learned(page)).toBeNull();
});

test('clearing forgets what it had learned', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await openOrder(page, 'ORD-1000'); await page.locator('#order-status').selectOption('processing');
  await page.getByRole('button', { name: 'Save order' }).click();

  await watch(page); // clear + start again
  expect(await page.evaluate(() => window.__recorder.getRecording().length)).toBe(0);
  expect(await learned(page)).toBeNull();

  await openOrder(page, 'ORD-1001'); await page.locator('#order-status').selectOption('processing');
  await page.getByRole('button', { name: 'Save order' }).click();
  await openOrder(page, 'ORD-1002'); await page.locator('#order-status').selectOption('processing');
  await page.getByRole('button', { name: 'Save order' }).click();

  const p = await learned(page);
  expect(p!.occurrences).toBe(2);
  expect(p!.variables[0].examples).toEqual(['ORD-1001', 'ORD-1002']);
});


test('a process can be learned in the refactored app too', async ({ page }) => {
  await gotoApp(page, 'v2');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  const p = await learned(page);
  expect(p).not.toBeNull();
  expect(p!.variables[0].examples).toEqual(['ORD-1000', 'ORD-1001']);

  const results = await run(page, [['ORD-1004']]);
  expect(await statusOf(page, 'ORD-1004')).toBe('processing');
});

test('an order hidden by a filter is not confused for another', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'processing');
  await processOrder(page, 'ORD-1001', 'processing');

  // Narrow the table so the requested order is genuinely not present.
  await page.locator('input[placeholder*="Filter"]').fill('wayne');
  await page.waitForTimeout(500);
  const visible = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="_row_"]'))
    .map((r) => (r.textContent ?? '').match(/ORD-\d+/)?.[0]));
  const hidden = 'ORD-1002';
  expect(visible).not.toContain(hidden);

  // Statuses by id, not by rendered position: the list is virtualized, so
  // which rows are on screen shifts for reasons that have nothing to do with
  // anything being modified.
  const sample = visible.filter(Boolean).slice(0, 5) as string[];
  const statusesOf = async () => {
    const out: Record<string, string | null> = {};
    for (const id of sample) out[id] = await statusOf(page, id);
    return out;
  };
  const before = await statusesOf();

  const results = await run(page, [[hidden]]);

  // It must not have modified a Wayne order that happened to be on screen.
  expect(await statusesOf()).toEqual(before);
  expect(results.flat().every((r) => r.status === 'failed')).toBe(true);
});

test('a failed lookup does not act on whatever is already open', async ({ page }) => {
  await gotoApp(page, 'v1');
  await watch(page);
  await processOrder(page, 'ORD-1000', 'cancelled');
  await processOrder(page, 'ORD-1001', 'cancelled');

  // Leave a completely unrelated order open in the drawer.
  await page.locator(ROW_SELECTOR).filter({ hasText: 'ORD-1005' }).first().getByText('ORD-1005', { exact: true }).click();
  await page.waitForTimeout(150);
  const before = await statusOf(page, 'ORD-1005');

  const results = await run(page, [['ORD-9999']]);

  // The run could not find its subject, so it must have stopped — not set the
  // status of the order that happened to be on screen.
  // ORD-1005 is 'cancelled' in the seeded fixture, which is also what the
  // process sets — so the check that matters is that it is untouched, not
  // that it differs from the process's value.
  expect(await statusOf(page, 'ORD-1005')).toBe(before);
  expect(results.flat()).toHaveLength(1);
});


test('a failed lookup leaves the page where it found it', async ({ page }) => {
  await gotoApp(page, 'v1');
  await page.evaluate(() => { window.__recorder.clear(); window.__recorder.startRecording(); });
  for (const id of ['ORD-1000', 'ORD-1001']) {
    await page.locator(ROW_SELECTOR).filter({ hasText: id }).first().getByText(id, { exact: true }).click();
    await page.locator('#order-status').selectOption('processing');
    await page.getByRole('button', { name: 'Save order' }).click();
  }

  const scrollTops = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).filter((el) => el.scrollHeight > el.clientHeight + 50)
      .map((el) => el.scrollTop));

  const before = await scrollTops();
  await page.evaluate(() => window.__recorder.runProcess([['ORD-9999']]));
  const after = await scrollTops();

  expect(after).toEqual(before);
});
