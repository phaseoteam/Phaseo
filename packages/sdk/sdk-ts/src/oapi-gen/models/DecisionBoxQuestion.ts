/**
 * Phaseo extension for a single bounding box. Requires image input and a supporting route, such as Jev 1.14. No criteria or not-found result.
 */
export interface DecisionBoxQuestion {
  instructions: string;
  name?: string;
  type: "box";
}
