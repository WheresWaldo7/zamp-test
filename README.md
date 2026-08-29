# A recorder that watches, learns, and replays

Record a flow through a web app once. Replay it later — against a version of
that app whose class names have all changed, whose DOM has been reorganised,
and whose buttons have moved — and have most of it still work. When a step
genuinely can't be resolved any more, stop and ask a human which element was
meant, learn the answer, and carry on.

Two packages, one repo:

- **`app/`** — the "victim": a fake order console, built deliberately hostile
  to automation.
- **`recorder/`** — the recorder itself: capture, describe, replay, heal.

---

## Running it

```bash
cd recorder && npm install && npm run build
cd ../app && npm install && npm run dev
```

Open the dev server URL. The recorder auto-injects in development (a Vite
plugin scoped with `apply: 'serve'`, so it never reaches a production build)
and a panel appears in the top-right.

1. **Record** — press Record, then use the app.
2. **Replay** — press Replay. The page reloads to a clean state, then each
   step runs with the target element highlighted as it goes.
3. **Replay against v2** — navigate to `?v2` and press Replay again. This is
   the interesting one.

Everything is also driveable from the console, because the panel lives in a
closed shadow root and is therefore deliberately unreachable from page
scripts:

```js
window.__recorder.startRecording()
window.__recorder.stopRecording()
window.__recorder.getRecording()          // the portable Recording JSON
window.__recorder.replay()                // reloads first, then runs
window.__recorder.replay(steps, { reload: false, stepDelayMs: 0 })
```

---

## The shape of the thing

Four stages, and one artifact passed between them.

```
  CAPTURE  ──▶  DESCRIBE  ──▶  REPLAY  ──▶  HEAL
  listen to     turn each      find it      when you can't,
  the user      action into    again, and   ask the human
  without       N ways to      wait until   and remember
  breaking      find that      it's really  the answer
  anything      element        ready
```

The artifact is a `Recording`: a JSON array of steps, each holding ranked
selector candidates and the action to perform.

```jsonc
{
  "id": "step_3",
  "action": { "type": "change", "value": "shipped" },
  "target": {
    "candidates": [
      { "kind": "role",   "value": "combobox[name=\"Status\"]", "score": 100 },
      { "kind": "label",  "value": "label:\"Status\"",          "score": 85  },
      { "kind": "attr",   "value": "._select_15gui_18",         "score": 35  }
    ],
    "frame": [],            // iframe path; empty = top document
    "shadowPath": []        // shadow host chain; empty = light DOM
  }
}
```

Everything either produces this object or consumes it.

---

## 1. Why deterministic replay, in the agent era

The obvious question is why any of this matters when a model can look at a
page and decide what to click.

Because deciding is the expensive part, and most of the time it is the same
decision. An agent asked to update an order does not need to rediscover the
route from scratch on the two-hundredth run — it needs to *remember* it. A
recording is that memory: a route through an application, captured once,
executed deterministically thereafter. It is cheap, auditable, and it fails
loudly instead of creatively.

That framing sets the engineering bar, and it is the whole reason this
project is interesting rather than routine:

- **Determinism is the product.** If replay is 95% reliable it is worse than
  useless, because the 5% is silent and wrong. Hence polling for actionability
  rather than sleeping, and hence a step that cannot resolve its target
  refusing to guess.
- **Resilience is the hard part.** A route recorded against today's DOM has
  to survive tomorrow's refactor, or the memory has to be rebuilt constantly
  and the economics collapse. Hence ranked candidates rather than one
  selector.
- **Graceful degradation beats brittle perfection.** The interesting question
  is not "does it work on the happy path" but "what happens when it doesn't."
  Hence healing: a step that breaks costs a human two seconds, not a rerecord.

The agent, in this picture, is what handles the genuinely novel — and what
answers the question when replay stops and asks which element moved.

---

## 2. The selector scoring function

For every captured element, generate every reasonable way to find it again,
then rank them. Store the top 3.

```
score = baseWeight(strategy)
      − 20  if the value looks machine-generated  (/_[a-z0-9]{4,}_[a-z0-9]{2,}$/)
      − 5   per level of structural depth          (structural candidates only)
      − 40  if it currently matches more than one element
```

| Rank | Strategy | Base | Survives | Fails when |
|---|---|---|---|---|
| 1 | Role + accessible name | 100 | Restyling, refactors, reparenting | No implicit/explicit role, or no accessible name |
| 2 | Label / placeholder | 85 | Restyling | Copy changes; only applies to form controls |
| 3 | Visible text | 70 | Restyling, reparenting | Copy changes; ambiguous when repeated |
| 4 | Stable attributes | 55 | Most changes | Often only a CSS-Module class is available, which is churn by design |
| 5 | Structural path | 20 | Nothing much | Any reorganisation — but it is always available |

Three things about this are worth more than the ordering itself.

**The uniqueness penalty is what makes it a function rather than a priority
list.** A `text:"Acme Corp"` candidate that matches 56 table rows scores below
a structural fallback that happens to resolve to exactly one element. Ranking
by strategy alone would confidently pick the ambiguous one.

**Each strategy's `describe()` doubles as its own matcher.** `findByStrategy`
re-runs `describe()` over the live DOM and compares values, so a candidate's
matching logic can never drift from the logic that generated it. There is no
second implementation to keep in sync.

**Machine-generated values are penalised, not excluded.** The app is styled
entirely with CSS Modules, so class names arrive as `_row_11v6d_29`. Excluding
them outright would hide the judgement; scoring them low leaves the reasoning
visible in the output, and still lets them win when nothing better exists.

### What this looks like in practice

Recorded against v1, replayed against v2 — where every CSS-Module class was
renamed, table rows were nested one level deeper, and the Save button was
moved into a different container:

| Step | Result | Matched via |
|---|---|---|
| Set status | `done` | `role` — `combobox[name="Status"]` |
| Click Save | `done` | `role` — survived the rename **and** the move to a new parent |
| Click rating star | `done` | `struct` — `span:nth-of-type(5)` inside the shadow root |
| Click table row | `healed` | nothing left — asked a human, learned the answer |

The row is the honest failure. It is a plain `<div>` with no role, no label,
and no stable text of its own; its only identities were a generated class name
and a position, and v2 destroyed both. Nothing in the scoring function could
have saved it — which is exactly why healing exists.

---

## 3. Record intent, not mechanics

A recorder that captures mechanics is a video. A recorder that captures intent
is a program. This single idea is what makes the hard interactions tractable.

- **Typing** "acme corp" is one `input` step with a value, not nine keystroke
  events. Coalesced on a debounce.
- **Dragging** stores `{ from, to }` — two elements — and nothing else. The
  path is synthesised at replay time. Storing 200 `pointermove` coordinates
  would be storing mechanics that no longer mean anything once the layout
  shifts.
- **Hovering** is only recorded when dwell exceeded ~300ms *and* a
  `MutationObserver` saw the DOM change during it. The mutation check is the
  good half: it distinguishes "this hover meant something" from "the cursor
  crossed fifteen elements on the way to a click."
- **Clicking a `<label>`** and the control it wraps is one intention, so the
  label's click is dropped and the control's stands for it.
- **Clicking a `<select>`** is not recorded at all — see the cut list. The
  `change` step carries the entire intention.

Replay is the same idea in reverse: it reproduces the *effect*, not the
choreography. A recorded status change replays as a real value update that
React observes, even though the dropdown never visibly opens, because opening
it was never the point.

### Making the effect actually register

Two details matter enough to call out, because both fail *silently*.

**React controlled inputs.** Setting `input.value = x` does nothing: React
tracks the previous value on an internal `_valueTracker` and dedupes when they
match, so `onChange` never fires and the field snaps back on the next render.
The fix is to go through the native setter so the tracker updates too, then
dispatch a **bubbling** `input` event — bubbling because React 17+ delegates
listeners at the root container, so a non-bubbling event never arrives.

```ts
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
setter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
```

**Never sleep.** `await sleep(500)` is a guess. Replay polls for four
actionability conditions borrowed from Playwright — visible, stable across two
animation frames, enabled, and hittable — and only then acts. After a reload it
waits for *mutation silence* rather than a fixed delay, because a React app
mounts well after `DOMContentLoaded` and a virtualized list populates later
still.

The hittable check earns its keep: it is what catches an invisible overlay
swallowing a click. During development it caught the recorder's own panel
sitting on top of v2's relocated Save button.

---

## 4. What I cut, and why

Each of these is a decision with a reason, not a gap.

| Cut | Reason |
|---|---|
| CSS-only `:hover` | Rendering-engine state, not an event. No amount of dispatching applies `.menu:hover { display: block }`. Needs real input through the browser pipeline. |
| Native `<select>` picker | Drawn by the browser/OS. It has no DOM representation — the `<option>`s are present whether it is open or shut — and it ignores synthetic clicks entirely. The resulting value change replays correctly; the popup cannot be shown. |
| HTML5 native drag-and-drop | `isTrusted: false` means the browser's drag machinery never engages. |
| OS-level file drag | Outside the page's security boundary. |
| Closed shadow roots | `element.shadowRoot` is `null` by design. Unreachable, permanently — which is exactly why the recorder's own panel uses one. |
| Cross-origin iframes | Same-origin policy. Would need a per-frame injected recorder. |
| Canvas / WebGL | No DOM targets. Only coordinates, and coordinates are lies. |
| Rich-text editors | ProseMirror/Slate/Lexical intercept `beforeinput`, `preventDefault` it, and run their own document model. |
| Clipboard, file pickers | `isTrusted` cannot be faked from page JS. |
| Loops and conditionals | Program synthesis, not frontend. A different discipline. |
| Any LLM | The lowest frontend signal per line of code in the entire project. |

The app deliberately ships both a JS-driven hover menu and a CSS-only one, so
the difference is demonstrable rather than merely asserted: replay drives the
first and provably cannot drive the second.

### Delivery: injected script, not a driver

This runs as an injected page script rather than through Playwright or CDP.
CDP would hand over precisely the things this project exists to demonstrate —
actionability waiting, selector generation, trusted input — and the result
would show that I can use Playwright, which is assumed. The constraints of
in-page JS are what force building the selector scorer, the four-condition
poll, and the native-setter fix by hand.

The cost is a real ceiling: `Input.dispatchMouseEvent` would unlock trusted
events, real CSS `:hover`, and the native `<select>` picker. That is a
deliberate trade, not an oversight.

The core is written so this stays a decision rather than a dead end. Nothing in
`core/` knows how it got onto the page, and nothing in `core/` knows the panel
exists — UI concerns arrive as injected callbacks (`onHeal`, `onBeforeAction`,
`isOverlay`, `shouldIgnore`). Wrapping it in a MV3 extension is an adapter
swap, not a rewrite.

---

## The victim app is hostile on purpose

Reviewers are right to be suspicious of a demo app quietly tuned to make the
demo work. This one is tuned the other way:

- **CSS Modules everywhere** → class names arrive as `_row_11v6d_29`, so
  class-based selectors are dead on arrival.
- **Zero `data-testid`** → adding them would be rigging my own exam.
- **A virtualized table** (TanStack Virtual) → row 400 does not exist in the
  DOM until scrolled to.
- **An open-shadow-root `<x-rating>` widget** → forces event retargeting, and
  the widget rebuilds its own children on every click.
- **A cookie banner on ~50% of loads** → genuine non-determinism.
- **Two hover menus**, one React-state-driven and one pure CSS.
- **A dnd-kit sortable list** with a pointer activation constraint.
- **A `?v2` variant** — all classes renamed, rows nested deeper, Save button
  relocated — for the record-on-v1/replay-on-v2 comparison.

The order data is seeded with a fixed PRNG. That is not softening the test: it
makes it *possible*, since a virtualized list whose contents change on every
reload cannot be replayed against at all.

---

## Things that were only learnable by building it

A short list of findings that cost real debugging time, kept because each one
is a trap rather than a triviality.

**Describe eagerly, in the capture handler.** Describing steps later, in a
batch, silently describes the wrong element. The rating widget removes and
recreates its `<span>` stars on every click, so by the time a deferred pass
ran, the element it scored was a detached node. Capture-phase handlers run
*before* the event reaches its target, which is the one moment the DOM is
guaranteed to still match what the user saw.

**Structural paths stop at shadow boundaries.** `parentElement` is `null` for
an element sitting directly inside a shadow root, so the walk terminated
immediately and described all five rating stars as the bare tag `span` —
mutually indistinguishable, and correctly refused by replay. A `ShadowRoot`
still exposes `children`, so stepping onto it as an indexing parent yields
`span:nth-of-type(5)` and the step replays.

**At drop time, the dragged element is under the cursor.** `elementFromPoint`
at the release point returns the thing being dragged, not the thing it is
being dropped on, so every drag recorded as "drop X onto X" and replayed as a
no-op. Walking the hit stack past the source finds the real target.

**dnd-kit ignores synthetic pointer moves fired in a tight loop.** The same
eight interpolated moves work when spaced across task ticks and are ignored
entirely when dispatched synchronously.

**A failed lookup must not leave the page scrolled.** The scroll-and-retry
that finds unmounted virtualized rows was running on *every* miss, including
misses that had nothing to do with virtualization, and leaving the table
hundreds of rows away — quietly corrupting every subsequent step. It now
restores scroll position when the probe finds nothing.

**Replay has to reset the page first.** Replaying immediately after recording
starts from the *end* state of the recording — drawer already open, filter
already typed. Nothing generic can undo an arbitrary app's state, but a reload
is the one reset every web app agrees on.

---

## Layout

```
recorder/src/
  core/
    recorder.ts            capture engine (Tier 1 + Tier 2 wiring)
    resolveTarget.ts       composedPath()[0], shadow + frame paths
    hoverCapture.ts        dwell + mutation heuristic
    dragCapture.ts         pointerdown/move/up shape, drop-target resolution
    describe/
      strategies.ts        the five strategies; describe() doubles as match()
      describeElement.ts   the scoring function
      describeRecording.ts CapturedStep[] -> RecordingStep[]
    replay/
      findTarget.ts        candidate fallthrough, virtualization scroll-retry
      actionability.ts     visible / stable / enabled / hittable polling
      quiescence.ts        mutation-silence wait after navigation
      performAction.ts     per-action performers, incl. the React setter fix
      replayStep.ts        resolve -> heal? -> wait -> act
    heal/
      elementPicker.ts     neutralised click-to-point
      healStep.ts          re-describe and patch the step in place
      describeForHuman.ts  candidate -> "the button labelled 'Save order'"
  ui/                      panel + highlight (closed shadow root)
  adapters/injected.ts     the only file that knows about pages and panels
```

---

## Observability

Every run prints a table and a summary, and the last one stays available as
`window.__recorder.getRunLog()`.

```
[replay] 4 steps in 43ms — 4 done, 0 healed, 0 skipped, 0 failed
  1. done | text  #0 (70)  | 3ms  | Click the element reading "ORD-1006"
  2. done | role  #0 (100) | 11ms | Set the combobox labelled "Status" to "shipped"
  3. done | struct #2 (15) | 15ms | Click the element reading "☆" (inside <x-rating>)
  4. done | role  #0 (100) | 14ms | Click the button labelled "Save order"
[replay] 1 step(s) resolved through a fallback candidate — still green, but
         those are the ones a refactor will break first.
```

Two things in there are worth more than the pass/fail count.

**The `#n` is the candidate's rank.** `#0` means the top-ranked candidate won;
anything higher means the fallthrough saved it. A green run where half the
steps resolved via `#2` is a recording one refactor away from stopping to ask
for help, and nothing in a pass/fail count would tell you that.

**Timings are split by phase, not totalled**, because the useful question is
*which* phase was slow. A long `findMs` means candidates missed and the scroll
probe ran; a long `actionableMs` means the app was still settling or something
was covering the target. That distinction diagnosed a real failure during
development: a step reporting `findMs: 1, actionableMs: 3043` had found its
button instantly and then been blocked for three seconds — which pointed
straight at the cookie banner overlapping it at a narrow viewport, rather than
at anything to do with selectors.

Human time spent re-pointing is tracked separately, since it would otherwise
dominate a total that is supposed to describe the system.

---

## Tests

```bash
npm install && npm test
```

Ten Playwright tests, run in CI on every push. Playwright is the *harness*,
not the delivery mechanism — the recorder still runs as an injected page
script driving the DOM with untrusted events, and Playwright only opens the
browser and reads results back out.

The suite pins both halves of the thesis:

- **v1 replays clean**, and does so repeatably across consecutive runs.
- **v2** — every class renamed, rows nested deeper, Save button moved — a flow
  recorded against *meaning* survives untouched, while a step recorded against
  nothing but a generated class name and a position needs exactly one
  re-point, and stays healed afterwards.

Both row-click behaviours are covered deliberately: clicking the order-id cell
yields durable text identity, clicking the row's own padding yields none.
Testing only the first would overstate how well this works; only the second
would understate it.

The suite is load-bearing rather than decorative. Demoting the role strategy's
base weight from 100 to 10 fails four tests, including "the Save button is
still found after moving to a new parent".

---

## Status

Stages 0–5 are complete: the victim app, capture, describe, replay, healing,
the v1→v2 demonstration, the run log, and CI.

The one item from the plan left undone is parameterisation — record the same
flow twice with different values, diff the recordings, and mark the differing
fields as variables. It is the piece that would turn a recording into a
reusable template rather than a fixed script, and it is roughly sixty lines
against the existing `Recording` shape.
