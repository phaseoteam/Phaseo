export type DecisionInstructions =
  | string
  | {
      [key: string]: unknown;
    }
  | unknown[];
