import { expect, test } from '@playwright/test';
import {
  ROW_SELECTOR,
  TARGET_ORDER,
  effectfulSteps,
  gotoApp,
  readAppState,
  recordCanonicalFlow,
  replay,
} from './helpers';

/**
 * What these pin down:
 *
 *   1. A recording replays cleanly against the app it was recorded on.
 *   2. Against a refactored app, steps that captured *meaning* keep working,
 *      and only a step that captured nothing but a class name and a position
 *      needs a human.
 *
 * The second is the assertion with teeth. If role-based candidates stopped
 * surviving a class rename, or the scoring function started preferring a
 * generated class over an accessible name, the healed count would move and
 * these would fail.
 */

// Each test records its own flow rather than sharing a fixture, so a change in
// capture behaviour surfaces here instead of silently invalidating a JSON file
// that nothing regenerates.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('captures intent rather than mechanics', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');

  // Four intentions, not the dozen events they produced. The two clicks that
  // open and dismiss the <select> are gone — an OS-drawn picker can never be
  // replayed, and the change step carries the whole intention.
  expect(effectfulSteps(steps).map((s) => s.action.type)).toEqual(['click', 'change', 'click', 'click']);

  const change = effectfulSteps(steps)[1];
  expect(change.action.value).toBe('shipped');
  expect(change.target?.candidates[0]).toMatchObject({ kind: 'role' });
});

test('v1: replays clean, with nothing needing a human', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');

  // Reload so replay starts from the app's initial state rather than the state
  // the recording left behind.
  await gotoApp(page, 'v1');
  const { results } = await replay(page, steps);

  expect(results.every((r) => r.status === 'done')).toBe(true);

  const state = await readAppState(page);
  expect(state.status).toBe('shipped');
  expect(state.stars).toBe('★★★★★');
  expect(state.drawerSubtitle).toContain(TARGET_ORDER);
});

test('v1: the same recording is stable across repeated runs', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');

  for (let run = 1; run <= 3; run++) {
    await gotoApp(page, 'v1');
    const { results } = await replay(page, steps);
    expect(results.every((r) => r.status === 'done'), `run ${run}`).toBe(true);
  }
});

test('v2: a flow built on meaning survives the refactor untouched', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');

  await gotoApp(page, 'v2');
  const { results } = await replay(page, steps); // deliberately no heal handler

  // Every class name changed, the rows are nested a level deeper, and the Save
  // button moved into a different container — and none of it matters, because
  // each step was recorded against something that means what it says.
  expect(results.every((r) => r.status === 'done')).toBe(true);
  expect(results.some((r) => r.status === 'healed')).toBe(false);

  const state = await readAppState(page);
  expect(state.status).toBe('shipped');
  expect(state.drawerSubtitle).toContain(TARGET_ORDER);
});

test('v2: the Save button is still found after moving to a new parent', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');

  await gotoApp(page, 'v2');
  const { results } = await replay(page, steps);

  const save = results[results.length - 1];
  expect(save.status).toBe('done');
  expect(save.matchedCandidate?.kind).toBe('role');
  expect(save.matchedCandidate?.value).toContain('Save order');
});

test('v2: a step with no semantic identity breaks, and says so', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'blank');

  // Clicked on the row's own padding, so the only candidates are a generated
  // class name and a position — v2 changes both.
  expect(steps[0].target?.candidates.every((c) => c.kind === 'attr' || c.kind === 'struct')).toBe(true);

  await gotoApp(page, 'v2');
  const { results } = await replay(page, steps); // no heal handler

  // Everything after it depends on the drawer that row would have opened, so
  // the cascade is expected. What matters is which step broke first, and why.
  expect(results[0].status).toBe('failed');
  expect(results[0].error).toContain('no candidate resolved');
});

test('v2: exactly one step needs re-pointing, and the rest carry themselves', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'blank');

  await gotoApp(page, 'v2');
  const { results } = await replay(page, steps, { healWith: TARGET_ORDER });

  const healed = results.filter((r) => r.status === 'healed');
  expect(healed).toHaveLength(1);
  expect(healed[0].stepId).toBe(results[0].stepId);
  expect(results.filter((r) => r.status === 'failed')).toHaveLength(0);

  // The steps that carried meaning were never in danger — the point of the
  // whole exercise.
  expect(results.slice(1).every((r) => r.status === 'done')).toBe(true);
  expect(results.some((r) => r.matchedCandidate?.kind === 'role')).toBe(true);

  const state = await readAppState(page);
  expect(state.status).toBe('shipped');
  expect(state.stars).toBe('★★★★★');
  expect(state.drawerSubtitle).toContain(TARGET_ORDER);
});

test('v2: a healed step stays healed on the next run', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'blank');

  await gotoApp(page, 'v2');
  const first = await replay(page, steps, { healWith: TARGET_ORDER });
  expect(first.results.filter((r) => r.status === 'healed')).toHaveLength(1);

  // Healing rewrites the step in place, so the correction holds without being
  // asked again — the run is now as clean as it was on v1. The corrected
  // steps come back from the first run because the patch happened inside the
  // page; in the product the recording never leaves the page to begin with.
  await gotoApp(page, 'v2');
  const second = await replay(page, first.steps);
  expect(second.results.every((r) => r.status === 'done')).toBe(true);
  expect(second.results.some((r) => r.status === 'healed')).toBe(false);
});

test('the scoring function ranks meaning above generated class names', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');
  const [rowCell, status] = effectfulSteps(steps);

  // The order id is real text, so it outranks the CSS-Module class on the same
  // element — which is scored low precisely because it is machine-generated.
  expect(rowCell.target?.candidates[0].kind).toBe('text');
  const classCandidate = rowCell.target?.candidates.find((c) => c.kind === 'attr');
  expect(classCandidate?.value).toMatch(/^\._/);
  expect(rowCell.target?.candidates[0].score).toBeGreaterThan(classCandidate!.score);

  // And a role beats everything available on the status control.
  expect(status.target?.candidates[0].kind).toBe('role');
});

test('the shadow-DOM rating star is addressable at all', async ({ page }) => {
  await gotoApp(page, 'v1');
  const steps = await recordCanonicalFlow(page, 'cell');
  const star = effectfulSteps(steps)[2];

  // Every star looks identical before one is filled, so the only thing that
  // can tell them apart is position *within the shadow root* — which only
  // works because the structural walk steps onto the ShadowRoot instead of
  // stopping at the null parentElement.
  expect(star.target?.shadowPath).toEqual(['x-rating']);
  expect(star.target?.candidates.some((c) => c.kind === 'struct' && /nth-of-type/.test(c.value))).toBe(true);
});

test('the rating widget shows the order it is looking at', async ({ page }) => {
  await gotoApp(page, 'v1');

  const open = async (id: string) =>
    page.locator(ROW_SELECTOR).filter({ hasText: id }).first().getByText(id, { exact: true }).click();

  /** What the widget displays, next to the value it was actually given. */
  const widget = async () =>
    page.evaluate(() => {
      const el = document.querySelector('x-rating') as HTMLElement & { value: number };
      const filled = Array.from(el.shadowRoot!.querySelectorAll('.star')).filter(
        (star) => star.textContent === '★',
      ).length;
      return { filled, value: el.value };
    });

  // React 19 assigns a non-string prop straight to the element as a property.
  // A custom element that only watches attributes never hears about it, so it
  // rendered an empty row of stars for an order rated four — and then held on
  // to whatever was last clicked, which is what surfaced as the next order
  // opening pre-filled.
  // Polled, not read once: opening an order is a React commit followed by the
  // custom element re-rendering, and reading between the two is a race that
  // fails about one run in twenty. ORD-1000 is rated 4 in the seeded fixture.
  await open('ORD-1000');
  await expect.poll(widget).toEqual({ filled: 4, value: 4 });

  await page.evaluate(() => {
    const el = document.querySelector('x-rating') as HTMLElement;
    (el.shadowRoot!.querySelectorAll('.star')[4] as HTMLElement).click();
  });
  expect(await widget()).toEqual({ filled: 5, value: 5 });

  // The next order shows its own rating rather than the one just clicked.
  // ORD-1001 is rated 3 — the fixture is seeded, so that is a fact, not a
  // coincidence of this run.
  await open('ORD-1001');
  await expect.poll(widget).toEqual({ filled: 3, value: 3 });
});
