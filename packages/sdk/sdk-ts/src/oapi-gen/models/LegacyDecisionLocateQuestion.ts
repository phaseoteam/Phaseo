/**
 * Finds the parts of state that match a description and returns them as verbatim spans. Requires a string state with no images, and a route that supports locate, such as Perplexity Decider V1.3. No criteria.
 */
export interface LegacyDecisionLocateQuestion {
  instructions: string;
  type: "locate";
}
