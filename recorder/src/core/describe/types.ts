export type CandidateKind = 'role' | 'label' | 'text' | 'attr' | 'struct';

export interface SelectorCandidate {
  kind: CandidateKind;
  value: string;
  score: number;
}

export interface DescribedTarget {
  candidates: SelectorCandidate[];
  frame: string[];
  shadowPath: string[];
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
}
