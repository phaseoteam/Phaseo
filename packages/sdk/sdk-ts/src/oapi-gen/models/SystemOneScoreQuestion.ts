/**
 * Deprecated compatibility alias. Use DecisionScoreQuestion.
 */
export interface SystemOneScoreQuestion {
  criteria: string[];
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "score";
}
