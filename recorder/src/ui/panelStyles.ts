export const PANEL_STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }

  .panel {
    position: fixed;
    top: 10px;
    left: auto;
    right: 16px;
    width: 340px;
    display: flex;
    flex-direction: column;
    background: #14131a;
    color: #e8e6ef;
    border: 1px solid #2e2c3a;
    border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
    z-index: 2147483647;
    font-size: 12px;
  }

  /* Dragging by the header means the header itself must never start a text
     selection, or the pointer ends up highlighting the title instead. */
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid #2e2c3a;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .header:active { cursor: grabbing; }
  .panel[data-dragging="true"] { box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6); }

  .caret {
    width: 12px;
    color: #8f8aa3;
    transition: transform 120ms ease;
  }
  .panel[data-collapsed="true"] .caret { transform: rotate(-90deg); }

  .title { font-weight: 600; font-size: 12px; letter-spacing: 0.02em; flex: 1; }
  .count { color: #8f8aa3; font-variant-numeric: tabular-nums; }

  /* Collapsed keeps the controls reachable and drops only the step list, so
     the panel can be pushed out of the way without becoming useless. */
  .panel[data-collapsed="true"] .steps,
  .panel[data-collapsed="true"] .empty { display: none; }

  .controls { display: flex; gap: 6px; padding: 10px 12px; border-bottom: 1px solid #2e2c3a; }
  button {
    flex: 1;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #3a3750;
    background: #1e1c28;
    color: #e8e6ef;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }
  button:hover { background: #272433; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.primary { background: #7c3aed; border-color: #7c3aed; color: #fff; }
  button.primary:hover { background: #6d28d9; }
  button.recording { background: #dc2626; border-color: #dc2626; color: #fff; }

  /* Capped rather than free-growing: a long recording used to run the panel
     down the entire right edge of the viewport, burying whatever was under
     it. The list scrolls inside this instead. */
  .steps {
    max-height: 40vh;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .steps::-webkit-scrollbar { width: 8px; }
  .steps::-webkit-scrollbar-thumb { background: #3a3750; border-radius: 4px; }
  .empty { padding: 20px 12px; text-align: center; color: #6f6a85; }

  .step {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    gap: 8px;
    align-items: start;
    padding: 7px 8px;
    border-radius: 6px;
    background: #1a1824;
    border: 1px solid transparent;
  }
  .step[data-status="running"] { border-color: #7c3aed; background: #221c33; }
  .step[data-status="failed"] { border-color: #7f1d1d; background: #2a1618; }
  .step[data-status="healed"] { border-color: #a16207; background: #2a2412; }

  .idx { color: #6f6a85; font-variant-numeric: tabular-nums; text-align: right; }
  .body { min-width: 0; }
  .desc { line-height: 1.35; word-break: break-word; }
  .meta { margin-top: 3px; color: #8f8aa3; font-size: 10px; word-break: break-all; }
  .score { color: #6f6a85; }
  .err { margin-top: 3px; color: #f87171; font-size: 10px; }

  .status {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .status[data-status="pending"] { background: #2b2937; color: #8f8aa3; }
  .status[data-status="running"] { background: #7c3aed; color: #fff; }
  .status[data-status="done"] { background: #14532d; color: #86efac; }
  .status[data-status="healed"] { background: #78350f; color: #fcd34d; }
  .status[data-status="skipped"] { background: #2b2937; color: #a5a1b8; }
  .status[data-status="failed"] { background: #7f1d1d; color: #fca5a5; }

  /* Deliberately the loudest thing in the panel: it is the one part that
     speaks without being asked. */
  .learned {
    /* Trimmed deliberately rather than by eye: collapsed, the panel has to
       stay clear of the detail pane's controls, and the notice is the part
       that decides its height. */
    padding: 10px 12px;
    /* Bounded rather than tuned. The collapsed panel's height is header +
       controls + this, and it has to stay clear of whatever the app puts
       below it. Letting the notice grow to fit its text made that clearance
       a function of font metrics, which is not something to rely on. */
    max-height: 150px;
    overflow-y: auto;
    border-top: 1px solid #2e2c3a;
    background: #10231c;
    border-left: 3px solid #10b981;
  }
  .learned-title { font-weight: 600; color: #6ee7b7; margin-bottom: 4px; }
  .learned-name { color: #d1fae5; line-height: 1.35; margin-bottom: 6px; }
  .learned-vars { color: #8f8aa3; font-size: 10px; line-height: 1.4; margin-bottom: 6px; }
  .learned-vars b { color: #a7f3d0; font-weight: 600; }

  .learned-input {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #2f5f4d;
    background: #0b1a15;
    color: #d1fae5;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    resize: vertical;
  }
  .learned-input::placeholder { color: #4b6b5f; }
  .learned-error { color: #fca5a5; font-size: 10px; line-height: 1.4; margin-bottom: 8px; }
  .learned .primary { background: #059669; border-color: #059669; }
  .learned .primary:hover { background: #047857; }

  .heal {
    padding: 12px;
    border-top: 1px solid #2e2c3a;
    background: #241c33;
  }
  .heal-title { font-weight: 600; color: #ddd6fe; margin-bottom: 6px; }
  .heal-desc { color: #c4b5fd; line-height: 1.4; margin-bottom: 10px; }
  .heal-hint { color: #8f8aa3; font-size: 10px; }
  .hidden { display: none; }
`;
