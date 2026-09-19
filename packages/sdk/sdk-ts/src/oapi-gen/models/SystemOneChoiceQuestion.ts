/**
 * Deprecated compatibility alias. Use DecisionChoiceQuestion.
 */
export interface SystemOneChoiceQuestion {
  criteria: {
    [key: string]: string | null;
  };
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "choice";
}
