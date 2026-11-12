export interface ObservabilityDestinationListResponse {
  data: {
    configured: boolean;
    created_at?: string | null;
    enabled: boolean;
    group_join: "and" | "or";
    id: string;
    include_cost_metadata?: boolean;
    include_generation_metadata?: boolean;
    include_identity_metadata?: boolean;
    include_request_context?: boolean;
    key_filters: {
      key_id: string;
      mode: "include" | "exclude";
    }[];
    name: string;
    privacy_mode: boolean;
    rule_groups: {
      match: "and" | "or";
      rules: {
        condition:
          | "equals"
          | "not_equals"
          | "contains"
          | "not_contains"
          | "starts_with"
          | "ends_with"
          | "exists"
          | "not_exists"
          | "matches_regex";
        field:
          | "model"
          | "provider"
          | "session_id"
          | "user_id"
          | "api_key_name"
          | "finish_reason"
          | "input"
          | "output"
          | "token_cost"
          | "total_cost"
          | "total_tokens"
          | "prompt_tokens"
          | "completion_tokens";
        value?: string | null;
      }[];
    }[];
    sampling_rate: number;
    type:
      | "arize"
      | "axiom"
      | "bigquery"
      | "braintrust"
      | "clickhouse"
      | "comet_opik"
      | "datadog"
      | "dynatrace"
      | "elastic"
      | "gcs"
      | "grafana_cloud"
      | "honeycomb"
      | "langfuse"
      | "langsmith"
      | "new_relic"
      | "otel_collector"
      | "posthog"
      | "r2"
      | "respan"
      | "s3"
      | "sentry"
      | "snowflake"
      | "wandb_weave"
      | "webhook";
    updated_at?: string | null;
    workspace_id: string;
  }[];
  total_count: number;
}
