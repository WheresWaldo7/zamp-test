const DEFAULT_QUIET_MS = 300;
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Resolves once the DOM has stopped changing for `quietMs`, or when
 * `timeoutMs` runs out.
 *
 * Used after a reload, where "the document finished parsing" says nothing
 * about whether the app has rendered — a React app mounts well after
 * DOMContentLoaded, and a virtualized list populates later still. Waiting on
 * actual mutation silence is the closest honest signal for "the page has
 * settled", and unlike a fixed sleep it costs only as long as it needs to.
 */
export function waitForQuiescence(quietMs = DEFAULT_QUIET_MS, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;

    const finish = () => {
      clearTimeout(quietTimer);
      clearTimeout(hardStop);
      observer.disconnect();
      resolve();
    };

    const restartQuietTimer = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    };

    const observer = new MutationObserver(restartQuietTimer);
    const hardStop = setTimeout(finish, timeoutMs);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    restartQuietTimer();
  });
}
