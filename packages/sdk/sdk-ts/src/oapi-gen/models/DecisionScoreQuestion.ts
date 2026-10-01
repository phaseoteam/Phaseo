export interface DecisionScoreQuestion {
  criteria: string[];
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "score";
}
