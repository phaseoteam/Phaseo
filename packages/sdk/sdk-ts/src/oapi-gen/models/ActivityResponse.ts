export interface ActivityResponse {
  data: {
    byok_usage_inference: number;
    completion_tokens: number;
    date: string;
    endpoint_id: string;
    model: string;
    model_permaslug: string;
    prompt_tokens: number;
    provider_name: string;
    reasoning_tokens: number;
    requests: number;
    usage: number;
  }[];
}
