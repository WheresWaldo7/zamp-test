# Decisions

The choices that had a real alternative, and what each one cost. Written down
because the code shows what was built, not what was rejected.

---

### Run as an injected page script, not through Playwright or CDP

A Chrome DevTools Protocol driver would have been easier and better in almost
every technical respect. It gives you trusted input, ready-made actionability
waiting, and selector generation for free.

That's exactly why I didn't use it. Those three things are the substance of
this problem. Delegating them would have produced a wrapper around someone
else's work and demonstrated only that I can call Playwright.

There's a structural argument too: CDP can drive replay, but *recording* still
needs in-page listeners regardless. So the project would have been split
across two runtimes and a message channel to buy a capability I'd already
decided to cut.

**Cost:** a real ceiling. Everything runs on untrusted synthetic events, so
CSS-only `:hover` menus, the native `<select>` popup, HTML5 drag-and-drop,
clipboard and file pickers are all permanently out of reach. This is the
single largest limitation in the project and it is self-imposed.

---

### Store several ranked ways to find an element, not one selector

Most recorders store one selector per step. One selector is one refactor from
dead, and when it dies you get silence or a wrong element.

Each step keeps its top three candidates, scored. At replay, they're tried
best-first, and any candidate that now matches zero or several elements is
skipped rather than trusted.

The part that makes this a scoring *function* rather than a priority list is
the uniqueness penalty. A `text:"Acme Corp"` candidate that matches 56 table
rows scores below a structural fallback that happens to match exactly one.
Ranking by strategy alone would confidently pick the ambiguous one.

**Cost:** capture is slower, because scoring checks each candidate's
uniqueness against the live DOM at record time.

---

### Score generated class names low instead of ignoring them

The app is styled with CSS Modules, so classes arrive as `_row_11v6d_29`.
Excluding them outright was tempting and would have been simpler.

Keeping them, penalised, means the reasoning stays visible in the output —
you can see that a step is resting on something fragile — and they can still
win when genuinely nothing better exists.

**Cost:** some steps do end up resting on a generated class, and only the
score tells you. That's why the run log reports which candidate won and where
it ranked.

---

### Describe elements during the capture handler, not afterwards

The obvious design is to record raw events fast and work out selectors later
in a batch. I built it that way first and it was quietly wrong.

The rating widget removes and recreates its star elements on every click, so
by the time a deferred pass ran, the element it scored was a detached node
that no longer existed on the page. Capture-phase handlers run *before* the
event reaches its target, which is the one moment the DOM is guaranteed to
still match what the user saw.

**Cost:** more work inside the event handler. Measurable, but small enough not
to change how the page behaves while recording — which matters, because a page
that behaves differently while being recorded produces a recording that is a
lie.

---

### Reload the page before replaying

Replay used to run against whatever state the page was already in. Recording a
flow and immediately replaying it started from the *end* of that flow — drawer
already open, filter already typed — so every step acted on a screen it was
never recorded against.

Nothing generic can undo an arbitrary app's state. A reload is the one reset
every web app agrees on.

It reloads the *current* URL rather than the one recording started on, so a v1
recording replayed against `?v2` stays on v2. That comparison is the entire
point of the exercise.

**Cost:** anything not recoverable from the URL is lost on the reset. Fine
here; a real app with deep in-memory state would need more.

---

### Put the recorder's panel in a closed shadow root

The panel has to be on the page it's observing. That's a problem in both
directions: the app's CSS could restyle the panel, and the panel's CSS could
leak out and change the page being recorded.

A closed shadow root prevents both. There's a pleasing symmetry in using the
exact feature the cut list documents as unreachable.

**Cost:** genuinely unreachable, including by test automation, which cannot
click into it. That forced a programmatic API (`startRecording()`,
`panel.collapse()`, and so on) as a parallel way in. Worth it, but it is extra
surface that exists only because of this choice.

---

### No loops, no conditionals

A recording is a straight line of steps. There's no "repeat for each" and no
"do this only if".

This was cut as program synthesis rather than frontend work — a different
discipline, and one that would have consumed the time the selector and
synchronisation work needed.

**Cost:** the clearest functional ceiling in the project. A task like *"filter
to pending, take the top ten, mark them processed"* cannot be expressed. You
can record ten specific orders by hand, but not "the top ten", because steps
capture identity (*the element reading ORD-1006*) rather than a query (*whatever
is first right now*). And the target set moves as you work — an order stops
matching a "pending" filter the moment you process it.

Parameterisation, the one plan item left undone, would not fix this. It varies
*values*, not counts or queries.

---

### Seed the fake order data

The 600 orders come from a fixed-seed generator rather than `Math.random()`.

This looks like softening the test and is the opposite. A virtualized list
whose contents change on every reload cannot be replayed against at all —
there is no "same row" to find. Seeding is what makes the exercise possible.

Everything else about the app is deliberately hostile: CSS Modules, no
`data-testid`, virtualization, an open shadow root, a cookie banner on half of
loads, and a pointer-activated drag list.

---

### Keep the replay engine ignorant of the UI

`core/` doesn't import anything from `ui/` and doesn't know a panel exists.
Anything visual arrives as an injected callback: `onHeal` to ask a human,
`onBeforeAction` to highlight, `isOverlay` to ignore the recorder's own chrome
during hit-testing.

This is what keeps the injected-script decision reversible. Wrapping the whole
thing in a browser extension is an adapter swap rather than a rewrite.

**Cost:** more indirection than a single-purpose tool needs.
