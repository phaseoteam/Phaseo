/**
 * Deprecated compatibility alias. Use DecisionInstructions.
 */
export type SystemOneInstructions =
  | string
  | {
      [key: string]: unknown;
    }
  | unknown[];
