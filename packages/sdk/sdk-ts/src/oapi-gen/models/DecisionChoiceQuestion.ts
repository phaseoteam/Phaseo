export interface DecisionChoiceQuestion {
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
