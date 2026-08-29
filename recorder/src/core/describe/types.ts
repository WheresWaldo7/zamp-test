export type CandidateKind = 'role' | 'label' | 'text' | 'attr' | 'struct';

export interface SelectorCandidate {
  kind: CandidateKind;
  value: string;
  score: number;
}

/** The repeated unit a target sits inside — a table row, a card, a list
 *  item — and how to tell this one from the others. Present only when the
 *  element really is inside a list of same-shaped siblings. */
export interface TargetScope {
  /** Selector matching every unit in the list. */
  container: string;
  /** Text that appears in exactly one unit, so it names this one. */
  text: string;
  /** The target's position among the unit's descendants, used when nothing
   *  about the element itself distinguishes it from the same cell in a
   *  different unit. */
  index: number;
}

export interface DescribedTarget {
  candidates: SelectorCandidate[];
  frame: string[];
  shadowPath: string[];
  scope?: TargetScope;
}

export type RecordingAction =
  | { type: 'click' }
  | { type: 'input'; value: string }
  | { type: 'change'; value: string }
  | { type: 'submit' }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'scroll'; scrollTop: number; scrollLeft: number }
  | { type: 'navigation'; url: string }
  | { type: 'hover' }
  | { type: 'drag'; to: DescribedTarget };

export interface RecordingStep {
  id: string;
  action: RecordingAction;
  target: DescribedTarget | null;
  createdAt: number;
  updatedAt: number;
  /** Replay skips rather than fails when this step's target can't be found —
   *  for things like a cookie banner that only shows up some of the time.
   *  Not inferred automatically; Stage 4's step-list UI is where a human
   *  marks a step this way. */
  optional?: boolean;
  /** This step's target came from a value the user supplied for this run —
   *  the step that decides *which* thing the run is about. Marked because a
   *  failure here means something different from any other step failing:
   *  not "the app moved", but "what you asked for isn't here". */
  instanceTarget?: boolean;
}
