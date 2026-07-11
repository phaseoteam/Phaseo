// API Response Types
export interface APIResponse<T> {
  ok: boolean;
  error?: string;
  message?: string;
  limit?: number;
  offset?: number;
  total?: number;
  data?: T;
}

// Model Types
export interface Model {
  model_id: string;
  name: string | null;
  release_date: string | null;
  status: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  organisation_colour: string | null;
  aliases: string[];
  endpoints: string[];
  input_types: string[];
  output_types: string[];
  providers: ProviderInfo[];
  pricing?: ModelPricing | null;
  top_provider?: ModelTopProvider | null;
}

export interface ProviderInfo {
  api_provider_id: string;
  params: string[];
}

export interface ModelPricing {
  prompt?: string | null;
  completion?: string | null;
  request?: string | null;
  image?: string | null;
}

export interface ModelTopProvider {
  context_length?: number | null;
  max_completion_tokens?: number | null;
}

// Organisation Types
export interface Organisation {
  organisation_id: string;
  name: string | null;
  country_code: string | null;
  description: string | null;
  colour: string | null;
}

// Provider Types
export interface Provider {
  api_provider_id: string;
  api_provider_name: string | null;
  description: string | null;
  link: string | null;
  country_code: string | null;
}

// API Response Types
export interface ModelsResponse {
  ok: boolean;
  limit: number;
  offset: number;
  total: number;
  models: Model[];
}

export interface OrganisationsResponse {
  ok: boolean;
  limit: number;
  offset: number;
  total: number;
  organisations: Organisation[];
}

export interface ProvidersResponse {
  ok: boolean;
  limit: number;
  offset: number;
  total: number;
  providers: Provider[];
}

export interface CreditsResponse {
  ok: true;
  credits: {
    remaining: number;
    balance_nanos: number;
    reserved_nanos: number;
    available_nanos: number;
    thirty_day_usage: number | null;
    thirty_day_requests: number;
  };
}

export interface WorkspaceActivityEntry {
  request_id: string | null;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  usage: Record<string, unknown> | null;
  cost_cents: number;
  latency_ms: number | null;
  timestamp: string | null;
}

export interface WorkspaceActivityResponse {
  ok: true;
  period_days: number;
  limit: number;
  offset: number;
  total: number;
  total_cost_cents: number;
  activity: WorkspaceActivityEntry[];
}

// Filter Types
export interface ModelFilters {
  endpoints?: string[];
  organisation?: string[];
  input_types?: string[];
  output_types?: string[];
  params?: string[];
}

// Preferences
export interface Preferences {
  apiKey: string;
  managementApiKey?: string;
  apiUrl?: string;
}
