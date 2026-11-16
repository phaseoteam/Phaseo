/**
 * Finds every passage of a kind in the state, such as each piece of personal data, with its position. Typed-answer routes only, such as Liquid d1.2.
 */
export interface DecisionSpansQuestion {
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "spans";
}
