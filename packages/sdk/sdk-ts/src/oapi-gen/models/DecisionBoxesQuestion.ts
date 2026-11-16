/**
 * Returns a box around every instance of an object in the one image, with the count. Typed-answer routes only, such as Liquid d1.2.
 */
export interface DecisionBoxesQuestion {
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  max?: number;
  type: "boxes";
}
