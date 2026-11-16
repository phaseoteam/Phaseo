/**
 * Reads a number from the state with its unit and span, or null when it is not found. With range, returns an estimate (the median) and its p10 to p90 interval instead. Typed-answer routes only, such as Liquid d1.2.
 */
export interface DecisionNumberQuestion {
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  range?: number[];
  step?: number;
  type: "number";
  unit?: string;
}
