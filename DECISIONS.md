# Decisions

The ten choices that had a real alternative. For each one: what was decided,
what else was on the table, why this option won, and what it costs.

The code shows what was built. This records what was rejected, which is the
part that disappears otherwise.

---

## 1. Delivery: an injected page script, not Playwright or CDP

**Decision.** The recorder is a single self-contained bundle
(`recorder/dist/recorder.global.js`, ~86KB, no runtime dependencies) that runs
inside the page it observes. It listens with ordinary DOM event listeners and
acts by dispatching synthetic events.

**Alternative.** Drive the browser through the Chrome DevTools Protocol, either
directly or via Playwright.

**Why this one.** CDP is technically superior in almost every respect, but those aspects are precisely the substance
of this problem. Delegating them would have demonstrated the ability to call
someone else's library rather than the ability to solve the problem.

**Cost.** Every replayed action is an untrusted synthetic event. This puts a
permanent ceiling on what can be automated:

- CSS-only `:hover` menus (no synthetic event triggers `:hover`)
- The native `<select>` dropdown (drawn by the OS, no DOM representation)
- HTML5 drag and drop (requires a trusted `dragstart`)
- Clipboard access and file pickers

This is the single largest limitation in the project, and it is self-imposed.

**Where it lives.** `recorder/src/adapters/injected.ts` is the only file aware
of pages and panels. `app/vite.config.ts` injects the bundle as a `<script>`
tag; nothing under `app/src` imports or references the recorder.

---

## 2. Element identity: three ranked candidates per step, not one selector

**Decision.** Each recorded step stores its top three ways of finding its
target element, each with a numeric score. At replay they are tried best-first,
and any candidate that now matches zero elements or more than one is skipped
rather than used.

**Alternative.** Store one selector per step, as most record-and-replay tools
do.

**Why this one.** A single selector is one refactor away from being dead, and
its failure mode is bad in both directions: it either finds nothing, or it
finds a different element and the replay proceeds as though nothing is wrong.

Five strategies produce candidates, with these base weights:

| Strategy | Weight | Example                            |
| -------- | ------ | ---------------------------------- |
| `role`   | 100    | `combobox[name="Status"]`          |
| `label`  | 85     | `label:"Status"`                   |
| `text`   | 70     | `text:"ORD-1006"`                  |
| `attr`   | 55     | `[name="status"]`, `#id`, `.class` |
| `struct` | 20     | `div:nth-of-type(2) > span`        |

Three penalties are then applied:

- **−40** if the candidate matches more than one element at capture time
- **−20** if the value looks machine-generated
  (`/_[a-z0-9]{4,}_[a-z0-9]{2,}$/i`, which catches CSS Module names like
  `_row_11v6d_29`)
- **−5 per level of depth** for structural paths

The uniqueness penalty is what makes this a scoring _function_ rather than a
priority list. `text:"Acme Corp"` matches 56 table rows, so it scores 30 and
loses to a structural path scoring 15 that matches exactly one element. A
strategy-ordered list would have confidently chosen the ambiguous candidate.

Machine-generated class names are penalised rather than excluded. Excluding
them would have been simpler, but keeping them means the run log shows when a
step is resting on something fragile, and they can still win when genuinely
nothing better exists.

**Cost.** Capture is slower, because every candidate is checked for uniqueness
against the live DOM at record time.

**Evidence it is load-bearing.** Reducing the `role` strategy's weight from 100
to 10 fails four tests, including "the Save button is still found after moving
to a new parent".

**Where it lives.** `recorder/src/core/describe/strategies.ts` (the five
strategies), `describeElement.ts` (the scoring function, `TOP_N = 3`).

---

## 3. Scope: no loops, no conditionals

**Decision.** A recording is a linear list of steps. There is no "repeat for
each", no "only if", and no branching of any kind.

**Alternative.** Infer control flow from the recording — detect that the user
is iterating over a collection, and generalise to "for each row matching X".

**Why this one.** That is program synthesis rather than frontend engineering.
It is a different discipline, and pursuing it would have consumed the time the
selector-resilience and synchronisation work needed. Given a fixed time budget,
depth on the DOM problems was the better use of it.

**Cost.** This is the clearest functional ceiling in the project.

A learned process takes **a list, not a query**. You can hand it ten specific
order ids. You cannot express "filter to pending, take the top ten, mark them
processed", for two reasons:

1. Steps capture _identity_ — the element reading `ORD-1006` — rather than a
   question about the current state of the page.
2. The target set moves while the work happens. An order stops matching a
   "pending" filter the moment it is processed, so the tenth item is not the
   same row it was when the run started.

Parameterisation does not solve this. It varies values, not counts or queries.

---

## 4. Instance identity: anchor a step to its row, not to the cell clicked

**Decision.** When a target sits inside a repeated unit (a table row, a card, a
list item), the step records that unit and the text that identifies it, not
just the element the cursor landed on. Substituting a different instance moves
that scope rather than rewriting selector strings.

**Alternative.** Identify the instance by the text of the element that was
actually clicked.

**Why this one.** Nobody aims at the same column twice. Clicking a row's total
on one pass and its status cell on the next are the same intention — open that
order — but the recorded texts are `"$317.60"` and `"cancelled"`. Neither names
anything a user could ask for, and substituting into them produced selectors
for strings that exist nowhere on the page.

Three rules make the scope reliable:

- **A repeated unit is several same-shaped siblings**, not merely a selector
  that matches twice somewhere on the page. Without that constraint the order
  drawer — whose contents also change between runs — is mistaken for a list,
  and a fixed step like "click Save" becomes a per-run input.
- **The identifying text is derived, not assumed.** An order id identifies a
  row because it appears in exactly one; "Pending" appears in dozens; a company
  name in four. Checking which field is unique finds the id column without
  anyone having to declare which column that is.
- **Uniqueness is measured among siblings, not across the page.** The
  saved-view chip labelled "Pending" is unique among the five chips, even
  though the word appears in every pending row of the table.

The scope also records the target's index within its unit, so the same cell of
a different row can be found. Where an element has no other identity at all —
five identical rating stars — that index becomes the only handle, and if it
varies between passes it is offered to the user as a numeric input.

**Cost.** More data captured per step, and the heuristic is only as good as the
page's structure. A list whose rows share no unique field gets no scope and
falls back to candidate matching.

**Where it lives.** `recorder/src/core/describe/scope.ts`, resolved at replay
by `findScoped()` in `recorder/src/core/replay/findTarget.ts`.

---

## 5. Detection: what counts as a process

**Decision.** A process is a _consecutive_ repetition of at least two
occurrences. Four further rules constrain what qualifies.

**Alternative.** Count any repeated sequence anywhere in the session, and allow
any single repeated action to count.

**Why this one.** Each rule exists because its absence produced a specific
wrong answer.

**Consecutive only.** Someone grinding through a queue does the work back to
back. Requiring adjacency is what stops unrelated actions that merely recur
across a session from being read as a procedure.

**A single repeated action counts only if it is a drag.** Dragging four items
into order is four complete units of work, and requiring a process to be at
least two steps long described that as "two drags, done twice" — which then
demanded two items on every run. Nothing else qualifies: opening one order
after another names things without changing them (that is reading), and typing
in a filter box changes something without naming it. The test is whether the
single action both picks out what it acts on _and_ changes it. Only a drag does
both.

**A uniform run is never a multi-step process.** Typing, backspacing and typing
again produces four steps with identical signatures. A uniform run matches a
pattern of every length up to half its own, so it was read as "two steps, done
twice" — a process demanding two search terms, when one person used one search
box.

**Ties go to the shorter pattern.** Four passes of a three-step cycle cover
twelve steps either way: three steps four times, or six steps twice. Both fit
the recording; only one is the process. Preferring the longer taught the tool
that a process was two orders' worth of work, so a single input processed two
orders — the second being one nobody had named.

**How shapes are compared.** Steps are matched by _signature_: the shape of a
step with instance-specific detail removed. Role first, then structure with
positional indices stripped, then class. Visible text is deliberately never
used, because it is the most instance-specific thing on an element. This is the
central inversion in the project: **replay wants what is unique; learning wants
what is shared.** Scroll, hover, focus and blur are excluded from matching
entirely, since people navigate differently on every repetition.

**Cost.** The drag rule looks arbitrary from outside, and it is wrong for an
application where a single click genuinely is a unit of work — approving rows
one at a time, for instance.

**Where it lives.** `recorder/src/core/learn/signature.ts` (the shape),
`detectRepetition.ts` (`MIN_OCCURRENCES = 2`, `MIN_PATTERN_LENGTH = 1`,
`SELF_CONTAINED_ACTIONS = {drag}`), `generalize.ts` (occurrences → a process
plus its inputs).

---

## 6. Failure handling: a run stops when it cannot find its subject

**Decision.** Running a learned process continues past a failed step in
general, but not past the step that determines _which_ instance the run is
about. That step is marked during instantiation; if it fails, the run ends. It
is also excluded from the healing flow.

**Alternative.** Treat every step alike and let `continueOnFailure` apply
uniformly.

**Why this one.** Every step after the instance step is written as "do this to
whatever is currently open". Continuing past a failed row lookup therefore set
a status and saved whatever happened to be on screen — an order the user never
named. This is the most damaging class of bug in the project, and it was
reached by three separate routes before being closed properly.

Healing is excluded for the same reason. Healing asks a human where an element
went, which is the right question when the application has been rebuilt around
a step, and the wrong one when the value came from that same human seconds
earlier. Asking anyway stalls an unattended batch on a prompt nobody is present
to answer, and invites the user to point at some other row.

**Cost.** If that one step's selector genuinely breaks — the application
changed, rather than the input being wrong — it now fails instead of asking for
help.

**Where it lives.** `instanceTarget` is set in
`recorder/src/core/learn/instantiate.ts` and honoured in `replayStep.ts` and
`replayRecording.ts`.

---

## 7. Timing: describe elements inside the capture handler, not afterwards

**Decision.** Selector candidates are generated synchronously, inside the
capture-phase event handler, at the moment the event fires.

**Alternative.** Record raw events quickly and resolve selectors later in a
batch, which is the obvious design and was the first implementation.

**Why this one.** The deferred version was quietly wrong. The rating widget
removes and recreates its `<span>` stars on every click, so by the time a
deferred pass ran, the element it scored was a detached node no longer in the
document. Capture-phase handlers run _before_ the event reaches its target,
which is the one moment the DOM is guaranteed to still match what the user saw.

**Cost.** More work inside the event handler. Measurable, but small enough not
to change how the page behaves while recording — which matters, because a page
that behaves differently while being recorded produces a recording that does
not describe what the user did.

**Where it lives.** `recorder/src/core/describe/describeRecording.ts`, called
from the adapter's `recorder.onStep`.

---

## 8. Tooling UI: a closed shadow root, collapsed by default

**Decision.** The recorder's panel renders inside a closed shadow root
(`attachShadow({ mode: 'closed' })`) and starts collapsed.

**Alternative.** An open shadow root, or a normal DOM overlay.

**Why this one.** The panel has to live on the page it observes, which creates
a problem in both directions: the application's CSS could restyle the panel,
and the panel's CSS could leak out and alter the page being recorded. A closed
root prevents both.

Collapsed-by-default is a separate finding. Expanded, the panel is roughly
370px tall against the right edge. On a 1280×720 laptop viewport that is
exactly where the detail pane's controls sit — the status select, the rating,
and in the refactored variant the Save button itself. The failure gives no
clue: press Record, then find that Save does nothing, with nothing to suggest
the tool just started is intercepting the click. Replay was never affected,
because it already treats the panel as an overlay to see through when
hit-testing; only the human was blocked.

There is no free corner. The table's id column is on the left and the detail
pane is on the right, so relocating the panel only changes which one it breaks.
Collapsing it clears the pane while still showing the controls and the
"noticed a process" notice.

**Cost.** The panel is genuinely unreachable, including by test automation,
which cannot click into it. That forced a programmatic API
(`startRecording()`, `panel.collapse()`, and so on) as a parallel way in. The
step list is also one click away rather than visible by default.

**Where it lives.** `recorder/src/ui/panel.ts`, `panelStyles.ts`.

---

## 9. Test fixture: seeded data in the victim app

**Decision.** The 600 orders come from a fixed-seed pseudo-random generator
(`mulberry32(20260814)`) with a fixed reference date, rather than
`Math.random()`.

**Alternative.** Generate random data on each load.

**Why this one.** This appears to soften the test and does the opposite. A
virtualized list whose contents change on every reload cannot be replayed
against at all — there is no "same row" to find, so no recording could ever be
verified. Seeding is what makes the exercise possible rather than easier.

Everything else about the application is deliberately hostile to automation:
CSS Modules with generated class names, no `data-testid` anywhere, a
virtualized table rendering roughly 15 of 600 rows, an open shadow root (the
rating widget), a cookie banner appearing on about half of loads, and a
pointer-activated drag-and-drop list. There is also a `?v2` variant in which
every class name is renamed, rows are nested a level deeper, and the Save
button moves to a different parent. That variant is how selector resilience is
proven rather than asserted.

**Where it lives.** `app/src/data/generateOrders.ts`, `app/src/variant.ts`.

---

## 10. Known limitation: typed values are stored in the clear

**Decision.** Not fixed. Recorded here as a limitation.

**What happens.** Every value the user types is captured verbatim, persisted to
`localStorage` under `__recorder_recording`, and included in the exported JSON.
There is no exclusion list of any kind.

**Why it matters.** The victim application has no login, so this has never
arisen in practice. But the recorder is not built for this application — it
contains no app-specific code, and was verified working against an unrelated
page. Any real site with a password field would have that password captured and
persisted in plaintext.

**The fix, for completeness.** Skip capture for `input[type="password"]`, and
for any field whose `autocomplete` attribute is `current-password`,
`new-password`, `one-time-code`, or begins with `cc-`. Checking `type` alone is
insufficient: a "show password" toggle switches the field to `type="text"`, and
that is precisely when the user is typing into it. The `autocomplete` hint
survives that switch. The step should be dropped rather than recorded with a
blanked value, because a step that records "a secret was typed here" is still a
step replay will attempt, and it would enter the wrong value into a login form
and report success.

**Cost of leaving it.** This is the first thing a security-minded reviewer
checks. Fixing it would also mean that any flow containing a login cannot be
replayed unattended, since the recording will not contain the credential.

**Where it lives.** `recorder/src/core/recorder.ts` (`handleInput`),
`recorder/src/adapters/injected.ts` (persistence).
