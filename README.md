# A recorder that watches, learns, and replays

**Learn a user's process by watching them, then automate it on their behalf.**

Nobody presses a button to say "this is a process". The recorder watches, and
when the same shape of work happens more than once it says so — along with
which parts of it were different each time, because those are the inputs.

The process it learns then replays against a version of the app whose class
names have all changed, whose DOM has been reorganised, and whose buttons have
moved. When a step genuinely can't be resolved any more, it stops and asks a
human which element was meant, learns the answer, and carries on.

Two packages, one repo:

- **`app/`** — the "victim": a fake order console, built deliberately hostile
  to automation.
- **`recorder/`** — the recorder itself: capture, describe, learn, replay, heal.

[DECISIONS.md](DECISIONS.md) covers the choices that had a real alternative,
and what each one cost.

---

## Running it

```bash
cd recorder && npm install && npm run build
cd ../app && npm install && npm run dev
```

Open the dev server URL. The recorder auto-injects in development (a Vite
plugin scoped with `apply: 'serve'`, so it never reaches a production build)
and a panel appears in the top-right, collapsed — click its header to unfold
the step list. It starts collapsed because expanded it covers the app's own
controls on a laptop-sized window, which is a bad way to meet a tool.

1. **Let it watch.** Press Record, then do something twice — open an order, set
   its status to Processing, save; then do the same for a second order.
2. **It notices.** A green panel appears naming the process, how many times it
   has seen it, and what varied between runs.
3. **Hand it the rest.** Type the orders you haven't done, one per line, and
   press *Do the rest for me*. It works through them with each target
   highlighted as it goes. If it found more than one input, the first is the
   one that matters — give it alone and the rest run as recorded.

If the cookie banner is showing, dismiss it first. It appears on half of loads
by design and it sits on top of the Save button.

Then, for the resilience half:

4. **Replay against v2** — navigate to `?v2` and press Replay. Same recording,
   an app whose class names have all changed and whose Save button has moved.

Everything is also driveable from the console, because the panel lives in a
closed shadow root and is therefore deliberately unreachable from page
scripts:

```js
window.__recorder.startRecording()
window.__recorder.stopRecording()
window.__recorder.getRecording()          // the portable Recording JSON
window.__recorder.replay()                // reloads first, then runs
window.__recorder.replay(steps, { reload: false, stepDelayMs: 0 })

window.__recorder.getLearnedProcess()     // what it noticed you repeating
window.__recorder.runProcess([['ORD-1002'], ['ORD-1003']])
```

---

## The shape of the thing

```
  CAPTURE  ──▶  DESCRIBE  ──▶  LEARN  ──▶  REPLAY  ──▶  HEAL
  listen to     turn each      notice a    find it      when you can't,
  the user      action into    repeated    again, and   ask the human
  without       N ways to      shape and   wait until   and remember
  breaking      find that      what it     it's really  the answer
  anything      element        takes as    ready
                               input
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

## 1. Learning a process by watching

Detection runs after every captured step. Nobody declares a process; doing the
same thing twice is the declaration.

The mechanism is a **step signature** — the shape of a step with everything
instance-specific stripped out. Two runs of "mark an order processed" touch
different rows and may set different values, so comparing steps by their
selectors would say every run was unrelated. Comparing them by shape says they
are the same procedure.

What the signature keeps, in order of preference:

| Kept | Why it generalises |
|---|---|
| Role — `combobox[name="Status"]` | Identical on every run |
| Structure with indices stripped | `div:nth-of-type(7) > span` and `div:nth-of-type(12) > span` are the same cell in different rows |
| Class or id — `._cellMuted_11v6d_52` | Shared by every row's id cell, so it generalises across rows precisely because it is generic |

Structure ranks above class because a class is only shared by *some* of the
things a person treats as equivalent. Clicking a row's id cell and clicking its
company cell are the same intention — open that order — but only the id cell
carries a class, so preferring the class gave the two clicks different shapes
and the repetition went unnoticed.

Visible text is deliberately never used. It is the most instance-specific
thing on an element — which makes it the best selector for replaying one step
and the worst descriptor for recognising a repeated one. That inversion is the
crux: **replay wants what is unique, learning wants what is shared.**

Scrolling, hovering and focus are excluded from matching. People scroll to find
a row and tab between fields differently on every repetition, so leaving them
in would make two runs of the same process look different.

### Detection and parameterisation are one computation

Comparing the runs tells you both that a shape recurred *and* which parts of it
differed. Anything identical across every run is part of the procedure;
anything that varied is an input to it.

Watching someone process three orders by hand produces:

```
Noticed a repeated process — done 3×
  Set the combobox labelled "Status" to "processing"
  ORD… (target): ORD-1000, ORD-1001, ORD-1002
```

The status was the same every time, so it belongs to the procedure. The order
was not, so it became an input — named from the shape of the data rather than
by position, and trimmed of trailing digits so the name doesn't drift as more
examples arrive.

Do the same three orders with three *different* statuses and it finds two
inputs instead of one, without being told anything had changed.

### Carrying it out

Give it the orders you haven't done and it works through them:

```js
window.__recorder.runProcess([['ORD-1002'], ['ORD-1003'], ['ORD-1004']])
```

or type them into the panel, one run per line, and press **Do the rest for
me**.

Substituting an input is less obvious than swapping a string. The template was
recorded against the first row, so its structural candidate —
`… > div:nth-of-type(1) > span` — still resolves perfectly on the page, *to
the wrong order*. Leaving it in place would let the fallthrough click row one
and report success. Substitution therefore drops structural candidates rather
than rewriting them: a step that can no longer identify its target should fail
and ask, because a wrong action taken confidently is worse than an action not
taken.

Which leaves the question of how the right row is found instead. A step
recorded inside a list carries the **repeated unit** it sat in, and is
re-pointed by moving that scope rather than by editing selector text — so
`._row_11v6d_29 containing "ORD-1044" › #4` finds the same cell of a different
row even when nothing about the recorded cell ever mentioned an order id. That
matters because nobody clicks the same column twice: aim at the total on one
pass and the status on the next, and the recorded texts are "$317.60" and
"cancelled", neither of which names anything a person could ask for.

A run that cannot find the thing it was given stops there rather than
continuing. Every step after the one that picks the instance means "do this to
whatever is open now", so carrying on past it would set a status and save
whatever happened to be on screen.

Steps that take an input are copied per run; steps that don't are shared on
purpose. If replay has to ask where the Save button went, that answer is
learned once and holds for the whole batch instead of being asked ten times.

Unlike replay, running a process does **not** reload between runs. Replay
reloads because it is re-performing a journey from the start; this is
continuing work the user was already doing, and each run leaves a real change
behind. Reloading would throw the batch away — in this app literally, since a
reload restores the seeded data.

Only consecutive repetition counts. Someone grinding through a queue does the
work back to back, and requiring that is what stops unrelated actions that
merely recur across a session from being mistaken for a procedure.

A single step repeated is ignored unless it is a drag. The test is whether the
one action both picks out what it acts on and changes it: opening one order
after another names things without changing them, and typing in a filter box
changes something without naming it, but a drag does both. And a stretch of
*identical* steps is never read as a multi-step process at all — type,
backspace, type again and a uniform run would otherwise match a pattern of
every length up to half its own, turning one person using one search box into
a procedure demanding two search terms.

---

## 2. Why deterministic replay, in the agent era

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

## 3. The selector scoring function

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

## 4. Record intent, not mechanics

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

## 5. What I cut, and why

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
      scope.ts             the repeated unit a target sits in, and which
                           text picks this one out from its siblings
      describeRecording.ts CapturedStep[] -> RecordingStep[]
    learn/
      signature.ts         a step's shape, with the instance stripped out
      detectRepetition.ts  the strongest consecutive repeat in what was done
      generalize.ts        occurrences -> a process plus what varies
      instantiate.ts       a process plus inputs -> the steps for one run
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

Forty-six Playwright tests, run in CI on every push. Playwright is the
*harness*, not the delivery mechanism — the recorder still runs as an injected
page script driving the DOM with untrusted events, and Playwright only opens
the browser and reads results back out. The recorder itself has no runtime
dependencies at all.

The suite pins both halves of the thesis:

- **Learning happens by watching.** One pass teaches it nothing; two passes
  produce a process; three passes with a varying status produce two inputs
  instead of one. Opening three orders without doing anything to them is
  correctly ignored: opening things names them without changing them, which is
  reading. A drag is the exception — it both names what it acts on and moves
  it, so one drag repeated is a process with one input.
- **A learned process runs against inputs the user never touched**, changes
  only the orders it was handed, and substitutes the right row rather than the
  position it happened to learn — the case where a stale structural candidate
  would otherwise act confidently on the wrong thing.
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

### The robustness suite

`robustness.spec.ts` was written the other way round from the two above it.
Those were written alongside the design, so they mostly ask whether it does
what it was built to do. These were written by sitting down and trying to
break it, and most of them failed the first time they ran. What they have in
common is that they are all things a person would plausibly do on a first
sitting without being told not to: start recording half way down the list,
start it with an order already open, click a different column each pass, type
and backspace in the search box, ask for an order that isn't there, ask for
one hidden behind a filter, run the same process twice, run it against an
order near the bottom of a hundred and fifty.

Five real defects came out of that, and the worst of them was not in the
recorder at all: expanded, the panel covered the app's own Save button on a
1280×720 laptop, so the first thing a new user would do is press Record and
find the app dead. [DECISIONS.md](DECISIONS.md) has the rest.

---

## Status

The brief works end to end. Do something twice and it is noticed; the process
and its inputs are worked out without being declared; hand it the rest and it
carries them out — surviving a refactor along the way, asking for help when it
genuinely cannot resolve a step, and explaining afterwards what it did and how
it got there.

**The remaining ceiling is that a process takes a list, not a query.** You can
hand it `ORD-1002, ORD-1003, ORD-1004`. You cannot say "take the top ten
pending", because that needs the target set re-evaluated as it changes — an
order stops matching a pending filter the moment you process it — and steps
capture identity (*the element reading ORD-1006*) rather than a query
(*whatever is first right now*).

That is the loops-and-conditionals cut, and it is the honest boundary of what
this is. [DECISIONS.md](DECISIONS.md) covers why it was cut and what it costs.
