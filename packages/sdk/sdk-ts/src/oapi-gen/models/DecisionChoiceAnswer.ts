export interface DecisionChoiceAnswer {
  choice: string | boolean;
  confidence: number;
  name: string | null;
  probabilities: {
    probability: number;
    value: string | boolean;
  }[];
  type: "choice";
}
