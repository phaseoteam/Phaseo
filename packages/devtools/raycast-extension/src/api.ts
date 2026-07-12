import { Cache, getPreferenceValues } from "@raycast/api";
import type {
  CreditsResponse,
  AnalyticsUsageResponse,
  Preferences,
  ModelsResponse,
  OrganisationsResponse,
  ProvidersResponse,
  WorkspaceActivityResponse,
  ModelFilters,
} from "./types";

const DEFAULT_API_URL = "https://api.phaseo.app/v1";
const LEGACY_API_URL = "https://api.phaseo.ai/v1";
const apiCache = new Cache({ namespace: "phaseo-api" });

const CACHE_TTL = {
  models: 5 * 60 * 1000,
  catalogue: 60 * 60 * 1000,
  account: 30 * 1000,
  analytics: 5 * 60 * 1000,
} as const;

type CachedResponse<T> = {
  expiresAt: number;
  value: T;
};

function getCacheKey(apiKey: string, url: string): string {
  let hash = 2166136261;
  const input = `${apiKey}:${url}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class ManagementKeyRequiredError extends APIError {
  constructor(
    message = "A management API key is required for this command. Configure it in extension preferences.",
  ) {
    super(message);
    this.name = "ManagementKeyRequiredError";
  }
}

type APIKeyType = "gateway" | "management";

function getAPIConfig(keyType: APIKeyType): { apiKey: string; apiUrl: string } {
  const preferences = getPreferenceValues<Preferences>();
  const apiKey =
    keyType === "management"
      ? preferences.managementApiKey
      : preferences.apiKey;
  const configuredApiUrl = preferences.apiUrl?.trim().replace(/\/+$/, "");
  const apiUrl =
    configuredApiUrl === LEGACY_API_URL
      ? DEFAULT_API_URL
      : configuredApiUrl || DEFAULT_API_URL;

  if (!apiKey) {
    if (keyType === "management") {
      throw new ManagementKeyRequiredError();
    }

    throw new APIError(
      "API key is required. Please configure it in extension preferences.",
    );
  }

  if (keyType === "management" && !apiKey.startsWith("phaseo_v1_mk_")) {
    throw new ManagementKeyRequiredError(
      "Use a typed management key beginning with phaseo_v1_mk_. Gateway API keys beginning with phaseo_v1_sk_ cannot access these commands.",
    );
  }

  return { apiKey, apiUrl };
}

async function fetchAPI<T>(
  endpoint: string,
  params?: Record<string, string | string[]>,
  cacheTtlMs = 0,
  keyType: APIKeyType = "gateway",
): Promise<T> {
  const { apiKey, apiUrl } = getAPIConfig(keyType);

  // Build query string
  const queryParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => queryParams.append(key, v));
      } else {
        queryParams.append(key, value);
      }
    });
  }

  const url = `${apiUrl}${endpoint}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  const cacheKey = getCacheKey(apiKey, url);

  if (cacheTtlMs > 0) {
    const cached = apiCache.get(cacheKey);
    if (cached) {
      try {
        const entry = JSON.parse(cached) as CachedResponse<T>;
        if (entry.expiresAt > Date.now()) return entry.value;
      } catch {
        apiCache.remove(cacheKey);
      }
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new APIError(
          keyType === "management"
            ? "Invalid management API key. Please check your extension preferences."
            : "Invalid API key. Please check your extension preferences.",
          401,
        );
      }
      if (response.status === 403) {
        throw new APIError(
          keyType === "management"
            ? "Management API key does not have permission for this command."
            : "Access forbidden. Please check your API key permissions.",
          403,
        );
      }
      if (response.status === 404) {
        throw new APIError("Endpoint not found.", 404);
      }
      throw new APIError(
        `API request failed with status ${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      ok?: boolean;
      message?: string;
    } & T;

    if (data.ok === false) {
      throw new APIError(data.message || "API request failed");
    }

    if (cacheTtlMs > 0) {
      apiCache.set(
        cacheKey,
        JSON.stringify({ expiresAt: Date.now() + cacheTtlMs, value: data }),
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new APIError(`Network error: ${error.message}`);
    }
    throw new APIError("Unknown error occurred");
  }
}

export async function getModels(
  limit = 50,
  offset = 0,
  filters?: ModelFilters,
): Promise<ModelsResponse> {
  const params: Record<string, string | string[]> = {
    limit: String(limit),
    offset: String(offset),
  };

  if (filters) {
    if (filters.endpoints) params.endpoints = filters.endpoints;
    if (filters.organisation) params.organisation = filters.organisation;
    if (filters.input_types) params.input_types = filters.input_types;
    if (filters.output_types) params.output_types = filters.output_types;
    if (filters.params) params.params = filters.params;
  }

  return fetchAPI<ModelsResponse>("/models", params, CACHE_TTL.models);
}

export async function getOrganisations(
  limit = 50,
  offset = 0,
): Promise<OrganisationsResponse> {
  const params = {
    limit: String(limit),
    offset: String(offset),
  };

  return fetchAPI<OrganisationsResponse>(
    "/organisations",
    params,
    CACHE_TTL.catalogue,
  );
}

export async function getProviders(
  limit = 50,
  offset = 0,
): Promise<ProvidersResponse> {
  const params = {
    limit: String(limit),
    offset: String(offset),
  };

  return fetchAPI<ProvidersResponse>("/providers", params, CACHE_TTL.catalogue);
}

export async function getCredits(): Promise<CreditsResponse> {
  return fetchAPI<CreditsResponse>(
    "/credits",
    undefined,
    CACHE_TTL.account,
    "management",
  );
}

export async function getRecentActivity(
  days = 7,
  limit = 50,
  offset = 0,
): Promise<WorkspaceActivityResponse> {
  return fetchAPI<WorkspaceActivityResponse>(
    "/activity",
    { days: String(days), limit: String(limit), offset: String(offset) },
    CACHE_TTL.account,
    "management",
  );
}

export async function getUsageAnalytics(): Promise<AnalyticsUsageResponse> {
  return fetchAPI<AnalyticsUsageResponse>(
    "/analytics",
    undefined,
    CACHE_TTL.analytics,
    "management",
  );
}

export function clearAPICache(): void {
  apiCache.clear();
}
