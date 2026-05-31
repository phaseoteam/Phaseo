import type { Client } from "../../runtime/client.js";

export type CreateWebhookEndpointParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    events?: string[];
    name?: string;
    url: string;
  };
};

/**
 * Creates a workspace-managed async webhook endpoint and returns the signing secret once.
 */
export async function createWebhookEndpoint(
  client: Client,
  args: CreateWebhookEndpointParams = {},
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events?: string[];
  hasSecret?: boolean;
  id?: string;
  name?: string;
  signing_secret?: string;
  status?: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url?: string;
  workspaceId?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/webhook-endpoints";
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events?: string[];
    hasSecret?: boolean;
    id?: string;
    name?: string;
    signing_secret?: string;
    status?: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url?: string;
    workspaceId?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWebhookEndpointParams = {
  path?: {
    endpoint_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Delete webhook endpoint
 */
export async function deleteWebhookEndpoint(
  client: Client,
  args: DeleteWebhookEndpointParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path?.endpoint_id))}`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWebhookEndpointParams = {
  path?: {
    endpoint_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Get webhook endpoint
 */
export async function getWebhookEndpoint(
  client: Client,
  args: GetWebhookEndpointParams = {},
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events?: string[];
  hasSecret?: boolean;
  id?: string;
  name?: string;
  status?: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url?: string;
  workspaceId?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path?.endpoint_id))}`;
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events?: string[];
    hasSecret?: boolean;
    id?: string;
    name?: string;
    status?: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url?: string;
    workspaceId?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWebhookEndpointsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists workspace-managed async webhook endpoints.
 */
export async function listWebhookEndpoints(
  client: Client,
  args: ListWebhookEndpointsParams = {},
): Promise<{
  data?: {
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events?: string[];
    hasSecret?: boolean;
    id?: string;
    name?: string;
    status?: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url?: string;
    workspaceId?: string;
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/webhook-endpoints";
  return client.request<{
    data?: {
      createdAt?: string | null;
      createdBy?: string | null;
      deletedAt?: string | null;
      events?: string[];
      hasSecret?: boolean;
      id?: string;
      name?: string;
      status?: "active" | "disabled" | "deleted";
      updatedAt?: string | null;
      url?: string;
      workspaceId?: string;
    }[];
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RotateWebhookEndpointSecretParams = {
  path?: {
    endpoint_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Rotate webhook endpoint secret
 */
export async function rotateWebhookEndpointSecret(
  client: Client,
  args: RotateWebhookEndpointSecretParams = {},
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events?: string[];
  hasSecret?: boolean;
  id?: string;
  name?: string;
  signing_secret?: string;
  status?: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url?: string;
  workspaceId?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path?.endpoint_id))}/rotate-secret`;
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events?: string[];
    hasSecret?: boolean;
    id?: string;
    name?: string;
    signing_secret?: string;
    status?: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url?: string;
    workspaceId?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWebhookEndpointParams = {
  path?: {
    endpoint_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    events?: string[];
    name?: string;
    status?: "active" | "disabled";
    url?: string;
  };
};

/**
 * Update webhook endpoint
 */
export async function updateWebhookEndpoint(
  client: Client,
  args: UpdateWebhookEndpointParams = {},
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events?: string[];
  hasSecret?: boolean;
  id?: string;
  name?: string;
  status?: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url?: string;
  workspaceId?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path?.endpoint_id))}`;
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events?: string[];
    hasSecret?: boolean;
    id?: string;
    name?: string;
    status?: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url?: string;
    workspaceId?: string;
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}
