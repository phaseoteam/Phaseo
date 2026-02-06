import { getPreferenceValues } from "@raycast/api";
import type {
  Preferences,
  ModelsResponse,
  OrganisationsResponse,
  ProvidersResponse,
  ModelFilters,
} from "./types";

class APIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "APIError";
  }
}

function getAPIConfig(): { apiKey: string; apiUrl: string } {
  const preferences = getPreferenceValues<Preferences>();
  const apiKey = preferences.apiKey;
  const apiUrl = preferences.apiUrl || "https://api.phaseo.app/v1";

  if (!apiKey) {
    throw new APIError("API key is required. Please configure it in extension preferences.");
  }

  return { apiKey, apiUrl };
}

async function fetchAPI<T>(endpoint: string, params?: Record<string, string | string[]>): Promise<T> {
  const { apiKey, apiUrl } = getAPIConfig();

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
        throw new APIError("Invalid API key. Please check your extension preferences.", 401);
      }
      if (response.status === 403) {
        throw new APIError("Access forbidden. Please check your API key permissions.", 403);
      }
      if (response.status === 404) {
        throw new APIError("Endpoint not found.", 404);
      }
      throw new APIError(`API request failed with status ${response.status}`, response.status);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new APIError(data.message || "API request failed");
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
  filters?: ModelFilters
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

  return fetchAPI<ModelsResponse>("/models", params);
}

export async function getOrganisations(limit = 50, offset = 0): Promise<OrganisationsResponse> {
  const params = {
    limit: String(limit),
    offset: String(offset),
  };

  return fetchAPI<OrganisationsResponse>("/organisations", params);
}

export async function getProviders(limit = 50, offset = 0): Promise<ProvidersResponse> {
  const params = {
    limit: String(limit),
    offset: String(offset),
  };

  return fetchAPI<ProvidersResponse>("/providers", params);
}

export { APIError };
