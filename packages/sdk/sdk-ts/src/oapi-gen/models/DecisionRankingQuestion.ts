/**
 * Orders the options, best first, or returns only the best top_k. Every decision model answers it. The answer lists the ranked option keys and the probability that each option is the best one.
 */
export interface DecisionRankingQuestion {
  criteria: {
    [key: string]: string | null;
  };
  instructions:
    | string
    | {
        [key: string]: unknown;
      }
    | unknown[];
  top_k?: number;
  type: "ranking";
}
