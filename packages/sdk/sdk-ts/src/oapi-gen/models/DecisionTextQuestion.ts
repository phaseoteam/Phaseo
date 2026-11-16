/**
 * Reads a text value from the state and returns it with its span, or null when it is not found. Typed-answer routes only, such as Liquid d1.2.
 */
export interface DecisionTextQuestion {
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "text";
}
