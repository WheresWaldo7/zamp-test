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

---

### Anchor a step to its row, not to the cell that was clicked

A step recorded "click the element reading $317.60" because that is where the
cursor landed. Aim at the same row's status cell on the next pass and the same
intention records as "click the element reading cancelled". The process then
believed its input was a price, and substituting into it produced a string
that exists nowhere on the page.

So a target now carries the repeated unit it sits inside — the row — and is
re-pointed by moving that scope rather than by rewriting selector text. Which
text identifies a row is worked out rather than assumed: an order id names one
row because it appears in exactly one, while "Pending" appears in dozens and a
company name in four.

A repeated unit has to be several same-shaped siblings, not just a selector
that matches twice somewhere. Without that, the order drawer — whose contents
also change between runs — reads as a list, and "click Save" becomes a per-run
input.

**Cost:** more captured per step, and a heuristic that is only as good as the
page's structure. A list whose rows share no unique field gets no scope and
falls back to the old behaviour.

---

### One repeated action is a process only if it is a drag

Dragging four items into order is four whole units of work, and requiring a
process to be at least two steps long described that as "two drags, done
twice" — then demanded two items every time it ran.

Nothing else qualifies. Opening one order after another names things without
changing them, which is reading. Typing in a filter box changes something
without naming it, and two searches in a row is how everyone uses a search
box; treating that as a procedure means announcing a process for ordinary
typing, and worse, it outranks the real multi-step work happening around it.

The rule is that the single action must both pick out what it acts on and
change it. Only a drag does both.

**Cost:** arbitrary-looking from outside, and wrong for any app where one
click is genuinely a unit of work — approving rows one at a time, say.

---

### A run of identical steps is never a multi-step process

Type, backspace, type again and you get four steps that look alike. A uniform
run matches a pattern of every length up to half its own, so it was read as
"two steps, done twice" — a process wanting two search terms, when one person
used one search box. Handing it two values typed the second into the same box,
so the first search never ran.

A stretch of identical steps has no shape of its own. The only honest reading
is a single step repeated, which is handled above and limited to drags.

**Cost:** a genuine two-step cycle made of one repeated action — type a term,
clear it, repeat — is invisible. The values have a rhythm the signatures do
not, and nothing looks at that.

---

### A run stops when it cannot find the thing it was given

Replaying a batch continues past a failed step, so one cosmetic miss does not
abandon the rest. That is wrong for the step that picks the instance: every
step after it means "do this to whatever is open now", so a mistyped id set a
status and saved whatever happened to be on screen.

That step is now marked, and failing it ends the run. It also no longer offers
to heal. Healing asks a human where an element went, which is right when the
app was rebuilt and wrong when the value came from that same human seconds
ago — it stalled unattended batches on a prompt nobody was there to answer,
and invited pointing at some other row.

**Cost:** a genuine selector break on that one step now fails instead of
asking for help.

---

### Fewer values than inputs means "leave the rest as recorded"

The tool sometimes counts something as an input that the person never varied
on purpose. A rating star reads "☆" or "★" depending on the order's score, so
clicking the same star on two differently-rated orders looks like picking two
different things.

Demanding a value for every input it thinks it saw turns a process that could
be run with an order number into one that cannot be run at all. Too many
values is still an error — that is a request that cannot be honoured, rather
than one that can be honoured in part.

**Cost:** an omitted input falls back to the recorded description, which may
be ambiguous. Omit the star and the rating lands on the wrong one.

---

### The panel starts collapsed

Expanded, it is around 370px tall against the right edge. On a 1280×720
laptop that is exactly where the detail pane's controls live — the status
select, the rating, and in the refactored variant the Save button itself.

The failure is not subtle and gives no clue: press Record, then find that Save
does nothing, with nothing to suggest the tool you just started is swallowing
the click. Replay was never affected, because it already treats the panel as
an overlay to see through; only the human was blocked.

There is no free corner. The table's id column is on the left and the pane is
on the right, so moving the panel only changes which one it breaks. Collapsed
it clears the pane while still showing the controls and the notice.

**Cost:** the step list — the most legible part of a replay — is one click
away instead of visible by default.
