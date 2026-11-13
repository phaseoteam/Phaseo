/**
 * Finds the parts of the input that match a description and returns them as verbatim spans. Requires string input with no images, audio or video, and a route that supports locate, such as Perplexity Decider V1.3.
 */
export interface DecisionLocateQuestion {
  instructions: string;
  name?: string;
  type: "locate";
}
