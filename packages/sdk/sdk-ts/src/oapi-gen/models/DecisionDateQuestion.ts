/**
 * Reads a date from the state and returns it in ISO 8601 with its span, or null when it is not found. Typed-answer routes only, such as Liquid d1.2.
 */
export interface DecisionDateQuestion {
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "date";
}
