export interface DecisionScoreAnswer {
  confidence: number;
  name: string | null;
  probabilities: {
    label: string;
    probability: number;
    value: number;
  }[];
  score: number;
  type: "score";
}
