export interface OpenAIDecisionChoiceQuestion {
  choices: {
    description?: string;
    value: string | boolean;
  }[];
  instructions: string;
  name?: string;
  type: "choice";
}
