// Capture-time representation. `target`/`to` still hold the live `Element`
// reference — turning that into ranked, serializable selector candidates is
// the DESCRIBE stage's job, not capture's. Capture only needs to know *what
// happened to which element*, cleanly and without noise.

export interface CapturedTarget {
  element: Element;
  /** Same-origin iframe chain, outermost first. Always [] in this project
   *  (cross-origin iframes are an explicit cut), but written generically. */
  frame: string[];
  /** Shadow host chain, outermost first, e.g. ["x-rating"]. */
  shadowPath: string[];
}

export type CapturedAction =
  | { type: 'click' }
  | { type: 'input'; value: string }
  | { type: 'change'; value: string }
  | { type: 'submit' }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'scroll'; scrollTop: number; scrollLeft: number }
  | { type: 'navigation'; url: string }
  | { type: 'hover' }
  | { type: 'drag'; to: CapturedTarget };

export interface CapturedStep {
  id: string;
  action: CapturedAction;
  /** null only for document-level actions with no single element, i.e. navigation. */
  target: CapturedTarget | null;
  createdAt: number;
  updatedAt: number;
}
