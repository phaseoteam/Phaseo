import type { ProviderProfile } from "@shared/types";

const DESKTOP_IDENTITY_HEADERS: Record<string, string> = {
  "x-title": "AI Stats Desktop",
  "http-referer": "https://ai-stats.phaseo.app/desktop",
  "x-ai-stats-client": "desktop-studio"
};

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }

  return output;
}

function extractModelId(entry: unknown): string {
  if (typeof entry === "string") {
    return entry;
  }

  if (!entry || typeof entry !== "object") {
    return "";
  }

  const item = entry as Record<string, unknown>;
  const value =
    item.id ??
    item.model ??
    item.name ??
    item.model_id ??
    item.modelId ??
    item.internal_model_id ??
    item.internalModelId;
  return typeof value === "string" ? value : "";
}

function extractModels(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  const candidateArrays: unknown[] = [
    objectPayload.data,
    objectPayload.models,
    (objectPayload.result as Record<string, unknown> | undefined)?.data,
    (objectPayload.result as Record<string, unknown> | undefined)?.models
  ];

  for (const candidate of candidateArrays) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const models = uniqueNonEmpty(candidate.map(extractModelId));
    if (models.length > 0) {
      return models.sort((a, b) => a.localeCompare(b));
    }
  }

  return [];
}

export async function fetchProviderModels(provider: ProviderProfile): Promise<string[]> {
  if (provider.kind !== "openai-compatible") {
    return uniqueNonEmpty(provider.models);
  }

  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    ...DESKTOP_IDENTITY_HEADERS
  };

  if (provider.apiKey.trim()) {
    headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  }

  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway model sync failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const payload = await response.json();
  const models = extractModels(payload);
  if (models.length === 0) {
    throw new Error("Gateway returned no models from /models.");
  }

  return models;
}
