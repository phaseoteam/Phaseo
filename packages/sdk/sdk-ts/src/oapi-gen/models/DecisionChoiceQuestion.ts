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
  multiple?: boolean;
  type: "choice";
}
