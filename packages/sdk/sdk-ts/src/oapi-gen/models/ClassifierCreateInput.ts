export interface ClassifierCreateInput {
  description?: string | null;
  dimensions: {
    allow_other?: boolean;
    description?: string | null;
    key: string;
    multiple?: boolean;
    name?: string;
    values: {
      description?: string | null;
      value: string;
    }[];
  }[];
  enabled?: boolean;
  input_scope?: "prompt" | "prompt_and_response";
  instructions?: string;
  model: string;
  monthly_budget_usd?: number | null;
  name: string;
  sample_by?: "request" | "session";
  sample_rate?: number;
  scope?: {
    app_ids?: string[];
    key_ids?: string[];
    models?: string[];
  };
}
