export interface OpenAIDecisionScoreQuestion {
  instructions: string;
  levels: {
    description?: string;
    label: string;
  }[];
  name?: string;
  type: "score";
}
