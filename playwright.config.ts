import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright is used here as a *test harness*, not as the delivery mechanism.
 * The recorder still runs exactly as it does in production — an injected page
 * script driving the DOM through untrusted events — and Playwright only opens
 * the browser, navigates, and reads results back out. That distinction is the
 * whole point of the delivery decision in the README: replaying through CDP
 * would have meant delegating the selector and synchronisation work this
 * project exists to demonstrate, whereas *observing* a run from outside costs
 * nothing.
 */
const PORT = process.env.PORT ?? '5199';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // CI downloads Playwright's pinned Chromium, which is the reproducible
  // choice. Locally that download can be blocked by a TLS-intercepting proxy,
  // so the installed Chrome is used instead — same engine, no download.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: {
    // The dev server injects the built recorder bundle, so `npm test` builds
    // the recorder before invoking Playwright.
    command: 'npm run dev --prefix app',
    env: { PORT },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
