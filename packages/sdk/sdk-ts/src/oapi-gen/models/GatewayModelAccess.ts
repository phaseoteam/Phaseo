/**
 * Returned by /models/me only: what the caller's guardrails left out of the listing, before search and paging.
 */
export interface GatewayModelAccess {
  hidden_model_count: number;
  hidden_models: {
    id: string;
    name: string;
  }[];
  limited_model_count: number;
  restricted: boolean;
}
