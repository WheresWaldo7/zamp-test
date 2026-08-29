/**
 * v2 is the same app after a plausible refactor: CSS Module class names all
 * changed (so every generated hash changed with them), the table rows gained
 * a wrapper element, and the Save button moved into a different container.
 *
 * Nothing here is contrived to break the recorder specifically — it's the
 * ordinary churn of a rename-and-reorganize commit. That's the point: the
 * recording was made against v1, and the question is how much of it still
 * means anything.
 *
 * Toggled with ?v2 so both versions are runnable side by side, which is what
 * record-on-v1 / replay-on-v2 needs.
 */
export const isV2 = typeof location !== 'undefined' && new URLSearchParams(location.search).has('v2');
