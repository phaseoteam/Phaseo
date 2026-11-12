export interface ClassifierTestResponse {
  data: {
    answered?: boolean;
    cost_usd?: number;
    format?: "json_schema" | "decisions" | "json";
    labels?: {
      confidence?: number | null;
      key?: string;
      value?: string;
    }[];
    model?: string;
    request_id?: string | null;
  };
}
