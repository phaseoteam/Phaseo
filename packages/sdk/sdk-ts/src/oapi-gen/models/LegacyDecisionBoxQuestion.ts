/**
 * Single bounding-box question for image-capable Box routes. No criteria.
 */
export interface LegacyDecisionBoxQuestion {
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  type: "box";
}
