import type { Client } from "../../runtime/client.js";

export type AcceptWorkspaceInviteParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    token: string;
  };
};

/**
 * Asks to join the workspace an invite code belongs to. A workspace owner or admin then approves or rejects the request. OAuth token with workspaces:write required; management keys are refused because they belong to a workspace, not a person.
 */
export async function acceptWorkspaceInvite(
  client: Client,
  args: AcceptWorkspaceInviteParams = {},
): Promise<{
  data: {
    created_at?: string;
    id?: string;
    status?: string;
    workspace_id?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/invites/accept";
  return client.request<{
    data: {
      created_at?: string;
      id?: string;
      status?: string;
      workspace_id?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type AddGuardrailKeysParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    key_ids: string[];
  };
};

/**
 * Assigns one or more workspace API keys. Requires `guardrails:write`.
 */
export async function addGuardrailKeys(
  client: Client,
  args: AddGuardrailKeysParams,
): Promise<{
  added_count: number;
  data: {
    created_at?: string | null;
    key_id: string;
    name?: string | null;
    prefix?: string | null;
    status?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/keys/add`;
  return client.request<{
    added_count: number;
    data: {
      created_at?: string | null;
      key_id: string;
      name?: string | null;
      prefix?: string | null;
      status?: string | null;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type AddGuardrailMembersParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    user_ids: string[];
  };
};

/**
 * Assigns workspace members to a guardrail. Requires `guardrails:write`.
 */
export async function addGuardrailMembers(
  client: Client,
  args: AddGuardrailMembersParams,
): Promise<{
  added_count: number;
  data: {
    display_name?: string | null;
    joined_at?: string | null;
    role?: string | null;
    user_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/members/add`;
  return client.request<{
    added_count: number;
    data: {
      display_name?: string | null;
      joined_at?: string | null;
      role?: string | null;
      user_id: string;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type AddWorkspaceMembersParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    role?: "admin" | "member";
    user_ids: string[];
  };
};

/**
 * Adds existing users to a workspace with an admin or member role. Management API key required.
 */
export async function addWorkspaceMembers(
  client: Client,
  args: AddWorkspaceMembersParams,
): Promise<{
  added_count: number;
  data: {
    display_name?: string | null;
    joined_at?: string | null;
    role: "owner" | "admin" | "member";
    user_id: string;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/members/add`;
  return client.request<{
    added_count: number;
    data: {
      display_name?: string | null;
      joined_at?: string | null;
      role: "owner" | "admin" | "member";
      user_id: string;
      workspace_id: string;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ApplyPresetUpstreamVersionParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    version_id: string;
  };
};

/**
 * Applies a public upstream version to a local fork draft without publishing it.
 */
export async function applyPresetUpstreamVersion(
  client: Client,
  args: ApplyPresetUpstreamVersionParams,
): Promise<{
  data: {
    applied_to_draft: true;
    id: string;
    upstream_version_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/upstream`;
  return client.request<{
    data: {
      applied_to_draft: true;
      id: string;
      upstream_version_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ApproveWorkspaceJoinRequestParams = {
  path: {
    id: string;
    request_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Atomically approves a pending request and applies its invite role. Management API key required.
 */
export async function approveWorkspaceJoinRequest(
  client: Client,
  args: ApproveWorkspaceJoinRequestParams,
): Promise<{
  data: {
    created_at?: string;
    decided_at?: string | null;
    decided_by?: string | null;
    id: string;
    invite_id?: string | null;
    requester_user_id: string;
    status: "pending" | "approved" | "denied";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["request_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/join-requests/${encodeURIComponent(String(path["request_id"]))}/approve`;
  return client.request<{
    data: {
      created_at?: string;
      decided_at?: string | null;
      decided_by?: string | null;
      id: string;
      invite_id?: string | null;
      requester_user_id: string;
      status: "pending" | "approved" | "denied";
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CalculatePricingParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    endpoint: string;
    model: string;
    provider: string;
    usage: {
      [key: string]: unknown;
    };
  };
};

/**
 * Calculates price for a usage payload.
 */
export async function calculatePricing(
  client: Client,
  args: CalculatePricingParams = {},
): Promise<{
  ok?: boolean;
  pricing?: {
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/pricing/calculate";
  return client.request<{
    ok?: boolean;
    pricing?: {
      [key: string]: unknown;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelBatchParams = {
  path: {
    batch_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Cancels a batch request.
 */
export async function cancelBatch(
  client: Client,
  args: CancelBatchParams,
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    estimation_sample_size?: number | null;
    estimation_total_rows?: number | null;
    estimation_truncated?: boolean | null;
    finalized_at?: string | null;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
  };
  cancel_url?: string | null;
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalized_at?: string | null;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  metadata?: {};
  native_batch_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_file_id?: string;
  polling_url?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  progress?: number;
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  results_url?: string | null;
  session_id?: string;
  status?: string;
  usage?: {
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    requests?: number | null;
    total_tokens?: number | null;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["batch_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batches/${encodeURIComponent(String(path["batch_id"]))}/cancel`;
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelBatchAliasParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/{batch_id}/cancel.
 */
export async function cancelBatchAlias(
  client: Client,
  args: CancelBatchAliasParams,
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    estimation_sample_size?: number | null;
    estimation_total_rows?: number | null;
    estimation_truncated?: boolean | null;
    finalized_at?: string | null;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
  };
  cancel_url?: string | null;
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalized_at?: string | null;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  metadata?: {};
  native_batch_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_file_id?: string;
  polling_url?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  progress?: number;
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  results_url?: string | null;
  session_id?: string;
  status?: string;
  usage?: {
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    requests?: number | null;
    total_tokens?: number | null;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batch/${encodeURIComponent(String(path["id"]))}/cancel`;
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelVideoParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Video cancellation is currently disabled across all providers.
 */
export async function cancelVideo(
  client: Client,
  args: CancelVideoParams,
): Promise<unknown> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/videos/${encodeURIComponent(String(path["video_id"]))}/cancel`;
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelVideoAliasParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}/cancel.
 */
export async function cancelVideoAlias(
  client: Client,
  args: CancelVideoAliasParams,
): Promise<unknown> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path["video_id"]))}/cancel`;
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateAnthropicMessageParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
    context_management?: {
      edits?: {
        type: string;
        [key: string]: unknown;
      }[];
      [key: string]: unknown;
    };
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
    max_tokens: number;
    messages: (
      | {
          content:
            | string
            | {
                cache_control?: {
                  scope?: string;
                  ttl?: string;
                  type?: string;
                  [key: string]: unknown;
                };
                content?: string;
                id?: string;
                input?: {};
                name?: string;
                source?: {
                  data?: string;
                  media_type?: string;
                  type?: string;
                  url?: string;
                };
                text?: string;
                tool_use_id?: string;
                type?: "text" | "image" | "tool_use" | "tool_result";
              }[];
          role: "user" | "assistant";
        }
      | {
          content:
            | string
            | {
                cache_control?: {
                  scope?: string;
                  ttl?: string;
                  type?: string;
                  [key: string]: unknown;
                };
                text: string;
                type: "text";
              }[];
          role: "system";
        }
    )[];
    meta?: boolean;
    metadata?: {
      [key: string]: unknown;
    };
    model: string;
    models?: string[];
    plugins?: (
      | {
          enabled?: boolean;
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          exclude_domains?: string[];
          id: "web";
          include_domains?: string[];
          max_results?: number;
          max_uses?: number;
          search_context_size?: "low" | "medium" | "high";
        }
      | {
          allowed_domains?: string[];
          blocked_domains?: string[];
          enabled?: boolean;
          engine?:
            "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
          id: "web-fetch";
          max_content_tokens?: number;
          max_uses?: number;
        }
      | {
          enabled?: boolean;
          id: "response-healing";
          mode?: "safe" | "strict";
        }
    )[];
    prompt?: {
      id: string;
      variables?: {
        [key: string]: unknown;
      };
      version?: string;
    };
    prompt_cache_key?: string | null;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      anthropic?: {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
      };
      google?: {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
        cache_ttl?: string;
        cached_content?: string;
      };
      openai?: {
        context_management?: {
          compact_threshold?: number;
          type: "compaction";
        };
        prompt_cache_options?: {
          mode?: "implicit" | "explicit";
          ttl?: string;
          [key: string]: unknown;
        };
        prompt_cache_retention?: string;
      };
      xai?: {
        conversation_id?: string;
      };
    };
    reasoning?: {
      effort?:
        "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null;
      enabled?: boolean;
      max_tokens?: number;
      mode?: "standard" | "pro";
      summary?: "auto" | "concise" | "detailed";
    };
    service_tier?:
      | "standard"
      | "default"
      | "fast"
      | "ultrafast"
      | "priority"
      | "flex"
      | "batch"
      | "auto"
      | "standard_only";
    session_id?: string;
    stop_sequences?: string[];
    stream?: boolean;
    system?:
      | string
      | {
          cache_control?: {
            scope?: string;
            ttl?: string;
            type?: string;
            [key: string]: unknown;
          };
          text?: string;
          type?: "text";
        }[];
    temperature?: number;
    tool_choice?: {} | string;
    tools?: (
      | {
          async?: boolean;
          description?: string;
          input_schema?: {};
          name: string;
        }
      | {
          parameters?: {
            timezone?: string;
          };
          timezone?: string;
          type: "phaseo:datetime" | "gateway:datetime";
        }
      | {
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          include_highlights?: boolean;
          include_text?: boolean;
          language?: string;
          max_results?: number;
          page?: number;
          parameters?: {
            engine?:
              | "auto"
              | "native"
              | "exa"
              | "firecrawl"
              | "parallel"
              | "perplexity"
              | "tinyfish";
            include_highlights?: boolean;
            include_text?: boolean;
            language?: string;
            max_results?: number;
            page?: number;
          };
          type: "phaseo:web_search" | "gateway:web_search";
        }
      | {
          max_chars?: number;
          parameters?: {
            max_chars?: number;
          };
          type: "phaseo:web_fetch" | "gateway:web_fetch";
        }
      | {
          parameters?: {
            [key: string]: unknown;
          };
          type: "phaseo:subagent";
        }
      | {
          parameters?: {
            analysis_models: string[];
            model?: string;
            [key: string]: unknown;
          };
          type: "phaseo:fusion";
        }
      | {
          parameters?: {
            max_results?: number;
          };
          type: "phaseo:search_models";
        }
    )[];
    top_k?: number;
    top_p?: number;
    usage?: boolean;
    user?: string;
  };
};

/**
 * Creates a message using the Anthropic Messages API.
 */
export async function createAnthropicMessage(
  client: Client,
  args: CreateAnthropicMessageParams = {},
): Promise<{
  content?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
    content?: string;
    id?: string;
    input?: {};
    name?: string;
    source?: {
      data?: string;
      media_type?: string;
      type?: string;
      url?: string;
    };
    text?: string;
    tool_use_id?: string;
    type?: "text" | "image" | "tool_use" | "tool_result";
  }[];
  context_management?: {
    applied_edits?: {
      [key: string]: unknown;
    }[];
  };
  id?: string;
  model?: string;
  role?: "assistant";
  stop_reason?: string;
  stop_sequence?: string;
  type?: string;
  usage?: {
    cache_creation?: {
      ephemeral_1h_input_tokens?: number;
      ephemeral_5m_input_tokens?: number;
    };
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cost?: number;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
    input_tokens?: number;
    output_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/messages";
  return client.request<{
    content?: {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
      content?: string;
      id?: string;
      input?: {};
      name?: string;
      source?: {
        data?: string;
        media_type?: string;
        type?: string;
        url?: string;
      };
      text?: string;
      tool_use_id?: string;
      type?: "text" | "image" | "tool_use" | "tool_result";
    }[];
    context_management?: {
      applied_edits?: {
        [key: string]: unknown;
      }[];
    };
    id?: string;
    model?: string;
    role?: "assistant";
    stop_reason?: string;
    stop_sequence?: string;
    type?: string;
    usage?: {
      cache_creation?: {
        ephemeral_1h_input_tokens?: number;
        ephemeral_5m_input_tokens?: number;
      };
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cost?: number;
      cost_details?: {
        upstream_inference_cost?: number | null;
      };
      input_tokens?: number;
      output_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateApiKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    department_id?: string | null;
    disabled?: boolean;
    expires_at?: string | null;
    include_byok_in_limit?: boolean;
    limit?: number | null;
    limit_reset?: "daily" | "weekly" | "monthly";
    limits?: {
      daily?: {
        cost?: number | null;
        requests?: number | null;
      };
      monthly?: {
        cost?: number | null;
        requests?: number | null;
      };
      weekly?: {
        cost?: number | null;
        requests?: number | null;
      };
    };
    name: string;
    scopes?: string | string[];
    soft_blocked?: boolean;
    storage_locations?: string[];
    workspace_id?: string;
  };
};

/**
 * Creates a new API key in the authenticated workspace. Management API key required.
 */
export async function createApiKey(
  client: Client,
  args: CreateApiKeyParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    key: string;
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    storage_locations?: string[];
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  };
  key: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      creator_user_id: string | null;
      department_id?: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      include_byok_in_limit: boolean;
      ip_allowlist?: {
        address: string;
        label: string;
      }[];
      key: string;
      label: string | null;
      last_used_at: string | null;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: "daily" | "weekly" | "monthly" | null;
      limits: {
        daily: {
          cost: number | null;
          requests: number | null;
        };
        monthly: {
          cost: number | null;
          requests: number | null;
        };
        weekly: {
          cost: number | null;
          requests: number | null;
        };
      };
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      storage_locations?: string[];
      updated_at: string | null;
      usage: number;
      usage_daily: number;
      usage_details: {
        daily: {
          cost: number;
          requests: number;
        };
        monthly: {
          cost: number;
          requests: number;
        };
        total: {
          cost: number;
          requests: number;
        };
        weekly: {
          cost: number;
          requests: number;
        };
      };
      usage_monthly: number;
      usage_weekly: number;
      workspace_id: string;
    };
    key: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateBatchParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    completion_window?: string;
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    endpoint?:
      | "/v1/chat/completions"
      | "/v1/responses"
      | "/v1/messages"
      | "/v1/embeddings"
      | "/v1/generateContent";
    input_file_id?: string;
    items?: {
      [key: string]: unknown;
    }[];
    max_tokens?: number;
    metadata?: {
      [key: string]: unknown;
    };
    model?: string;
    prompts?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    requests?: {
      body: {
        [key: string]: unknown;
      };
      custom_id?: string;
      method?: "POST";
      url?: string;
    }[];
    session_id?: string;
    system?: string;
    temperature?: number;
    webhook?: {
      endpoint_id: string;
      events?: string[];
    };
    webhook_endpoint_id?: string;
  };
};

/**
 * Creates an async batch job and returns the upstream batch object. Batch creation supports OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, and Together AI through the requested `model`. The gateway infers the upstream provider from the model and also accepts `session_id` and `webhook` for observability and async notifications. Use `provider` only as an advanced routing constraint.
 */
export async function createBatch(
  client: Client,
  args: CreateBatchParams = {},
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    estimation_sample_size?: number | null;
    estimation_total_rows?: number | null;
    estimation_truncated?: boolean | null;
    finalized_at?: string | null;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
  };
  cancel_url?: string | null;
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalized_at?: string | null;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  metadata?: {};
  native_batch_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_file_id?: string;
  polling_url?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  progress?: number;
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  results_url?: string | null;
  session_id?: string;
  status?: string;
  usage?: {
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    requests?: number | null;
    total_tokens?: number | null;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches";
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateBatchAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    completion_window?: string;
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    endpoint?:
      | "/v1/chat/completions"
      | "/v1/responses"
      | "/v1/messages"
      | "/v1/embeddings"
      | "/v1/generateContent";
    input_file_id?: string;
    items?: {
      [key: string]: unknown;
    }[];
    max_tokens?: number;
    metadata?: {
      [key: string]: unknown;
    };
    model?: string;
    prompts?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    requests?: {
      body: {
        [key: string]: unknown;
      };
      custom_id?: string;
      method?: "POST";
      url?: string;
    }[];
    session_id?: string;
    system?: string;
    temperature?: number;
    webhook?: {
      endpoint_id: string;
      events?: string[];
    };
    webhook_endpoint_id?: string;
  };
};

/**
 * Alias of /batches.
 */
export async function createBatchAlias(
  client: Client,
  args: CreateBatchAliasParams = {},
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    estimation_sample_size?: number | null;
    estimation_total_rows?: number | null;
    estimation_truncated?: boolean | null;
    finalized_at?: string | null;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
  };
  cancel_url?: string | null;
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalized_at?: string | null;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  metadata?: {};
  native_batch_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_file_id?: string;
  polling_url?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  progress?: number;
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  results_url?: string | null;
  session_id?: string;
  status?: string;
  usage?: {
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    requests?: number | null;
    total_tokens?: number | null;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch";
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateChatCompletionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
    frequency_penalty?: number;
    image_config?: {
      aspect_ratio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      [key: string]: unknown;
    };
    include_reasoning?: boolean;
    logit_bias?: {
      [key: string]: number;
    };
    logprobs?: boolean;
    max_completion_tokens?: number;
    max_tokens?: number;
    max_tool_calls?: number;
    messages: {
      audio?: {
        id: string;
      } | null;
      audios?: {
        audio_url: {
          url: string;
        };
        format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
        mime_type?: string;
        type: "audio_url";
      }[];
      content?:
        | string
        | null
        | (
            | {
                cache_control?: {
                  scope?: string;
                  ttl?: string;
                  type?: string;
                  [key: string]: unknown;
                };
                prompt_cache_breakpoint?: {
                  mode?: "explicit";
                  ttl?: string;
                  [key: string]: unknown;
                };
                text: string;
                type: "text";
              }
            | {
                image_url: {
                  url?: string;
                };
                type: "image_url";
              }
            | {
                input_audio: {
                  data?: string;
                  format?:
                    "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
                };
                type: "input_audio";
              }
            | {
                type: "input_video";
                video_url: string;
              }
            | {
                cache_control?: {
                  scope?: string;
                  ttl?: string;
                  type?: string;
                  [key: string]: unknown;
                };
                file: {
                  file_data?: string;
                  file_id?: string;
                  filename?: string;
                };
                type: "file";
              }
            | {
                function: {
                  arguments?: string;
                  name?: string;
                };
                id: string;
                type: "tool_call";
              }
          )[];
      images?: {
        image_url: {
          url: string;
        };
        mime_type?: string;
        type: "image_url";
      }[];
      name?: string;
      reasoning?: string;
      reasoning_content?: string;
      reasoning_details?: {
        data?: string;
        format?: string;
        id?: string;
        index?: number;
        signature?: string;
        summary?: string;
        text?: string;
        type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
      }[];
      role: "system" | "developer" | "user" | "assistant" | "tool";
      tool_call_id?: string;
      tool_calls?: {
        function: {
          arguments?: string;
          description?: string;
          name?: string;
          parameters?: {};
        };
        id: string;
        type: "function";
      }[];
    }[];
    meta?: boolean;
    metadata?: {
      [key: string]: string;
    };
    modalities?: ("text" | "image" | "audio")[];
    model: string;
    models?: string[];
    parallel_tool_calls?: boolean;
    plugins?: (
      | {
          enabled?: boolean;
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          exclude_domains?: string[];
          id: "web";
          include_domains?: string[];
          max_results?: number;
          max_uses?: number;
          search_context_size?: "low" | "medium" | "high";
        }
      | {
          allowed_domains?: string[];
          blocked_domains?: string[];
          enabled?: boolean;
          engine?:
            "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
          id: "web-fetch";
          max_content_tokens?: number;
          max_uses?: number;
        }
      | {
          enabled?: boolean;
          id: "response-healing";
          mode?: "safe" | "strict";
        }
    )[];
    prediction?: {
      content:
        | string
        | {
            [key: string]: unknown;
          }[];
      type: "content";
    };
    presence_penalty?: number;
    prompt?: {
      id: string;
      variables?: {
        [key: string]: unknown;
      };
      version?: string;
    };
    prompt_cache_key?: string | null;
    prompt_cache_options?: {
      mode?: "implicit" | "explicit";
      ttl?: string;
      [key: string]: unknown;
    };
    prompt_cache_retention?: "in_memory" | "24h";
    provider?:
      | "openai"
      | "anthropic"
      | "google-ai-studio"
      | "gemini"
      | "mistral"
      | "x-ai"
      | "xai"
      | "groq"
      | "together"
      | {
          allow_fallbacks?: boolean | null;
          data_collection?: "allow" | "deny" | null;
          enforce_distillable_text?: boolean | null;
          ignore?: string[];
          include_alpha?: boolean;
          max_price?: {
            audio?: number | string;
            completion?: number | string;
            image?: number | string;
            prompt?: number | string;
            request?: number | string;
          };
          only?: string[];
          order?: string[];
          preferred_max_latency?:
            | number
            | {
                [key: string]: number;
              };
          preferred_min_throughput?:
            | number
            | {
                [key: string]: number;
              };
          quantizations?: string[] | null;
          require_parameters?: boolean | null;
          require_zero_data_retention?: boolean | null;
          required_data_region?: string | null;
          required_execution_region?: string | null;
          sort?:
            | string
            | {
                [key: string]: unknown;
              };
          zdr?: boolean | null;
        };
    provider_options?: {
      anthropic?: {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
      };
      google?: {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
        cache_ttl?: string;
        cached_content?: string;
      };
      openai?: {
        context_management?: {
          compact_threshold?: number;
          type: "compaction";
        };
        prompt_cache_options?: {
          mode?: "implicit" | "explicit";
          ttl?: string;
          [key: string]: unknown;
        };
        prompt_cache_retention?: string;
      };
      xai?: {
        conversation_id?: string;
      };
    };
    reasoning?: {
      effort?:
        | "none"
        | "instant"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh"
        | "max"
        | null;
      enabled?: boolean;
      max_tokens?: number;
      mode?: "standard" | "pro";
      summary?: "auto" | "concise" | "detailed";
    };
    reasoning_effort?:
      | "none"
      | "instant"
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | "xhigh"
      | "max";
    response_format?:
      | string
      | {
          schema?: {};
          type?: string;
        };
    safety_identifier?: string | null;
    seed?: number;
    service_tier?:
      | "standard"
      | "default"
      | "fast"
      | "ultrafast"
      | "priority"
      | "flex"
      | "batch"
      | "auto"
      | "scale"
      | null;
    session_id?: string;
    stop?: string | string[];
    store?: boolean;
    stream?: boolean;
    stream_options?: {};
    temperature?: number;
    tool_choice?:
      | "auto"
      | "none"
      | "required"
      | "phaseo:datetime"
      | "phaseo:web_search"
      | "phaseo:web_fetch"
      | "phaseo:subagent"
      | "phaseo:fusion"
      | "phaseo:search_models"
      | "gateway:datetime"
      | "gateway:web_search"
      | "gateway:web_fetch"
      | {};
    tools?: (
      | {
          async?: boolean;
          cache_control?: {
            scope?: string;
            ttl?: string;
            type?: string;
            [key: string]: unknown;
          };
          function: {
            description?: string;
            name: string;
            parameters: {};
          };
          type: "function";
          [key: string]: unknown;
        }
      | {
          parameters?: {
            timezone?: string;
          };
          timezone?: string;
          type: "phaseo:datetime" | "gateway:datetime";
        }
      | {
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          include_highlights?: boolean;
          include_text?: boolean;
          language?: string;
          max_results?: number;
          page?: number;
          parameters?: {
            engine?:
              | "auto"
              | "native"
              | "exa"
              | "firecrawl"
              | "parallel"
              | "perplexity"
              | "tinyfish";
            include_highlights?: boolean;
            include_text?: boolean;
            language?: string;
            max_results?: number;
            page?: number;
          };
          type: "phaseo:web_search" | "gateway:web_search";
        }
      | {
          max_chars?: number;
          parameters?: {
            max_chars?: number;
          };
          type: "phaseo:web_fetch" | "gateway:web_fetch";
        }
      | {
          parameters?: {
            [key: string]: unknown;
          };
          type: "phaseo:subagent";
        }
      | {
          parameters?: {
            analysis_models: string[];
            model?: string;
            [key: string]: unknown;
          };
          type: "phaseo:fusion";
        }
      | {
          parameters?: {
            max_results?: number;
          };
          type: "phaseo:search_models";
        }
      | {
          filters?: {
            allowed_domains?: string[];
          };
          search_context_size?: "low" | "medium" | "high";
          type:
            | "web_search"
            | "web_search_2025_08_26"
            | "web_search_preview"
            | "web_search_preview_2025_03_11";
          user_location?: {
            [key: string]: unknown;
          };
          [key: string]: unknown;
        }
    )[];
    top_logprobs?: number;
    top_p?: number;
    usage?: boolean;
    user?: string;
    user_id?: string;
  };
};

/**
 * Creates a completion for the chat message.
 */
export async function createChatCompletion(
  client: Client,
  args: CreateChatCompletionParams = {},
): Promise<{
  choices?: {
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter";
    index?: number;
    message?: {
      audio?: {
        data?: string;
        expires_at?: number;
        id?: string;
        transcript?: string;
      };
      audios?: {
        audio_url: {
          url: string;
        };
        format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
        mime_type?: string;
        type: "audio_url";
      }[];
      content?:
        | string
        | null
        | (
            | {
                cache_control?: {
                  scope?: string;
                  ttl?: string;
                  type?: string;
                  [key: string]: unknown;
                };
                prompt_cache_breakpoint?: {
                  mode?: "explicit";
                  ttl?: string;
                  [key: string]: unknown;
                };
                text: string;
                type: "text";
              }
            | {
                image_url: {
                  url?: string;
                };
                type: "image_url";
              }
            | {
                input_audio: {
                  data?: string;
                  format?:
                    "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
                };
                type: "input_audio";
              }
            | {
                type: "input_video";
                video_url: string;
              }
            | {
                cache_control?: {
                  scope?: string;
                  ttl?: string;
                  type?: string;
                  [key: string]: unknown;
                };
                file: {
                  file_data?: string;
                  file_id?: string;
                  filename?: string;
                };
                type: "file";
              }
            | {
                function: {
                  arguments?: string;
                  name?: string;
                };
                id: string;
                type: "tool_call";
              }
          )[];
      images?: {
        image_url: {
          url: string;
        };
        mime_type?: string;
        type: "image_url";
      }[];
      name?: string;
      reasoning?: string;
      reasoning_content?: string;
      reasoning_details?: {
        data?: string;
        format?: string;
        id?: string;
        index?: number;
        signature?: string;
        summary?: string;
        text?: string;
        type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
      }[];
      role: "system" | "developer" | "user" | "assistant" | "tool";
      tool_call_id?: string;
      tool_calls?: {
        function: {
          arguments?: string;
          description?: string;
          name?: string;
          parameters?: {};
        };
        id: string;
        type: "function";
      }[];
    };
  }[];
  created?: number;
  id?: string;
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  provider?: string;
  usage?: {
    completion_tokens?: number;
    cost?: number;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
    input_tokens?: number;
    input_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    output_tokens?: number;
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    server_tool_use?: {
      advisor_requests?: number;
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      search_models_requests?: number;
      subagent_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/chat/completions";
  return client.request<{
    choices?: {
      finish_reason?: "stop" | "length" | "tool_calls" | "content_filter";
      index?: number;
      message?: {
        audio?: {
          data?: string;
          expires_at?: number;
          id?: string;
          transcript?: string;
        };
        audios?: {
          audio_url: {
            url: string;
          };
          format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
          mime_type?: string;
          type: "audio_url";
        }[];
        content?:
          | string
          | null
          | (
              | {
                  cache_control?: {
                    scope?: string;
                    ttl?: string;
                    type?: string;
                    [key: string]: unknown;
                  };
                  prompt_cache_breakpoint?: {
                    mode?: "explicit";
                    ttl?: string;
                    [key: string]: unknown;
                  };
                  text: string;
                  type: "text";
                }
              | {
                  image_url: {
                    url?: string;
                  };
                  type: "image_url";
                }
              | {
                  input_audio: {
                    data?: string;
                    format?:
                      | "wav"
                      | "mp3"
                      | "flac"
                      | "m4a"
                      | "ogg"
                      | "pcm16"
                      | "pcm24";
                  };
                  type: "input_audio";
                }
              | {
                  type: "input_video";
                  video_url: string;
                }
              | {
                  cache_control?: {
                    scope?: string;
                    ttl?: string;
                    type?: string;
                    [key: string]: unknown;
                  };
                  file: {
                    file_data?: string;
                    file_id?: string;
                    filename?: string;
                  };
                  type: "file";
                }
              | {
                  function: {
                    arguments?: string;
                    name?: string;
                  };
                  id: string;
                  type: "tool_call";
                }
            )[];
        images?: {
          image_url: {
            url: string;
          };
          mime_type?: string;
          type: "image_url";
        }[];
        name?: string;
        reasoning?: string;
        reasoning_content?: string;
        reasoning_details?: {
          data?: string;
          format?: string;
          id?: string;
          index?: number;
          signature?: string;
          summary?: string;
          text?: string;
          type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
        }[];
        role: "system" | "developer" | "user" | "assistant" | "tool";
        tool_call_id?: string;
        tool_calls?: {
          function: {
            arguments?: string;
            description?: string;
            name?: string;
            parameters?: {};
          };
          id: string;
          type: "function";
        }[];
      };
    }[];
    created?: number;
    id?: string;
    model?: string;
    nativeResponseId?: string | null;
    object?: string;
    provider?: string;
    usage?: {
      completion_tokens?: number;
      cost?: number;
      cost_details?: {
        upstream_inference_cost?: number | null;
      };
      input_tokens?: number;
      input_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      output_tokens?: number;
      prompt_tokens?: number;
      prompt_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      server_tool_use?: {
        advisor_requests?: number;
        apply_patch_requests?: number;
        datetime_requests?: number;
        fusion_requests?: number;
        image_generation_requests?: number;
        search_models_requests?: number;
        subagent_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateClassifierParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
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
  };
};

/**
 * Creates a classifier. After each eligible request finishes, the chosen model places it in every dimension and the answers are added to the request as labels, so they can be filtered and grouped in logs, usage and analytics. Classification runs after the response is sent and is billed to the workspace at the model's normal price.
 */
export async function createClassifier(
  client: Client,
  args: CreateClassifierParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by: string | null;
    description: string | null;
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
    enabled: boolean;
    id: string;
    input_scope: "prompt" | "prompt_and_response";
    instructions: string;
    model: string;
    monthly_budget_usd: number | null;
    name: string;
    sample_by: "request" | "session";
    sample_rate: number;
    scope: {
      app_ids?: string[];
      key_ids?: string[];
      models?: string[];
    };
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/classifiers";
  return client.request<{
    data: {
      created_at: string;
      created_by: string | null;
      description: string | null;
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
      enabled: boolean;
      id: string;
      input_scope: "prompt" | "prompt_and_response";
      instructions: string;
      model: string;
      monthly_budget_usd: number | null;
      name: string;
      sample_by: "request" | "session";
      sample_rate: number;
      scope: {
        app_ids?: string[];
        key_ids?: string[];
        models?: string[];
      };
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateCreditTopupParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: {
    "Idempotency-Key"?: string;
  };
  body?: {
    amount_usd: number;
    idempotency_key?: string;
    workspace_id?: string;
  };
};

/**
 * Asks to add credits to the authenticated workspace. Needs the opt-in billing:write scope and workspace membership. Nothing is charged here. With a saved card, every workspace owner and admin is emailed a single-use link and one of them confirms or declines the charge. Without one, the response has a checkout_url where an owner or admin pays with a new card, which is saved for later top-ups. Amounts are $5 to $500. A workspace can have 5 pending top-ups, and each expires after 30 minutes.
 */
export async function createCreditTopup(
  client: Client,
  args: CreateCreditTopupParams = {},
): Promise<{
  ok: true;
  topup: {
    amount_cents: number;
    amount_usd: number;
    checkout_url: string | null;
    confirmation_recipients?: number;
    created_at: string;
    currency: string;
    decided_at: string | null;
    expires_at: string;
    final: boolean;
    flow: "checkout" | "saved_card";
    id: string;
    message: string;
    next_action:
      | "open_checkout_url"
      | "await_email_confirmation"
      | "await_payment"
      | null
      | null;
    paid_at: string | null;
    payment_method: {
      brand?: string | null;
      last4?: string | null;
    } | null;
    reason: string | null;
    status:
      "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/credits/topups";
  return client.request<{
    ok: true;
    topup: {
      amount_cents: number;
      amount_usd: number;
      checkout_url: string | null;
      confirmation_recipients?: number;
      created_at: string;
      currency: string;
      decided_at: string | null;
      expires_at: string;
      final: boolean;
      flow: "checkout" | "saved_card";
      id: string;
      message: string;
      next_action:
        | "open_checkout_url"
        | "await_email_confirmation"
        | "await_payment"
        | null
        | null;
      paid_at: string | null;
      payment_method: {
        brand?: string | null;
        last4?: string | null;
      } | null;
      reason: string | null;
      status:
        "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateDataContributionClassifierParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    categories: {
      [key: string]: string[];
    };
    description?: string | null;
    enabled?: boolean;
    instructions: string;
    model?: string;
    name: string;
    sampleRateBps?: number;
    serviceTier?: "standard" | "flex";
    slug?: string;
  };
};

/**
 * Creates a custom workspace classifier. Requires `settings:write` and feature access.
 */
export async function createDataContributionClassifier(
  client: Client,
  args: CreateDataContributionClassifierParams = {},
): Promise<{
  data: {
    categories: {
      [key: string]: string[];
    };
    created_at?: string | null;
    description?: string | null;
    enabled: boolean;
    id: string;
    instructions: string;
    kind: "starter" | "custom";
    model: string;
    name: string;
    sample_rate_bps: number;
    service_tier: "standard" | "flex";
    slug: string;
    updated_at?: string | null;
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/data-contribution/classifiers";
  return client.request<{
    data: {
      categories: {
        [key: string]: string[];
      };
      created_at?: string | null;
      description?: string | null;
      enabled: boolean;
      id: string;
      instructions: string;
      kind: "starter" | "custom";
      model: string;
      name: string;
      sample_rate_bps: number;
      service_tier: "standard" | "flex";
      slug: string;
      updated_at?: string | null;
      [key: string]: unknown;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateDepartmentBudgetParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    department_id: string;
    interval: "daily" | "weekly" | "monthly";
    limit: number;
  };
};

/**
 * Creates a daily, weekly, or monthly spend budget for one department. Once the department has used it, API-key requests that count toward the department return 429 key_limit_exceeded until the budget resets. Batch jobs, realtime sessions and OAuth requests are not blocked. If the budget check is briefly unavailable, requests are allowed rather than refused. Owners and admins get a mobile push at about 80% and at 100%.
 */
export async function createDepartmentBudget(
  client: Client,
  args: CreateDepartmentBudgetParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    department_id: string;
    department_name: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/department-budgets";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      department_id: string;
      department_name: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateDynamicRouteParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config: {
      cacheAwareRouting?: boolean;
      defaultAction?: {
        allowFallbacks?: boolean;
        model?: string;
        modelFallbacks?: string[];
        providerIgnore?: string[];
        providerOnly?: string[];
        providerOrder?: string[];
        routingMode?: "balanced" | "price" | "latency" | "throughput";
      };
      edges?: {
        id: string;
        source: string;
        sourceHandle?: string | null;
        target: string;
      }[];
      entryNodeId?: string | null;
      nodes?: {
        data: {
          [key: string]: unknown;
        };
        id: string;
        position?: {
          x: number;
          y: number;
        } | null;
        type:
          | "start"
          | "condition"
          | "percentage"
          | "model"
          | "rate_limit"
          | "budget_limit"
          | "end";
      }[];
      rules?: {
        action: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        condition: {
          field: "always" | "endpoint" | "model" | "session_id" | "metadata";
          metadataKey?: string | null;
          operator:
            "equals" | "not_equals" | "contains" | "starts_with" | "exists";
          value?: string | null;
        };
        enabled: boolean;
        id: string;
        name: string;
      }[];
      schemaVersion?: 2;
      sessionAffinity?: boolean;
    };
    description?: string | null;
    name: string;
    slug?: string;
    status?: "active" | "paused";
  };
};

/**
 * Creates a dynamic route with its first immutable configuration version.
 */
export async function createDynamicRoute(
  client: Client,
  args: CreateDynamicRouteParams = {},
): Promise<{
  data: {
    config: {
      cacheAwareRouting?: boolean;
      defaultAction?: {
        allowFallbacks?: boolean;
        model?: string;
        modelFallbacks?: string[];
        providerIgnore?: string[];
        providerOnly?: string[];
        providerOrder?: string[];
        routingMode?: "balanced" | "price" | "latency" | "throughput";
      };
      edges?: {
        id: string;
        source: string;
        sourceHandle?: string | null;
        target: string;
      }[];
      entryNodeId?: string | null;
      nodes?: {
        data: {
          [key: string]: unknown;
        };
        id: string;
        position?: {
          x: number;
          y: number;
        } | null;
        type:
          | "start"
          | "condition"
          | "percentage"
          | "model"
          | "rate_limit"
          | "budget_limit"
          | "end";
      }[];
      rules?: {
        action: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        condition: {
          field: "always" | "endpoint" | "model" | "session_id" | "metadata";
          metadataKey?: string | null;
          operator:
            "equals" | "not_equals" | "contains" | "starts_with" | "exists";
          value?: string | null;
        };
        enabled: boolean;
        id: string;
        name: string;
      }[];
      schemaVersion?: 2;
      sessionAffinity?: boolean;
    };
    created_at?: string | null;
    deployed_version?: number | null;
    description?: string | null;
    id: string;
    key_ids: string[];
    name: string;
    slug: string;
    status: "active" | "paused";
    updated_at?: string | null;
    version: number;
    versions: {
      created_at?: string | null;
      created_by?: string | null;
      status: "draft" | "deployed" | "superseded";
      version: number;
    }[];
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/dynamic-routes";
  return client.request<{
    data: {
      config: {
        cacheAwareRouting?: boolean;
        defaultAction?: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        edges?: {
          id: string;
          source: string;
          sourceHandle?: string | null;
          target: string;
        }[];
        entryNodeId?: string | null;
        nodes?: {
          data: {
            [key: string]: unknown;
          };
          id: string;
          position?: {
            x: number;
            y: number;
          } | null;
          type:
            | "start"
            | "condition"
            | "percentage"
            | "model"
            | "rate_limit"
            | "budget_limit"
            | "end";
        }[];
        rules?: {
          action: {
            allowFallbacks?: boolean;
            model?: string;
            modelFallbacks?: string[];
            providerIgnore?: string[];
            providerOnly?: string[];
            providerOrder?: string[];
            routingMode?: "balanced" | "price" | "latency" | "throughput";
          };
          condition: {
            field: "always" | "endpoint" | "model" | "session_id" | "metadata";
            metadataKey?: string | null;
            operator:
              "equals" | "not_equals" | "contains" | "starts_with" | "exists";
            value?: string | null;
          };
          enabled: boolean;
          id: string;
          name: string;
        }[];
        schemaVersion?: 2;
        sessionAffinity?: boolean;
      };
      created_at?: string | null;
      deployed_version?: number | null;
      description?: string | null;
      id: string;
      key_ids: string[];
      name: string;
      slug: string;
      status: "active" | "paused";
      updated_at?: string | null;
      version: number;
      versions: {
        created_at?: string | null;
        created_by?: string | null;
        status: "draft" | "deployed" | "superseded";
        version: number;
      }[];
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateEmbeddingParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    dimensions?: number;
    encoding_format?: "float" | "base64";
    input:
      | string
      | number[]
      | {
          content: (
            | {
                text: string;
                type: "text" | "input_text";
              }
            | {
                image_url?:
                  | string
                  | {
                      url: string;
                    };
                type: "image_url" | "input_image" | "image";
                url?:
                  | string
                  | {
                      url: string;
                    };
              }
            | {
                input_audio: {
                  data?: string;
                  format?: string;
                  url?: string;
                };
                type: "input_audio";
              }
            | {
                type: "input_video" | "video_url";
                url?:
                  | string
                  | {
                      url: string;
                    };
                video_url?:
                  | string
                  | {
                      url: string;
                    };
              }
          )[];
        }
      | (
          | string
          | number[]
          | {
              content: (
                | {
                    text: string;
                    type: "text" | "input_text";
                  }
                | {
                    image_url?:
                      | string
                      | {
                          url: string;
                        };
                    type: "image_url" | "input_image" | "image";
                    url?:
                      | string
                      | {
                          url: string;
                        };
                  }
                | {
                    input_audio: {
                      data?: string;
                      format?: string;
                      url?: string;
                    };
                    type: "input_audio";
                  }
                | {
                    type: "input_video" | "video_url";
                    url?:
                      | string
                      | {
                          url: string;
                        };
                    video_url?:
                      | string
                      | {
                          url: string;
                        };
                  }
              )[];
            }
        )[];
    model: string;
    models?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      google?: {
        task_type?: string;
        title?: string;
      };
      mistral?: {
        output_dtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
      };
    };
    user?: string;
  };
};

/**
 * Creates an embedding vector representing the input text.
 */
export async function createEmbedding(
  client: Client,
  args: CreateEmbeddingParams = {},
): Promise<{
  data?: {
    embedding?: number[];
    index?: number;
    object?: string;
  }[];
  model?: string;
  object?: string;
  usage?: {
    completion_tokens?: number;
    cost?: number;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
    input_tokens?: number;
    input_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    output_tokens?: number;
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    server_tool_use?: {
      advisor_requests?: number;
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      search_models_requests?: number;
      subagent_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/embeddings";
  return client.request<{
    data?: {
      embedding?: number[];
      index?: number;
      object?: string;
    }[];
    model?: string;
    object?: string;
    usage?: {
      completion_tokens?: number;
      cost?: number;
      cost_details?: {
        upstream_inference_cost?: number | null;
      };
      input_tokens?: number;
      input_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      output_tokens?: number;
      prompt_tokens?: number;
      prompt_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      server_tool_use?: {
        advisor_requests?: number;
        apply_patch_requests?: number;
        datetime_requests?: number;
        fusion_requests?: number;
        image_generation_requests?: number;
        search_models_requests?: number;
        subagent_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateExtractionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    fields: {
      [key: string]:
        | {
            instructions?: string;
            type: "text";
          }
        | {
            decimals?: number;
            instructions?: string;
            integer?: boolean;
            type: "number";
            unit?: string;
          }
        | {
            instructions?: string;
            type: "date";
          }
        | {
            instructions?: string;
            type: "time";
          }
        | {
            instructions?: string;
            type: "datetime";
          }
        | {
            decimals?: number;
            instructions?: string;
            integer?: boolean;
            type: "duration";
            unit?:
              | "seconds"
              | "minutes"
              | "hours"
              | "days"
              | "weeks"
              | "months"
              | "years";
          }
        | {
            decimals?: number;
            instructions?: string;
            items: "text" | "number" | "date";
            type: "list";
          };
    };
    images?: {
      base64: string;
      content_type: "image/png" | "image/jpeg" | "image/webp";
    }[];
    input: string;
    model: string;
    reference_date?: string;
  };
};

/**
 * Extracts text, numbers, dates, times, durations and typed lists from text or embedded images. Returns typed values and model-reported uncertainty. Estimates, forecasts, streaming and remote image URLs are not supported.
 */
export async function createExtraction(
  client: Client,
  args: CreateExtractionParams = {},
): Promise<{
  answers: {
    [key: string]:
      | {
          confidence: number;
          p_null: number;
          type: "text" | "date" | "time" | "datetime";
          value: string | null;
        }
      | {
          confidence: number;
          p_null: number;
          type: "number" | "duration";
          value: number | null;
        }
      | {
          confidence: number;
          type: "list";
          value: (string | number)[];
        };
  };
  model: string;
  truncated: boolean;
  usage: {
    input_tokens: number;
    output_tokens: 0;
    total_tokens: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/extractions";
  return client.request<{
    answers: {
      [key: string]:
        | {
            confidence: number;
            p_null: number;
            type: "text" | "date" | "time" | "datetime";
            value: string | null;
          }
        | {
            confidence: number;
            p_null: number;
            type: "number" | "duration";
            value: number | null;
          }
        | {
            confidence: number;
            type: "list";
            value: (string | number)[];
          };
    };
    model: string;
    truncated: boolean;
    usage: {
      input_tokens: number;
      output_tokens: 0;
      total_tokens: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateGatewayFeedbackParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    comment?: string;
    end_user_id?: string;
    metadata?: {
      [key: string]: unknown;
    };
    metadata_dimensions?: {
      [key: string]: unknown;
    };
    preset_id?: string;
    rating?: string;
    reason?: string;
    reason_tags?: string[];
    request_id?: string;
    score?: number;
    session_id?: string;
    source?: "api" | "user" | "system" | "import" | "test";
    test_run_id?: string;
  };
};

/**
 * Records feedback for a request, session, preset, or preset test run. Requires `feedback:write`.
 */
export async function createGatewayFeedback(
  client: Client,
  args: CreateGatewayFeedbackParams = {},
): Promise<{
  data: {
    comment: string | null;
    created_at: string;
    created_by_user_id: string | null;
    end_user_id: string | null;
    id: string;
    metadata: {
      [key: string]: unknown;
    };
    metadata_dimensions: {
      [key: string]: string;
    };
    preset_id: string | null;
    rating: string | null;
    reason: string | null;
    reason_tags: string[];
    request_id: string | null;
    score: number | null;
    session_id: string | null;
    source: "api" | "user" | "system" | "import" | "test";
    test_run_id: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/feedback";
  return client.request<{
    data: {
      comment: string | null;
      created_at: string;
      created_by_user_id: string | null;
      end_user_id: string | null;
      id: string;
      metadata: {
        [key: string]: unknown;
      };
      metadata_dimensions: {
        [key: string]: string;
      };
      preset_id: string | null;
      rating: string | null;
      reason: string | null;
      reason_tags: string[];
      request_id: string | null;
      score: number | null;
      session_id: string | null;
      source: "api" | "user" | "system" | "import" | "test";
      test_run_id: string | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateGatewayObservabilityEventParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    category?: "feedback" | "behavior" | "outcome" | "app" | "test" | "custom";
    end_user_id?: string;
    event_name: string;
    metadata?: {
      [key: string]: unknown;
    };
    metadata_dimensions?: {
      [key: string]: unknown;
    };
    numeric_value?: number;
    occurred_at?: string;
    preset_id?: string;
    request_id?: string;
    session_id?: string;
    source?: "api" | "user" | "system" | "import" | "test";
    test_run_id?: string;
    value?: unknown;
  };
};

/**
 * Records a custom outcome or behavior event linked to a request, session, preset, or test run. Requires `feedback:write`.
 */
export async function createGatewayObservabilityEvent(
  client: Client,
  args: CreateGatewayObservabilityEventParams = {},
): Promise<{
  data: {
    category: "feedback" | "behavior" | "outcome" | "app" | "test" | "custom";
    created_at: string;
    created_by_user_id: string | null;
    end_user_id: string | null;
    event_name: string;
    id: string;
    metadata: {
      [key: string]: unknown;
    };
    metadata_dimensions: {
      [key: string]: string;
    };
    numeric_value: number | null;
    occurred_at: string;
    preset_id: string | null;
    request_id: string | null;
    session_id: string | null;
    source: "api" | "user" | "system" | "import" | "test";
    test_run_id: string | null;
    value: unknown | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/events";
  return client.request<{
    data: {
      category: "feedback" | "behavior" | "outcome" | "app" | "test" | "custom";
      created_at: string;
      created_by_user_id: string | null;
      end_user_id: string | null;
      event_name: string;
      id: string;
      metadata: {
        [key: string]: unknown;
      };
      metadata_dimensions: {
        [key: string]: string;
      };
      numeric_value: number | null;
      occurred_at: string;
      preset_id: string | null;
      request_id: string | null;
      session_id: string | null;
      source: "api" | "user" | "system" | "import" | "test";
      test_run_id: string | null;
      value: unknown | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateGuardrailParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allowedApiModelIds?: string[];
    budgets?: {
      dailyCostNanos?: number | null;
      dailyRequests?: number | null;
      monthlyCostNanos?: number | null;
      monthlyRequests?: number | null;
      weeklyCostNanos?: number | null;
      weeklyRequests?: number | null;
    };
    description?: string | null;
    enabled?: boolean;
    modelRestrictionMode?: "none" | "allowlist" | "blocklist";
    name: string;
    privacyEnableFreeMayPublishPrompts?: boolean | null;
    privacyEnableFreeMayTrain?: boolean | null;
    privacyEnableInputOutputLogging?: boolean | null;
    privacyEnablePaidMayTrain?: boolean | null;
    privacyZdrOnly?: boolean | null;
    promptInjectionAction?: "flag" | "block";
    promptInjectionEnabled?: boolean;
    providerRestrictionEnforceAllowed?: boolean;
    providerRestrictionMode?: "none" | "allowlist" | "blocklist";
    providerRestrictionProviderIds?: string[];
    sensitiveInfoDefaultAction?: "flag" | "redact" | "block";
    sensitiveInfoEnabled?: boolean;
    sensitiveInfoRules?: {
      [key: string]: unknown;
    }[];
  };
};

/**
 * Creates a workspace guardrail. Requires `guardrails:write`.
 */
export async function createGuardrail(
  client: Client,
  args: CreateGuardrailParams = {},
): Promise<{
  data: {
    allowed_api_model_ids?: string[] | null;
    created_at?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    description?: string | null;
    enabled?: boolean | null;
    id: string;
    model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    prompt_injection_action?: "flag" | "block" | null;
    prompt_injection_enabled?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    sensitive_info_default_action?: "flag" | "redact" | "block" | null;
    sensitive_info_enabled?: boolean | null;
    sensitive_info_rules?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/guardrails";
  return client.request<{
    data: {
      allowed_api_model_ids?: string[] | null;
      created_at?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      description?: string | null;
      enabled?: boolean | null;
      id: string;
      model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      privacy_enable_free_may_publish_prompts?: boolean | null;
      privacy_enable_free_may_train?: boolean | null;
      privacy_enable_input_output_logging?: boolean | null;
      privacy_enable_paid_may_train?: boolean | null;
      privacy_zdr_only?: boolean | null;
      prompt_injection_action?: "flag" | "block" | null;
      prompt_injection_enabled?: boolean | null;
      provider_restriction_enforce_allowed?: boolean | null;
      provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      provider_restriction_provider_ids?: string[] | null;
      sensitive_info_default_action?: "flag" | "redact" | "block" | null;
      sensitive_info_enabled?: boolean | null;
      sensitive_info_rules?:
        | {
            [key: string]: unknown;
          }[]
        | null;
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateImageParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    background?: "transparent" | "opaque" | "auto";
    model: string;
    models?: string[];
    moderation?: "auto" | "low";
    n?: number;
    output_compression?: number;
    output_format?: "png" | "jpeg" | "webp";
    partial_images?: number;
    prompt: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    quality?: string;
    resolution?: string;
    response_format?: string;
    size?: string;
    stream?: boolean;
    style?: string;
    user?: string;
  };
};

/**
 * Creates an image given a prompt.
 */
export async function createImage(
  client: Client,
  args: CreateImageParams = {},
): Promise<{
  created?: number;
  data?: {
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/images/generations";
  return client.request<{
    created?: number;
    data?: {
      b64_json?: string;
      revised_prompt?: string;
      url?: string;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateImageEditParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    background?: "transparent" | "opaque" | "auto";
    image: string | string[];
    input_fidelity?: "high" | "low";
    mask?: string;
    meta?: boolean;
    model: string;
    models?: string[];
    moderation?: "auto" | "low";
    n?: number;
    output_compression?: number;
    output_format?: "png" | "jpeg" | "webp";
    partial_images?: number;
    prompt: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    quality?: "standard" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";
    resolution?: string;
    size?: string;
    stream?: boolean;
    usage?: boolean;
    user?: string;
  };
};

/**
 * Creates an edited or extended image given an original image and a prompt.
 */
export async function createImageEdit(
  client: Client,
  args: CreateImageEditParams = {},
): Promise<{
  created?: number;
  data?: {
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/images/edits";
  return client.request<{
    created?: number;
    data?: {
      b64_json?: string;
      revised_prompt?: string;
      url?: string;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateLiveSessionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    backend_model?: "openai/gpt-5.6-luna" | "openai/gpt-5.6-terra";
    backend_settings?: {
      instructions?: string;
      max_output_tokens?: number;
      parallel_tool_calls?: boolean;
      reasoning_effort?: "none" | "low" | "medium" | "high" | "xhigh";
      reasoning_summary?: "auto" | "concise" | "detailed";
      service_tier?: "default" | "flex" | "priority";
      tool_choice?: "auto" | "none" | "required";
      tools?: {
        description?: string;
        name: string;
        parameters?: {
          [key: string]: unknown;
        };
        strict?: boolean;
        type: "function";
      }[];
      verbosity?: "low" | "medium" | "high";
      web_search?: boolean;
    };
    instructions?: string;
    metadata?: {
      [key: string]: unknown;
    };
    model: "openai/gpt-live-1";
    provider: "openai";
    source?: "api" | "chat";
    type?: "live";
    voice?:
      | "alloy"
      | "ash"
      | "ballad"
      | "beacon"
      | "bossa"
      | "cedar"
      | "cinder"
      | "coral"
      | "delta"
      | "echo"
      | "gleam"
      | "marin"
      | "meridian"
      | "quartz"
      | "ripple"
      | "sage"
      | "shimmer"
      | "stone"
      | "tempo"
      | "verse"
      | "vesper"
      | "willow";
  };
};

/**
 * Creates a metered GPT Live voice session, which delegates reasoning to a Responses backend model, and returns relay connection details. Function tools run on your client: the relay forwards each `function_call` and accepts its `function_call_output` followed by `response.create`.
 */
export async function createLiveSession(
  client: Client,
  args: CreateLiveSessionParams = {},
): Promise<{
  billing?: {
    [key: string]: unknown;
  };
  client_secret?: string;
  connect?: {
    transport?: string;
    url?: string;
    [key: string]: unknown;
  };
  expires_at?: string | null;
  id?: string;
  idle_timeout_seconds?: number | null;
  max_duration_seconds?: number;
  model?: string;
  model_id?: string;
  provider?: string;
  session_id?: string;
  status?: string;
  voice?: string | null;
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/live/sessions";
  return client.request<{
    billing?: {
      [key: string]: unknown;
    };
    client_secret?: string;
    connect?: {
      transport?: string;
      url?: string;
      [key: string]: unknown;
    };
    expires_at?: string | null;
    id?: string;
    idle_timeout_seconds?: number | null;
    max_duration_seconds?: number;
    model?: string;
    model_id?: string;
    provider?: string;
    session_id?: string;
    status?: string;
    voice?: string | null;
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateManagementKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    expires_at?: string | null;
    name: string;
    paused?: boolean;
    scopes?: string | string[];
    template?: "read-only" | "read-write" | "full-control";
  };
};

/**
 * Creates a scoped management key. The raw key is returned once. Requires `management_keys:write`.
 */
export async function createManagementKey(
  client: Client,
  args: CreateManagementKeyParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    expires_at?: string | null;
    id: string;
    key: string;
    last_used_at?: string | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    prefix: string;
    scopes: string[];
    soft_blocked?: boolean | null;
    status: "active" | "paused";
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/management-keys";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      expires_at?: string | null;
      id: string;
      key: string;
      last_used_at?: string | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      prefix: string;
      scopes: string[];
      soft_blocked?: boolean | null;
      status: "active" | "paused";
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateModerationParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    input:
      | string
      | (
          | {
              text: string;
              type: "text";
            }
          | {
              image_url: {
                url?: string;
              };
              type: "image_url";
            }
        )[];
    meta?: boolean;
    model: string;
    models?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
  };
};

/**
 * Classifies if text violates OpenAI's usage policies.
 */
export async function createModeration(
  client: Client,
  args: CreateModerationParams = {},
): Promise<{
  id?: string;
  meta?: {
    generation_ms?: number;
    latency_ms?: number;
    [key: string]: unknown;
  };
  model?: string;
  results?: {
    categories?: {
      harassment?: boolean;
      "harassment/threatening"?: boolean;
      hate?: boolean;
      "hate/threatening"?: boolean;
      "self-harm"?: boolean;
      "self-harm/instructions"?: boolean;
      "self-harm/intent"?: boolean;
      sexual?: boolean;
      "sexual/minors"?: boolean;
      violence?: boolean;
      "violence/graphic"?: boolean;
    };
    category_scores?: {
      harassment?: number;
      "harassment/threatening"?: number;
      hate?: number;
      "hate/threatening"?: number;
      "self-harm"?: number;
      "self-harm/instructions"?: number;
      "self-harm/intent"?: number;
      sexual?: number;
      "sexual/minors"?: number;
      violence?: number;
      "violence/graphic"?: number;
    };
    flagged?: boolean;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/moderations";
  return client.request<{
    id?: string;
    meta?: {
      generation_ms?: number;
      latency_ms?: number;
      [key: string]: unknown;
    };
    model?: string;
    results?: {
      categories?: {
        harassment?: boolean;
        "harassment/threatening"?: boolean;
        hate?: boolean;
        "hate/threatening"?: boolean;
        "self-harm"?: boolean;
        "self-harm/instructions"?: boolean;
        "self-harm/intent"?: boolean;
        sexual?: boolean;
        "sexual/minors"?: boolean;
        violence?: boolean;
        "violence/graphic"?: boolean;
      };
      category_scores?: {
        harassment?: number;
        "harassment/threatening"?: number;
        hate?: number;
        "hate/threatening"?: number;
        "self-harm"?: number;
        "self-harm/instructions"?: number;
        "self-harm/intent"?: number;
        sexual?: number;
        "sexual/minors"?: number;
        violence?: number;
        "violence/graphic"?: number;
      };
      flagged?: boolean;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateOAuthClientParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allowed_scopes?: string[];
    client_type?: "public" | "confidential";
    description?: string;
    homepage_url?: string;
    logo_url?: string;
    name: string;
    privacy_policy_url?: string;
    redirect_uris: string[];
    terms_of_service_url?: string;
  };
};

/**
 * Creates a public or confidential OAuth application. Confidential secrets are returned once. Requires `oauth_clients:write` and the OAuth beta feature.
 */
export async function createOAuthClient(
  client: Client,
  args: CreateOAuthClientParams = {},
): Promise<{
  active_authorizations?: number;
  allowed_scopes?: string[];
  client_id: string;
  client_secret?: string | null;
  client_type: "public" | "confidential";
  created_at?: string | null;
  description?: string | null;
  homepage_url?: string | null;
  last_used_at?: string | null;
  logo_url?: string | null;
  name: string;
  privacy_policy_url?: string | null;
  redirect_uris: string[];
  requests_last_30d?: number;
  status: string;
  terms_of_service_url?: string | null;
  total_authorizations?: number;
  updated_at?: string | null;
  workspace_id: string;
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/oauth-clients";
  return client.request<{
    active_authorizations?: number;
    allowed_scopes?: string[];
    client_id: string;
    client_secret?: string | null;
    client_type: "public" | "confidential";
    created_at?: string | null;
    description?: string | null;
    homepage_url?: string | null;
    last_used_at?: string | null;
    logo_url?: string | null;
    name: string;
    privacy_policy_url?: string | null;
    redirect_uris: string[];
    requests_last_30d?: number;
    status: string;
    terms_of_service_url?: string | null;
    total_authorizations?: number;
    updated_at?: string | null;
    workspace_id: string;
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateObservabilityDestinationParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config: {
      [key: string]: string;
    };
    enabled?: boolean;
    group_join?: "and" | "or";
    include_cost_metadata?: boolean;
    include_generation_metadata?: boolean;
    include_identity_metadata?: boolean;
    include_request_context?: boolean;
    key_filters?: {
      key_id: string;
      mode: "include" | "exclude";
    }[];
    name: string;
    privacy_mode?: boolean;
    rule_groups?: {
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
    sampling_rate?: number;
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
  };
};

/**
 * Creates a destination with encrypted, write-only configuration. Management API key required.
 */
export async function createObservabilityDestination(
  client: Client,
  args: CreateObservabilityDestinationParams = {},
): Promise<{
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
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/observability/destinations";
  return client.request<{
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
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateOcrParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
    image: string;
    language?: string;
    model: string;
    models?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
  };
};

/**
 * Extracts text from an image using the requested model.
 */
export async function createOcr(
  client: Client,
  args: CreateOcrParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/ocr";
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateParseParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    document: {
      image_url: string;
      type: "image_url";
    };
    echo_upstream_request?: boolean;
    model: string;
    models?: string[];
    output_format?: "markdown" | "blocks";
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    routing?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
  };
};

/**
 * Parses a document image into Markdown or ordered content blocks. The current Cohere Parse API accepts remote image URLs and base64 image data URIs; PDF and file URL inputs are not yet supported.
 */
export async function createParse(
  client: Client,
  args: CreateParseParams = {},
): Promise<{
  id: string;
  meta?: {
    [key: string]: unknown;
  };
  model: string;
  object: "parse";
  pages: (
    | {
        index: number;
        markdown: {
          content: string;
          images?: {
            bounding_box: {
              bottom_right_x: number;
              bottom_right_y: number;
              top_left_x: number;
              top_left_y: number;
            };
            bounding_box_normalized: {
              bottom_right_x: number;
              bottom_right_y: number;
              top_left_x: number;
              top_left_y: number;
            };
            category: "other" | "flowchart" | "logo" | "signature";
            description: string;
            id: string;
          }[];
        };
        type: "markdown";
      }
    | {
        blocks: (
          | {
              text: {
                content: string;
              };
              type: "text";
            }
          | {
              image: {
                bounding_box: {
                  bottom_right_x: number;
                  bottom_right_y: number;
                  top_left_x: number;
                  top_left_y: number;
                };
                bounding_box_normalized: {
                  bottom_right_x: number;
                  bottom_right_y: number;
                  top_left_x: number;
                  top_left_y: number;
                };
                category: "other" | "flowchart" | "logo" | "signature";
                description: string;
                id: string;
              };
              type: "image";
            }
          | {
              table: {
                bounding_box: {
                  bottom_right_x: number;
                  bottom_right_y: number;
                  top_left_x: number;
                  top_left_y: number;
                };
                bounding_box_normalized: {
                  bottom_right_x: number;
                  bottom_right_y: number;
                  top_left_x: number;
                  top_left_y: number;
                };
                description?: string;
                html: string;
                title?: string;
                type: "html";
              };
              type: "table";
            }
        )[];
        index: number;
        type: "blocks";
      }
  )[];
  provider: string;
  usage?: {
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/parse";
  return client.request<{
    id: string;
    meta?: {
      [key: string]: unknown;
    };
    model: string;
    object: "parse";
    pages: (
      | {
          index: number;
          markdown: {
            content: string;
            images?: {
              bounding_box: {
                bottom_right_x: number;
                bottom_right_y: number;
                top_left_x: number;
                top_left_y: number;
              };
              bounding_box_normalized: {
                bottom_right_x: number;
                bottom_right_y: number;
                top_left_x: number;
                top_left_y: number;
              };
              category: "other" | "flowchart" | "logo" | "signature";
              description: string;
              id: string;
            }[];
          };
          type: "markdown";
        }
      | {
          blocks: (
            | {
                text: {
                  content: string;
                };
                type: "text";
              }
            | {
                image: {
                  bounding_box: {
                    bottom_right_x: number;
                    bottom_right_y: number;
                    top_left_x: number;
                    top_left_y: number;
                  };
                  bounding_box_normalized: {
                    bottom_right_x: number;
                    bottom_right_y: number;
                    top_left_x: number;
                    top_left_y: number;
                  };
                  category: "other" | "flowchart" | "logo" | "signature";
                  description: string;
                  id: string;
                };
                type: "image";
              }
            | {
                table: {
                  bounding_box: {
                    bottom_right_x: number;
                    bottom_right_y: number;
                    top_left_x: number;
                    top_left_y: number;
                  };
                  bounding_box_normalized: {
                    bottom_right_x: number;
                    bottom_right_y: number;
                    top_left_x: number;
                    top_left_y: number;
                  };
                  description?: string;
                  html: string;
                  title?: string;
                  type: "html";
                };
                type: "table";
              }
          )[];
          index: number;
          type: "blocks";
        }
    )[];
    provider: string;
    usage?: {
      [key: string]: unknown;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreatePresetParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config?: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    description?: string | null;
    name: string;
    slug?: string;
    versioning_method?: "sequential" | "semver" | "date";
    visibility?: "private" | "team" | "public";
  };
};

/**
 * Creates a workspace preset with durable prompt, routing, parameter, and plugin defaults.
 */
export async function createPreset(
  client: Client,
  args: CreatePresetParams = {},
): Promise<{
  canonical_model: string;
  data: {
    active_version_id?: string | null;
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at?: string | null;
    created_by?: string | null;
    description?: string | null;
    id: string;
    name: string;
    slug: string;
    source_preset_id?: string | null;
    source_preset_version_id?: string | null;
    updated_at?: string | null;
    upstream_version_id?: string | null;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/presets";
  return client.request<{
    canonical_model: string;
    data: {
      active_version_id?: string | null;
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at?: string | null;
      created_by?: string | null;
      description?: string | null;
      id: string;
      name: string;
      slug: string;
      source_preset_id?: string | null;
      source_preset_version_id?: string | null;
      updated_at?: string | null;
      upstream_version_id?: string | null;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreatePresetTestRunParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    baseline_preset_id?: string;
    completed_at?: string;
    config?: {
      [key: string]: unknown;
    };
    dataset_name?: string;
    description?: string;
    name?: string;
    preset_id?: string;
    started_at?: string;
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    summary?: {
      [key: string]: unknown;
    };
  };
};

/**
 * Creates a workspace test run for a preset or baseline comparison. Requires `feedback:write` and an owner or admin identity.
 */
export async function createPresetTestRun(
  client: Client,
  args: CreatePresetTestRunParams = {},
): Promise<{
  data: {
    baseline_preset_id: string | null;
    completed_at: string | null;
    config: {
      [key: string]: unknown;
    };
    created_at: string;
    created_by_user_id: string | null;
    dataset_name: string | null;
    description: string | null;
    id: string;
    name: string | null;
    preset_id: string | null;
    started_at: string | null;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    summary: {
      [key: string]: unknown;
    };
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/preset-test-runs";
  return client.request<{
    data: {
      baseline_preset_id: string | null;
      completed_at: string | null;
      config: {
        [key: string]: unknown;
      };
      created_at: string;
      created_by_user_id: string | null;
      dataset_name: string | null;
      description: string | null;
      id: string;
      name: string | null;
      preset_id: string | null;
      started_at: string | null;
      status: "pending" | "running" | "completed" | "failed" | "cancelled";
      summary: {
        [key: string]: unknown;
      };
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreatePrivateModelParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    base_url: string;
    context_length?: number | null;
    credential: string;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string;
    enabled?: boolean;
    host_provider_id?: string | null;
    max_output_tokens?: number | null;
    model_reference: string;
    name: string;
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses?: boolean;
    upstream_model_id: string;
  };
};

/**
 * Creates a workspace-only OpenAI-compatible model endpoint. Requires `private_models:write` and an owner or admin identity.
 */
export async function createPrivateModel(
  client: Client,
  args: CreatePrivateModelParams = {},
): Promise<{
  data: {
    base_url: string;
    catalog_model_id?: string | null;
    context_length?: number | null;
    created_at?: string | null;
    created_by?: string | null;
    credential_prefix?: string | null;
    credential_suffix?: string | null;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string | null;
    enabled: boolean;
    host_provider_id?: string | null;
    id: string;
    input_modalities?: string[];
    local_slug?: string;
    max_output_tokens?: number | null;
    model_id: string;
    name: string;
    output_modalities?: string[];
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses: boolean;
    updated_at?: string | null;
    upstream_model_id: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/private-models";
  return client.request<{
    data: {
      base_url: string;
      catalog_model_id?: string | null;
      context_length?: number | null;
      created_at?: string | null;
      created_by?: string | null;
      credential_prefix?: string | null;
      credential_suffix?: string | null;
      custom_provider_name?: string | null;
      custom_provider_url?: string | null;
      description?: string | null;
      enabled: boolean;
      host_provider_id?: string | null;
      id: string;
      input_modalities?: string[];
      local_slug?: string;
      max_output_tokens?: number | null;
      model_id: string;
      name: string;
      output_modalities?: string[];
      routing_policy?: "preferred" | "balanced" | "fallback";
      supports_responses: boolean;
      updated_at?: string | null;
      upstream_model_id: string;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateProviderCredentialParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allowed_api_key_ids?: string[];
    allowed_models?: string[];
    enabled?: boolean;
    key: string;
    name: string;
    provider: string;
    routing_mode?: "priority" | "fallback";
  };
};

/**
 * Encrypts and stores a write-only provider credential for the authenticated workspace.
 */
export async function createProviderCredential(
  client: Client,
  args: CreateProviderCredentialParams = {},
): Promise<{
  data: {
    allowed_api_key_ids?: string[];
    allowed_model_slugs?: string[];
    always_use?: boolean;
    created_at?: string | null;
    created_by?: string | null;
    disabled: boolean;
    enabled: boolean;
    error_message?: string | null;
    id: string;
    is_fallback: boolean;
    last_used_at?: string | null;
    last_verified_at?: string | null;
    name: string;
    prefix?: string | null;
    provider_id: string;
    routing_mode: "priority" | "fallback";
    sort_order: number;
    suffix?: string | null;
    verification_status?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/byok";
  return client.request<{
    data: {
      allowed_api_key_ids?: string[];
      allowed_model_slugs?: string[];
      always_use?: boolean;
      created_at?: string | null;
      created_by?: string | null;
      disabled: boolean;
      enabled: boolean;
      error_message?: string | null;
      id: string;
      is_fallback: boolean;
      last_used_at?: string | null;
      last_verified_at?: string | null;
      name: string;
      prefix?: string | null;
      provider_id: string;
      routing_mode: "priority" | "fallback";
      sort_order: number;
      suffix?: string | null;
      verification_status?: string | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRateLimitAssignmentParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    policy_id: string;
    target_id?: string;
    target_type:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
  };
};

/**
 * Applies a policy to one API key, workspace member, department, or guardrail, or sets the workspace default for each end user. Each target can have one policy. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function createRateLimitAssignment(
  client: Client,
  args: CreateRateLimitAssignmentParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    id: string;
    policy_id: string;
    target_id: string | null;
    target_type:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rate-limits/assignments";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      id: string;
      policy_id: string;
      target_id: string | null;
      target_type:
        "key" | "member" | "department" | "guardrail" | "end_user_default";
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRateLimitPolicyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    concurrent_requests?: number | null;
    description?: string | null;
    fail_closed?: boolean;
    name: string;
    requests_per_minute?: number | null;
    tokens_per_minute?: number | null;
  };
};

/**
 * Creates a named policy with requests per minute, tokens per minute, or concurrent request limits. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function createRateLimitPolicy(
  client: Client,
  args: CreateRateLimitPolicyParams = {},
): Promise<{
  data: {
    concurrent_requests: number | null;
    created_at: string;
    created_by?: string | null;
    description: string | null;
    fail_closed: boolean;
    id: string;
    name: string;
    requests_per_minute: number | null;
    tokens_per_minute: number | null;
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rate-limits/policies";
  return client.request<{
    data: {
      concurrent_requests: number | null;
      created_at: string;
      created_by?: string | null;
      description: string | null;
      fail_closed: boolean;
      id: string;
      name: string;
      requests_per_minute: number | null;
      tokens_per_minute: number | null;
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRealtimeSessionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    instructions?: string;
    metadata?: {
      [key: string]: unknown;
    };
    model: string;
    provider?: string;
    source?: "api" | "chat";
    type?: "realtime";
    voice?: string;
  };
};

/**
 * Creates a metered realtime audio session and returns relay connection details.
 */
export async function createRealtimeSession(
  client: Client,
  args: CreateRealtimeSessionParams = {},
): Promise<{
  billing?: {
    [key: string]: unknown;
  };
  client_secret?: string;
  connect?: {
    transport?: string;
    url?: string;
    [key: string]: unknown;
  };
  expires_at?: string | null;
  id?: string;
  idle_timeout_seconds?: number | null;
  max_duration_seconds?: number;
  model?: string;
  model_id?: string;
  provider?: string;
  session_id?: string;
  status?: string;
  voice?: string | null;
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/realtime/sessions";
  return client.request<{
    billing?: {
      [key: string]: unknown;
    };
    client_secret?: string;
    connect?: {
      transport?: string;
      url?: string;
      [key: string]: unknown;
    };
    expires_at?: string | null;
    id?: string;
    idle_timeout_seconds?: number | null;
    max_duration_seconds?: number;
    model?: string;
    model_id?: string;
    provider?: string;
    session_id?: string;
    status?: string;
    voice?: string | null;
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRerankParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    documents:
      | string[]
      | {
          [key: string]: unknown;
        }[];
    max_chunks_per_doc?: number;
    metadata?: {
      [key: string]: string;
    };
    model: string;
    models?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      [key: string]: unknown;
    };
    query: string;
    rank_fields?: string[];
    return_documents?: boolean;
    top_k?: number;
    top_n?: number;
    user?: string;
  };
};

/**
 * Reranks a list of documents against a query.
 */
export async function createRerank(
  client: Client,
  args: CreateRerankParams = {},
): Promise<{
  id?: string;
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  results?: {
    document?:
      | string
      | {
          [key: string]: unknown;
        };
    index?: number;
    relevance_score?: number;
  }[];
  usage?: {
    completion_tokens?: number;
    cost?: number;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
    input_tokens?: number;
    input_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    output_tokens?: number;
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    server_tool_use?: {
      advisor_requests?: number;
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      search_models_requests?: number;
      subagent_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rerank";
  return client.request<{
    id?: string;
    model?: string;
    nativeResponseId?: string | null;
    object?: string;
    results?: {
      document?:
        | string
        | {
            [key: string]: unknown;
          };
      index?: number;
      relevance_score?: number;
    }[];
    usage?: {
      completion_tokens?: number;
      cost?: number;
      cost_details?: {
        upstream_inference_cost?: number | null;
      };
      input_tokens?: number;
      input_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      output_tokens?: number;
      prompt_tokens?: number;
      prompt_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      server_tool_use?: {
        advisor_requests?: number;
        apply_patch_requests?: number;
        datetime_requests?: number;
        fusion_requests?: number;
        image_generation_requests?: number;
        search_models_requests?: number;
        subagent_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateResponseParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    background?: boolean;
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
    image_config?: {
      aspect_ratio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      [key: string]: unknown;
    };
    include?: string[];
    input:
      | string
      | {
          content?: string | {}[] | {};
          encrypted_content?: string;
          format?:
            | "anthropic-claude-v1"
            | "openai-responses-v1"
            | "azure-openai-responses-v1"
            | "xai-responses-v1"
            | "google-gemini-v1";
          id?: string;
          role?: "user" | "assistant" | "system" | "developer";
          signature?: string;
          summary?: {
            text: string;
            type: "summary_text";
          }[];
          type?: string;
        }[]
      | {};
    instructions?: string;
    max_output_tokens?: number;
    meta?: boolean;
    metadata?: {
      [key: string]: string;
    };
    modalities?: ("text" | "image" | "audio")[];
    model: string;
    models?: string[];
    parallel_tool_calls?: boolean;
    plugins?: (
      | {
          enabled?: boolean;
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          exclude_domains?: string[];
          id: "web";
          include_domains?: string[];
          max_results?: number;
          max_uses?: number;
          search_context_size?: "low" | "medium" | "high";
        }
      | {
          allowed_domains?: string[];
          blocked_domains?: string[];
          enabled?: boolean;
          engine?:
            "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
          id: "web-fetch";
          max_content_tokens?: number;
          max_uses?: number;
        }
      | {
          enabled?: boolean;
          id: "response-healing";
          mode?: "safe" | "strict";
        }
    )[];
    previous_response_id?: string;
    prompt?: {
      id: string;
      variables?: {
        [key: string]: unknown;
      };
      version?: string;
    };
    prompt_cache_key?: string | null;
    prompt_cache_options?: {
      mode?: "implicit" | "explicit";
      ttl?: string;
      [key: string]: unknown;
    };
    prompt_cache_retention?: "in_memory" | "24h";
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      anthropic?: {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
      };
      google?: {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
        cache_ttl?: string;
        cached_content?: string;
      };
      openai?: {
        context_management?: {
          compact_threshold?: number;
          type: "compaction";
        };
        prompt_cache_options?: {
          mode?: "implicit" | "explicit";
          ttl?: string;
          [key: string]: unknown;
        };
        prompt_cache_retention?: string;
      };
      xai?: {
        conversation_id?: string;
      };
    };
    reasoning?: {
      effort?:
        | "none"
        | "instant"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh"
        | "max"
        | null;
      enabled?: boolean;
      max_tokens?: number;
      mode?: "standard" | "pro";
      summary?: "auto" | "concise" | "detailed";
    };
    safety_identifier?: string | null;
    service_tier?:
      | "standard"
      | "default"
      | "fast"
      | "ultrafast"
      | "priority"
      | "flex"
      | "batch"
      | "auto"
      | "scale"
      | null;
    session_id?: string;
    store?: boolean;
    stream?: boolean;
    temperature?: number;
    text?: {};
    tool_choice?:
      | "auto"
      | "none"
      | "required"
      | "phaseo:datetime"
      | "phaseo:web_search"
      | "phaseo:web_fetch"
      | "phaseo:subagent"
      | "phaseo:fusion"
      | "phaseo:search_models"
      | "gateway:datetime"
      | "gateway:web_search"
      | "gateway:web_fetch"
      | {};
    tools?: (
      | {
          async?: boolean;
          cache_control?: {
            scope?: string;
            ttl?: string;
            type?: string;
            [key: string]: unknown;
          };
          function: {
            description?: string;
            name: string;
            parameters: {};
          };
          type: "function";
          [key: string]: unknown;
        }
      | {
          parameters?: {
            timezone?: string;
          };
          timezone?: string;
          type: "phaseo:datetime" | "gateway:datetime";
        }
      | {
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          include_highlights?: boolean;
          include_text?: boolean;
          language?: string;
          max_results?: number;
          page?: number;
          parameters?: {
            engine?:
              | "auto"
              | "native"
              | "exa"
              | "firecrawl"
              | "parallel"
              | "perplexity"
              | "tinyfish";
            include_highlights?: boolean;
            include_text?: boolean;
            language?: string;
            max_results?: number;
            page?: number;
          };
          type: "phaseo:web_search" | "gateway:web_search";
        }
      | {
          max_chars?: number;
          parameters?: {
            max_chars?: number;
          };
          type: "phaseo:web_fetch" | "gateway:web_fetch";
        }
      | {
          parameters?: {
            [key: string]: unknown;
          };
          type: "phaseo:subagent";
        }
      | {
          parameters?: {
            analysis_models: string[];
            model?: string;
            [key: string]: unknown;
          };
          type: "phaseo:fusion";
        }
      | {
          parameters?: {
            max_results?: number;
          };
          type: "phaseo:search_models";
        }
      | {
          filters?: {
            allowed_domains?: string[];
          };
          search_context_size?: "low" | "medium" | "high";
          type:
            | "web_search"
            | "web_search_2025_08_26"
            | "web_search_preview"
            | "web_search_preview_2025_03_11";
          user_location?: {
            [key: string]: unknown;
          };
          [key: string]: unknown;
        }
    )[];
    top_p?: number;
    truncation?: "auto" | "disabled";
    usage?: boolean;
    user?: string;
  };
};

/**
 * Creates a response using the Responses API.
 */
export async function createResponse(
  client: Client,
  args: CreateResponseParams = {},
): Promise<{
  content?: {}[];
  cost_cents?: number;
  cost_nanos?: number;
  created?: number;
  currency?: string;
  finish_reason?: string | null;
  id?: string;
  meta?: {
    [key: string]: unknown;
  };
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  output?: {
    arguments?: string;
    call_id?: string;
    content?: (
      | {
          annotations?: {}[];
          text: string;
          type: "output_text";
        }
      | {
          text: string;
          type: "reasoning_text";
        }
      | {
          b64_json?: string;
          image_url?: {
            url?: string;
          };
          mime_type?: string;
          type: "output_image";
        }
      | {
          audio_url?: {
            url?: string;
          };
          b64_json?: string;
          format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
          mime_type?: string;
          type: "output_audio";
        }
    )[];
    encrypted_content?: string;
    id?: string;
    name?: string;
    role?: string;
    summary?: {
      text: string;
      type: "summary_text";
    }[];
    type?: string;
  }[];
  output_items?: {
    arguments?: string;
    call_id?: string;
    content?: (
      | {
          annotations?: {}[];
          text: string;
          type: "output_text";
        }
      | {
          text: string;
          type: "reasoning_text";
        }
      | {
          b64_json?: string;
          image_url?: {
            url?: string;
          };
          mime_type?: string;
          type: "output_image";
        }
      | {
          audio_url?: {
            url?: string;
          };
          b64_json?: string;
          format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
          mime_type?: string;
          type: "output_audio";
        }
    )[];
    encrypted_content?: string;
    id?: string;
    name?: string;
    role?: string;
    summary?: {
      text: string;
      type: "summary_text";
    }[];
    type?: string;
  }[];
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  provider_id?: string;
  role?: string;
  status?: "completed" | "failed" | "incomplete";
  stop_reason?: string;
  type?: string;
  usage?: {
    completion_tokens?: number;
    cost?: number;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
    input_tokens?: number;
    input_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    output_tokens?: number;
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    server_tool_use?: {
      advisor_requests?: number;
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      search_models_requests?: number;
      subagent_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/responses";
  return client.request<{
    content?: {}[];
    cost_cents?: number;
    cost_nanos?: number;
    created?: number;
    currency?: string;
    finish_reason?: string | null;
    id?: string;
    meta?: {
      [key: string]: unknown;
    };
    model?: string;
    nativeResponseId?: string | null;
    object?: string;
    output?: {
      arguments?: string;
      call_id?: string;
      content?: (
        | {
            annotations?: {}[];
            text: string;
            type: "output_text";
          }
        | {
            text: string;
            type: "reasoning_text";
          }
        | {
            b64_json?: string;
            image_url?: {
              url?: string;
            };
            mime_type?: string;
            type: "output_image";
          }
        | {
            audio_url?: {
              url?: string;
            };
            b64_json?: string;
            format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
            mime_type?: string;
            type: "output_audio";
          }
      )[];
      encrypted_content?: string;
      id?: string;
      name?: string;
      role?: string;
      summary?: {
        text: string;
        type: "summary_text";
      }[];
      type?: string;
    }[];
    output_items?: {
      arguments?: string;
      call_id?: string;
      content?: (
        | {
            annotations?: {}[];
            text: string;
            type: "output_text";
          }
        | {
            text: string;
            type: "reasoning_text";
          }
        | {
            b64_json?: string;
            image_url?: {
              url?: string;
            };
            mime_type?: string;
            type: "output_image";
          }
        | {
            audio_url?: {
              url?: string;
            };
            b64_json?: string;
            format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
            mime_type?: string;
            type: "output_audio";
          }
      )[];
      encrypted_content?: string;
      id?: string;
      name?: string;
      role?: string;
      summary?: {
        text: string;
        type: "summary_text";
      }[];
      type?: string;
    }[];
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    provider?: string;
    provider_id?: string;
    role?: string;
    status?: "completed" | "failed" | "incomplete";
    stop_reason?: string;
    type?: string;
    usage?: {
      completion_tokens?: number;
      cost?: number;
      cost_details?: {
        upstream_inference_cost?: number | null;
      };
      input_tokens?: number;
      input_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      output_tokens?: number;
      prompt_tokens?: number;
      prompt_tokens_details?: {
        cache_write_tokens?: number;
        cache_write_tokens_details?: {
          ttl_12h_tokens?: number;
          ttl_30m_tokens?: number;
        };
        cached_tokens?: number;
      };
      server_tool_use?: {
        advisor_requests?: number;
        apply_patch_requests?: number;
        datetime_requests?: number;
        fusion_requests?: number;
        image_generation_requests?: number;
        search_models_requests?: number;
        subagent_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateSpeechParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config?: {
      elevenlabs?: {
        language_code?: string;
        output_format?: string;
        voice_id?: string;
        voice_settings?: {
          similarity_boost?: number;
          stability?: number;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    format?: "mp3" | "wav" | "ogg" | "aac";
    input: string;
    model: string;
    models?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    speed?: number;
    voice?: string;
  };
};

/**
 * Generates audio from the input text.
 */
export async function createSpeech(
  client: Client,
  args: CreateSpeechParams = {},
): Promise<Blob> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/speech";
  return client.request<Blob>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateSpendRuleParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    action?: "notify" | "block";
    base_amount_nanos?: number | null;
    base_amount_usd?: number | null;
    base_kind?:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_ref?: "daily" | "weekly" | "monthly" | null;
    block_at_amount_nanos?: number | null;
    block_at_amount_usd?: number | null;
    block_at_percent?: number;
    block_free_models?: boolean;
    cooldown_minutes?: number;
    destination_ids?: string[];
    enabled?: boolean;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    name: string;
    period: "day" | "week" | "month" | "rolling";
    runway_days?: number | null;
    scope_id?: string | null;
    scope_type?:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spike_floor_nanos?: number | null;
    spike_floor_usd?: number | null;
    spike_multiplier?: number | null;
    threshold_amount_nanos?: number | null;
    threshold_amount_usd?: number | null;
    threshold_percents?: number[] | null;
    time_zone?: string | null;
    window_hours?: number | null;
  };
};

/**
 * Creates a spend rule and sets its notification destinations. Every metric is accepted; rules returned with evaluated false are saved and fire from a later release. Blocking is best effort and acts minutes after the threshold; use key limits and workspace budgets for exact caps. A workspace can have 50 spend rules.
 */
export async function createSpendRule(
  client: Client,
  args: CreateSpendRuleParams = {},
): Promise<{
  data: {
    action: "notify" | "block";
    base_amount_nanos: number | null;
    base_amount_usd: number | null;
    base_kind:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_ref: "daily" | "weekly" | "monthly" | null;
    block_at_amount_nanos: number | null;
    block_at_amount_usd: number | null;
    block_at_percent: number;
    block_free_models: boolean;
    cooldown_minutes: number;
    created_at: string;
    created_by: string | null;
    destination_ids: string[];
    enabled: boolean;
    evaluated: boolean;
    id: string;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    name: string;
    period: "day" | "week" | "month" | "rolling";
    runway_days: number | null;
    scope_id: string | null;
    scope_type:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spike_floor_nanos: number | null;
    spike_floor_usd: number | null;
    spike_multiplier: number | null;
    threshold_amount_nanos: number | null;
    threshold_amount_usd: number | null;
    threshold_percents: number[] | null;
    time_zone: string | null;
    updated_at: string;
    window_hours: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/spend-rules";
  return client.request<{
    data: {
      action: "notify" | "block";
      base_amount_nanos: number | null;
      base_amount_usd: number | null;
      base_kind:
        "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
      base_ref: "daily" | "weekly" | "monthly" | null;
      block_at_amount_nanos: number | null;
      block_at_amount_usd: number | null;
      block_at_percent: number;
      block_free_models: boolean;
      cooldown_minutes: number;
      created_at: string;
      created_by: string | null;
      destination_ids: string[];
      enabled: boolean;
      evaluated: boolean;
      id: string;
      metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
      name: string;
      period: "day" | "week" | "month" | "rolling";
      runway_days: number | null;
      scope_id: string | null;
      scope_type:
        "workspace" | "key" | "member" | "department" | "model" | "provider";
      spike_floor_nanos: number | null;
      spike_floor_usd: number | null;
      spike_multiplier: number | null;
      threshold_amount_nanos: number | null;
      threshold_amount_usd: number | null;
      threshold_percents: number[] | null;
      time_zone: string | null;
      updated_at: string;
      window_hours: number | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateTranscriptionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    audio_b64?: string;
    audio_url?: string;
    chunking_strategy?:
      | "auto"
      | {
          prefix_padding_ms?: number;
          silence_duration_ms?: number;
          threshold?: number;
          type: "server_vad";
        };
    known_speaker_names?: string[];
    known_speaker_references?: string[];
    language?: string;
    model: string;
    models?: string[];
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
  };
};

/**
 * Transcribes audio into the input language.
 */
export async function createTranscription(
  client: Client,
  args: CreateTranscriptionParams = {},
): Promise<{
  text?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/transcriptions";
  return client.request<{
    text?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateTranslationParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    audio_b64?: string;
    audio_url?: string;
    language?: string;
    model: string;
    models?: string[];
    prompt?: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    temperature?: number;
  };
};

/**
 * Translates audio into English.
 */
export async function createTranslation(
  client: Client,
  args: CreateTranslationParams = {},
): Promise<{
  text?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/translations";
  return client.request<{
    text?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    aspect_ratio?: string;
    compression_quality?: number;
    duration?: number;
    enhance_prompt?: boolean;
    frame_images?: {
      frame_type: "first_frame" | "last_frame";
      image_url: {
        url: string;
      };
      type: "image_url";
    }[];
    generate_audio?: boolean;
    input_audio_duration?: number;
    input_references?: (
      | {
          image_url: {
            url: string;
          };
          reference_type?: string;
          role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
          type: "image_url";
        }
      | {
          media_url: {
            url: string;
          };
          reference_type?: string;
          role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
          type: "video_url" | "audio_url";
        }
    )[];
    input_video_duration?: number;
    model: string;
    models?: string[];
    negative_prompt?: string;
    output?: {
      access?: "bytes" | "signed_url" | "both";
    };
    person_generation?: string;
    prompt: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    provider_params?: {
      [key: string]: unknown;
    };
    resize_mode?: string;
    resolution?: string;
    sample_count?: number;
    seed?: number;
    size?: string;
    webhook?: {
      endpoint_id: string;
      events?: string[];
    };
  };
};

/**
 * Creates an async video generation job. Poll the returned `polling_url` every 20 seconds until the job reaches a terminal status.
 */
export async function createVideo(
  client: Client,
  args: CreateVideoParams = {},
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    billable?: boolean;
    billed_at?: string;
    charge_reason?: string | null;
    charged?: boolean | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
    [key: string]: unknown;
  };
  cancel_url?: string | null;
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  model?: string;
  native_video_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos";
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      billable?: boolean;
      billed_at?: string;
      charge_reason?: string | null;
      charged?: boolean | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
      [key: string]: unknown;
    };
    cancel_url?: string | null;
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    model?: string;
    native_video_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    aspect_ratio?: string;
    compression_quality?: number;
    duration?: number;
    enhance_prompt?: boolean;
    frame_images?: {
      frame_type: "first_frame" | "last_frame";
      image_url: {
        url: string;
      };
      type: "image_url";
    }[];
    generate_audio?: boolean;
    input_audio_duration?: number;
    input_references?: (
      | {
          image_url: {
            url: string;
          };
          reference_type?: string;
          role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
          type: "image_url";
        }
      | {
          media_url: {
            url: string;
          };
          reference_type?: string;
          role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
          type: "video_url" | "audio_url";
        }
    )[];
    input_video_duration?: number;
    model: string;
    models?: string[];
    negative_prompt?: string;
    output?: {
      access?: "bytes" | "signed_url" | "both";
    };
    person_generation?: string;
    prompt: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    provider_options?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    provider_params?: {
      [key: string]: unknown;
    };
    resize_mode?: string;
    resolution?: string;
    sample_count?: number;
    seed?: number;
    size?: string;
    webhook?: {
      endpoint_id: string;
      events?: string[];
    };
  };
};

/**
 * Alias of /videos.
 */
export async function createVideoAlias(
  client: Client,
  args: CreateVideoAliasParams = {},
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    billable?: boolean;
    billed_at?: string;
    charge_reason?: string | null;
    charged?: boolean | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
    [key: string]: unknown;
  };
  cancel_url?: string | null;
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  model?: string;
  native_video_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations";
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      billable?: boolean;
      billed_at?: string;
      charge_reason?: string | null;
      charged?: boolean | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
      [key: string]: unknown;
    };
    cancel_url?: string | null;
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    model?: string;
    native_video_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoDownloadUrlParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disposition?: "attachment" | "inline";
    index?: number;
    ttl_seconds?: number;
  };
};

/**
 * Returns a signed first-party download URL for a rendered video.
 */
export async function createVideoDownloadUrl(
  client: Client,
  args: CreateVideoDownloadUrlParams,
): Promise<{
  download_url?: string;
  expires_at?: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/videos/${encodeURIComponent(String(path["video_id"]))}/download_url`;
  return client.request<{
    download_url?: string;
    expires_at?: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoDownloadUrlAliasParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disposition?: "attachment" | "inline";
    index?: number;
    ttl_seconds?: number;
  };
};

/**
 * Alias of /videos/{video_id}/download_url.
 */
export async function createVideoDownloadUrlAlias(
  client: Client,
  args: CreateVideoDownloadUrlAliasParams,
): Promise<{
  download_url?: string;
  expires_at?: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path["video_id"]))}/download_url`;
  return client.request<{
    download_url?: string;
    expires_at?: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWebhookEndpointParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    events?: (
      | "job.created"
      | "job.status_changed"
      | "job.progress"
      | "job.completed"
      | "job.failed"
      | "job.cancelled"
      | "job.expired"
      | "video.created"
      | "video.status_changed"
      | "video.progress"
      | "video.completed"
      | "video.failed"
      | "video.cancelled"
      | "video.expired"
      | "batch.created"
      | "batch.status_changed"
      | "batch.progress"
      | "batch.completed"
      | "batch.failed"
      | "batch.cancelled"
      | "batch.expired"
    )[];
    name?: string;
    url: string;
  };
};

/**
 * Creates an HTTPS webhook endpoint and returns its signing secret once.
 */
export async function createWebhookEndpoint(
  client: Client,
  args: CreateWebhookEndpointParams = {},
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events: string[];
  hasSecret: boolean;
  id: string;
  name: string;
  signing_secret: string;
  status: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url: string;
  workspaceId: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/webhook-endpoints";
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events: string[];
    hasSecret: boolean;
    id: string;
    name: string;
    signing_secret: string;
    status: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url: string;
    workspaceId: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkloadIdentityPolicyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    claim_conditions?: {
      [key: string]: string[];
    };
    issuer?: string;
    max_token_lifetime_seconds?: number;
    name: string;
    owner_id: string;
    provider: "vercel" | "github_actions";
  };
};

/**
 * Creates a policy and its secretless key. Tokens must be issued for the audience https://api.phaseo.app and match the pinned owner and every claim condition. A workspace can have up to 50 policies; more returns 409 limit_reached. Requires keys:write on management keys and OAuth tokens, or a workspace owner or admin. Available only to workspaces in the trusted workloads beta; other workspaces get 404.
 */
export async function createWorkloadIdentityPolicy(
  client: Client,
  args: CreateWorkloadIdentityPolicyParams = {},
): Promise<{
  data: {
    audience: string;
    claim_conditions: {
      [key: string]: string[];
    };
    created_at: string;
    created_by: string | null;
    id: string;
    issuer: string;
    key_id: string;
    last_used_at: string | null;
    max_token_lifetime_seconds: number;
    name: string;
    owner_id: string;
    provider: "vercel" | "github_actions";
    status: "active" | "disabled";
    updated_at: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/workload-identity/policies";
  return client.request<{
    data: {
      audience: string;
      claim_conditions: {
        [key: string]: string[];
      };
      created_at: string;
      created_by: string | null;
      id: string;
      issuer: string;
      key_id: string;
      last_used_at: string | null;
      max_token_lifetime_seconds: number;
      name: string;
      owner_id: string;
      provider: "vercel" | "github_actions";
      status: "active" | "disabled";
      updated_at: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name: string;
    slug?: string;
  };
};

/**
 * Creates a new workspace for the authenticated owner. Management API key required.
 */
export async function createWorkspace(
  client: Client,
  args: CreateWorkspaceParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug?: string | null;
    updated_at: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/workspaces";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug?: string | null;
      updated_at: string | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceBudgetParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    interval: "daily" | "weekly" | "monthly" | "lifetime";
    limit: number;
  };
};

/**
 * Creates an enforced spend ceiling for one workspace interval.
 */
export async function createWorkspaceBudget(
  client: Client,
  args: CreateWorkspaceBudgetParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly" | "lifetime";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/budgets";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly" | "lifetime";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceDepartmentParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    color?:
      | "blue"
      | "emerald"
      | "amber"
      | "rose"
      | "violet"
      | "slate"
      | "cyan"
      | "teal"
      | "lime"
      | "yellow"
      | "orange"
      | "red"
      | "pink"
      | "fuchsia"
      | "indigo"
      | "sky"
      | "green"
      | "purple";
    description?: string | null;
    icon?:
      | "users"
      | "briefcase"
      | "megaphone"
      | "code"
      | "palette"
      | "headphones"
      | "landmark"
      | "scale"
      | "heart-pulse"
      | "globe"
      | "flask"
      | "graduation-cap"
      | "shield-check"
      | "shopping-bag"
      | "wrench"
      | "truck"
      | "handshake"
      | "chart";
    name: string;
  };
};

/**
 * Creates a manually managed department. Requires `settings:write`.
 */
export async function createWorkspaceDepartment(
  client: Client,
  args: CreateWorkspaceDepartmentParams = {},
): Promise<{
  data: {
    color?: string;
    created_at?: string | null;
    description?: string | null;
    directory_name?: string | null;
    icon?: string;
    id: string;
    name: string;
    name_overridden?: boolean;
    source_id?: string | null;
    source_type?: "manual" | "scim_group";
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/departments";
  return client.request<{
    data: {
      color?: string;
      created_at?: string | null;
      description?: string | null;
      directory_name?: string | null;
      icon?: string;
      id: string;
      name: string;
      name_overridden?: boolean;
      source_id?: string | null;
      source_type?: "manual" | "scim_group";
      updated_at?: string | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceGroupMappingParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    access_role?: "member" | "admin";
    department_id: string;
    department_position?: "member" | "lead";
    scim_group_id: string;
  };
};

/**
 * Maps a provisioned group to a workspace department and access role.
 */
export async function createWorkspaceGroupMapping(
  client: Client,
  args: CreateWorkspaceGroupMappingParams = {},
): Promise<{
  data: {
    access_role: "member" | "admin";
    created_at?: string | null;
    department_id: string;
    department_position: "member" | "lead";
    id: string;
    scim_group_id: string;
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/group-mappings";
  return client.request<{
    data: {
      access_role: "member" | "admin";
      created_at?: string | null;
      department_id: string;
      department_position: "member" | "lead";
      id: string;
      scim_group_id: string;
      updated_at?: string | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceInviteParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    expires_in_days?: number;
    max_uses?: number | null;
    role?: "admin" | "member";
  };
};

/**
 * Creates an encrypted invite and returns its plaintext token once. Management API key required.
 */
export async function createWorkspaceInvite(
  client: Client,
  args: CreateWorkspaceInviteParams,
): Promise<{
  data: {
    created_at?: string;
    creator_user_id: string;
    expires_at?: string | null;
    id: string;
    max_uses?: number | null;
    role: "admin" | "member";
    token_preview?: string | null;
    uses_count?: number;
    workspace_id: string;
  };
  token: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/invites`;
  return client.request<{
    data: {
      created_at?: string;
      creator_user_id: string;
      expires_at?: string | null;
      id: string;
      max_uses?: number | null;
      role: "admin" | "member";
      token_preview?: string | null;
      uses_count?: number;
      workspace_id: string;
    };
    token: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceNotificationDestinationParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name: string;
    target: string;
    type:
      | "email"
      | "discord"
      | "discord_webhook"
      | "slack"
      | "microsoft_teams"
      | "custom_webhook";
  };
};

/**
 * Validates and encrypts an email, chat, or HTTPS webhook destination. The raw target is never returned.
 */
export async function createWorkspaceNotificationDestination(
  client: Client,
  args: CreateWorkspaceNotificationDestinationParams = {},
): Promise<{
  data: {
    created_at?: string | null;
    has_signing_secret?: boolean;
    id: string;
    name: string;
    signing_secret?: string;
    signing_secret_rotated_at?: string | null;
    status: "active" | "disabled";
    target_preview: string;
    type:
      | "email"
      | "discord"
      | "discord_webhook"
      | "slack"
      | "microsoft_teams"
      | "custom_webhook";
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/notifications/destinations";
  return client.request<{
    data: {
      created_at?: string | null;
      has_signing_secret?: boolean;
      id: string;
      name: string;
      signing_secret?: string;
      signing_secret_rotated_at?: string | null;
      status: "active" | "disabled";
      target_preview: string;
      type:
        | "email"
        | "discord"
        | "discord_webhook"
        | "slack"
        | "microsoft_teams"
        | "custom_webhook";
      updated_at?: string | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceScimTokenParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    expires_at?: string | null;
    label?: string;
  };
};

/**
 * Creates a provisioning token. The raw token is returned once. Requires the identity add-on and `settings:write`.
 */
export async function createWorkspaceScimToken(
  client: Client,
  args: CreateWorkspaceScimTokenParams = {},
): Promise<{
  data: {
    created_at?: string | null;
    expires_at?: string | null;
    id: string;
    label: string;
    last_used_at?: string | null;
    revoked_at?: string | null;
    token: string;
    token_prefix: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/scim/tokens";
  return client.request<{
    data: {
      created_at?: string | null;
      expires_at?: string | null;
      id: string;
      label: string;
      last_used_at?: string | null;
      revoked_at?: string | null;
      token: string;
      token_prefix: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteApiKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes an API key in the authenticated workspace. Management API key required.
 */
export async function deleteApiKey(
  client: Client,
  args: DeleteApiKeyParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/keys/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteClassifierParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a classifier. Labels it already wrote stay on past requests.
 */
export async function deleteClassifier(
  client: Client,
  args: DeleteClassifierParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/classifiers/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteDataContributionClassifierParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a custom classifier. The built-in starter classifier cannot be deleted.
 */
export async function deleteDataContributionClassifier(
  client: Client,
  args: DeleteDataContributionClassifierParams,
): Promise<{
  data: {
    deleted: true;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/data-contribution/classifiers/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: true;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteDepartmentBudgetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes a department budget. Within about a minute, requests are no longer refused because of it, and its alerts stop.
 */
export async function deleteDepartmentBudget(
  client: Client,
  args: DeleteDepartmentBudgetParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/department-budgets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteDynamicRouteParams = {
  path: {
    id: string;
  };
  query?: {
    confirm_name?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently deletes a route and refreshes all previously attached API-key contexts.
 */
export async function deleteDynamicRoute(
  client: Client,
  args: DeleteDynamicRouteParams,
): Promise<{
  data: {
    deleted: true;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/routing/dynamic-routes/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: true;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteGuardrailParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a guardrail and its assignments. Requires `guardrails:delete`.
 */
export async function deleteGuardrail(
  client: Client,
  args: DeleteGuardrailParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteManagementKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently revokes and deletes a management key. Requires `management_keys:delete`.
 */
export async function deleteManagementKey(
  client: Client,
  args: DeleteManagementKeyParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/management-keys/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteOAuthClientParams = {
  path: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes the client after revoking its active authorizations.
 */
export async function deleteOAuthClient(
  client: Client,
  args: DeleteOAuthClientParams,
): Promise<{
  client_id: string;
  message: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["client_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path["client_id"]))}`;
  return client.request<{
    client_id: string;
    message: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteObservabilityDestinationParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a destination and its key and rule filters.
 */
export async function deleteObservabilityDestination(
  client: Client,
  args: DeleteObservabilityDestinationParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/observability/destinations/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeletePresetParams = {
  path: {
    id: string;
  };
  query?: {
    confirm_name?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Soft-deletes a preset after optional exact-name confirmation.
 */
export async function deletePreset(
  client: Client,
  args: DeletePresetParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeletePresetLabelParams = {
  path: {
    id: string;
    label: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes a label. Requests that still pin it fail with preset_version_not_found.
 */
export async function deletePresetLabel(
  client: Client,
  args: DeletePresetLabelParams,
): Promise<{
  deleted: boolean;
  label: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["label"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/labels/${encodeURIComponent(String(path["label"]))}`;
  return client.request<{
    deleted: boolean;
    label: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeletePrivateModelParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently deletes a private model owned by the authenticated workspace. Repeated deletion is safe.
 */
export async function deletePrivateModel(
  client: Client,
  args: DeletePrivateModelParams,
): Promise<{
  deleted: boolean;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/private-models/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: boolean;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteProviderCredentialParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently removes a provider credential. Repeated deletion is safe.
 */
export async function deleteProviderCredential(
  client: Client,
  args: DeleteProviderCredentialParams,
): Promise<{
  deleted: boolean;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/byok/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: boolean;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteRateLimitAssignmentParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes a policy from its target. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function deleteRateLimitAssignment(
  client: Client,
  args: DeleteRateLimitAssignmentParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/rate-limits/assignments/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteRateLimitPolicyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a policy and every assignment that uses it. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function deleteRateLimitPolicy(
  client: Client,
  args: DeleteRateLimitPolicyParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/rate-limits/policies/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteSpendRuleParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a spend rule. It is no longer evaluated and no longer counts toward the limit of 50 rules.
 */
export async function deleteSpendRule(
  client: Client,
  args: DeleteSpendRuleParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-rules/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteVideoParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Tombstones a terminal video generation record. In-progress jobs cannot be deleted.
 */
export async function deleteVideo(
  client: Client,
  args: DeleteVideoParams,
): Promise<{
  deleted?: boolean;
  id?: string;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/videos/${encodeURIComponent(String(path["video_id"]))}`;
  return client.request<{
    deleted?: boolean;
    id?: string;
    object?: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteVideoAliasParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}.
 */
export async function deleteVideoAlias(
  client: Client,
  args: DeleteVideoAliasParams,
): Promise<{
  deleted?: boolean;
  id?: string;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path["video_id"]))}`;
  return client.request<{
    deleted?: boolean;
    id?: string;
    object?: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWebhookEndpointParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Soft-deletes a webhook endpoint and stops future delivery. Requires `settings:write`.
 */
export async function deleteWebhookEndpoint(
  client: Client,
  args: DeleteWebhookEndpointParams,
): Promise<{
  deleted: true;
  id: string;
  object: "webhook_endpoint";
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
    id: string;
    object: "webhook_endpoint";
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkloadIdentityPolicyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Revokes the policy's key, then deletes the policy. Matching tokens are refused within a minute. Past requests keep their key in logs and usage. Requires keys:delete on management keys and OAuth tokens, or a workspace owner or admin. Available only to workspaces in the trusted workloads beta; other workspaces get 404.
 */
export async function deleteWorkloadIdentityPolicy(
  client: Client,
  args: DeleteWorkloadIdentityPolicyParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workload-identity/policies/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a workspace by UUID or slug. Management API key required.
 */
export async function deleteWorkspace(
  client: Client,
  args: DeleteWorkspaceParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceBudgetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes a workspace spend ceiling and stops enforcing that interval.
 */
export async function deleteWorkspaceBudget(
  client: Client,
  args: DeleteWorkspaceBudgetParams,
): Promise<{
  data: {
    deleted: boolean;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/budgets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      deleted: boolean;
      id: string;
    };
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceDepartmentParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a manually managed department. Directory-synchronized departments cannot be deleted here.
 */
export async function deleteWorkspaceDepartment(
  client: Client,
  args: DeleteWorkspaceDepartmentParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/departments/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceDepartmentMemberParams = {
  path: {
    departmentId: string;
    userId: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes a manual department membership without changing directory-synchronized membership.
 */
export async function deleteWorkspaceDepartmentMember(
  client: Client,
  args: DeleteWorkspaceDepartmentMemberParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["departmentId"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["userId"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/departments/${encodeURIComponent(String(path["departmentId"]))}/members/${encodeURIComponent(String(path["userId"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceGroupMappingParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes a provisioned-group mapping from the workspace.
 */
export async function deleteWorkspaceGroupMapping(
  client: Client,
  args: DeleteWorkspaceGroupMappingParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/group-mappings/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceInviteParams = {
  path: {
    id: string;
    invite_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently revokes an invite. Management API key required.
 */
export async function deleteWorkspaceInvite(
  client: Client,
  args: DeleteWorkspaceInviteParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["invite_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/invites/${encodeURIComponent(String(path["invite_id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceNotificationDestinationParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Soft-deletes a workspace notification destination and removes it from future routing.
 */
export async function deleteWorkspaceNotificationDestination(
  client: Client,
  args: DeleteWorkspaceNotificationDestinationParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/notifications/destinations/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeployDynamicRouteVersionParams = {
  path: {
    id: string;
    version: number;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Makes an immutable route version active and refreshes attached-key contexts.
 */
export async function deployDynamicRouteVersion(
  client: Client,
  args: DeployDynamicRouteVersionParams,
): Promise<{
  data: {
    deployed_version: number;
    id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["version"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/routing/dynamic-routes/${encodeURIComponent(String(path["id"]))}/versions/${encodeURIComponent(String(path["version"]))}/deploy`;
  return client.request<{
    data: {
      deployed_version: number;
      id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ExportAnalyticsCsvParams = {
  path?: Record<string, never>;
  query?: {
    byok?: boolean;
    date?: string;
    end_user_id?: string;
    endpoint?: string;
    key_id?: string;
    label_key?: string;
    label_value?: string;
    model?: string;
    provider?: string;
    success?: boolean;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Exports the complete filtered analytics aggregate as spreadsheet-safe CSV.
 */
export async function exportAnalyticsCsv(
  client: Client,
  args: ExportAnalyticsCsvParams = {},
): Promise<string> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/analytics/export";
  return client.request<string>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type FinalizeRealtimeSessionParams = {
  path: {
    session_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disconnect_reason?: string;
    error_code?: string;
    error_message?: string;
    status?: "completed" | "failed" | "cancelled" | "expired";
    usage?: {
      [key: string]: unknown;
    };
  };
};

/**
 * Finalizes metering and releases any remaining credit reservation for a realtime session.
 */
export async function finalizeRealtimeSession(
  client: Client,
  args: FinalizeRealtimeSessionParams,
): Promise<{
  billing: {
    [key: string]: unknown;
  };
  expires_at?: string | null;
  expiresAt?: string | null;
  id: string;
  model: string;
  model_id: string;
  provider: string;
  session_id: string;
  settlement: {
    [key: string]: unknown;
  };
  status: string;
  usage: {
    [key: string]: unknown;
  };
  voice?: string | null;
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["session_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/audio/realtime/sessions/${encodeURIComponent(String(path["session_id"]))}/finalize`;
  return client.request<{
    billing: {
      [key: string]: unknown;
    };
    expires_at?: string | null;
    expiresAt?: string | null;
    id: string;
    model: string;
    model_id: string;
    provider: string;
    session_id: string;
    settlement: {
      [key: string]: unknown;
    };
    status: string;
    usage: {
      [key: string]: unknown;
    };
    voice?: string | null;
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ForkPresetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    source_version_id?: string;
  };
};

/**
 * Copies the active or selected public version into the management workspace as a private preset.
 */
export async function forkPreset(
  client: Client,
  args: ForkPresetParams,
): Promise<{
  data: {
    active_version_id?: string | null;
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at?: string | null;
    created_by?: string | null;
    description?: string | null;
    id: string;
    name: string;
    slug: string;
    source_preset_id?: string | null;
    source_preset_version_id?: string | null;
    updated_at?: string | null;
    upstream_version_id?: string | null;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/fork`;
  return client.request<{
    data: {
      active_version_id?: string | null;
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at?: string | null;
      created_by?: string | null;
      description?: string | null;
      id: string;
      name: string;
      slug: string;
      source_preset_id?: string | null;
      source_preset_version_id?: string | null;
      updated_at?: string | null;
      upstream_version_id?: string | null;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GenerateMusicParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    duration?: number;
    echo_upstream_request?: boolean;
    elevenlabs?: {
      composition_plan?: {};
      force_instrumental?: boolean;
      model_id?: string;
      music_length_ms?: number;
      output_format?: string;
      prompt?: string;
      sign_with_c2pa?: boolean;
      store_for_inpainting?: boolean;
      with_timestamps?: boolean;
    };
    format?: "mp3" | "wav" | "ogg" | "aac";
    model: string;
    models?: string[];
    prompt?: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    suno?: {
      audioWeight?: number;
      callBackUrl?: string;
      customMode?: boolean;
      instrumental?: boolean;
      model?: string;
      negativeTags?: string;
      personaId?: string;
      prompt?: string;
      style?: string;
      styleWeight?: number;
      title?: string;
      vocalGender?: "m" | "f";
      weirdnessConstraint?: number;
    };
  };
};

/**
 * Generates music through one provider-independent endpoint. Phaseo waits for synchronous providers and handles provider queue polling internally.
 */
export async function generateMusic(
  client: Client,
  args: GenerateMusicParams = {},
): Promise<{
  audio_base64?: string;
  audio_url?: string;
  id: string;
  model: string;
  nativeResponseId?: string | null;
  object: "music";
  output?: {
    [key: string]: unknown;
  }[];
  provider: string;
  result?: unknown;
  status: "queued" | "in_progress" | "completed" | "failed";
  usage?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/music/generate";
  return client.request<{
    audio_base64?: string;
    audio_url?: string;
    id: string;
    model: string;
    nativeResponseId?: string | null;
    object: "music";
    output?: {
      [key: string]: unknown;
    }[];
    provider: string;
    result?: unknown;
    status: "queued" | "in_progress" | "completed" | "failed";
    usage?: {
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GenerateMusicAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    duration?: number;
    echo_upstream_request?: boolean;
    elevenlabs?: {
      composition_plan?: {};
      force_instrumental?: boolean;
      model_id?: string;
      music_length_ms?: number;
      output_format?: string;
      prompt?: string;
      sign_with_c2pa?: boolean;
      store_for_inpainting?: boolean;
      with_timestamps?: boolean;
    };
    format?: "mp3" | "wav" | "ogg" | "aac";
    model: string;
    models?: string[];
    prompt?: string;
    provider?: {
      allow_fallbacks?: boolean | null;
      data_collection?: "allow" | "deny" | null;
      enforce_distillable_text?: boolean | null;
      ignore?: string[];
      include_alpha?: boolean;
      max_price?: {
        audio?: number | string;
        completion?: number | string;
        image?: number | string;
        prompt?: number | string;
        request?: number | string;
      };
      only?: string[];
      order?: string[];
      preferred_max_latency?:
        | number
        | {
            [key: string]: number;
          };
      preferred_min_throughput?:
        | number
        | {
            [key: string]: number;
          };
      quantizations?: string[] | null;
      require_parameters?: boolean | null;
      require_zero_data_retention?: boolean | null;
      required_data_region?: string | null;
      required_execution_region?: string | null;
      sort?:
        | string
        | {
            [key: string]: unknown;
          };
      zdr?: boolean | null;
    };
    suno?: {
      audioWeight?: number;
      callBackUrl?: string;
      customMode?: boolean;
      instrumental?: boolean;
      model?: string;
      negativeTags?: string;
      personaId?: string;
      prompt?: string;
      style?: string;
      styleWeight?: number;
      title?: string;
      vocalGender?: "m" | "f";
      weirdnessConstraint?: number;
    };
  };
};

/**
 * Alias of /music/generate.
 */
export async function generateMusicAlias(
  client: Client,
  args: GenerateMusicAliasParams = {},
): Promise<{
  audio_base64?: string;
  audio_url?: string;
  id: string;
  model: string;
  nativeResponseId?: string | null;
  object: "music";
  output?: {
    [key: string]: unknown;
  }[];
  provider: string;
  result?: unknown;
  status: "queued" | "in_progress" | "completed" | "failed";
  usage?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/music/generations";
  return client.request<{
    audio_base64?: string;
    audio_url?: string;
    id: string;
    model: string;
    nativeResponseId?: string | null;
    object: "music";
    output?: {
      [key: string]: unknown;
    }[];
    provider: string;
    result?: unknown;
    status: "queued" | "in_progress" | "completed" | "failed";
    usage?: {
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetActivityParams = {
  path?: Record<string, never>;
  query?: {
    days?: number;
    limit?: number;
    offset?: number;
    workspace_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns recent request activity for the authenticated workspace. Management API key required.
 */
export async function getActivity(
  client: Client,
  args: GetActivityParams = {},
): Promise<{
  activity: {
    cost_cents: number;
    endpoint: string | null;
    latency_ms: number | null;
    model: string | null;
    provider: string | null;
    request_id: string | null;
    timestamp: string | null;
    usage: {
      [key: string]: unknown;
    } | null;
  }[];
  limit: number;
  offset: number;
  ok: true;
  period_days: number;
  total: number;
  total_cost_cents: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/activity";
  return client.request<{
    activity: {
      cost_cents: number;
      endpoint: string | null;
      latency_ms: number | null;
      model: string | null;
      provider: string | null;
      request_id: string | null;
      timestamp: string | null;
      usage: {
        [key: string]: unknown;
      } | null;
    }[];
    limit: number;
    offset: number;
    ok: true;
    period_days: number;
    total: number;
    total_cost_cents: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetActivityAliasParams = {
  path?: Record<string, never>;
  query?: {
    byok?: boolean;
    date?: string;
    end_user_id?: string;
    endpoint?: string;
    key_id?: string;
    label_key?: string;
    label_value?: string;
    limit?: number;
    model?: string;
    offset?: number;
    provider?: string;
    success?: boolean;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns cost, request, and token aggregates grouped by date, model, provider, and endpoint for the last 30 completed UTC days.
 */
export async function getActivityAlias(
  client: Client,
  args: GetActivityAliasParams = {},
): Promise<{
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
  limit: number;
  offset: number;
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/analytics";
  return client.request<{
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
    limit: number;
    offset: number;
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetApiKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns metadata for one API key in the authenticated workspace. Management API key required.
 */
export async function getApiKey(
  client: Client,
  args: GetApiKeyParams,
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    storage_locations?: string[];
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/keys/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      creator_user_id: string | null;
      department_id?: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      include_byok_in_limit: boolean;
      ip_allowlist?: {
        address: string;
        label: string;
      }[];
      label: string | null;
      last_used_at: string | null;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: "daily" | "weekly" | "monthly" | null;
      limits: {
        daily: {
          cost: number | null;
          requests: number | null;
        };
        monthly: {
          cost: number | null;
          requests: number | null;
        };
        weekly: {
          cost: number | null;
          requests: number | null;
        };
      };
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      storage_locations?: string[];
      updated_at: string | null;
      usage: number;
      usage_daily: number;
      usage_details: {
        daily: {
          cost: number;
          requests: number;
        };
        monthly: {
          cost: number;
          requests: number;
        };
        total: {
          cost: number;
          requests: number;
        };
        weekly: {
          cost: number;
          requests: number;
        };
      };
      usage_monthly: number;
      usage_weekly: number;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetAutoRoutingSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the limits the auto-router works within for this workspace. Any workspace member; settings:read required.
 */
export async function getAutoRoutingSettings(
  client: Client,
  args: GetAutoRoutingSettingsParams = {},
): Promise<{
  data: {
    allow_fallbacks?: boolean;
    allowed_patterns?: string[];
    max_input_price_per_million?: number | null;
    max_output_price_per_million?: number | null;
    objective?: "balanced" | "quality" | "cost" | "latency";
    revision?: string | null;
    spend_profile?:
      "economy" | "standard" | "premium" | "unrestricted" | "custom";
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/auto";
  return client.request<{
    data: {
      allow_fallbacks?: boolean;
      allowed_patterns?: string[];
      max_input_price_per_million?: number | null;
      max_output_price_per_million?: number | null;
      objective?: "balanced" | "quality" | "cost" | "latency";
      revision?: string | null;
      spend_profile?:
        "economy" | "standard" | "premium" | "unrestricted" | "custom";
      updated_at?: string | null;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetClassifierParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one classifier. Owners and admins only.
 */
export async function getClassifier(
  client: Client,
  args: GetClassifierParams,
): Promise<{
  data: {
    created_at: string;
    created_by: string | null;
    description: string | null;
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
    enabled: boolean;
    id: string;
    input_scope: "prompt" | "prompt_and_response";
    instructions: string;
    model: string;
    monthly_budget_usd: number | null;
    name: string;
    sample_by: "request" | "session";
    sample_rate: number;
    scope: {
      app_ids?: string[];
      key_ids?: string[];
      models?: string[];
    };
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/classifiers/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by: string | null;
      description: string | null;
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
      enabled: boolean;
      id: string;
      input_scope: "prompt" | "prompt_and_response";
      instructions: string;
      model: string;
      monthly_budget_usd: number | null;
      name: string;
      sample_by: "request" | "session";
      sample_rate: number;
      scope: {
        app_ids?: string[];
        key_ids?: string[];
        models?: string[];
      };
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetCreditsParams = {
  path?: Record<string, never>;
  query?: {
    workspace_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns remaining credits and usage statistics for the authenticated workspace. Management API key required.
 */
export async function getCredits(
  client: Client,
  args: GetCreditsParams = {},
): Promise<{
  credits: {
    available_nanos: number;
    balance_nanos: number;
    remaining: number;
    reserved_nanos: number;
    thirty_day_requests: number;
    thirty_day_usage: number | null;
  };
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/credits";
  return client.request<{
    credits: {
      available_nanos: number;
      balance_nanos: number;
      remaining: number;
      reserved_nanos: number;
      thirty_day_requests: number;
      thirty_day_usage: number | null;
    };
    ok: true;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetCreditTopupParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the status of a credit top-up in the authenticated workspace. Needs credits:read or billing:write. Poll until final is true. Declined, expired and failed top-ups carry a reason code; do not retry them automatically.
 */
export async function getCreditTopup(
  client: Client,
  args: GetCreditTopupParams,
): Promise<{
  ok: true;
  topup: {
    amount_cents: number;
    amount_usd: number;
    checkout_url: string | null;
    confirmation_recipients?: number;
    created_at: string;
    currency: string;
    decided_at: string | null;
    expires_at: string;
    final: boolean;
    flow: "checkout" | "saved_card";
    id: string;
    message: string;
    next_action:
      | "open_checkout_url"
      | "await_email_confirmation"
      | "await_payment"
      | null
      | null;
    paid_at: string | null;
    payment_method: {
      brand?: string | null;
      last4?: string | null;
    } | null;
    reason: string | null;
    status:
      "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/credits/topups/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    ok: true;
    topup: {
      amount_cents: number;
      amount_usd: number;
      checkout_url: string | null;
      confirmation_recipients?: number;
      created_at: string;
      currency: string;
      decided_at: string | null;
      expires_at: string;
      final: boolean;
      flow: "checkout" | "saved_card";
      id: string;
      message: string;
      next_action:
        | "open_checkout_url"
        | "await_email_confirmation"
        | "await_payment"
        | null
        | null;
      paid_at: string | null;
      payment_method: {
        brand?: string | null;
        last4?: string | null;
      } | null;
      reason: string | null;
      status:
        "pending" | "confirmed" | "declined" | "expired" | "paid" | "failed";
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetCurrentApiKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns metadata for the currently authenticated standard Gateway API key.
 */
export async function getCurrentApiKey(
  client: Client,
  args: GetCurrentApiKeyParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    storage_locations?: string[];
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/key";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      creator_user_id: string | null;
      department_id?: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      include_byok_in_limit: boolean;
      ip_allowlist?: {
        address: string;
        label: string;
      }[];
      label: string | null;
      last_used_at: string | null;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: "daily" | "weekly" | "monthly" | null;
      limits: {
        daily: {
          cost: number | null;
          requests: number | null;
        };
        monthly: {
          cost: number | null;
          requests: number | null;
        };
        weekly: {
          cost: number | null;
          requests: number | null;
        };
      };
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      storage_locations?: string[];
      updated_at: string | null;
      usage: number;
      usage_daily: number;
      usage_details: {
        daily: {
          cost: number;
          requests: number;
        };
        monthly: {
          cost: number;
          requests: number;
        };
        total: {
          cost: number;
          requests: number;
        };
        weekly: {
          cost: number;
          requests: number;
        };
      };
      usage_monthly: number;
      usage_weekly: number;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetDataContributionSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns workspace consent, classifier configuration, and recent aggregate contribution analytics. Requires `settings:read` and feature access.
 */
export async function getDataContributionSettings(
  client: Client,
  args: GetDataContributionSettingsParams = {},
): Promise<{
  data: {
    analytics: {
      [key: string]: unknown;
    }[];
    classifiers: {
      categories: {
        [key: string]: string[];
      };
      created_at?: string | null;
      description?: string | null;
      enabled: boolean;
      id: string;
      instructions: string;
      kind: "starter" | "custom";
      model: string;
      name: string;
      sample_rate_bps: number;
      service_tier: "standard" | "flex";
      slug: string;
      updated_at?: string | null;
      [key: string]: unknown;
    }[];
    classifierSampleRateBps: number;
    consentedAt?: string | null;
    discountBps: number;
    enabled: boolean;
    last30Days: {
      contributions: number;
      discountNanos: number;
    };
    policyVersion: string;
    sampleRateBps: number;
    starterCategories: {
      [key: string]: string[];
    };
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/data-contribution";
  return client.request<{
    data: {
      analytics: {
        [key: string]: unknown;
      }[];
      classifiers: {
        categories: {
          [key: string]: string[];
        };
        created_at?: string | null;
        description?: string | null;
        enabled: boolean;
        id: string;
        instructions: string;
        kind: "starter" | "custom";
        model: string;
        name: string;
        sample_rate_bps: number;
        service_tier: "standard" | "flex";
        slug: string;
        updated_at?: string | null;
        [key: string]: unknown;
      }[];
      classifierSampleRateBps: number;
      consentedAt?: string | null;
      discountBps: number;
      enabled: boolean;
      last30Days: {
        contributions: number;
        discountNanos: number;
      };
      policyVersion: string;
      sampleRateBps: number;
      starterCategories: {
        [key: string]: string[];
      };
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetDepartmentBudgetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one department budget with the department's spend so far.
 */
export async function getDepartmentBudget(
  client: Client,
  args: GetDepartmentBudgetParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    department_id: string;
    department_name: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/department-budgets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      department_id: string;
      department_name: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetDynamicRouteParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one workspace dynamic route with versions and API-key attachments.
 */
export async function getDynamicRoute(
  client: Client,
  args: GetDynamicRouteParams,
): Promise<{
  data: {
    config: {
      cacheAwareRouting?: boolean;
      defaultAction?: {
        allowFallbacks?: boolean;
        model?: string;
        modelFallbacks?: string[];
        providerIgnore?: string[];
        providerOnly?: string[];
        providerOrder?: string[];
        routingMode?: "balanced" | "price" | "latency" | "throughput";
      };
      edges?: {
        id: string;
        source: string;
        sourceHandle?: string | null;
        target: string;
      }[];
      entryNodeId?: string | null;
      nodes?: {
        data: {
          [key: string]: unknown;
        };
        id: string;
        position?: {
          x: number;
          y: number;
        } | null;
        type:
          | "start"
          | "condition"
          | "percentage"
          | "model"
          | "rate_limit"
          | "budget_limit"
          | "end";
      }[];
      rules?: {
        action: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        condition: {
          field: "always" | "endpoint" | "model" | "session_id" | "metadata";
          metadataKey?: string | null;
          operator:
            "equals" | "not_equals" | "contains" | "starts_with" | "exists";
          value?: string | null;
        };
        enabled: boolean;
        id: string;
        name: string;
      }[];
      schemaVersion?: 2;
      sessionAffinity?: boolean;
    };
    created_at?: string | null;
    deployed_version?: number | null;
    description?: string | null;
    id: string;
    key_ids: string[];
    name: string;
    slug: string;
    status: "active" | "paused";
    updated_at?: string | null;
    version: number;
    versions: {
      created_at?: string | null;
      created_by?: string | null;
      status: "draft" | "deployed" | "superseded";
      version: number;
    }[];
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/routing/dynamic-routes/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      config: {
        cacheAwareRouting?: boolean;
        defaultAction?: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        edges?: {
          id: string;
          source: string;
          sourceHandle?: string | null;
          target: string;
        }[];
        entryNodeId?: string | null;
        nodes?: {
          data: {
            [key: string]: unknown;
          };
          id: string;
          position?: {
            x: number;
            y: number;
          } | null;
          type:
            | "start"
            | "condition"
            | "percentage"
            | "model"
            | "rate_limit"
            | "budget_limit"
            | "end";
        }[];
        rules?: {
          action: {
            allowFallbacks?: boolean;
            model?: string;
            modelFallbacks?: string[];
            providerIgnore?: string[];
            providerOnly?: string[];
            providerOrder?: string[];
            routingMode?: "balanced" | "price" | "latency" | "throughput";
          };
          condition: {
            field: "always" | "endpoint" | "model" | "session_id" | "metadata";
            metadataKey?: string | null;
            operator:
              "equals" | "not_equals" | "contains" | "starts_with" | "exists";
            value?: string | null;
          };
          enabled: boolean;
          id: string;
          name: string;
        }[];
        schemaVersion?: 2;
        sessionAffinity?: boolean;
      };
      created_at?: string | null;
      deployed_version?: number | null;
      description?: string | null;
      id: string;
      key_ids: string[];
      name: string;
      slug: string;
      status: "active" | "paused";
      updated_at?: string | null;
      version: number;
      versions: {
        created_at?: string | null;
        created_by?: string | null;
        status: "draft" | "deployed" | "superseded";
        version: number;
      }[];
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetGatewayRequestLogParams = {
  path: {
    requestId: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one redacted request record by request identifier.
 */
export async function getGatewayRequestLog(
  client: Client,
  args: GetGatewayRequestLogParams,
): Promise<{
  data: {
    auth_method?: string | null;
    byok?: boolean | null;
    canonical_model_id?: string | null;
    cost_nanos?: number | null;
    created_at?: string;
    currency?: string | null;
    endpoint?: string | null;
    error_code?: string | null;
    finish_reason?: string | null;
    generation_ms?: number | null;
    key_id?: string | null;
    latency_ms?: number | null;
    location?: string | null;
    model_id?: string | null;
    native_response_id?: string | null;
    oauth_client_id?: string | null;
    pricing_lines?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    provider?: string | null;
    request_id?: string;
    requested_model_id?: string | null;
    routed_model_id?: string | null;
    status_code?: number | null;
    stream?: boolean | null;
    success?: boolean | null;
    throughput?: number | null;
    usage?: {
      [key: string]: unknown;
    } | null;
  };
  ok: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["requestId"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/logs/${encodeURIComponent(String(path["requestId"]))}`;
  return client.request<{
    data: {
      auth_method?: string | null;
      byok?: boolean | null;
      canonical_model_id?: string | null;
      cost_nanos?: number | null;
      created_at?: string;
      currency?: string | null;
      endpoint?: string | null;
      error_code?: string | null;
      finish_reason?: string | null;
      generation_ms?: number | null;
      key_id?: string | null;
      latency_ms?: number | null;
      location?: string | null;
      model_id?: string | null;
      native_response_id?: string | null;
      oauth_client_id?: string | null;
      pricing_lines?:
        | {
            [key: string]: unknown;
          }[]
        | null;
      provider?: string | null;
      request_id?: string;
      requested_model_id?: string | null;
      routed_model_id?: string | null;
      status_code?: number | null;
      stream?: boolean | null;
      success?: boolean | null;
      throughput?: number | null;
      usage?: {
        [key: string]: unknown;
      } | null;
    };
    ok: true;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetGenerationParams = {
  path?: Record<string, never>;
  query?: {
    id: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieve a specific generation by ID.
 */
export async function getGeneration(
  client: Client,
  args: GetGenerationParams = {},
): Promise<{
  app_id?: string | null;
  byok?: boolean;
  cost_nanos?: number;
  created_at?: string;
  currency?: string;
  endpoint?: string;
  error_code?: string | null;
  error_message?: string | null;
  generation_ms?: number;
  key_id?: string;
  latency_ms?: number;
  model_id?: string;
  native_response_id?: string | null;
  pricing_lines?: {}[];
  provider?: string;
  replay_request?: {
    [key: string]: unknown;
  } | null;
  replay_supported?: boolean;
  request_id?: string;
  status_code?: number;
  stream?: boolean;
  success?: boolean;
  team_id?: string;
  throughput?: number | null;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  } | null;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/generations";
  return client.request<{
    app_id?: string | null;
    byok?: boolean;
    cost_nanos?: number;
    created_at?: string;
    currency?: string;
    endpoint?: string;
    error_code?: string | null;
    error_message?: string | null;
    generation_ms?: number;
    key_id?: string;
    latency_ms?: number;
    model_id?: string;
    native_response_id?: string | null;
    pricing_lines?: {}[];
    provider?: string;
    replay_request?: {
      [key: string]: unknown;
    } | null;
    replay_supported?: boolean;
    request_id?: string;
    status_code?: number;
    stream?: boolean;
    success?: boolean;
    team_id?: string;
    throughput?: number | null;
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      total_tokens?: number;
    } | null;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetGuardrailParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a guardrail and its assigned key IDs. Requires `guardrails:read`.
 */
export async function getGuardrail(
  client: Client,
  args: GetGuardrailParams,
): Promise<{
  data: {
    allowed_api_model_ids?: string[] | null;
    created_at?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    description?: string | null;
    enabled?: boolean | null;
    id: string;
    key_ids: string[];
    model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    prompt_injection_action?: "flag" | "block" | null;
    prompt_injection_enabled?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    sensitive_info_default_action?: "flag" | "redact" | "block" | null;
    sensitive_info_enabled?: boolean | null;
    sensitive_info_rules?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      allowed_api_model_ids?: string[] | null;
      created_at?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      description?: string | null;
      enabled?: boolean | null;
      id: string;
      key_ids: string[];
      model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      privacy_enable_free_may_publish_prompts?: boolean | null;
      privacy_enable_free_may_train?: boolean | null;
      privacy_enable_input_output_logging?: boolean | null;
      privacy_enable_paid_may_train?: boolean | null;
      privacy_zdr_only?: boolean | null;
      prompt_injection_action?: "flag" | "block" | null;
      prompt_injection_enabled?: boolean | null;
      provider_restriction_enforce_allowed?: boolean | null;
      provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      provider_restriction_provider_ids?: string[] | null;
      sensitive_info_default_action?: "flag" | "redact" | "block" | null;
      sensitive_info_enabled?: boolean | null;
      sensitive_info_rules?:
        | {
            [key: string]: unknown;
          }[]
        | null;
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetHealthParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a minimal gateway health snapshot.
 */
export async function getHealth(
  client: Client,
  args: GetHealthParams = {},
): Promise<{
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/health";
  return client.request<{
    status?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetManagementKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns management-key metadata without the secret. Requires `management_keys:read`.
 */
export async function getManagementKey(
  client: Client,
  args: GetManagementKeyParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    expires_at?: string | null;
    id: string;
    last_used_at?: string | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    prefix: string;
    scopes: string[];
    soft_blocked?: boolean | null;
    status: "active" | "paused";
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/management-keys/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      expires_at?: string | null;
      id: string;
      last_used_at?: string | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      prefix: string;
      scopes: string[];
      soft_blocked?: boolean | null;
      status: "active" | "paused";
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetMeParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the OAuth token's user, the token's client and scopes, and the workspaces the user belongs to. OAuth token with me:read required; management keys are refused.
 */
export async function getMe(
  client: Client,
  args: GetMeParams = {},
): Promise<{
  data: {
    current_workspace_id?: string;
    oauth?: {
      client_id?: string;
      resource?: string | null;
      scopes?: string[];
    };
    user?: {
      email?: string | null;
      id?: string;
      name?: string | null;
    };
    workspaces?: {
      current?: boolean;
      id?: string;
      name?: string | null;
      role?: string | null;
      slug?: string | null;
    }[];
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/me";
  return client.request<{
    data: {
      current_workspace_id?: string;
      oauth?: {
        client_id?: string;
        resource?: string | null;
        scopes?: string[];
      };
      user?: {
        email?: string | null;
        id?: string;
        name?: string | null;
      };
      workspaces?: {
        current?: boolean;
        id?: string;
        name?: string | null;
        role?: string | null;
        slug?: string | null;
      }[];
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetMusicGenerationParams = {
  path: {
    music_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves a normalized music result using the Phaseo request ID returned by POST /music/generate. Provider-specific status APIs are handled internally.
 */
export async function getMusicGeneration(
  client: Client,
  args: GetMusicGenerationParams,
): Promise<{
  audio_base64?: string;
  audio_url?: string;
  id: string;
  model: string;
  nativeResponseId?: string | null;
  object: "music";
  output?: {
    [key: string]: unknown;
  }[];
  provider: string;
  result?: unknown;
  status: "queued" | "in_progress" | "completed" | "failed";
  usage?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["music_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/music/generate/${encodeURIComponent(String(path["music_id"]))}`;
  return client.request<{
    audio_base64?: string;
    audio_url?: string;
    id: string;
    model: string;
    nativeResponseId?: string | null;
    object: "music";
    output?: {
      [key: string]: unknown;
    }[];
    provider: string;
    result?: unknown;
    status: "queued" | "in_progress" | "completed" | "failed";
    usage?: {
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetMusicGenerationAliasParams = {
  path: {
    music_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /music/generate/{music_id}.
 */
export async function getMusicGenerationAlias(
  client: Client,
  args: GetMusicGenerationAliasParams,
): Promise<{
  audio_base64?: string;
  audio_url?: string;
  id: string;
  model: string;
  nativeResponseId?: string | null;
  object: "music";
  output?: {
    [key: string]: unknown;
  }[];
  provider: string;
  result?: unknown;
  status: "queued" | "in_progress" | "completed" | "failed";
  usage?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["music_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/music/generations/${encodeURIComponent(String(path["music_id"]))}`;
  return client.request<{
    audio_base64?: string;
    audio_url?: string;
    id: string;
    model: string;
    nativeResponseId?: string | null;
    object: "music";
    output?: {
      [key: string]: unknown;
    }[];
    provider: string;
    result?: unknown;
    status: "queued" | "in_progress" | "completed" | "failed";
    usage?: {
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetMyProfileParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the profile fields shown on the dashboard's Profile page. OAuth token with me:read required.
 */
export async function getMyProfile(
  client: Client,
  args: GetMyProfileParams = {},
): Promise<{
  data: {
    default_workspace_id?: string | null;
    display_name?: string | null;
    obfuscate_info?: boolean;
    user_id?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/me/profile";
  return client.request<{
    data: {
      default_workspace_id?: string | null;
      display_name?: string | null;
      obfuscate_info?: boolean;
      user_id?: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetOAuthClientParams = {
  path: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one active OAuth application. Requires `oauth_clients:read` and the OAuth beta feature.
 */
export async function getOAuthClient(
  client: Client,
  args: GetOAuthClientParams,
): Promise<{
  active_authorizations?: number;
  allowed_scopes?: string[];
  client_id: string;
  client_type: "public" | "confidential";
  created_at?: string | null;
  description?: string | null;
  homepage_url?: string | null;
  last_used_at?: string | null;
  logo_url?: string | null;
  name: string;
  privacy_policy_url?: string | null;
  redirect_uris: string[];
  requests_last_30d?: number;
  status: string;
  terms_of_service_url?: string | null;
  total_authorizations?: number;
  updated_at?: string | null;
  workspace_id: string;
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["client_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path["client_id"]))}`;
  return client.request<{
    active_authorizations?: number;
    allowed_scopes?: string[];
    client_id: string;
    client_type: "public" | "confidential";
    created_at?: string | null;
    description?: string | null;
    homepage_url?: string | null;
    last_used_at?: string | null;
    logo_url?: string | null;
    name: string;
    privacy_policy_url?: string | null;
    redirect_uris: string[];
    requests_last_30d?: number;
    status: string;
    terms_of_service_url?: string | null;
    total_authorizations?: number;
    updated_at?: string | null;
    workspace_id: string;
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetObservabilityDestinationParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns destination metadata and filters without secret configuration.
 */
export async function getObservabilityDestination(
  client: Client,
  args: GetObservabilityDestinationParams,
): Promise<{
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
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/observability/destinations/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
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
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetObservabilityLoggingPolicyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns workspace log storage and retention settings with read-only billing state.
 */
export async function getObservabilityLoggingPolicy(
  client: Client,
  args: GetObservabilityLoggingPolicyParams = {},
): Promise<{
  data: {
    billing_status: "active" | "grace" | "suspended";
    enabled: boolean;
    grace_until?: string | null;
    include_provider_payloads: boolean;
    price_per_million_units_nanos: number;
    retention_days: number;
    updated_at?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/observability/logging-policy";
  return client.request<{
    data: {
      billing_status: "active" | "grace" | "suspended";
      enabled: boolean;
      grace_until?: string | null;
      include_provider_payloads: boolean;
      price_per_million_units_nanos: number;
      retention_days: number;
      updated_at?: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetPresetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Gets an active preset by UUID, slug, or canonical name.
 */
export async function getPreset(
  client: Client,
  args: GetPresetParams,
): Promise<{
  data: {
    active_version_id?: string | null;
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at?: string | null;
    created_by?: string | null;
    description?: string | null;
    id: string;
    name: string;
    slug: string;
    source_preset_id?: string | null;
    source_preset_version_id?: string | null;
    updated_at?: string | null;
    upstream_version_id?: string | null;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      active_version_id?: string | null;
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at?: string | null;
      created_by?: string | null;
      description?: string | null;
      id: string;
      name: string;
      slug: string;
      source_preset_id?: string | null;
      source_preset_version_id?: string | null;
      updated_at?: string | null;
      upstream_version_id?: string | null;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetPresetPublisherParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the canonical public-preset publisher handle for the workspace.
 */
export async function getPresetPublisher(
  client: Client,
  args: GetPresetPublisherParams = {},
): Promise<{
  data: {
    handle: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/presets/publisher";
  return client.request<{
    data: {
      handle: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetPresetTestRunParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a test run and its feedback summary.
 */
export async function getPresetTestRun(
  client: Client,
  args: GetPresetTestRunParams,
): Promise<{
  data: {
    baseline_preset_id: string | null;
    completed_at: string | null;
    config: {
      [key: string]: unknown;
    };
    created_at: string;
    created_by_user_id: string | null;
    dataset_name: string | null;
    description: string | null;
    id: string;
    name: string | null;
    preset_id: string | null;
    started_at: string | null;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    summary: {
      [key: string]: unknown;
    };
    updated_at: string;
    workspace_id: string;
  };
  feedback_summary: {
    average_score: number | null;
    count: number;
    last_feedback_at: string | null;
    metadata_key?: string;
    metadata_value?: string | null;
    negative: number;
    partial: number;
    positive: number;
    preset_id?: string | null;
    ratings: {
      [key: string]: number;
    };
    test_run_id?: string | null;
  } | null;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/preset-test-runs/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      baseline_preset_id: string | null;
      completed_at: string | null;
      config: {
        [key: string]: unknown;
      };
      created_at: string;
      created_by_user_id: string | null;
      dataset_name: string | null;
      description: string | null;
      id: string;
      name: string | null;
      preset_id: string | null;
      started_at: string | null;
      status: "pending" | "running" | "completed" | "failed" | "cancelled";
      summary: {
        [key: string]: unknown;
      };
      updated_at: string;
      workspace_id: string;
    };
    feedback_summary: {
      average_score: number | null;
      count: number;
      last_feedback_at: string | null;
      metadata_key?: string;
      metadata_value?: string | null;
      negative: number;
      partial: number;
      positive: number;
      preset_id?: string | null;
      ratings: {
        [key: string]: number;
      };
      test_run_id?: string | null;
    } | null;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetPrivateModelParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns endpoint metadata for one private model in the authenticated workspace without returning its credential.
 */
export async function getPrivateModel(
  client: Client,
  args: GetPrivateModelParams,
): Promise<{
  data: {
    base_url: string;
    catalog_model_id?: string | null;
    context_length?: number | null;
    created_at?: string | null;
    created_by?: string | null;
    credential_prefix?: string | null;
    credential_suffix?: string | null;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string | null;
    enabled: boolean;
    host_provider_id?: string | null;
    id: string;
    input_modalities?: string[];
    local_slug?: string;
    max_output_tokens?: number | null;
    model_id: string;
    name: string;
    output_modalities?: string[];
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses: boolean;
    updated_at?: string | null;
    upstream_model_id: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/private-models/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      base_url: string;
      catalog_model_id?: string | null;
      context_length?: number | null;
      created_at?: string | null;
      created_by?: string | null;
      credential_prefix?: string | null;
      credential_suffix?: string | null;
      custom_provider_name?: string | null;
      custom_provider_url?: string | null;
      description?: string | null;
      enabled: boolean;
      host_provider_id?: string | null;
      id: string;
      input_modalities?: string[];
      local_slug?: string;
      max_output_tokens?: number | null;
      model_id: string;
      name: string;
      output_modalities?: string[];
      routing_policy?: "preferred" | "balanced" | "fallback";
      supports_responses: boolean;
      updated_at?: string | null;
      upstream_model_id: string;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetProviderCredentialParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns safe metadata without exposing encrypted fields or the raw secret.
 */
export async function getProviderCredential(
  client: Client,
  args: GetProviderCredentialParams,
): Promise<{
  data: {
    allowed_api_key_ids?: string[];
    allowed_model_slugs?: string[];
    always_use?: boolean;
    created_at?: string | null;
    created_by?: string | null;
    disabled: boolean;
    enabled: boolean;
    error_message?: string | null;
    id: string;
    is_fallback: boolean;
    last_used_at?: string | null;
    last_verified_at?: string | null;
    name: string;
    prefix?: string | null;
    provider_id: string;
    routing_mode: "priority" | "fallback";
    sort_order: number;
    suffix?: string | null;
    verification_status?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/byok/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      allowed_api_key_ids?: string[];
      allowed_model_slugs?: string[];
      always_use?: boolean;
      created_at?: string | null;
      created_by?: string | null;
      disabled: boolean;
      enabled: boolean;
      error_message?: string | null;
      id: string;
      is_fallback: boolean;
      last_used_at?: string | null;
      last_verified_at?: string | null;
      name: string;
      prefix?: string | null;
      provider_id: string;
      routing_mode: "priority" | "fallback";
      sort_order: number;
      suffix?: string | null;
      verification_status?: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetProviderDerankStatusParams = {
  path: {
    provider_id: string;
  };
  query?: {
    fetch_limit?: number;
    max_pairs?: number;
    window_hours?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns breaker-based derank/recovery status for a provider.
 */
export async function getProviderDerankStatus(
  client: Client,
  args: GetProviderDerankStatusParams,
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["provider_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/health/providers/${encodeURIComponent(String(path["provider_id"]))}/derank`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetRateLimitAssignmentParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one rate limit assignment. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function getRateLimitAssignment(
  client: Client,
  args: GetRateLimitAssignmentParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    id: string;
    policy_id: string;
    target_id: string | null;
    target_type:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/rate-limits/assignments/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      id: string;
      policy_id: string;
      target_id: string | null;
      target_type:
        "key" | "member" | "department" | "guardrail" | "end_user_default";
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetRateLimitPolicyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one rate limit policy. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function getRateLimitPolicy(
  client: Client,
  args: GetRateLimitPolicyParams,
): Promise<{
  data: {
    concurrent_requests: number | null;
    created_at: string;
    created_by?: string | null;
    description: string | null;
    fail_closed: boolean;
    id: string;
    name: string;
    requests_per_minute: number | null;
    tokens_per_minute: number | null;
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/rate-limits/policies/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      concurrent_requests: number | null;
      created_at: string;
      created_by?: string | null;
      description: string | null;
      fail_closed: boolean;
      id: string;
      name: string;
      requests_per_minute: number | null;
      tokens_per_minute: number | null;
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetRateLimitTierParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the workspace's trust tier, its requests per minute, and whether it can raise itself one tier now. Workspace owners and admins (OAuth) or management keys with rate_limits:read. canRaise is true only for the workspace owner.
 */
export async function getRateLimitTier(
  client: Client,
  args: GetRateLimitTierParams = {},
): Promise<{
  data: {
    activeUntil?: number | null;
    availableAt?: number | null;
    canRaise?: boolean;
    durationDays?: number;
    eligible?: boolean;
    refusal?: string | null;
    requestsPerMinute?: number;
    target?: string | null;
    targetRequestsPerMinute?: number | null;
    thresholds?: {
      minAgeDays?: number;
      minLifetimePaidSpendUsd?: number;
    };
    tier?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rate-limits/tier";
  return client.request<{
    data: {
      activeUntil?: number | null;
      availableAt?: number | null;
      canRaise?: boolean;
      durationDays?: number;
      eligible?: boolean;
      refusal?: string | null;
      requestsPerMinute?: number;
      target?: string | null;
      targetRequestsPerMinute?: number | null;
      thresholds?: {
        minAgeDays?: number;
        minLifetimePaidSpendUsd?: number;
      };
      tier?: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetSpendRuleParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one spend rule.
 */
export async function getSpendRule(
  client: Client,
  args: GetSpendRuleParams,
): Promise<{
  data: {
    action: "notify" | "block";
    base_amount_nanos: number | null;
    base_amount_usd: number | null;
    base_kind:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_ref: "daily" | "weekly" | "monthly" | null;
    block_at_amount_nanos: number | null;
    block_at_amount_usd: number | null;
    block_at_percent: number;
    block_free_models: boolean;
    cooldown_minutes: number;
    created_at: string;
    created_by: string | null;
    destination_ids: string[];
    enabled: boolean;
    evaluated: boolean;
    id: string;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    name: string;
    period: "day" | "week" | "month" | "rolling";
    runway_days: number | null;
    scope_id: string | null;
    scope_type:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spike_floor_nanos: number | null;
    spike_floor_usd: number | null;
    spike_multiplier: number | null;
    threshold_amount_nanos: number | null;
    threshold_amount_usd: number | null;
    threshold_percents: number[] | null;
    time_zone: string | null;
    updated_at: string;
    window_hours: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-rules/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      action: "notify" | "block";
      base_amount_nanos: number | null;
      base_amount_usd: number | null;
      base_kind:
        "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
      base_ref: "daily" | "weekly" | "monthly" | null;
      block_at_amount_nanos: number | null;
      block_at_amount_usd: number | null;
      block_at_percent: number;
      block_free_models: boolean;
      cooldown_minutes: number;
      created_at: string;
      created_by: string | null;
      destination_ids: string[];
      enabled: boolean;
      evaluated: boolean;
      id: string;
      metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
      name: string;
      period: "day" | "week" | "month" | "rolling";
      runway_days: number | null;
      scope_id: string | null;
      scope_type:
        "workspace" | "key" | "member" | "department" | "model" | "provider";
      spike_floor_nanos: number | null;
      spike_floor_usd: number | null;
      spike_multiplier: number | null;
      threshold_amount_nanos: number | null;
      threshold_amount_usd: number | null;
      threshold_percents: number[] | null;
      time_zone: string | null;
      updated_at: string;
      window_hours: number | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves the status for a video generation request. Poll every 20 seconds unless you are using webhooks.
 */
export async function getVideo(
  client: Client,
  args: GetVideoParams,
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    billable?: boolean;
    billed_at?: string;
    charge_reason?: string | null;
    charged?: boolean | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
    [key: string]: unknown;
  };
  cancel_url?: string | null;
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  model?: string;
  native_video_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/videos/${encodeURIComponent(String(path["video_id"]))}`;
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      billable?: boolean;
      billed_at?: string;
      charge_reason?: string | null;
      charged?: boolean | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
      [key: string]: unknown;
    };
    cancel_url?: string | null;
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    model?: string;
    native_video_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoAliasParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}.
 */
export async function getVideoAlias(
  client: Client,
  args: GetVideoAliasParams,
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    billable?: boolean;
    billed_at?: string;
    charge_reason?: string | null;
    charged?: boolean | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
    [key: string]: unknown;
  };
  cancel_url?: string | null;
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  model?: string;
  native_video_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path["video_id"]))}`;
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      billable?: boolean;
      billed_at?: string;
      charge_reason?: string | null;
      charged?: boolean | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
      [key: string]: unknown;
    };
    cancel_url?: string | null;
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    model?: string;
    native_video_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoContentParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Downloads the rendered video content.
 */
export async function getVideoContent(
  client: Client,
  args: GetVideoContentParams,
): Promise<Blob> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/videos/${encodeURIComponent(String(path["video_id"]))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoContentAliasParams = {
  path: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}/content.
 */
export async function getVideoContentAlias(
  client: Client,
  args: GetVideoContentAliasParams,
): Promise<Blob> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["video_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path["video_id"]))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWebhookEndpointParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one async webhook endpoint without its signing secret. Requires `settings:read`.
 */
export async function getWebhookEndpoint(
  client: Client,
  args: GetWebhookEndpointParams,
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events: (
    | "job.created"
    | "job.status_changed"
    | "job.progress"
    | "job.completed"
    | "job.failed"
    | "job.cancelled"
    | "job.expired"
    | "video.created"
    | "video.status_changed"
    | "video.progress"
    | "video.completed"
    | "video.failed"
    | "video.cancelled"
    | "video.expired"
    | "batch.created"
    | "batch.status_changed"
    | "batch.progress"
    | "batch.completed"
    | "batch.failed"
    | "batch.cancelled"
    | "batch.expired"
  )[];
  hasSecret: boolean;
  id: string;
  name: string;
  status: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url: string;
  workspaceId: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events: (
      | "job.created"
      | "job.status_changed"
      | "job.progress"
      | "job.completed"
      | "job.failed"
      | "job.cancelled"
      | "job.expired"
      | "video.created"
      | "video.status_changed"
      | "video.progress"
      | "video.completed"
      | "video.failed"
      | "video.cancelled"
      | "video.expired"
      | "batch.created"
      | "batch.status_changed"
      | "batch.progress"
      | "batch.completed"
      | "batch.failed"
      | "batch.cancelled"
      | "batch.expired"
    )[];
    hasSecret: boolean;
    id: string;
    name: string;
    status: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url: string;
    workspaceId: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkloadIdentityPolicyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one trusted workload policy. Requires keys:read on management keys and OAuth tokens, or a workspace owner or admin. Available only to workspaces in the trusted workloads beta; other workspaces get 404.
 */
export async function getWorkloadIdentityPolicy(
  client: Client,
  args: GetWorkloadIdentityPolicyParams,
): Promise<{
  data: {
    audience: string;
    claim_conditions: {
      [key: string]: string[];
    };
    created_at: string;
    created_by: string | null;
    id: string;
    issuer: string;
    key_id: string;
    last_used_at: string | null;
    max_token_lifetime_seconds: number;
    name: string;
    owner_id: string;
    provider: "vercel" | "github_actions";
    status: "active" | "disabled";
    updated_at: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workload-identity/policies/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      audience: string;
      claim_conditions: {
        [key: string]: string[];
      };
      created_at: string;
      created_by: string | null;
      id: string;
      issuer: string;
      key_id: string;
      last_used_at: string | null;
      max_token_lifetime_seconds: number;
      name: string;
      owner_id: string;
      provider: "vercel" | "github_actions";
      status: "active" | "disabled";
      updated_at: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a workspace by UUID or slug. Management API key required.
 */
export async function getWorkspace(
  client: Client,
  args: GetWorkspaceParams,
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug?: string | null;
    updated_at: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug?: string | null;
      updated_at: string | null;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceBudgetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns one workspace spend ceiling with current usage and remaining spend.
 */
export async function getWorkspaceBudget(
  client: Client,
  args: GetWorkspaceBudgetParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly" | "lifetime";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/budgets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly" | "lifetime";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceDirectoryParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns enterprise departments and effective member entitlements. Requires the identity add-on, `settings:read`, and an owner or admin identity.
 */
export async function getWorkspaceDirectory(
  client: Client,
  args: GetWorkspaceDirectoryParams = {},
): Promise<{
  data: {
    departments: {
      color?: string;
      created_at?: string | null;
      description?: string | null;
      directory_name?: string | null;
      icon?: string;
      id: string;
      name: string;
      name_overridden?: boolean;
      source_id?: string | null;
      source_type?: "manual" | "scim_group";
      updated_at?: string | null;
    }[];
    members: {
      access_source: string;
      department: {
        color?: string;
        created_at?: string | null;
        description?: string | null;
        directory_name?: string | null;
        icon?: string;
        id: string;
        name: string;
        name_overridden?: boolean;
        source_id?: string | null;
        source_type?: "manual" | "scim_group";
        updated_at?: string | null;
      } | null;
      department_override_enabled: boolean;
      department_override_id: string | null;
      department_source: string;
      directory_department?: string | null;
      display_name: string;
      effective_role: "owner" | "admin" | "member";
      email?: string | null;
      joined_at?: string | null;
      role_override: "admin" | "member" | null;
      status: "active" | "suspended";
      user_id: string;
      workspace_role: string;
    }[];
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/directory";
  return client.request<{
    data: {
      departments: {
        color?: string;
        created_at?: string | null;
        description?: string | null;
        directory_name?: string | null;
        icon?: string;
        id: string;
        name: string;
        name_overridden?: boolean;
        source_id?: string | null;
        source_type?: "manual" | "scim_group";
        updated_at?: string | null;
      }[];
      members: {
        access_source: string;
        department: {
          color?: string;
          created_at?: string | null;
          description?: string | null;
          directory_name?: string | null;
          icon?: string;
          id: string;
          name: string;
          name_overridden?: boolean;
          source_id?: string | null;
          source_type?: "manual" | "scim_group";
          updated_at?: string | null;
        } | null;
        department_override_enabled: boolean;
        department_override_id: string | null;
        department_source: string;
        directory_department?: string | null;
        display_name: string;
        effective_role: "owner" | "admin" | "member";
        email?: string | null;
        joined_at?: string | null;
        role_override: "admin" | "member" | null;
        status: "active" | "suspended";
        user_id: string;
        workspace_role: string;
      }[];
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceNotificationSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns auto top-up policy, low-balance email configuration, and workspace email preferences. Requires `settings:read` and an owner or admin identity.
 */
export async function getWorkspaceNotificationSettings(
  client: Client,
  args: GetWorkspaceNotificationSettingsParams = {},
): Promise<{
  data: {
    auto_top_up: {
      amount_nanos: number;
      balance_threshold_nanos: number;
      enabled: boolean;
      payment_method_id: string | null;
    };
    email_preferences: {
      auto_top_up_failure: boolean;
      model_deprecation: boolean;
      payment_method_expiring: boolean;
    };
    low_balance_email: {
      enabled: boolean;
      threshold_usd: number;
    };
    spend: {
      billing_time_zone: string;
      department_attribution: "all" | "primary";
    };
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/notifications/settings";
  return client.request<{
    data: {
      auto_top_up: {
        amount_nanos: number;
        balance_threshold_nanos: number;
        enabled: boolean;
        payment_method_id: string | null;
      };
      email_preferences: {
        auto_top_up_failure: boolean;
        model_deprecation: boolean;
        payment_method_expiring: boolean;
      };
      low_balance_email: {
        enabled: boolean;
        threshold_usd: number;
      };
      spend: {
        billing_time_zone: string;
        department_attribution: "all" | "primary";
      };
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceScimParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns endpoint status, token metadata, provisioned object counts, and the latest SCIM event.
 */
export async function getWorkspaceScim(
  client: Client,
  args: GetWorkspaceScimParams = {},
): Promise<{
  data: {
    endpoint: {
      created_at?: string | null;
      enabled: boolean;
      id: string;
      updated_at?: string | null;
    } | null;
    group_count: number;
    last_event: {
      action?: string;
      correlation_id?: string | null;
      created_at?: string;
      detail?: {
        [key: string]: unknown;
      } | null;
      http_status?: number;
      id?: string;
      outcome?: string;
      request_id?: string | null;
      resource_id?: string | null;
      resource_type?: string | null;
      scim_type?: string | null;
    } | null;
    tokens: {
      created_at?: string | null;
      expires_at?: string | null;
      id: string;
      label: string;
      last_used_at?: string | null;
      revoked_at?: string | null;
      token_prefix: string;
    }[];
    user_count: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/scim";
  return client.request<{
    data: {
      endpoint: {
        created_at?: string | null;
        enabled: boolean;
        id: string;
        updated_at?: string | null;
      } | null;
      group_count: number;
      last_event: {
        action?: string;
        correlation_id?: string | null;
        created_at?: string;
        detail?: {
          [key: string]: unknown;
        } | null;
        http_status?: number;
        id?: string;
        outcome?: string;
        request_id?: string | null;
        resource_id?: string | null;
        resource_type?: string | null;
        scim_type?: string | null;
      } | null;
      tokens: {
        created_at?: string | null;
        expires_at?: string | null;
        id: string;
        label: string;
        last_used_at?: string | null;
        revoked_at?: string | null;
        token_prefix: string;
      }[];
      user_count: number;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the automatable workspace routing, provider, privacy, and gateway defaults.
 */
export async function getWorkspaceSettings(
  client: Client,
  args: GetWorkspaceSettingsParams = {},
): Promise<{
  data: {
    alpha_channel_enabled?: boolean | null;
    beta_channel_enabled?: boolean | null;
    byok_fallback_enabled?: boolean | null;
    io_logging_enabled?: boolean | null;
    io_logging_include_provider_payloads?: boolean | null;
    model_successor_max_price_increase_percent?: number | null;
    model_successor_price_policy?: "never" | "limit" | "any" | null;
    model_successor_redirect_enabled?: boolean | null;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    response_healing_enabled?: boolean | null;
    response_healing_locked?: boolean | null;
    response_healing_mode?: "safe" | "strict" | null;
    routing_mode?: "balanced" | "price" | "latency" | "throughput" | null;
    updated_at?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/settings";
  return client.request<{
    data: {
      alpha_channel_enabled?: boolean | null;
      beta_channel_enabled?: boolean | null;
      byok_fallback_enabled?: boolean | null;
      io_logging_enabled?: boolean | null;
      io_logging_include_provider_payloads?: boolean | null;
      model_successor_max_price_increase_percent?: number | null;
      model_successor_price_policy?: "never" | "limit" | "any" | null;
      model_successor_redirect_enabled?: boolean | null;
      privacy_enable_free_may_publish_prompts?: boolean | null;
      privacy_enable_free_may_train?: boolean | null;
      privacy_enable_input_output_logging?: boolean | null;
      privacy_enable_paid_may_train?: boolean | null;
      privacy_zdr_only?: boolean | null;
      provider_restriction_enforce_allowed?: boolean | null;
      provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      provider_restriction_provider_ids?: string[] | null;
      response_healing_enabled?: boolean | null;
      response_healing_locked?: boolean | null;
      response_healing_mode?: "safe" | "strict" | null;
      routing_mode?: "balanced" | "price" | "latency" | "throughput" | null;
      updated_at?: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceSsoParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns workspace SAML or custom OIDC settings. Requires `settings:read` and an owner or admin identity.
 */
export async function getWorkspaceSso(
  client: Client,
  args: GetWorkspaceSsoParams = {},
): Promise<{
  data: {
    domains: string[];
    enabled: boolean;
    enforced: false;
    mode: "none" | "saml" | "custom_oidc";
    provider_identifier: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/sso";
  return client.request<{
    data: {
      domains: string[];
      enabled: boolean;
      enforced: false;
      mode: "none" | "saml" | "custom_oidc";
      provider_identifier: string | null;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type InvalidateApiKeyCacheParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Refreshes globally cached policy state for a workspace API key. Requires an authenticated workspace management caller.
 */
export async function invalidateApiKeyCache(
  client: Client,
  args: InvalidateApiKeyCacheParams,
): Promise<{
  key: {
    id: string;
    kid?: string | null;
    status?: string | null;
    workspace_id: string;
  };
  message: string;
  ok: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/keys/${encodeURIComponent(String(path["id"]))}/invalidate`;
  return client.request<{
    key: {
      id: string;
      kid?: string | null;
      status?: string | null;
      workspace_id: string;
    };
    message: string;
    ok: true;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type LiftSpendBlockParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lifts an active spend block so requests in its scope are accepted again within about a minute. The rule does not block again until its period resets, but it keeps sending alerts. Owners and admins only; the lift is recorded in the audit log and queues a spend_blocked event with state lifted. Returns 404 for an unknown block and 409 spend_block_not_active when it was already lifted.
 */
export async function liftSpendBlock(
  client: Client,
  args: LiftSpendBlockParams,
): Promise<{
  data: {
    active: boolean;
    block_free_models: boolean;
    id: string;
    lift_reason:
      | "manual"
      | "period_reset"
      | "below_limit"
      | "rule_changed"
      | "rule_disabled"
      | "rule_deleted"
      | null;
    lifted_at: string | null;
    lifted_by: string | null;
    limit_nanos: number;
    limit_usd: number;
    period_start: string;
    resets_at: string | null;
    rule_id: string | null;
    rule_name: string | null;
    scope_id: string | null;
    scope_label: string;
    scope_type:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spend_nanos: number;
    spend_usd: number;
    started_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-blocks/${encodeURIComponent(String(path["id"]))}/lift`;
  return client.request<{
    data: {
      active: boolean;
      block_free_models: boolean;
      id: string;
      lift_reason:
        | "manual"
        | "period_reset"
        | "below_limit"
        | "rule_changed"
        | "rule_disabled"
        | "rule_deleted"
        | null;
      lifted_at: string | null;
      lifted_by: string | null;
      limit_nanos: number;
      limit_usd: number;
      period_start: string;
      resets_at: string | null;
      rule_id: string | null;
      rule_name: string | null;
      scope_id: string | null;
      scope_label: string;
      scope_type:
        "workspace" | "key" | "member" | "department" | "model" | "provider";
      spend_nanos: number;
      spend_usd: number;
      started_at: string;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListApiKeysParams = {
  path?: Record<string, never>;
  query?: {
    include_disabled?: boolean;
    limit?: number;
    offset?: number;
    workspace_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists API keys for the authenticated workspace. Management API key required.
 */
export async function listApiKeys(
  client: Client,
  args: ListApiKeysParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    storage_locations?: string[];
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      creator_user_id: string | null;
      department_id?: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      include_byok_in_limit: boolean;
      ip_allowlist?: {
        address: string;
        label: string;
      }[];
      label: string | null;
      last_used_at: string | null;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: "daily" | "weekly" | "monthly" | null;
      limits: {
        daily: {
          cost: number | null;
          requests: number | null;
        };
        monthly: {
          cost: number | null;
          requests: number | null;
        };
        weekly: {
          cost: number | null;
          requests: number | null;
        };
      };
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      storage_locations?: string[];
      updated_at: string | null;
      usage: number;
      usage_daily: number;
      usage_details: {
        daily: {
          cost: number;
          requests: number;
        };
        monthly: {
          cost: number;
          requests: number;
        };
        total: {
          cost: number;
          requests: number;
        };
        weekly: {
          cost: number;
          requests: number;
        };
      };
      usage_monthly: number;
      usage_weekly: number;
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListAuthorizedAppsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the apps you have authorized with OAuth, in every workspace. OAuth token with oauth_clients:read required.
 */
export async function listAuthorizedApps(
  client: Client,
  args: ListAuthorizedAppsParams = {},
): Promise<{
  data: {
    app_name?: string;
    authorized_at?: string;
    client_id?: string;
    current?: boolean;
    id?: string;
    last_used_at?: string | null;
    scopes?: string[];
    workspace_id?: string;
    workspace_name?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/me/authorized-apps";
  return client.request<{
    data: {
      app_name?: string;
      authorized_at?: string;
      client_id?: string;
      current?: boolean;
      id?: string;
      last_used_at?: string | null;
      scopes?: string[];
      workspace_id?: string;
      workspace_name?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListBatchCapabilitiesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns provider-level batch input mode support for file upload and request-list batch creation.
 */
export async function listBatchCapabilities(
  client: Client,
  args: ListBatchCapabilitiesParams = {},
): Promise<{
  data?: {
    documentation_url?: string;
    endpoints?: {
      endpoint: string;
      mode: "native" | "translated";
    }[];
    gateway_input_modes?: ("file" | "requests")[];
    id?: string;
    name?: string;
    native_input_modes?: ("file" | "requests")[];
    notes?: string | null;
    status?: "active" | "planned";
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches/capabilities";
  return client.request<{
    data?: {
      documentation_url?: string;
      endpoints?: {
        endpoint: string;
        mode: "native" | "translated";
      }[];
      gateway_input_modes?: ("file" | "requests")[];
      id?: string;
      name?: string;
      native_input_modes?: ("file" | "requests")[];
      notes?: string | null;
      status?: "active" | "planned";
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

export type ListBatchCapabilitiesAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/capabilities.
 */
export async function listBatchCapabilitiesAlias(
  client: Client,
  args: ListBatchCapabilitiesAliasParams = {},
): Promise<{
  data?: {
    documentation_url?: string;
    endpoints?: {
      endpoint: string;
      mode: "native" | "translated";
    }[];
    gateway_input_modes?: ("file" | "requests")[];
    id?: string;
    name?: string;
    native_input_modes?: ("file" | "requests")[];
    notes?: string | null;
    status?: "active" | "planned";
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch/capabilities";
  return client.request<{
    data?: {
      documentation_url?: string;
      endpoints?: {
        endpoint: string;
        mode: "native" | "translated";
      }[];
      gateway_input_modes?: ("file" | "requests")[];
      id?: string;
      name?: string;
      native_input_modes?: ("file" | "requests")[];
      notes?: string | null;
      status?: "active" | "planned";
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

export type ListBatchesParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    status?: string[];
    statuses?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists owned async batch jobs for the authenticated workspace from the gateway's persisted async job store.
 */
export async function listBatches(
  client: Client,
  args: ListBatchesParams = {},
): Promise<{
  data?: {
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }[];
  first_id?: string | null;
  has_more?: boolean;
  last_id?: string | null;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches";
  return client.request<{
    data?: {
      billing?: {
        billed?: boolean;
        charged?: boolean;
        cost_nanos?: number | null;
        cost_usd?: number | null;
        currency?: string;
        estimated_nanos?: number | null;
        estimated_provider_cost?: string | null;
        estimated_user_cost?: string | null;
        estimation_sample_size?: number | null;
        estimation_total_rows?: number | null;
        estimation_truncated?: boolean | null;
        finalized_at?: string | null;
        pricing_breakdown?: {
          [key: string]: unknown;
        };
        reason?: string;
        reservation_id?: string | null;
        reservation_status?: string | null;
        reserved_nanos?: number | null;
        settled_provider_cost?: string | null;
        settled_user_cost?: string | null;
        state?: "pending" | "estimated" | "settled" | "void";
        total_nanos?: number | null;
      };
      cancel_url?: string | null;
      cancelled_at?: number;
      cancelling_at?: number;
      completed_at?: number;
      completion_window?: string;
      created_at?: number;
      endpoint?: string;
      error_file_id?: string;
      errors?: {};
      expired_at?: number;
      expires_at?: number;
      failed_at?: number;
      finalized_at?: string | null;
      finalizing_at?: number;
      id?: string;
      in_progress_at?: number;
      input_file_id?: string;
      last_webhook_dispatched_at?: string | null;
      last_webhook_progress?: number | null;
      last_webhook_progress_at?: string | null;
      lifecycle_status?:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
      metadata?: {};
      native_batch_id?: string | null;
      next_webhook_retry_at?: string | null;
      object?: string;
      output_file_id?: string;
      polling_url?: string;
      pricing_lines?: {
        [key: string]: unknown;
      }[];
      progress?: number;
      provider?: string;
      request_counts?: {
        completed?: number;
        failed?: number;
        total?: number;
      };
      request_id?: string;
      results_url?: string | null;
      session_id?: string;
      status?: string;
      usage?: {
        cost_nanos?: number | null;
        cost_usd?: number | null;
        currency?: string;
        input_tokens?: number | null;
        output_tokens?: number | null;
        requests?: number | null;
        total_tokens?: number | null;
      };
      webhook?: {
        attempts?: {
          attempt_number?: number;
          delivered_at?: string | null;
          delivery_key?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          max_attempts?: number;
          next_retry_at?: string | null;
          response_body_preview?: string | null;
          response_status?: number | null;
          status?: "delivered" | "scheduled_retry" | "failed_permanently";
          tried_at?: string;
        }[];
        delivery?: {
          delivered_event_types?: string[];
          delivered_events?: number;
          last_attempt_at?: string | null;
          last_attempt_status?:
            "delivered" | "scheduled_retry" | "failed_permanently" | null;
          last_delivered_at?: string | null;
          last_error_message?: string | null;
          last_failure_at?: string | null;
          last_response_status?: number | null;
          next_retry_at?: string | null;
          pending_retries?: number;
          total_attempts?: number;
        };
        events?: string[];
        has_secret?: boolean;
        url?: string | null;
      };
      websocket_url?: string;
    }[];
    first_id?: string | null;
    has_more?: boolean;
    last_id?: string | null;
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListBatchesAliasParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    status?: string[];
    statuses?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches.
 */
export async function listBatchesAlias(
  client: Client,
  args: ListBatchesAliasParams = {},
): Promise<{
  data?: {
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }[];
  first_id?: string | null;
  has_more?: boolean;
  last_id?: string | null;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch";
  return client.request<{
    data?: {
      billing?: {
        billed?: boolean;
        charged?: boolean;
        cost_nanos?: number | null;
        cost_usd?: number | null;
        currency?: string;
        estimated_nanos?: number | null;
        estimated_provider_cost?: string | null;
        estimated_user_cost?: string | null;
        estimation_sample_size?: number | null;
        estimation_total_rows?: number | null;
        estimation_truncated?: boolean | null;
        finalized_at?: string | null;
        pricing_breakdown?: {
          [key: string]: unknown;
        };
        reason?: string;
        reservation_id?: string | null;
        reservation_status?: string | null;
        reserved_nanos?: number | null;
        settled_provider_cost?: string | null;
        settled_user_cost?: string | null;
        state?: "pending" | "estimated" | "settled" | "void";
        total_nanos?: number | null;
      };
      cancel_url?: string | null;
      cancelled_at?: number;
      cancelling_at?: number;
      completed_at?: number;
      completion_window?: string;
      created_at?: number;
      endpoint?: string;
      error_file_id?: string;
      errors?: {};
      expired_at?: number;
      expires_at?: number;
      failed_at?: number;
      finalized_at?: string | null;
      finalizing_at?: number;
      id?: string;
      in_progress_at?: number;
      input_file_id?: string;
      last_webhook_dispatched_at?: string | null;
      last_webhook_progress?: number | null;
      last_webhook_progress_at?: string | null;
      lifecycle_status?:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
      metadata?: {};
      native_batch_id?: string | null;
      next_webhook_retry_at?: string | null;
      object?: string;
      output_file_id?: string;
      polling_url?: string;
      pricing_lines?: {
        [key: string]: unknown;
      }[];
      progress?: number;
      provider?: string;
      request_counts?: {
        completed?: number;
        failed?: number;
        total?: number;
      };
      request_id?: string;
      results_url?: string | null;
      session_id?: string;
      status?: string;
      usage?: {
        cost_nanos?: number | null;
        cost_usd?: number | null;
        currency?: string;
        input_tokens?: number | null;
        output_tokens?: number | null;
        requests?: number | null;
        total_tokens?: number | null;
      };
      webhook?: {
        attempts?: {
          attempt_number?: number;
          delivered_at?: string | null;
          delivery_key?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          max_attempts?: number;
          next_retry_at?: string | null;
          response_body_preview?: string | null;
          response_status?: number | null;
          status?: "delivered" | "scheduled_retry" | "failed_permanently";
          tried_at?: string;
        }[];
        delivery?: {
          delivered_event_types?: string[];
          delivered_events?: number;
          last_attempt_at?: string | null;
          last_attempt_status?:
            "delivered" | "scheduled_retry" | "failed_permanently" | null;
          last_delivered_at?: string | null;
          last_error_message?: string | null;
          last_failure_at?: string | null;
          last_response_status?: number | null;
          next_retry_at?: string | null;
          pending_retries?: number;
          total_attempts?: number;
        };
        events?: string[];
        has_secret?: boolean;
        url?: string | null;
      };
      websocket_url?: string;
    }[];
    first_id?: string | null;
    has_more?: boolean;
    last_id?: string | null;
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListBatchFilesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns an error because listing shared gateway-key files is not supported. Retrieve workspace-owned files directly by id instead.
 */
export async function listBatchFiles(
  client: Client,
  args: ListBatchFilesParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches/files";
  return client.request<unknown>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListBatchFilesAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of GET /batches/files.
 */
export async function listBatchFilesAlias(
  client: Client,
  args: ListBatchFilesAliasParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch/files";
  return client.request<unknown>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListBatchModelsParams = {
  path?: Record<string, never>;
  query?: {
    params?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns DB-backed batch model/provider capability metadata, including supported batch parameters such as allowed input endpoints and completion windows.
 */
export async function listBatchModels(
  client: Client,
  args: ListBatchModelsParams = {},
): Promise<{
  data?: {
    input_types?: string[];
    model?: string;
    name?: string;
    output_types?: string[];
    pricing?: {
      [key: string]: unknown;
    };
    providers?: {
      id?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
    }[];
    status?: string;
    supported_parameters?: string[];
    supported_parameters_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    supported_params?: string[];
    supported_params_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches/models";
  return client.request<{
    data?: {
      input_types?: string[];
      model?: string;
      name?: string;
      output_types?: string[];
      pricing?: {
        [key: string]: unknown;
      };
      providers?: {
        id?: string;
        supported_parameters?: string[];
        supported_parameters_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        supported_params?: string[];
        supported_params_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
      }[];
      status?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
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

export type ListBatchModelsAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/models.
 */
export async function listBatchModelsAlias(
  client: Client,
  args: ListBatchModelsAliasParams = {},
): Promise<{
  data?: {
    input_types?: string[];
    model?: string;
    name?: string;
    output_types?: string[];
    pricing?: {
      [key: string]: unknown;
    };
    providers?: {
      id?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
    }[];
    status?: string;
    supported_parameters?: string[];
    supported_parameters_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    supported_params?: string[];
    supported_params_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch/models";
  return client.request<{
    data?: {
      input_types?: string[];
      model?: string;
      name?: string;
      output_types?: string[];
      pricing?: {
        [key: string]: unknown;
      };
      providers?: {
        id?: string;
        supported_parameters?: string[];
        supported_parameters_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        supported_params?: string[];
        supported_params_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
      }[];
      status?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
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

export type ListBatchRequestsParams = {
  path: {
    batch_id: string;
  };
  query?: {
    limit?: number;
    offset?: number;
    status?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists tracked per-request rows for an owned batch job.
 */
export async function listBatchRequests(
  client: Client,
  args: ListBatchRequestsParams,
): Promise<{
  batch_id?: string;
  data?: {
    completed_at?: string | null;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    created_at?: string | null;
    custom_id?: string;
    endpoint?: string | null;
    error_body?: {
      [key: string]: unknown;
    } | null;
    id?: string;
    meta?: {
      [key: string]: unknown;
    };
    method?: string | null;
    model?: string | null;
    native_batch_id?: string | null;
    provider?: string;
    request_body_hash?: string | null;
    request_index?: number;
    response_body?: {
      [key: string]: unknown;
    } | null;
    response_status?: number | null;
    status?: string;
    updated_at?: string | null;
    usage?: {
      [key: string]: unknown;
    } | null;
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["batch_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batches/${encodeURIComponent(String(path["batch_id"]))}/requests`;
  return client.request<{
    batch_id?: string;
    data?: {
      completed_at?: string | null;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      created_at?: string | null;
      custom_id?: string;
      endpoint?: string | null;
      error_body?: {
        [key: string]: unknown;
      } | null;
      id?: string;
      meta?: {
        [key: string]: unknown;
      };
      method?: string | null;
      model?: string | null;
      native_batch_id?: string | null;
      provider?: string;
      request_body_hash?: string | null;
      request_index?: number;
      response_body?: {
        [key: string]: unknown;
      } | null;
      response_status?: number | null;
      status?: string;
      updated_at?: string | null;
      usage?: {
        [key: string]: unknown;
      } | null;
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

export type ListBatchRequestsAliasParams = {
  path: {
    id: string;
  };
  query?: {
    limit?: number;
    offset?: number;
    status?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/{batch_id}/requests.
 */
export async function listBatchRequestsAlias(
  client: Client,
  args: ListBatchRequestsAliasParams,
): Promise<{
  batch_id?: string;
  data?: {
    completed_at?: string | null;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    created_at?: string | null;
    custom_id?: string;
    endpoint?: string | null;
    error_body?: {
      [key: string]: unknown;
    } | null;
    id?: string;
    meta?: {
      [key: string]: unknown;
    };
    method?: string | null;
    model?: string | null;
    native_batch_id?: string | null;
    provider?: string;
    request_body_hash?: string | null;
    request_index?: number;
    response_body?: {
      [key: string]: unknown;
    } | null;
    response_status?: number | null;
    status?: string;
    updated_at?: string | null;
    usage?: {
      [key: string]: unknown;
    } | null;
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batch/${encodeURIComponent(String(path["id"]))}/requests`;
  return client.request<{
    batch_id?: string;
    data?: {
      completed_at?: string | null;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      created_at?: string | null;
      custom_id?: string;
      endpoint?: string | null;
      error_body?: {
        [key: string]: unknown;
      } | null;
      id?: string;
      meta?: {
        [key: string]: unknown;
      };
      method?: string | null;
      model?: string | null;
      native_batch_id?: string | null;
      provider?: string;
      request_body_hash?: string | null;
      request_index?: number;
      response_body?: {
        [key: string]: unknown;
      } | null;
      response_status?: number | null;
      status?: string;
      updated_at?: string | null;
      usage?: {
        [key: string]: unknown;
      } | null;
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

export type ListClassifiersParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the workspace's request classifiers. A workspace can have up to five. Owners and admins only.
 */
export async function listClassifiers(
  client: Client,
  args: ListClassifiersParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by: string | null;
    description: string | null;
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
    enabled: boolean;
    id: string;
    input_scope: "prompt" | "prompt_and_response";
    instructions: string;
    model: string;
    monthly_budget_usd: number | null;
    name: string;
    sample_by: "request" | "session";
    sample_rate: number;
    scope: {
      app_ids?: string[];
      key_ids?: string[];
      models?: string[];
    };
    updated_at: string;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/classifiers";
  return client.request<{
    data: {
      created_at: string;
      created_by: string | null;
      description: string | null;
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
      enabled: boolean;
      id: string;
      input_scope: "prompt" | "prompt_and_response";
      instructions: string;
      model: string;
      monthly_budget_usd: number | null;
      name: string;
      sample_by: "request" | "session";
      sample_rate: number;
      scope: {
        app_ids?: string[];
        key_ids?: string[];
        models?: string[];
      };
      updated_at: string;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListDataModelsParams = {
  path?: Record<string, never>;
  query?: {
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    id?: string | string[];
    include_hidden?: boolean;
    limit?: number;
    model_id?: string | string[];
    offset?: number;
    organisation?:
      | "01-ai"
      | "adept"
      | "ai21"
      | "aion-labs"
      | "aisingapore"
      | "alibaba"
      | "allenai"
      | "amazon"
      | "anthracite-org"
      | "anthropic"
      | "arcee-ai"
      | "baai"
      | "baichuan"
      | "baidu"
      | "bigcode"
      | "black-forest-labs"
      | "bytedance"
      | "bytedance-seed"
      | "cogito"
      | "cognitivecomputations"
      | "cohere"
      | "crofai"
      | "cursor"
      | "cyfragovpl"
      | "databricks"
      | "dealignai"
      | "decart"
      | "deepseek"
      | "dots-studio"
      | "early-access"
      | "eleven-labs"
      | "essential-ai"
      | "fastino"
      | "fish-audio"
      | "github"
      | "google"
      | "gryphe"
      | "hexgrad"
      | "ibm"
      | "ibm-granite"
      | "inception"
      | "inclusionai"
      | "inference-net"
      | "inflection"
      | "intfloat"
      | "jetbrains"
      | "kblab"
      | "kling"
      | "kuaishou"
      | "kwaipilot"
      | "kwaivgi"
      | "lg"
      | "lightricks"
      | "liquid-ai"
      | "mancer"
      | "medaibase"
      | "meituan"
      | "meta"
      | "microsoft"
      | "mindai"
      | "minimax"
      | "mistral"
      | "mistralai"
      | "moonshotai"
      | "morph"
      | "naver-hyperclova"
      | "near-ai"
      | "nex-agi"
      | "nous"
      | "nousresearch"
      | "novasearch"
      | "nvidia"
      | "openai"
      | "openbmb"
      | "opencompass"
      | "opengvlab"
      | "orcarouter"
      | "ornith"
      | "perceptron"
      | "perplexity"
      | "phala"
      | "pixverse"
      | "poe"
      | "poolside"
      | "prime-intellect"
      | "prism-ml"
      | "qwen"
      | "reka"
      | "relace"
      | "runway"
      | "sakana"
      | "sao10k"
      | "sapiens-ai"
      | "sentence-transformers"
      | "sference"
      | "shanghai-ai-laboratory"
      | "shengshu-ai"
      | "snowflake"
      | "sourceful"
      | "spacex-ai"
      | "speakleash"
      | "stability-ai"
      | "stealth"
      | "stepfun"
      | "suno"
      | "tencent"
      | "thedrummer"
      | "thinking-machines"
      | "undi95"
      | "upstage"
      | "venice"
      | "vercel"
      | "villanova-ai"
      | "voyage"
      | "windsurf"
      | "writer"
      | "xai"
      | "xgenerationlab"
      | "xiaomi"
      | "z-ai"
      | "zyphra"
      | (
          | "01-ai"
          | "adept"
          | "ai21"
          | "aion-labs"
          | "aisingapore"
          | "alibaba"
          | "allenai"
          | "amazon"
          | "anthracite-org"
          | "anthropic"
          | "arcee-ai"
          | "baai"
          | "baichuan"
          | "baidu"
          | "bigcode"
          | "black-forest-labs"
          | "bytedance"
          | "bytedance-seed"
          | "cogito"
          | "cognitivecomputations"
          | "cohere"
          | "crofai"
          | "cursor"
          | "cyfragovpl"
          | "databricks"
          | "dealignai"
          | "decart"
          | "deepseek"
          | "dots-studio"
          | "early-access"
          | "eleven-labs"
          | "essential-ai"
          | "fastino"
          | "fish-audio"
          | "github"
          | "google"
          | "gryphe"
          | "hexgrad"
          | "ibm"
          | "ibm-granite"
          | "inception"
          | "inclusionai"
          | "inference-net"
          | "inflection"
          | "intfloat"
          | "jetbrains"
          | "kblab"
          | "kling"
          | "kuaishou"
          | "kwaipilot"
          | "kwaivgi"
          | "lg"
          | "lightricks"
          | "liquid-ai"
          | "mancer"
          | "medaibase"
          | "meituan"
          | "meta"
          | "microsoft"
          | "mindai"
          | "minimax"
          | "mistral"
          | "mistralai"
          | "moonshotai"
          | "morph"
          | "naver-hyperclova"
          | "near-ai"
          | "nex-agi"
          | "nous"
          | "nousresearch"
          | "novasearch"
          | "nvidia"
          | "openai"
          | "openbmb"
          | "opencompass"
          | "opengvlab"
          | "orcarouter"
          | "ornith"
          | "perceptron"
          | "perplexity"
          | "phala"
          | "pixverse"
          | "poe"
          | "poolside"
          | "prime-intellect"
          | "prism-ml"
          | "qwen"
          | "reka"
          | "relace"
          | "runway"
          | "sakana"
          | "sao10k"
          | "sapiens-ai"
          | "sentence-transformers"
          | "sference"
          | "shanghai-ai-laboratory"
          | "shengshu-ai"
          | "snowflake"
          | "sourceful"
          | "spacex-ai"
          | "speakleash"
          | "stability-ai"
          | "stealth"
          | "stepfun"
          | "suno"
          | "tencent"
          | "thedrummer"
          | "thinking-machines"
          | "undi95"
          | "upstage"
          | "venice"
          | "vercel"
          | "villanova-ai"
          | "voyage"
          | "windsurf"
          | "writer"
          | "xai"
          | "xgenerationlab"
          | "xiaomi"
          | "z-ai"
          | "zyphra"
        )[];
    status?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns source catalogue models from the data_models table.
 */
export async function listDataModels(
  client: Client,
  args: ListDataModelsParams = {},
): Promise<{
  include_hidden?: boolean;
  limit?: number;
  models?: {
    deprecation_date?: string | null;
    hidden?: boolean;
    input_types?: string[];
    lifecycle?: {
      deprecation_date?: string | null;
      message?: string | null;
      replacement_model_id?: string | null;
      retirement_date?: string | null;
      status?: "active" | "deprecated" | "retired" | null;
    };
    model_id?: string | null;
    name?: string | null;
    organisation?: {
      colour?: string | null;
      country_code?: string | null;
      name?: string | null;
      organisation_id?: string | null;
    } | null;
    output_types?: string[];
    release_date?: string | null;
    retirement_date?: string | null;
    status?: string | null;
  }[];
  offset?: number;
  ok?: boolean;
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/data/models";
  return client.request<{
    include_hidden?: boolean;
    limit?: number;
    models?: {
      deprecation_date?: string | null;
      hidden?: boolean;
      input_types?: string[];
      lifecycle?: {
        deprecation_date?: string | null;
        message?: string | null;
        replacement_model_id?: string | null;
        retirement_date?: string | null;
        status?: "active" | "deprecated" | "retired" | null;
      };
      model_id?: string | null;
      name?: string | null;
      organisation?: {
        colour?: string | null;
        country_code?: string | null;
        name?: string | null;
        organisation_id?: string | null;
      } | null;
      output_types?: string[];
      release_date?: string | null;
      retirement_date?: string | null;
      status?: string | null;
    }[];
    offset?: number;
    ok?: boolean;
    total?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListDepartmentBudgetsParams = {
  path?: Record<string, never>;
  query?: {
    department_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists department spend budgets with each department's spend so far in the current UTC period. Spend comes from an hourly rollup, so it can lag by up to an hour.
 */
export async function listDepartmentBudgets(
  client: Client,
  args: ListDepartmentBudgetsParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    department_id: string;
    department_name: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/department-budgets";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      department_id: string;
      department_name: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListDynamicRoutesParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists versioned dynamic routes and their API-key attachments for the workspace.
 */
export async function listDynamicRoutes(
  client: Client,
  args: ListDynamicRoutesParams = {},
): Promise<{
  data: {
    config: {
      cacheAwareRouting?: boolean;
      defaultAction?: {
        allowFallbacks?: boolean;
        model?: string;
        modelFallbacks?: string[];
        providerIgnore?: string[];
        providerOnly?: string[];
        providerOrder?: string[];
        routingMode?: "balanced" | "price" | "latency" | "throughput";
      };
      edges?: {
        id: string;
        source: string;
        sourceHandle?: string | null;
        target: string;
      }[];
      entryNodeId?: string | null;
      nodes?: {
        data: {
          [key: string]: unknown;
        };
        id: string;
        position?: {
          x: number;
          y: number;
        } | null;
        type:
          | "start"
          | "condition"
          | "percentage"
          | "model"
          | "rate_limit"
          | "budget_limit"
          | "end";
      }[];
      rules?: {
        action: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        condition: {
          field: "always" | "endpoint" | "model" | "session_id" | "metadata";
          metadataKey?: string | null;
          operator:
            "equals" | "not_equals" | "contains" | "starts_with" | "exists";
          value?: string | null;
        };
        enabled: boolean;
        id: string;
        name: string;
      }[];
      schemaVersion?: 2;
      sessionAffinity?: boolean;
    };
    created_at?: string | null;
    deployed_version?: number | null;
    description?: string | null;
    id: string;
    key_ids: string[];
    name: string;
    slug: string;
    status: "active" | "paused";
    updated_at?: string | null;
    version: number;
    versions: {
      created_at?: string | null;
      created_by?: string | null;
      status: "draft" | "deployed" | "superseded";
      version: number;
    }[];
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/dynamic-routes";
  return client.request<{
    data: {
      config: {
        cacheAwareRouting?: boolean;
        defaultAction?: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        edges?: {
          id: string;
          source: string;
          sourceHandle?: string | null;
          target: string;
        }[];
        entryNodeId?: string | null;
        nodes?: {
          data: {
            [key: string]: unknown;
          };
          id: string;
          position?: {
            x: number;
            y: number;
          } | null;
          type:
            | "start"
            | "condition"
            | "percentage"
            | "model"
            | "rate_limit"
            | "budget_limit"
            | "end";
        }[];
        rules?: {
          action: {
            allowFallbacks?: boolean;
            model?: string;
            modelFallbacks?: string[];
            providerIgnore?: string[];
            providerOnly?: string[];
            providerOrder?: string[];
            routingMode?: "balanced" | "price" | "latency" | "throughput";
          };
          condition: {
            field: "always" | "endpoint" | "model" | "session_id" | "metadata";
            metadataKey?: string | null;
            operator:
              "equals" | "not_equals" | "contains" | "starts_with" | "exists";
            value?: string | null;
          };
          enabled: boolean;
          id: string;
          name: string;
        }[];
        schemaVersion?: 2;
        sessionAffinity?: boolean;
      };
      created_at?: string | null;
      deployed_version?: number | null;
      description?: string | null;
      id: string;
      key_ids: string[];
      name: string;
      slug: string;
      status: "active" | "paused";
      updated_at?: string | null;
      version: number;
      versions: {
        created_at?: string | null;
        created_by?: string | null;
        status: "draft" | "deployed" | "superseded";
        version: number;
      }[];
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListEndpointsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists capability-backed gateway endpoint IDs with public paths, modality collections, model counts, provider counts, and sample models.
 */
export async function listEndpoints(
  client: Client,
  args: ListEndpointsParams = {},
): Promise<{
  data: {
    capability_id: string;
    collection: string;
    id: string;
    model_count: number;
    provider_count: number;
    public_path: string;
  }[];
  endpoints: string[];
  ok: true;
  sample_models: string[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/endpoints";
  return client.request<{
    data: {
      capability_id: string;
      collection: string;
      id: string;
      model_count: number;
      provider_count: number;
      public_path: string;
    }[];
    endpoints: string[];
    ok: true;
    sample_models: string[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListFilesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Currently returns `not_supported` on the shared gateway key. Persist uploaded file ids and retrieve them directly instead.
 */
export async function listFiles(
  client: Client,
  args: ListFilesParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/files";
  return client.request<unknown>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListGatewayFeedbackParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    preset_id?: string;
    rating?: string;
    request_id?: string;
    session_id?: string;
    since?: string;
    test_run_id?: string;
    until?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists workspace feedback with target, date, rating, and metadata-dimension filters. Requires `feedback:read`.
 */
export async function listGatewayFeedback(
  client: Client,
  args: ListGatewayFeedbackParams = {},
): Promise<{
  data: {
    comment: string | null;
    created_at: string;
    created_by_user_id: string | null;
    end_user_id: string | null;
    id: string;
    metadata: {
      [key: string]: unknown;
    };
    metadata_dimensions: {
      [key: string]: string;
    };
    preset_id: string | null;
    rating: string | null;
    reason: string | null;
    reason_tags: string[];
    request_id: string | null;
    score: number | null;
    session_id: string | null;
    source: "api" | "user" | "system" | "import" | "test";
    test_run_id: string | null;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/feedback";
  return client.request<{
    data: {
      comment: string | null;
      created_at: string;
      created_by_user_id: string | null;
      end_user_id: string | null;
      id: string;
      metadata: {
        [key: string]: unknown;
      };
      metadata_dimensions: {
        [key: string]: string;
      };
      preset_id: string | null;
      rating: string | null;
      reason: string | null;
      reason_tags: string[];
      request_id: string | null;
      score: number | null;
      session_id: string | null;
      source: "api" | "user" | "system" | "import" | "test";
      test_run_id: string | null;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListGatewayObservabilityEventsParams = {
  path?: Record<string, never>;
  query?: {
    category?: string;
    event?: string;
    limit?: number;
    offset?: number;
    preset_id?: string;
    request_id?: string;
    session_id?: string;
    test_run_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists custom workspace outcome and behavior events. Requires `feedback:read`.
 */
export async function listGatewayObservabilityEvents(
  client: Client,
  args: ListGatewayObservabilityEventsParams = {},
): Promise<{
  data: {
    category: "feedback" | "behavior" | "outcome" | "app" | "test" | "custom";
    created_at: string;
    created_by_user_id: string | null;
    end_user_id: string | null;
    event_name: string;
    id: string;
    metadata: {
      [key: string]: unknown;
    };
    metadata_dimensions: {
      [key: string]: string;
    };
    numeric_value: number | null;
    occurred_at: string;
    preset_id: string | null;
    request_id: string | null;
    session_id: string | null;
    source: "api" | "user" | "system" | "import" | "test";
    test_run_id: string | null;
    value: unknown | null;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/events";
  return client.request<{
    data: {
      category: "feedback" | "behavior" | "outcome" | "app" | "test" | "custom";
      created_at: string;
      created_by_user_id: string | null;
      end_user_id: string | null;
      event_name: string;
      id: string;
      metadata: {
        [key: string]: unknown;
      };
      metadata_dimensions: {
        [key: string]: string;
      };
      numeric_value: number | null;
      occurred_at: string;
      preset_id: string | null;
      request_id: string | null;
      session_id: string | null;
      source: "api" | "user" | "system" | "import" | "test";
      test_run_id: string | null;
      value: unknown | null;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListGatewayRequestLogsParams = {
  path?: Record<string, never>;
  query?: {
    endpoint?: string;
    error_code?: string;
    from?: string;
    key_id?: string;
    limit?: number;
    model?: string;
    offset?: number;
    provider?: string;
    request_id?: string;
    session_id?: string;
    since?: string;
    status?: string;
    to?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists redacted request facts for the authenticated workspace with bounded time-range and field filters. Requires `activity:read`.
 */
export async function listGatewayRequestLogs(
  client: Client,
  args: ListGatewayRequestLogsParams = {},
): Promise<{
  data: {
    auth_method?: string | null;
    byok?: boolean | null;
    canonical_model_id?: string | null;
    cost_nanos?: number | null;
    created_at?: string;
    currency?: string | null;
    endpoint?: string | null;
    error_code?: string | null;
    finish_reason?: string | null;
    generation_ms?: number | null;
    key_id?: string | null;
    latency_ms?: number | null;
    location?: string | null;
    model_id?: string | null;
    native_response_id?: string | null;
    oauth_client_id?: string | null;
    pricing_lines?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    provider?: string | null;
    request_id?: string;
    requested_model_id?: string | null;
    routed_model_id?: string | null;
    status_code?: number | null;
    stream?: boolean | null;
    success?: boolean | null;
    throughput?: number | null;
    usage?: {
      [key: string]: unknown;
    } | null;
  }[];
  from_time: string;
  limit: number;
  offset: number;
  ok: true;
  to_time: string | null;
  total: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/logs";
  return client.request<{
    data: {
      auth_method?: string | null;
      byok?: boolean | null;
      canonical_model_id?: string | null;
      cost_nanos?: number | null;
      created_at?: string;
      currency?: string | null;
      endpoint?: string | null;
      error_code?: string | null;
      finish_reason?: string | null;
      generation_ms?: number | null;
      key_id?: string | null;
      latency_ms?: number | null;
      location?: string | null;
      model_id?: string | null;
      native_response_id?: string | null;
      oauth_client_id?: string | null;
      pricing_lines?:
        | {
            [key: string]: unknown;
          }[]
        | null;
      provider?: string | null;
      request_id?: string;
      requested_model_id?: string | null;
      routed_model_id?: string | null;
      status_code?: number | null;
      stream?: boolean | null;
      success?: boolean | null;
      throughput?: number | null;
      usage?: {
        [key: string]: unknown;
      } | null;
    }[];
    from_time: string;
    limit: number;
    offset: number;
    ok: true;
    to_time: string | null;
    total: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListGuardrailKeysParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists API keys assigned to a guardrail. Requires `guardrails:read`.
 */
export async function listGuardrailKeys(
  client: Client,
  args: ListGuardrailKeysParams,
): Promise<{
  data: {
    created_at?: string | null;
    key_id: string;
    name?: string | null;
    prefix?: string | null;
    status?: string | null;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/keys`;
  return client.request<{
    data: {
      created_at?: string | null;
      key_id: string;
      name?: string | null;
      prefix?: string | null;
      status?: string | null;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListGuardrailMembersParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists workspace members assigned to a guardrail. Requires `guardrails:read`.
 */
export async function listGuardrailMembers(
  client: Client,
  args: ListGuardrailMembersParams,
): Promise<{
  data: {
    display_name?: string | null;
    joined_at?: string | null;
    role?: string | null;
    user_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/members`;
  return client.request<{
    data: {
      display_name?: string | null;
      joined_at?: string | null;
      role?: string | null;
      user_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListGuardrailsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists workspace guardrails. Requires `guardrails:read`.
 */
export async function listGuardrails(
  client: Client,
  args: ListGuardrailsParams = {},
): Promise<{
  data: {
    allowed_api_model_ids?: string[] | null;
    created_at?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    description?: string | null;
    enabled?: boolean | null;
    id: string;
    model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    prompt_injection_action?: "flag" | "block" | null;
    prompt_injection_enabled?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    sensitive_info_default_action?: "flag" | "redact" | "block" | null;
    sensitive_info_enabled?: boolean | null;
    sensitive_info_rules?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/guardrails";
  return client.request<{
    data: {
      allowed_api_model_ids?: string[] | null;
      created_at?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      description?: string | null;
      enabled?: boolean | null;
      id: string;
      model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      privacy_enable_free_may_publish_prompts?: boolean | null;
      privacy_enable_free_may_train?: boolean | null;
      privacy_enable_input_output_logging?: boolean | null;
      privacy_enable_paid_may_train?: boolean | null;
      privacy_zdr_only?: boolean | null;
      prompt_injection_action?: "flag" | "block" | null;
      prompt_injection_enabled?: boolean | null;
      provider_restriction_enforce_allowed?: boolean | null;
      provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      provider_restriction_provider_ids?: string[] | null;
      sensitive_info_default_action?: "flag" | "redact" | "block" | null;
      sensitive_info_enabled?: boolean | null;
      sensitive_info_rules?:
        | {
            [key: string]: unknown;
          }[]
        | null;
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListManagementKeysParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists management-key metadata for the authenticated workspace. Requires `management_keys:read`.
 */
export async function listManagementKeys(
  client: Client,
  args: ListManagementKeysParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    expires_at?: string | null;
    id: string;
    last_used_at?: string | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    prefix: string;
    scopes: string[];
    soft_blocked?: boolean | null;
    status: "active" | "paused";
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/management-keys";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      expires_at?: string | null;
      id: string;
      last_used_at?: string | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      prefix: string;
      scopes: string[];
      soft_blocked?: boolean | null;
      status: "active" | "paused";
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListModelEndpointsParams = {
  path: {
    author: string;
    slug: string;
  };
  query?: {
    availability?: "active" | "all";
    capability_status?: string[];
    model_routing_status?: string[];
    provider?: string[];
    provider_availability_reason?: string[];
    provider_availability_status?: string[];
    provider_routing_status?: string[];
    provider_status?: string[];
    status?: string[];
    supported_parameters?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns provider-specific endpoint rows for one model, including public paths, modalities, supported parameters, availability, routing state, provider model slugs, and endpoint pricing summaries.
 */
export async function listModelEndpoints(
  client: Client,
  args: ListModelEndpointsParams,
): Promise<{
  availability_mode: "active" | "all";
  description: string;
  endpoints: {
    capabilities: {
      endpoints?: string[];
      parameter_details: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      parameters: string[];
    };
    capability_id: string;
    collection:
      | "text"
      | "images"
      | "video"
      | "audio"
      | "embeddings"
      | "rerank"
      | "moderation"
      | "ocr"
      | "music"
      | "batch"
      | "files";
    effective: {
      from: string | null;
      to: string | null;
    };
    endpoint: string;
    id: string;
    modalities: {
      input: string[];
      output: string[];
    };
    model: string | null;
    pricing: {
      meters: {
        [key: string]: {
          currency: "USD";
          price_per_unit: string;
          provider_id: string;
          unit: string;
          unit_size: number;
        } | null;
      };
      pricing_plan: "standard";
    };
    provider: {
      id: string;
      name: string | null;
    };
    public_path: string;
    routable: boolean;
    routing: {
      capability:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
      model:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      provider:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
    };
    status: "active" | "coming_soon" | "inactive";
    status_reason:
      | "active"
      | "preview_only"
      | "gated"
      | "access_limited"
      | "region_limited"
      | "project_limited"
      | "paused"
      | "soft_blocked"
      | "deranked_lvl1"
      | "deranked_lvl2"
      | "deranked_lvl3"
      | "internal_testing"
      | "scheduled"
      | "coming_soon"
      | "provider_disabled"
      | "model_disabled"
      | "capability_disabled"
      | "provider_not_ready"
      | "provider_inactive"
      | "inactive"
      | "retired";
  }[];
  id: string;
  modalities: {
    input: string[];
    output: string[];
  };
  name: string;
  ok: true;
  organization: {
    color: string | null;
    id: string;
    name: string | null;
  } | null;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["author"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["slug"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/models/${encodeURIComponent(String(path["author"]))}/${encodeURIComponent(String(path["slug"]))}/endpoints`;
  return client.request<{
    availability_mode: "active" | "all";
    description: string;
    endpoints: {
      capabilities: {
        endpoints?: string[];
        parameter_details: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        parameters: string[];
      };
      capability_id: string;
      collection:
        | "text"
        | "images"
        | "video"
        | "audio"
        | "embeddings"
        | "rerank"
        | "moderation"
        | "ocr"
        | "music"
        | "batch"
        | "files";
      effective: {
        from: string | null;
        to: string | null;
      };
      endpoint: string;
      id: string;
      modalities: {
        input: string[];
        output: string[];
      };
      model: string | null;
      pricing: {
        meters: {
          [key: string]: {
            currency: "USD";
            price_per_unit: string;
            provider_id: string;
            unit: string;
            unit_size: number;
          } | null;
        };
        pricing_plan: "standard";
      };
      provider: {
        id: string;
        name: string | null;
      };
      public_path: string;
      routable: boolean;
      routing: {
        capability:
          | "active"
          | "coming_soon"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled"
          | "internal_testing";
        model:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
        provider:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
      };
      status: "active" | "coming_soon" | "inactive";
      status_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
    }[];
    id: string;
    modalities: {
      input: string[];
      output: string[];
    };
    name: string;
    ok: true;
    organization: {
      color: string | null;
      id: string;
      name: string | null;
    } | null;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListModelsParams = {
  path?: Record<string, never>;
  query?: {
    availability?: "active" | "all";
    capability_status?: string[];
    endpoints?: string[];
    feed?: "json" | "rss" | "atom";
    format?: "json" | "openai" | "rss" | "atom";
    gateway_available_only?: boolean;
    input_modalities?: string[];
    input_modality?: "text" | "image" | "audio" | "video";
    input_types?: string[];
    limit?: number;
    maximum_input_price_per_million?: number;
    minimum_context_tokens?: number;
    model_routing_status?: string[];
    offset?: number;
    organisation?:
      | "01-ai"
      | "adept"
      | "ai21"
      | "aion-labs"
      | "aisingapore"
      | "alibaba"
      | "allenai"
      | "amazon"
      | "anthracite-org"
      | "anthropic"
      | "arcee-ai"
      | "baai"
      | "baichuan"
      | "baidu"
      | "bigcode"
      | "black-forest-labs"
      | "bytedance"
      | "bytedance-seed"
      | "cogito"
      | "cognitivecomputations"
      | "cohere"
      | "crofai"
      | "cursor"
      | "cyfragovpl"
      | "databricks"
      | "dealignai"
      | "decart"
      | "deepseek"
      | "dots-studio"
      | "early-access"
      | "eleven-labs"
      | "essential-ai"
      | "fastino"
      | "fish-audio"
      | "github"
      | "google"
      | "gryphe"
      | "hexgrad"
      | "ibm"
      | "ibm-granite"
      | "inception"
      | "inclusionai"
      | "inference-net"
      | "inflection"
      | "intfloat"
      | "jetbrains"
      | "kblab"
      | "kling"
      | "kuaishou"
      | "kwaipilot"
      | "kwaivgi"
      | "lg"
      | "lightricks"
      | "liquid-ai"
      | "mancer"
      | "medaibase"
      | "meituan"
      | "meta"
      | "microsoft"
      | "mindai"
      | "minimax"
      | "mistral"
      | "mistralai"
      | "moonshotai"
      | "morph"
      | "naver-hyperclova"
      | "near-ai"
      | "nex-agi"
      | "nous"
      | "nousresearch"
      | "novasearch"
      | "nvidia"
      | "openai"
      | "openbmb"
      | "opencompass"
      | "opengvlab"
      | "orcarouter"
      | "ornith"
      | "perceptron"
      | "perplexity"
      | "phala"
      | "pixverse"
      | "poe"
      | "poolside"
      | "prime-intellect"
      | "prism-ml"
      | "qwen"
      | "reka"
      | "relace"
      | "runway"
      | "sakana"
      | "sao10k"
      | "sapiens-ai"
      | "sentence-transformers"
      | "sference"
      | "shanghai-ai-laboratory"
      | "shengshu-ai"
      | "snowflake"
      | "sourceful"
      | "spacex-ai"
      | "speakleash"
      | "stability-ai"
      | "stealth"
      | "stepfun"
      | "suno"
      | "tencent"
      | "thedrummer"
      | "thinking-machines"
      | "undi95"
      | "upstage"
      | "venice"
      | "vercel"
      | "villanova-ai"
      | "voyage"
      | "windsurf"
      | "writer"
      | "xai"
      | "xgenerationlab"
      | "xiaomi"
      | "z-ai"
      | "zyphra"
      | (
          | "01-ai"
          | "adept"
          | "ai21"
          | "aion-labs"
          | "aisingapore"
          | "alibaba"
          | "allenai"
          | "amazon"
          | "anthracite-org"
          | "anthropic"
          | "arcee-ai"
          | "baai"
          | "baichuan"
          | "baidu"
          | "bigcode"
          | "black-forest-labs"
          | "bytedance"
          | "bytedance-seed"
          | "cogito"
          | "cognitivecomputations"
          | "cohere"
          | "crofai"
          | "cursor"
          | "cyfragovpl"
          | "databricks"
          | "dealignai"
          | "decart"
          | "deepseek"
          | "dots-studio"
          | "early-access"
          | "eleven-labs"
          | "essential-ai"
          | "fastino"
          | "fish-audio"
          | "github"
          | "google"
          | "gryphe"
          | "hexgrad"
          | "ibm"
          | "ibm-granite"
          | "inception"
          | "inclusionai"
          | "inference-net"
          | "inflection"
          | "intfloat"
          | "jetbrains"
          | "kblab"
          | "kling"
          | "kuaishou"
          | "kwaipilot"
          | "kwaivgi"
          | "lg"
          | "lightricks"
          | "liquid-ai"
          | "mancer"
          | "medaibase"
          | "meituan"
          | "meta"
          | "microsoft"
          | "mindai"
          | "minimax"
          | "mistral"
          | "mistralai"
          | "moonshotai"
          | "morph"
          | "naver-hyperclova"
          | "near-ai"
          | "nex-agi"
          | "nous"
          | "nousresearch"
          | "novasearch"
          | "nvidia"
          | "openai"
          | "openbmb"
          | "opencompass"
          | "opengvlab"
          | "orcarouter"
          | "ornith"
          | "perceptron"
          | "perplexity"
          | "phala"
          | "pixverse"
          | "poe"
          | "poolside"
          | "prime-intellect"
          | "prism-ml"
          | "qwen"
          | "reka"
          | "relace"
          | "runway"
          | "sakana"
          | "sao10k"
          | "sapiens-ai"
          | "sentence-transformers"
          | "sference"
          | "shanghai-ai-laboratory"
          | "shengshu-ai"
          | "snowflake"
          | "sourceful"
          | "spacex-ai"
          | "speakleash"
          | "stability-ai"
          | "stealth"
          | "stepfun"
          | "suno"
          | "tencent"
          | "thedrummer"
          | "thinking-machines"
          | "undi95"
          | "upstage"
          | "venice"
          | "vercel"
          | "villanova-ai"
          | "voyage"
          | "windsurf"
          | "writer"
          | "xai"
          | "xgenerationlab"
          | "xiaomi"
          | "z-ai"
          | "zyphra"
        )[];
    output_modalities?: string[];
    output_types?: string[];
    params?: string[];
    provider?: string[];
    provider_availability_reason?: string[];
    provider_availability_status?: string[];
    provider_routing_status?: string[];
    provider_search?: string;
    provider_status?: string[];
    search?: string;
    sort_by?:
      | "relevance"
      | "input_price"
      | "output_price"
      | "context_length"
      | "provider_count";
    sort_order?: "asc" | "desc";
    status?: string[];
    supported_parameters?: string[];
  };
  headers?: {
    "If-None-Match"?: string;
  };
  body?: never;
};

/**
 * Returns shared non-hidden gateway models. Defaults to currently publicly routable models; use availability=all to include non-routable availability records. Use format=openai for an OpenAI-compatible model list. OpenAI format returns all filtered models by default; an explicit limit and offset can still select a page.
 */
export async function listModels(
  client: Client,
  args: ListModelsParams = {},
): Promise<
  | {
      availability_mode: "active" | "all";
      limit: number;
      models: {
        aliases: string[];
        availability: {
          active_provider_count: number;
          coming_soon_provider_count: number;
          inactive_provider_count: number;
          provider_count: number;
          status: "active" | "coming_soon" | "inactive" | "not_listed";
        };
        base_model_id: string;
        capabilities: {
          endpoints?: string[];
          parameter_details: {
            [key: string]: {
              [key: string]: unknown;
            };
          };
          parameters: string[];
        };
        description: string;
        id: string;
        lifecycle: {
          deprecated_at: string | null;
          message: string | null;
          released_at: string | null;
          replacement_id: string | null;
          retires_at: string | null;
          status: "active" | "deprecated" | "retired" | null;
        };
        limits: {
          input_tokens: number | null;
          output_tokens: number | null;
        };
        modalities: {
          input: string[];
          output: string[];
        };
        name: string;
        offers: {
          capabilities: {
            endpoints?: string[];
            parameter_details: {
              [key: string]: {
                [key: string]: unknown;
              };
            };
            parameters: string[];
          };
          effective: {
            from: string | null;
            to: string | null;
          };
          endpoints: string[];
          modalities: {
            input: string[];
            output: string[];
          };
          model: string | null;
          pricing: {
            meters: {
              [key: string]: {
                currency: "USD";
                price_per_unit: string;
                provider_id: string;
                unit: string;
                unit_size: number;
              } | null;
            };
            pricing_plan: "standard";
          };
          provider: {
            id: string;
            name: string | null;
          };
          routable: boolean;
          routing: {
            capability:
              | "active"
              | "coming_soon"
              | "deranked_lvl1"
              | "deranked_lvl2"
              | "deranked_lvl3"
              | "disabled"
              | "internal_testing";
            model:
              | "active"
              | "deranked_lvl1"
              | "deranked_lvl2"
              | "deranked_lvl3"
              | "disabled";
            provider:
              | "active"
              | "deranked_lvl1"
              | "deranked_lvl2"
              | "deranked_lvl3"
              | "disabled";
          };
          service_tiers?: ("flex" | "priority" | "standard" | "ultrafast")[];
          status: "active" | "coming_soon" | "inactive";
          status_reason:
            | "active"
            | "preview_only"
            | "gated"
            | "access_limited"
            | "region_limited"
            | "project_limited"
            | "paused"
            | "soft_blocked"
            | "deranked_lvl1"
            | "deranked_lvl2"
            | "deranked_lvl3"
            | "internal_testing"
            | "scheduled"
            | "coming_soon"
            | "provider_disabled"
            | "model_disabled"
            | "capability_disabled"
            | "provider_not_ready"
            | "provider_inactive"
            | "inactive"
            | "retired";
        }[];
        organization: {
          color: string | null;
          id: string;
          name: string | null;
        } | null;
        pricing: {
          meters: {
            [key: string]: {
              currency: "USD";
              price_per_unit: string;
              provider_id: string;
              unit: string;
              unit_size: number;
            } | null;
          };
          pricing_plan: "standard";
        };
        variant: string;
        variants: {
          [key: string]: {
            model_id: string;
            name: string;
          };
        };
      }[];
      offset: number;
      ok: boolean;
      total: number;
    }
  | {
      data: {
        created: number;
        id: string;
        object: "model";
        owned_by: string;
      }[];
      object: "list";
    }
> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/models";
  return client.request<
    | {
        availability_mode: "active" | "all";
        limit: number;
        models: {
          aliases: string[];
          availability: {
            active_provider_count: number;
            coming_soon_provider_count: number;
            inactive_provider_count: number;
            provider_count: number;
            status: "active" | "coming_soon" | "inactive" | "not_listed";
          };
          base_model_id: string;
          capabilities: {
            endpoints?: string[];
            parameter_details: {
              [key: string]: {
                [key: string]: unknown;
              };
            };
            parameters: string[];
          };
          description: string;
          id: string;
          lifecycle: {
            deprecated_at: string | null;
            message: string | null;
            released_at: string | null;
            replacement_id: string | null;
            retires_at: string | null;
            status: "active" | "deprecated" | "retired" | null;
          };
          limits: {
            input_tokens: number | null;
            output_tokens: number | null;
          };
          modalities: {
            input: string[];
            output: string[];
          };
          name: string;
          offers: {
            capabilities: {
              endpoints?: string[];
              parameter_details: {
                [key: string]: {
                  [key: string]: unknown;
                };
              };
              parameters: string[];
            };
            effective: {
              from: string | null;
              to: string | null;
            };
            endpoints: string[];
            modalities: {
              input: string[];
              output: string[];
            };
            model: string | null;
            pricing: {
              meters: {
                [key: string]: {
                  currency: "USD";
                  price_per_unit: string;
                  provider_id: string;
                  unit: string;
                  unit_size: number;
                } | null;
              };
              pricing_plan: "standard";
            };
            provider: {
              id: string;
              name: string | null;
            };
            routable: boolean;
            routing: {
              capability:
                | "active"
                | "coming_soon"
                | "deranked_lvl1"
                | "deranked_lvl2"
                | "deranked_lvl3"
                | "disabled"
                | "internal_testing";
              model:
                | "active"
                | "deranked_lvl1"
                | "deranked_lvl2"
                | "deranked_lvl3"
                | "disabled";
              provider:
                | "active"
                | "deranked_lvl1"
                | "deranked_lvl2"
                | "deranked_lvl3"
                | "disabled";
            };
            service_tiers?: ("flex" | "priority" | "standard" | "ultrafast")[];
            status: "active" | "coming_soon" | "inactive";
            status_reason:
              | "active"
              | "preview_only"
              | "gated"
              | "access_limited"
              | "region_limited"
              | "project_limited"
              | "paused"
              | "soft_blocked"
              | "deranked_lvl1"
              | "deranked_lvl2"
              | "deranked_lvl3"
              | "internal_testing"
              | "scheduled"
              | "coming_soon"
              | "provider_disabled"
              | "model_disabled"
              | "capability_disabled"
              | "provider_not_ready"
              | "provider_inactive"
              | "inactive"
              | "retired";
          }[];
          organization: {
            color: string | null;
            id: string;
            name: string | null;
          } | null;
          pricing: {
            meters: {
              [key: string]: {
                currency: "USD";
                price_per_unit: string;
                provider_id: string;
                unit: string;
                unit_size: number;
              } | null;
            };
            pricing_plan: "standard";
          };
          variant: string;
          variants: {
            [key: string]: {
              model_id: string;
              name: string;
            };
          };
        }[];
        offset: number;
        ok: boolean;
        total: number;
      }
    | {
        data: {
          created: number;
          id: string;
          object: "model";
          owned_by: string;
        }[];
        object: "list";
      }
  >({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListMyJoinRequestsParams = {
  path?: Record<string, never>;
  query?: {
    status?: "pending" | "approved" | "denied" | "cancelled" | "all";
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists your own requests to join workspaces, newest first (at most 100). OAuth token with workspaces:read required.
 */
export async function listMyJoinRequests(
  client: Client,
  args: ListMyJoinRequestsParams = {},
): Promise<{
  data: {
    created_at?: string;
    decided_at?: string | null;
    id?: string;
    status?: "pending" | "approved" | "denied" | "cancelled";
    workspace_id?: string;
    workspace_name?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/invites/requests";
  return client.request<{
    data: {
      created_at?: string;
      decided_at?: string | null;
      id?: string;
      status?: "pending" | "approved" | "denied" | "cancelled";
      workspace_id?: string;
      workspace_name?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListOAuthClientsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists active OAuth applications for the workspace. Requires `oauth_clients:read` and the OAuth beta feature.
 */
export async function listOAuthClients(
  client: Client,
  args: ListOAuthClientsParams = {},
): Promise<{
  data: {
    active_authorizations?: number;
    allowed_scopes?: string[];
    client_id: string;
    client_type: "public" | "confidential";
    created_at?: string | null;
    description?: string | null;
    homepage_url?: string | null;
    last_used_at?: string | null;
    logo_url?: string | null;
    name: string;
    privacy_policy_url?: string | null;
    redirect_uris: string[];
    requests_last_30d?: number;
    status: string;
    terms_of_service_url?: string | null;
    total_authorizations?: number;
    updated_at?: string | null;
    workspace_id: string;
    [key: string]: unknown;
  }[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/oauth-clients";
  return client.request<{
    data: {
      active_authorizations?: number;
      allowed_scopes?: string[];
      client_id: string;
      client_type: "public" | "confidential";
      created_at?: string | null;
      description?: string | null;
      homepage_url?: string | null;
      last_used_at?: string | null;
      logo_url?: string | null;
      name: string;
      privacy_policy_url?: string | null;
      redirect_uris: string[];
      requests_last_30d?: number;
      status: string;
      terms_of_service_url?: string | null;
      total_authorizations?: number;
      updated_at?: string | null;
      workspace_id: string;
      [key: string]: unknown;
    }[];
    pagination: {
      page: number;
      per_page: number;
      total: number;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListObservabilityDestinationsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists executable observability destinations for the management key workspace.
 */
export async function listObservabilityDestinations(
  client: Client,
  args: ListObservabilityDestinationsParams = {},
): Promise<{
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
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/observability/destinations";
  return client.request<{
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
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListOrganisationsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a list of available organisations.
 */
export async function listOrganisations(
  client: Client,
  args: ListOrganisationsParams = {},
): Promise<{
  limit?: number;
  offset?: number;
  ok?: boolean;
  organisations?: {
    colour?: string | null;
    country_code?: string | null;
    description?: string | null;
    name?: string | null;
    organisation_id?: string;
  }[];
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/organisations";
  return client.request<{
    limit?: number;
    offset?: number;
    ok?: boolean;
    organisations?: {
      colour?: string | null;
      country_code?: string | null;
      description?: string | null;
      name?: string | null;
      organisation_id?: string;
    }[];
    total?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPresetLabelsParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the named labels, such as production or staging, and the published version each one points at.
 */
export async function listPresetLabels(
  client: Client,
  args: ListPresetLabelsParams,
): Promise<{
  data: {
    created_at?: string | null;
    label: string;
    updated_at?: string | null;
    updated_by?: string | null;
    version_id: string;
    version_label: string | null;
    version_number: number | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/labels`;
  return client.request<{
    data: {
      created_at?: string | null;
      label: string;
      updated_at?: string | null;
      updated_by?: string | null;
      version_id: string;
      version_label: string | null;
      version_number: number | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPresetsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    visibility?: "private" | "team" | "public";
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists active presets visible to the management key workspace.
 */
export async function listPresets(
  client: Client,
  args: ListPresetsParams = {},
): Promise<{
  data: {
    active_version_id?: string | null;
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at?: string | null;
    created_by?: string | null;
    description?: string | null;
    id: string;
    name: string;
    slug: string;
    source_preset_id?: string | null;
    source_preset_version_id?: string | null;
    updated_at?: string | null;
    upstream_version_id?: string | null;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/presets";
  return client.request<{
    data: {
      active_version_id?: string | null;
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at?: string | null;
      created_by?: string | null;
      description?: string | null;
      id: string;
      name: string;
      slug: string;
      source_preset_id?: string | null;
      source_preset_version_id?: string | null;
      updated_at?: string | null;
      upstream_version_id?: string | null;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPresetTestRunsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    preset_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists visible test runs, optionally filtered by preset. Requires `feedback:read`.
 */
export async function listPresetTestRuns(
  client: Client,
  args: ListPresetTestRunsParams = {},
): Promise<{
  data: {
    baseline_preset_id: string | null;
    completed_at: string | null;
    config: {
      [key: string]: unknown;
    };
    created_at: string;
    created_by_user_id: string | null;
    dataset_name: string | null;
    description: string | null;
    id: string;
    name: string | null;
    preset_id: string | null;
    started_at: string | null;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    summary: {
      [key: string]: unknown;
    };
    updated_at: string;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/preset-test-runs";
  return client.request<{
    data: {
      baseline_preset_id: string | null;
      completed_at: string | null;
      config: {
        [key: string]: unknown;
      };
      created_at: string;
      created_by_user_id: string | null;
      dataset_name: string | null;
      description: string | null;
      id: string;
      name: string | null;
      preset_id: string | null;
      started_at: string | null;
      status: "pending" | "running" | "completed" | "failed" | "cancelled";
      summary: {
        [key: string]: unknown;
      };
      updated_at: string;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPresetVersionsParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists immutable published snapshots for a preset in descending version order.
 */
export async function listPresetVersions(
  client: Client,
  args: ListPresetVersionsParams,
): Promise<{
  data: {
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at: string;
    created_by: string;
    description?: string | null;
    id: string;
    labels?: string[];
    name: string;
    preset_id: string;
    release_notes?: string | null;
    slug: string;
    version_label: string;
    version_number: number;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
  }[];
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/versions`;
  return client.request<{
    data: {
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at: string;
      created_by: string;
      description?: string | null;
      id: string;
      labels?: string[];
      name: string;
      preset_id: string;
      release_notes?: string | null;
      slug: string;
      version_label: string;
      version_number: number;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPricingModelsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns active provider/model pricing entries.
 */
export async function listPricingModels(
  client: Client,
  args: ListPricingModelsParams = {},
): Promise<{
  models?: {
    [key: string]: unknown;
  }[];
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/pricing/models";
  return client.request<{
    models?: {
      [key: string]: unknown;
    }[];
    ok?: boolean;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPrivateModelsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists private model metadata for the authenticated workspace. Requires `private_models:read` and an owner or admin identity.
 */
export async function listPrivateModels(
  client: Client,
  args: ListPrivateModelsParams = {},
): Promise<{
  data: {
    base_url: string;
    catalog_model_id?: string | null;
    context_length?: number | null;
    created_at?: string | null;
    created_by?: string | null;
    credential_prefix?: string | null;
    credential_suffix?: string | null;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string | null;
    enabled: boolean;
    host_provider_id?: string | null;
    id: string;
    input_modalities?: string[];
    local_slug?: string;
    max_output_tokens?: number | null;
    model_id: string;
    name: string;
    output_modalities?: string[];
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses: boolean;
    updated_at?: string | null;
    upstream_model_id: string;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/private-models";
  return client.request<{
    data: {
      base_url: string;
      catalog_model_id?: string | null;
      context_length?: number | null;
      created_at?: string | null;
      created_by?: string | null;
      credential_prefix?: string | null;
      credential_suffix?: string | null;
      custom_provider_name?: string | null;
      custom_provider_url?: string | null;
      description?: string | null;
      enabled: boolean;
      host_provider_id?: string | null;
      id: string;
      input_modalities?: string[];
      local_slug?: string;
      max_output_tokens?: number | null;
      model_id: string;
      name: string;
      output_modalities?: string[];
      routing_policy?: "preferred" | "balanced" | "fallback";
      supports_responses: boolean;
      updated_at?: string | null;
      upstream_model_id: string;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListProviderCredentialsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    provider?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns write-only provider credential metadata for the authenticated workspace.
 */
export async function listProviderCredentials(
  client: Client,
  args: ListProviderCredentialsParams = {},
): Promise<{
  data: {
    allowed_api_key_ids?: string[];
    allowed_model_slugs?: string[];
    always_use?: boolean;
    created_at?: string | null;
    created_by?: string | null;
    disabled: boolean;
    enabled: boolean;
    error_message?: string | null;
    id: string;
    is_fallback: boolean;
    last_used_at?: string | null;
    last_verified_at?: string | null;
    name: string;
    prefix?: string | null;
    provider_id: string;
    routing_mode: "priority" | "fallback";
    sort_order: number;
    suffix?: string | null;
    verification_status?: string | null;
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/byok";
  return client.request<{
    data: {
      allowed_api_key_ids?: string[];
      allowed_model_slugs?: string[];
      always_use?: boolean;
      created_at?: string | null;
      created_by?: string | null;
      disabled: boolean;
      enabled: boolean;
      error_message?: string | null;
      id: string;
      is_fallback: boolean;
      last_used_at?: string | null;
      last_verified_at?: string | null;
      name: string;
      prefix?: string | null;
      provider_id: string;
      routing_mode: "priority" | "fallback";
      sort_order: number;
      suffix?: string | null;
      verification_status?: string | null;
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListProvidersParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a list of available API providers.
 */
export async function listProviders(
  client: Client,
  args: ListProvidersParams = {},
): Promise<{
  limit?: number;
  offset?: number;
  ok?: boolean;
  providers?: {
    api_provider_id?: string;
    api_provider_name?: string | null;
    country_code?: string | null;
    description?: string | null;
    link?: string | null;
  }[];
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/providers";
  return client.request<{
    limit?: number;
    offset?: number;
    ok?: boolean;
    providers?: {
      api_provider_id?: string;
      api_provider_name?: string | null;
      country_code?: string | null;
      description?: string | null;
      link?: string | null;
    }[];
    total?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListRateLimitAssignmentsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    policy_id?: string;
    target_type?:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists where rate limit policies apply, optionally filtered by policy or target type. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function listRateLimitAssignments(
  client: Client,
  args: ListRateLimitAssignmentsParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    id: string;
    policy_id: string;
    target_id: string | null;
    target_type:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
    updated_at: string;
    workspace_id: string;
  }[];
  has_more: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rate-limits/assignments";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      id: string;
      policy_id: string;
      target_id: string | null;
      target_type:
        "key" | "member" | "department" | "guardrail" | "end_user_default";
      updated_at: string;
      workspace_id: string;
    }[];
    has_more: boolean;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListRateLimitPoliciesParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the workspace's named rate limit policies. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function listRateLimitPolicies(
  client: Client,
  args: ListRateLimitPoliciesParams = {},
): Promise<{
  data: {
    concurrent_requests: number | null;
    created_at: string;
    created_by?: string | null;
    description: string | null;
    fail_closed: boolean;
    id: string;
    name: string;
    requests_per_minute: number | null;
    tokens_per_minute: number | null;
    updated_at: string;
    workspace_id: string;
  }[];
  has_more: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rate-limits/policies";
  return client.request<{
    data: {
      concurrent_requests: number | null;
      created_at: string;
      created_by?: string | null;
      description: string | null;
      fail_closed: boolean;
      id: string;
      name: string;
      requests_per_minute: number | null;
      tokens_per_minute: number | null;
      updated_at: string;
      workspace_id: string;
    }[];
    has_more: boolean;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListSpendBlocksParams = {
  path?: Record<string, never>;
  query?: {
    include_lifted?: boolean;
    limit?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the workspace's spend blocks, newest first: the blocks that spend rules with action block have started once spend reached their block point. Active blocks only, unless include_lifted is true. Owners and admins only.
 */
export async function listSpendBlocks(
  client: Client,
  args: ListSpendBlocksParams = {},
): Promise<{
  data: {
    active: boolean;
    block_free_models: boolean;
    id: string;
    lift_reason:
      | "manual"
      | "period_reset"
      | "below_limit"
      | "rule_changed"
      | "rule_disabled"
      | "rule_deleted"
      | null;
    lifted_at: string | null;
    lifted_by: string | null;
    limit_nanos: number;
    limit_usd: number;
    period_start: string;
    resets_at: string | null;
    rule_id: string | null;
    rule_name: string | null;
    scope_id: string | null;
    scope_label: string;
    scope_type:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spend_nanos: number;
    spend_usd: number;
    started_at: string;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/spend-blocks";
  return client.request<{
    data: {
      active: boolean;
      block_free_models: boolean;
      id: string;
      lift_reason:
        | "manual"
        | "period_reset"
        | "below_limit"
        | "rule_changed"
        | "rule_disabled"
        | "rule_deleted"
        | null;
      lifted_at: string | null;
      lifted_by: string | null;
      limit_nanos: number;
      limit_usd: number;
      period_start: string;
      resets_at: string | null;
      rule_id: string | null;
      rule_name: string | null;
      scope_id: string | null;
      scope_label: string;
      scope_type:
        "workspace" | "key" | "member" | "department" | "model" | "provider";
      spend_nanos: number;
      spend_usd: number;
      started_at: string;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListSpendRuleHistoryParams = {
  path: {
    id: string;
  };
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the alerts and block events the rule has queued, newest first, with delivery counts, and its most recent period records.
 */
export async function listSpendRuleHistory(
  client: Client,
  args: ListSpendRuleHistoryParams,
): Promise<{
  data: {
    events: {
      base_nanos?: number | null;
      base_usd?: number | null;
      created_at: string;
      deliveries: {
        failed: number;
        pending: number;
        sent: number;
      };
      id: string;
      kind: "spend_alert" | "spend_blocked";
      message?: string | null;
      percent?: number | null;
      period?: {
        [key: string]: unknown;
      } | null;
      state?: string | null;
      threshold_amount_nanos?: number | null;
      threshold_amount_usd?: number | null;
      threshold_percent?: number | null;
      thresholds_crossed?: number[] | null;
      title?: string | null;
      value_nanos?: number | null;
      value_usd?: number | null;
    }[];
    has_more: boolean;
    periods: {
      amount_fired_at: string | null;
      fire_count: number;
      highest_percent_fired: number | null;
      last_base_nanos: number | null;
      last_base_usd: number | null;
      last_fired_at: string | null;
      last_value_nanos: number | null;
      last_value_usd: number | null;
      period_end: string | null;
      period_start: string | null;
    }[];
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-rules/${encodeURIComponent(String(path["id"]))}/history`;
  return client.request<{
    data: {
      events: {
        base_nanos?: number | null;
        base_usd?: number | null;
        created_at: string;
        deliveries: {
          failed: number;
          pending: number;
          sent: number;
        };
        id: string;
        kind: "spend_alert" | "spend_blocked";
        message?: string | null;
        percent?: number | null;
        period?: {
          [key: string]: unknown;
        } | null;
        state?: string | null;
        threshold_amount_nanos?: number | null;
        threshold_amount_usd?: number | null;
        threshold_percent?: number | null;
        thresholds_crossed?: number[] | null;
        title?: string | null;
        value_nanos?: number | null;
        value_usd?: number | null;
      }[];
      has_more: boolean;
      periods: {
        amount_fired_at: string | null;
        fire_count: number;
        highest_percent_fired: number | null;
        last_base_nanos: number | null;
        last_base_usd: number | null;
        last_fired_at: string | null;
        last_value_nanos: number | null;
        last_value_usd: number | null;
        period_end: string | null;
        period_start: string | null;
      }[];
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListSpendRulesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the workspace's spend rules. A rule notifies at thresholds in dollars or percent over a scope and a calendar or rolling period. Every workspace member can read them.
 */
export async function listSpendRules(
  client: Client,
  args: ListSpendRulesParams = {},
): Promise<{
  data: {
    action: "notify" | "block";
    base_amount_nanos: number | null;
    base_amount_usd: number | null;
    base_kind:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_ref: "daily" | "weekly" | "monthly" | null;
    block_at_amount_nanos: number | null;
    block_at_amount_usd: number | null;
    block_at_percent: number;
    block_free_models: boolean;
    cooldown_minutes: number;
    created_at: string;
    created_by: string | null;
    destination_ids: string[];
    enabled: boolean;
    evaluated: boolean;
    id: string;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    name: string;
    period: "day" | "week" | "month" | "rolling";
    runway_days: number | null;
    scope_id: string | null;
    scope_type:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spike_floor_nanos: number | null;
    spike_floor_usd: number | null;
    spike_multiplier: number | null;
    threshold_amount_nanos: number | null;
    threshold_amount_usd: number | null;
    threshold_percents: number[] | null;
    time_zone: string | null;
    updated_at: string;
    window_hours: number | null;
    workspace_id: string;
  }[];
  max_rules: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/spend-rules";
  return client.request<{
    data: {
      action: "notify" | "block";
      base_amount_nanos: number | null;
      base_amount_usd: number | null;
      base_kind:
        "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
      base_ref: "daily" | "weekly" | "monthly" | null;
      block_at_amount_nanos: number | null;
      block_at_amount_usd: number | null;
      block_at_percent: number;
      block_free_models: boolean;
      cooldown_minutes: number;
      created_at: string;
      created_by: string | null;
      destination_ids: string[];
      enabled: boolean;
      evaluated: boolean;
      id: string;
      metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
      name: string;
      period: "day" | "week" | "month" | "rolling";
      runway_days: number | null;
      scope_id: string | null;
      scope_type:
        "workspace" | "key" | "member" | "department" | "model" | "provider";
      spike_floor_nanos: number | null;
      spike_floor_usd: number | null;
      spike_multiplier: number | null;
      threshold_amount_nanos: number | null;
      threshold_amount_usd: number | null;
      threshold_percents: number[] | null;
      time_zone: string | null;
      updated_at: string;
      window_hours: number | null;
      workspace_id: string;
    }[];
    max_rules: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListSuccessorReplacementsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the workspace's own choices of replacement for models no provider serves any more. Successor routing's switch and price policy are in /settings. Any workspace member; settings:read required.
 */
export async function listSuccessorReplacements(
  client: Client,
  args: ListSuccessorReplacementsParams = {},
): Promise<{
  data: {
    model?: string;
    successor?: string | null;
    updated_at?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/successor/replacements";
  return client.request<{
    data: {
      model?: string;
      successor?: string | null;
      updated_at?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListTeamModelsParams = {
  path?: Record<string, never>;
  query?: {
    availability?: "active" | "all";
    capability_status?: string[];
    endpoints?: string[];
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    input_types?: string[];
    limit?: number;
    model_routing_status?: string[];
    offset?: number;
    organisation?:
      | "01-ai"
      | "adept"
      | "ai21"
      | "aion-labs"
      | "aisingapore"
      | "alibaba"
      | "allenai"
      | "amazon"
      | "anthracite-org"
      | "anthropic"
      | "arcee-ai"
      | "baai"
      | "baichuan"
      | "baidu"
      | "bigcode"
      | "black-forest-labs"
      | "bytedance"
      | "bytedance-seed"
      | "cogito"
      | "cognitivecomputations"
      | "cohere"
      | "crofai"
      | "cursor"
      | "cyfragovpl"
      | "databricks"
      | "dealignai"
      | "decart"
      | "deepseek"
      | "dots-studio"
      | "early-access"
      | "eleven-labs"
      | "essential-ai"
      | "fastino"
      | "fish-audio"
      | "github"
      | "google"
      | "gryphe"
      | "hexgrad"
      | "ibm"
      | "ibm-granite"
      | "inception"
      | "inclusionai"
      | "inference-net"
      | "inflection"
      | "intfloat"
      | "jetbrains"
      | "kblab"
      | "kling"
      | "kuaishou"
      | "kwaipilot"
      | "kwaivgi"
      | "lg"
      | "lightricks"
      | "liquid-ai"
      | "mancer"
      | "medaibase"
      | "meituan"
      | "meta"
      | "microsoft"
      | "mindai"
      | "minimax"
      | "mistral"
      | "mistralai"
      | "moonshotai"
      | "morph"
      | "naver-hyperclova"
      | "near-ai"
      | "nex-agi"
      | "nous"
      | "nousresearch"
      | "novasearch"
      | "nvidia"
      | "openai"
      | "openbmb"
      | "opencompass"
      | "opengvlab"
      | "orcarouter"
      | "ornith"
      | "perceptron"
      | "perplexity"
      | "phala"
      | "pixverse"
      | "poe"
      | "poolside"
      | "prime-intellect"
      | "prism-ml"
      | "qwen"
      | "reka"
      | "relace"
      | "runway"
      | "sakana"
      | "sao10k"
      | "sapiens-ai"
      | "sentence-transformers"
      | "sference"
      | "shanghai-ai-laboratory"
      | "shengshu-ai"
      | "snowflake"
      | "sourceful"
      | "spacex-ai"
      | "speakleash"
      | "stability-ai"
      | "stealth"
      | "stepfun"
      | "suno"
      | "tencent"
      | "thedrummer"
      | "thinking-machines"
      | "undi95"
      | "upstage"
      | "venice"
      | "vercel"
      | "villanova-ai"
      | "voyage"
      | "windsurf"
      | "writer"
      | "xai"
      | "xgenerationlab"
      | "xiaomi"
      | "z-ai"
      | "zyphra"
      | (
          | "01-ai"
          | "adept"
          | "ai21"
          | "aion-labs"
          | "aisingapore"
          | "alibaba"
          | "allenai"
          | "amazon"
          | "anthracite-org"
          | "anthropic"
          | "arcee-ai"
          | "baai"
          | "baichuan"
          | "baidu"
          | "bigcode"
          | "black-forest-labs"
          | "bytedance"
          | "bytedance-seed"
          | "cogito"
          | "cognitivecomputations"
          | "cohere"
          | "crofai"
          | "cursor"
          | "cyfragovpl"
          | "databricks"
          | "dealignai"
          | "decart"
          | "deepseek"
          | "dots-studio"
          | "early-access"
          | "eleven-labs"
          | "essential-ai"
          | "fastino"
          | "fish-audio"
          | "github"
          | "google"
          | "gryphe"
          | "hexgrad"
          | "ibm"
          | "ibm-granite"
          | "inception"
          | "inclusionai"
          | "inference-net"
          | "inflection"
          | "intfloat"
          | "jetbrains"
          | "kblab"
          | "kling"
          | "kuaishou"
          | "kwaipilot"
          | "kwaivgi"
          | "lg"
          | "lightricks"
          | "liquid-ai"
          | "mancer"
          | "medaibase"
          | "meituan"
          | "meta"
          | "microsoft"
          | "mindai"
          | "minimax"
          | "mistral"
          | "mistralai"
          | "moonshotai"
          | "morph"
          | "naver-hyperclova"
          | "near-ai"
          | "nex-agi"
          | "nous"
          | "nousresearch"
          | "novasearch"
          | "nvidia"
          | "openai"
          | "openbmb"
          | "opencompass"
          | "opengvlab"
          | "orcarouter"
          | "ornith"
          | "perceptron"
          | "perplexity"
          | "phala"
          | "pixverse"
          | "poe"
          | "poolside"
          | "prime-intellect"
          | "prism-ml"
          | "qwen"
          | "reka"
          | "relace"
          | "runway"
          | "sakana"
          | "sao10k"
          | "sapiens-ai"
          | "sentence-transformers"
          | "sference"
          | "shanghai-ai-laboratory"
          | "shengshu-ai"
          | "snowflake"
          | "sourceful"
          | "spacex-ai"
          | "speakleash"
          | "stability-ai"
          | "stealth"
          | "stepfun"
          | "suno"
          | "tencent"
          | "thedrummer"
          | "thinking-machines"
          | "undi95"
          | "upstage"
          | "venice"
          | "vercel"
          | "villanova-ai"
          | "voyage"
          | "windsurf"
          | "writer"
          | "xai"
          | "xgenerationlab"
          | "xiaomi"
          | "z-ai"
          | "zyphra"
        )[];
    output_types?: string[];
    params?: string[];
    provider?: string[];
    provider_availability_reason?: string[];
    provider_availability_status?: string[];
    provider_routing_status?: string[];
    provider_status?: string[];
    status?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns team-scoped gateway model listings. Defaults to currently publicly routable models; use availability=all to include non-routable availability records.
 */
export async function listTeamModels(
  client: Client,
  args: ListTeamModelsParams = {},
): Promise<{
  availability_mode: "active" | "all";
  limit: number;
  models: {
    aliases: string[];
    availability: {
      active_provider_count: number;
      coming_soon_provider_count: number;
      inactive_provider_count: number;
      provider_count: number;
      status: "active" | "coming_soon" | "inactive" | "not_listed";
    };
    base_model_id: string;
    capabilities: {
      endpoints?: string[];
      parameter_details: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      parameters: string[];
    };
    description: string;
    id: string;
    lifecycle: {
      deprecated_at: string | null;
      message: string | null;
      released_at: string | null;
      replacement_id: string | null;
      retires_at: string | null;
      status: "active" | "deprecated" | "retired" | null;
    };
    limits: {
      input_tokens: number | null;
      output_tokens: number | null;
    };
    modalities: {
      input: string[];
      output: string[];
    };
    name: string;
    offers: {
      capabilities: {
        endpoints?: string[];
        parameter_details: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        parameters: string[];
      };
      effective: {
        from: string | null;
        to: string | null;
      };
      endpoints: string[];
      modalities: {
        input: string[];
        output: string[];
      };
      model: string | null;
      pricing: {
        meters: {
          [key: string]: {
            currency: "USD";
            price_per_unit: string;
            provider_id: string;
            unit: string;
            unit_size: number;
          } | null;
        };
        pricing_plan: "standard";
      };
      provider: {
        id: string;
        name: string | null;
      };
      routable: boolean;
      routing: {
        capability:
          | "active"
          | "coming_soon"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled"
          | "internal_testing";
        model:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
        provider:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
      };
      service_tiers?: ("flex" | "priority" | "standard" | "ultrafast")[];
      status: "active" | "coming_soon" | "inactive";
      status_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
    }[];
    organization: {
      color: string | null;
      id: string;
      name: string | null;
    } | null;
    pricing: {
      meters: {
        [key: string]: {
          currency: "USD";
          price_per_unit: string;
          provider_id: string;
          unit: string;
          unit_size: number;
        } | null;
      };
      pricing_plan: "standard";
    };
    variant: string;
    variants: {
      [key: string]: {
        model_id: string;
        name: string;
      };
    };
  }[];
  offset: number;
  ok: boolean;
  total: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/models/me";
  return client.request<{
    availability_mode: "active" | "all";
    limit: number;
    models: {
      aliases: string[];
      availability: {
        active_provider_count: number;
        coming_soon_provider_count: number;
        inactive_provider_count: number;
        provider_count: number;
        status: "active" | "coming_soon" | "inactive" | "not_listed";
      };
      base_model_id: string;
      capabilities: {
        endpoints?: string[];
        parameter_details: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        parameters: string[];
      };
      description: string;
      id: string;
      lifecycle: {
        deprecated_at: string | null;
        message: string | null;
        released_at: string | null;
        replacement_id: string | null;
        retires_at: string | null;
        status: "active" | "deprecated" | "retired" | null;
      };
      limits: {
        input_tokens: number | null;
        output_tokens: number | null;
      };
      modalities: {
        input: string[];
        output: string[];
      };
      name: string;
      offers: {
        capabilities: {
          endpoints?: string[];
          parameter_details: {
            [key: string]: {
              [key: string]: unknown;
            };
          };
          parameters: string[];
        };
        effective: {
          from: string | null;
          to: string | null;
        };
        endpoints: string[];
        modalities: {
          input: string[];
          output: string[];
        };
        model: string | null;
        pricing: {
          meters: {
            [key: string]: {
              currency: "USD";
              price_per_unit: string;
              provider_id: string;
              unit: string;
              unit_size: number;
            } | null;
          };
          pricing_plan: "standard";
        };
        provider: {
          id: string;
          name: string | null;
        };
        routable: boolean;
        routing: {
          capability:
            | "active"
            | "coming_soon"
            | "deranked_lvl1"
            | "deranked_lvl2"
            | "deranked_lvl3"
            | "disabled"
            | "internal_testing";
          model:
            | "active"
            | "deranked_lvl1"
            | "deranked_lvl2"
            | "deranked_lvl3"
            | "disabled";
          provider:
            | "active"
            | "deranked_lvl1"
            | "deranked_lvl2"
            | "deranked_lvl3"
            | "disabled";
        };
        service_tiers?: ("flex" | "priority" | "standard" | "ultrafast")[];
        status: "active" | "coming_soon" | "inactive";
        status_reason:
          | "active"
          | "preview_only"
          | "gated"
          | "access_limited"
          | "region_limited"
          | "project_limited"
          | "paused"
          | "soft_blocked"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "internal_testing"
          | "scheduled"
          | "coming_soon"
          | "provider_disabled"
          | "model_disabled"
          | "capability_disabled"
          | "provider_not_ready"
          | "provider_inactive"
          | "inactive"
          | "retired";
      }[];
      organization: {
        color: string | null;
        id: string;
        name: string | null;
      } | null;
      pricing: {
        meters: {
          [key: string]: {
            currency: "USD";
            price_per_unit: string;
            provider_id: string;
            unit: string;
            unit_size: number;
          } | null;
        };
        pricing_plan: "standard";
      };
      variant: string;
      variants: {
        [key: string]: {
          model_id: string;
          name: string;
        };
      };
    }[];
    offset: number;
    ok: boolean;
    total: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListVideoModelsParams = {
  path?: Record<string, never>;
  query?: {
    params?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns DB-backed video model/provider capability metadata for the video playground and SDK validation.
 */
export async function listVideoModels(
  client: Client,
  args: ListVideoModelsParams = {},
): Promise<{
  data?: {
    input_types?: string[];
    model?: string;
    name?: string;
    output_types?: string[];
    pricing?: {
      [key: string]: unknown;
    };
    providers?: {
      id?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
    }[];
    status?: string;
    supported_parameters?: string[];
    supported_parameters_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    supported_params?: string[];
    supported_params_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos/models";
  return client.request<{
    data?: {
      input_types?: string[];
      model?: string;
      name?: string;
      output_types?: string[];
      pricing?: {
        [key: string]: unknown;
      };
      providers?: {
        id?: string;
        supported_parameters?: string[];
        supported_parameters_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        supported_params?: string[];
        supported_params_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
      }[];
      status?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
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

export type ListVideoModelsAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/models.
 */
export async function listVideoModelsAlias(
  client: Client,
  args: ListVideoModelsAliasParams = {},
): Promise<{
  data?: {
    input_types?: string[];
    model?: string;
    name?: string;
    output_types?: string[];
    pricing?: {
      [key: string]: unknown;
    };
    providers?: {
      id?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
    }[];
    status?: string;
    supported_parameters?: string[];
    supported_parameters_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    supported_params?: string[];
    supported_params_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations/models";
  return client.request<{
    data?: {
      input_types?: string[];
      model?: string;
      name?: string;
      output_types?: string[];
      pricing?: {
        [key: string]: unknown;
      };
      providers?: {
        id?: string;
        supported_parameters?: string[];
        supported_parameters_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        supported_params?: string[];
        supported_params_detail?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
      }[];
      status?: string;
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      supported_params?: string[];
      supported_params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
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

export type ListVideosParams = {
  path?: Record<string, never>;
  query?: {
    after?: string;
    limit?: number;
    offset?: number;
    order?: "asc" | "desc";
    status?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists async video generation jobs for the authenticated team.
 */
export async function listVideos(
  client: Client,
  args: ListVideosParams = {},
): Promise<{
  data?: {
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      billable?: boolean;
      billed_at?: string;
      charge_reason?: string | null;
      charged?: boolean | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
      [key: string]: unknown;
    };
    cancel_url?: string | null;
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    model?: string;
    native_video_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }[];
  first_id?: string | null;
  has_more?: boolean;
  last_id?: string | null;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos";
  return client.request<{
    data?: {
      asset?: {
        bytes?: number;
        duration_seconds?: number;
        height?: number;
        id?: string;
        mime_type?: string;
        sha256?: string;
        width?: number;
      } | null;
      audio?: boolean;
      billing?: {
        billable?: boolean;
        billed_at?: string;
        charge_reason?: string | null;
        charged?: boolean | null;
        currency?: string;
        estimated_nanos?: number | null;
        estimated_provider_cost?: string | null;
        estimated_user_cost?: string | null;
        reservation_id?: string | null;
        reservation_status?: string | null;
        reserved_nanos?: number | null;
        settled_provider_cost?: string | null;
        settled_user_cost?: string | null;
        state?: "pending" | "estimated" | "settled" | "void";
        total_nanos?: number | null;
        [key: string]: unknown;
      };
      cancel_url?: string | null;
      completed_at?: number | string | null;
      content_url?: string;
      created_at?: number | string;
      download_url?: string | null;
      error?: unknown | null;
      expires_at?: number | null;
      generation_id?: string | null;
      id?: string;
      last_webhook_dispatched_at?: string | null;
      last_webhook_progress?: number | null;
      last_webhook_progress_at?: string | null;
      lifecycle_status?:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
      model?: string;
      native_video_id?: string | null;
      next_webhook_retry_at?: string | null;
      object?: string;
      output_access?: "bytes" | "signed_url" | "both";
      outputs?: {
        bytes_available?: boolean;
        content_url?: string;
        download_url?: string;
        expires_at?: number;
        index?: number;
        mime_type?: string;
      }[];
      poll_after_seconds?: number;
      polling_url?: string;
      progress?: number | null;
      progress_source?: string;
      provider?: string;
      request_id?: string;
      seconds?: number;
      session_id?: string;
      size?: string;
      started_at?: number | string | null;
      status?:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
      usage?: {
        cost?: number;
        is_byok?: boolean;
        [key: string]: unknown;
      };
      webhook?: {
        attempts?: {
          attempt_number?: number;
          delivered_at?: string | null;
          delivery_key?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          max_attempts?: number;
          next_retry_at?: string | null;
          response_body_preview?: string | null;
          response_status?: number | null;
          status?: "delivered" | "scheduled_retry" | "failed_permanently";
          tried_at?: string;
        }[];
        delivery?: {
          delivered_event_types?: string[];
          delivered_events?: number;
          last_attempt_at?: string | null;
          last_attempt_status?:
            "delivered" | "scheduled_retry" | "failed_permanently" | null;
          last_delivered_at?: string | null;
          last_error_message?: string | null;
          last_failure_at?: string | null;
          last_response_status?: number | null;
          next_retry_at?: string | null;
          pending_retries?: number;
          total_attempts?: number;
        };
        events?: string[];
        has_secret?: boolean;
        url?: string | null;
      };
      websocket_url?: string;
    }[];
    first_id?: string | null;
    has_more?: boolean;
    last_id?: string | null;
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListVideosAliasParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    status?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos.
 */
export async function listVideosAlias(
  client: Client,
  args: ListVideosAliasParams = {},
): Promise<{
  data?: {
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      billable?: boolean;
      billed_at?: string;
      charge_reason?: string | null;
      charged?: boolean | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
      [key: string]: unknown;
    };
    cancel_url?: string | null;
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    model?: string;
    native_video_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }[];
  first_id?: string | null;
  has_more?: boolean;
  last_id?: string | null;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations";
  return client.request<{
    data?: {
      asset?: {
        bytes?: number;
        duration_seconds?: number;
        height?: number;
        id?: string;
        mime_type?: string;
        sha256?: string;
        width?: number;
      } | null;
      audio?: boolean;
      billing?: {
        billable?: boolean;
        billed_at?: string;
        charge_reason?: string | null;
        charged?: boolean | null;
        currency?: string;
        estimated_nanos?: number | null;
        estimated_provider_cost?: string | null;
        estimated_user_cost?: string | null;
        reservation_id?: string | null;
        reservation_status?: string | null;
        reserved_nanos?: number | null;
        settled_provider_cost?: string | null;
        settled_user_cost?: string | null;
        state?: "pending" | "estimated" | "settled" | "void";
        total_nanos?: number | null;
        [key: string]: unknown;
      };
      cancel_url?: string | null;
      completed_at?: number | string | null;
      content_url?: string;
      created_at?: number | string;
      download_url?: string | null;
      error?: unknown | null;
      expires_at?: number | null;
      generation_id?: string | null;
      id?: string;
      last_webhook_dispatched_at?: string | null;
      last_webhook_progress?: number | null;
      last_webhook_progress_at?: string | null;
      lifecycle_status?:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
      model?: string;
      native_video_id?: string | null;
      next_webhook_retry_at?: string | null;
      object?: string;
      output_access?: "bytes" | "signed_url" | "both";
      outputs?: {
        bytes_available?: boolean;
        content_url?: string;
        download_url?: string;
        expires_at?: number;
        index?: number;
        mime_type?: string;
      }[];
      poll_after_seconds?: number;
      polling_url?: string;
      progress?: number | null;
      progress_source?: string;
      provider?: string;
      request_id?: string;
      seconds?: number;
      session_id?: string;
      size?: string;
      started_at?: number | string | null;
      status?:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
      usage?: {
        cost?: number;
        is_byok?: boolean;
        [key: string]: unknown;
      };
      webhook?: {
        attempts?: {
          attempt_number?: number;
          delivered_at?: string | null;
          delivery_key?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          max_attempts?: number;
          next_retry_at?: string | null;
          response_body_preview?: string | null;
          response_status?: number | null;
          status?: "delivered" | "scheduled_retry" | "failed_permanently";
          tried_at?: string;
        }[];
        delivery?: {
          delivered_event_types?: string[];
          delivered_events?: number;
          last_attempt_at?: string | null;
          last_attempt_status?:
            "delivered" | "scheduled_retry" | "failed_permanently" | null;
          last_delivered_at?: string | null;
          last_error_message?: string | null;
          last_failure_at?: string | null;
          last_response_status?: number | null;
          next_retry_at?: string | null;
          pending_retries?: number;
          total_attempts?: number;
        };
        events?: string[];
        has_secret?: boolean;
        url?: string | null;
      };
      websocket_url?: string;
    }[];
    first_id?: string | null;
    has_more?: boolean;
    last_id?: string | null;
    object?: string;
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
  query?: {
    include_deleted?: boolean;
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists async webhook destinations. Requires `settings:read` and workspace access to async APIs.
 */
export async function listWebhookEndpoints(
  client: Client,
  args: ListWebhookEndpointsParams = {},
): Promise<{
  data: {
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events: (
      | "job.created"
      | "job.status_changed"
      | "job.progress"
      | "job.completed"
      | "job.failed"
      | "job.cancelled"
      | "job.expired"
      | "video.created"
      | "video.status_changed"
      | "video.progress"
      | "video.completed"
      | "video.failed"
      | "video.cancelled"
      | "video.expired"
      | "batch.created"
      | "batch.status_changed"
      | "batch.progress"
      | "batch.completed"
      | "batch.failed"
      | "batch.cancelled"
      | "batch.expired"
    )[];
    hasSecret: boolean;
    id: string;
    name: string;
    status: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url: string;
    workspaceId: string;
  }[];
  object: "list";
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/webhook-endpoints";
  return client.request<{
    data: {
      createdAt?: string | null;
      createdBy?: string | null;
      deletedAt?: string | null;
      events: (
        | "job.created"
        | "job.status_changed"
        | "job.progress"
        | "job.completed"
        | "job.failed"
        | "job.cancelled"
        | "job.expired"
        | "video.created"
        | "video.status_changed"
        | "video.progress"
        | "video.completed"
        | "video.failed"
        | "video.cancelled"
        | "video.expired"
        | "batch.created"
        | "batch.status_changed"
        | "batch.progress"
        | "batch.completed"
        | "batch.failed"
        | "batch.cancelled"
        | "batch.expired"
      )[];
      hasSecret: boolean;
      id: string;
      name: string;
      status: "active" | "disabled" | "deleted";
      updatedAt?: string | null;
      url: string;
      workspaceId: string;
    }[];
    object: "list";
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkloadIdentityPoliciesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists the workspace's trusted workload policies: which Vercel deployments and GitHub Actions workflows may call the gateway with their OIDC token instead of an API key. Requires keys:read on management keys and OAuth tokens, or a workspace owner or admin. Available only to workspaces in the trusted workloads beta; other workspaces get 404.
 */
export async function listWorkloadIdentityPolicies(
  client: Client,
  args: ListWorkloadIdentityPoliciesParams = {},
): Promise<{
  audience: string;
  data: {
    audience: string;
    claim_conditions: {
      [key: string]: string[];
    };
    created_at: string;
    created_by: string | null;
    id: string;
    issuer: string;
    key_id: string;
    last_used_at: string | null;
    max_token_lifetime_seconds: number;
    name: string;
    owner_id: string;
    provider: "vercel" | "github_actions";
    status: "active" | "disabled";
    updated_at: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/workload-identity/policies";
  return client.request<{
    audience: string;
    data: {
      audience: string;
      claim_conditions: {
        [key: string]: string[];
      };
      created_at: string;
      created_by: string | null;
      id: string;
      issuer: string;
      key_id: string;
      last_used_at: string | null;
      max_token_lifetime_seconds: number;
      name: string;
      owner_id: string;
      provider: "vercel" | "github_actions";
      status: "active" | "disabled";
      updated_at: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceAppsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists automatically attributed gateway applications and their editable metadata. Requires `settings:read`.
 */
export async function listWorkspaceApps(
  client: Client,
  args: ListWorkspaceAppsParams = {},
): Promise<{
  data: {
    app_key: string;
    category: string | null;
    created_at: string | null;
    docs_url: string | null;
    id: string;
    image_url: string | null;
    is_active: boolean;
    is_managed: boolean;
    is_public: boolean;
    last_seen: string | null;
    title: string;
    url: string | null;
  }[];
  limit: number;
  offset: number;
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/apps";
  return client.request<{
    data: {
      app_key: string;
      category: string | null;
      created_at: string | null;
      docs_url: string | null;
      id: string;
      image_url: string | null;
      is_active: boolean;
      is_managed: boolean;
      is_public: boolean;
      last_seen: string | null;
      title: string;
      url: string | null;
    }[];
    limit: number;
    offset: number;
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceAuditEventsParams = {
  path?: Record<string, never>;
  query?: {
    action?: string;
    cursor?: string;
    limit?: number;
    target_type?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns security-sensitive control-plane changes for the authenticated workspace. Requires an owner or admin identity and the activity:read management capability.
 */
export async function listWorkspaceAuditEvents(
  client: Client,
  args: ListWorkspaceAuditEventsParams = {},
): Promise<{
  data: {
    action: string;
    actor?: {
      display_name?: string | null;
      email?: string | null;
    } | null;
    actor_user_id?: string | null;
    created_at: string;
    id: string;
    metadata: {
      accessTemplate?: string;
      changedFields?: string[];
      expiresAt?: string | null;
      limits?: {
        dailyCostNanos?: number;
        dailyRequests?: number;
        monthlyCostNanos?: number;
        monthlyRequests?: number;
        softBlocked?: boolean;
        weeklyCostNanos?: number;
        weeklyRequests?: number;
      };
      prefix?: string | null;
      previousKeyExpiresAt?: string | null;
      replacementKeyId?: string;
      replacementKeyName?: string;
      status?: string;
      [key: string]: unknown;
    };
    request_id?: string | null;
    target_id: string;
    target_name?: string | null;
    target_type: string;
    workspace_id: string;
  }[];
  has_more: boolean;
  next_cursor?: string | null;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audit-events";
  return client.request<{
    data: {
      action: string;
      actor?: {
        display_name?: string | null;
        email?: string | null;
      } | null;
      actor_user_id?: string | null;
      created_at: string;
      id: string;
      metadata: {
        accessTemplate?: string;
        changedFields?: string[];
        expiresAt?: string | null;
        limits?: {
          dailyCostNanos?: number;
          dailyRequests?: number;
          monthlyCostNanos?: number;
          monthlyRequests?: number;
          softBlocked?: boolean;
          weeklyCostNanos?: number;
          weeklyRequests?: number;
        };
        prefix?: string | null;
        previousKeyExpiresAt?: string | null;
        replacementKeyId?: string;
        replacementKeyName?: string;
        status?: string;
        [key: string]: unknown;
      };
      request_id?: string | null;
      target_id: string;
      target_name?: string | null;
      target_type: string;
      workspace_id: string;
    }[];
    has_more: boolean;
    next_cursor?: string | null;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceBudgetsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists spend ceilings with current usage, remaining spend, and reset timestamps.
 */
export async function listWorkspaceBudgets(
  client: Client,
  args: ListWorkspaceBudgetsParams = {},
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly" | "lifetime";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/budgets";
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly" | "lifetime";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceDepartmentsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists manually managed and directory-synchronized departments.
 */
export async function listWorkspaceDepartments(
  client: Client,
  args: ListWorkspaceDepartmentsParams = {},
): Promise<{
  data: {
    color?: string;
    created_at?: string | null;
    description?: string | null;
    directory_name?: string | null;
    icon?: string;
    id: string;
    name: string;
    name_overridden?: boolean;
    source_id?: string | null;
    source_type?: "manual" | "scim_group";
    updated_at?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/departments";
  return client.request<{
    data: {
      color?: string;
      created_at?: string | null;
      description?: string | null;
      directory_name?: string | null;
      icon?: string;
      id: string;
      name: string;
      name_overridden?: boolean;
      source_id?: string | null;
      source_type?: "manual" | "scim_group";
      updated_at?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceGroupMappingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists mappings from provisioned groups to workspace roles and departments.
 */
export async function listWorkspaceGroupMappings(
  client: Client,
  args: ListWorkspaceGroupMappingsParams = {},
): Promise<{
  data: {
    access_role: "member" | "admin";
    created_at?: string | null;
    department_id: string;
    department_position: "member" | "lead";
    id: string;
    scim_group_id: string;
    updated_at?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/group-mappings";
  return client.request<{
    data: {
      access_role: "member" | "admin";
      created_at?: string | null;
      department_id: string;
      department_position: "member" | "lead";
      id: string;
      scim_group_id: string;
      updated_at?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceInvitesParams = {
  path: {
    id: string;
  };
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists invite metadata without returning invite secrets. Management API key required.
 */
export async function listWorkspaceInvites(
  client: Client,
  args: ListWorkspaceInvitesParams,
): Promise<{
  data: {
    created_at?: string;
    creator_user_id: string;
    expires_at?: string | null;
    id: string;
    max_uses?: number | null;
    role: "admin" | "member";
    token_preview?: string | null;
    uses_count?: number;
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/invites`;
  return client.request<{
    data: {
      created_at?: string;
      creator_user_id: string;
      expires_at?: string | null;
      id: string;
      max_uses?: number | null;
      role: "admin" | "member";
      token_preview?: string | null;
      uses_count?: number;
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceJoinRequestsParams = {
  path: {
    id: string;
  };
  query?: {
    limit?: number;
    offset?: number;
    status?: "pending" | "approved" | "denied";
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists recent workspace join requests. Management API key required.
 */
export async function listWorkspaceJoinRequests(
  client: Client,
  args: ListWorkspaceJoinRequestsParams,
): Promise<{
  data: {
    created_at?: string;
    decided_at?: string | null;
    decided_by?: string | null;
    id: string;
    invite_id?: string | null;
    requester_user_id: string;
    status: "pending" | "approved" | "denied";
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/join-requests`;
  return client.request<{
    data: {
      created_at?: string;
      decided_at?: string | null;
      decided_by?: string | null;
      id: string;
      invite_id?: string | null;
      requester_user_id: string;
      status: "pending" | "approved" | "denied";
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceMembersParams = {
  path: {
    id: string;
  };
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists members and roles for a workspace. Management API key required.
 */
export async function listWorkspaceMembers(
  client: Client,
  args: ListWorkspaceMembersParams,
): Promise<{
  data: {
    display_name?: string | null;
    joined_at?: string | null;
    role: "owner" | "admin" | "member";
    user_id: string;
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/members`;
  return client.request<{
    data: {
      display_name?: string | null;
      joined_at?: string | null;
      role: "owner" | "admin" | "member";
      user_id: string;
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceNotificationDestinationsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists active and disabled workspace destinations without returning encrypted target values.
 */
export async function listWorkspaceNotificationDestinations(
  client: Client,
  args: ListWorkspaceNotificationDestinationsParams = {},
): Promise<{
  data: {
    created_at?: string | null;
    has_signing_secret?: boolean;
    id: string;
    name: string;
    signing_secret?: string;
    signing_secret_rotated_at?: string | null;
    status: "active" | "disabled";
    target_preview: string;
    type:
      | "email"
      | "discord"
      | "discord_webhook"
      | "slack"
      | "microsoft_teams"
      | "custom_webhook";
    updated_at?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/notifications/destinations";
  return client.request<{
    data: {
      created_at?: string | null;
      has_signing_secret?: boolean;
      id: string;
      name: string;
      signing_secret?: string;
      signing_secret_rotated_at?: string | null;
      status: "active" | "disabled";
      target_preview: string;
      type:
        | "email"
        | "discord"
        | "discord_webhook"
        | "slack"
        | "microsoft_teams"
        | "custom_webhook";
      updated_at?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceNotificationRoutesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns destination assignments for each supported workspace notification event.
 */
export async function listWorkspaceNotificationRoutes(
  client: Client,
  args: ListWorkspaceNotificationRoutesParams = {},
): Promise<{
  data: {
    auto_top_up_failed: string[];
    broadcast_destination_failing: string[];
    low_balance: string[];
    model_deprecation: string[];
    model_substitution: string[];
    payment_method_expiring: string[];
    rate_limit_throttled: string[];
    spend_alert: string[];
    spend_blocked: string[];
    spend_report: string[];
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/notifications/routes";
  return client.request<{
    data: {
      auto_top_up_failed: string[];
      broadcast_destination_failing: string[];
      low_balance: string[];
      model_deprecation: string[];
      model_substitution: string[];
      payment_method_expiring: string[];
      rate_limit_throttled: string[];
      spend_alert: string[];
      spend_blocked: string[];
      spend_report: string[];
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspacesParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists workspaces owned by the authenticated management key owner. Management API key required.
 */
export async function listWorkspaces(
  client: Client,
  args: ListWorkspacesParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug?: string | null;
    updated_at: string | null;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/workspaces";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug?: string | null;
      updated_at: string | null;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspaceScimAuditEventsParams = {
  path?: Record<string, never>;
  query?: {
    before?: string;
    limit?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists recent SCIM provisioning activity for the workspace.
 */
export async function listWorkspaceScimAuditEvents(
  client: Client,
  args: ListWorkspaceScimAuditEventsParams = {},
): Promise<{
  data: {
    action?: string;
    correlation_id?: string | null;
    created_at?: string;
    detail?: {
      [key: string]: unknown;
    } | null;
    http_status?: number;
    id?: string;
    outcome?: string;
    request_id?: string | null;
    resource_id?: string | null;
    resource_type?: string | null;
    scim_type?: string | null;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/scim/audit";
  return client.request<{
    data: {
      action?: string;
      correlation_id?: string | null;
      created_at?: string;
      detail?: {
        [key: string]: unknown;
      } | null;
      http_status?: number;
      id?: string;
      outcome?: string;
      request_id?: string | null;
      resource_id?: string | null;
      resource_type?: string | null;
      scim_type?: string | null;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type MakeDecisionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?:
    | {
        debug?: {
          enabled?: boolean;
          return_upstream_request?: boolean;
          return_upstream_response?: boolean;
          trace?: boolean;
          trace_level?: "summary" | "full";
        };
        echo_upstream_request?: boolean;
        input:
          | string
          | {
              content:
                | string
                | (
                    | {
                        text: string;
                        type: "input_text";
                      }
                    | {
                        detail?: "low" | "high" | "auto" | "original" | null;
                        image_url: string;
                        type: "input_image";
                      }
                    | {
                        input_audio: {
                          data?: string;
                          format?: "wav" | "mp3";
                          url?: string;
                        };
                        type: "input_audio";
                      }
                    | {
                        type: "input_video";
                        video_url:
                          | string
                          | {
                              url: string;
                            };
                      }
                  )[];
              role: "user";
              type?: "message";
            }[];
        meta?: boolean;
        metadata?: {
          [key: string]: unknown;
        };
        model: string;
        models?: string[];
        provider?: {
          allow_fallbacks?: boolean | null;
          data_collection?: "allow" | "deny" | null;
          enforce_distillable_text?: boolean | null;
          ignore?: string[];
          include_alpha?: boolean;
          max_price?: {
            audio?: number | string;
            completion?: number | string;
            image?: number | string;
            prompt?: number | string;
            request?: number | string;
          };
          only?: string[];
          order?: string[];
          preferred_max_latency?:
            | number
            | {
                [key: string]: number;
              };
          preferred_min_throughput?:
            | number
            | {
                [key: string]: number;
              };
          quantizations?: string[] | null;
          require_parameters?: boolean | null;
          require_zero_data_retention?: boolean | null;
          required_data_region?: string | null;
          required_execution_region?: string | null;
          sort?:
            | string
            | {
                [key: string]: unknown;
              };
          zdr?: boolean | null;
        };
        provider_options?: {
          typesafe?: {
            long_context?: boolean;
          };
        };
        questions: (
          | {
              instructions: string;
              name?: string;
              type: "predicate";
            }
          | {
              choices: {
                description?: string;
                value: string | boolean;
              }[];
              instructions: string;
              name?: string;
              type: "choice";
            }
          | {
              instructions: string;
              levels: {
                description?: string;
                label: string;
              }[];
              name?: string;
              type: "score";
            }
          | {
              instructions: string;
              name?: string;
              type: "box";
            }
        )[];
        routing?: {
          allow_fallbacks?: boolean | null;
          data_collection?: "allow" | "deny" | null;
          enforce_distillable_text?: boolean | null;
          ignore?: string[];
          include_alpha?: boolean;
          max_price?: {
            audio?: number | string;
            completion?: number | string;
            image?: number | string;
            prompt?: number | string;
            request?: number | string;
          };
          only?: string[];
          order?: string[];
          preferred_max_latency?:
            | number
            | {
                [key: string]: number;
              };
          preferred_min_throughput?:
            | number
            | {
                [key: string]: number;
              };
          quantizations?: string[] | null;
          require_parameters?: boolean | null;
          require_zero_data_retention?: boolean | null;
          required_data_region?: string | null;
          required_execution_region?: string | null;
          sort?:
            | string
            | {
                [key: string]: unknown;
              };
          zdr?: boolean | null;
        };
        safety_identifier?: string | null;
      }
    | {
        debug?: {
          enabled?: boolean;
          return_upstream_request?: boolean;
          return_upstream_response?: boolean;
          trace?: boolean;
          trace_level?: "summary" | "full";
        };
        echo_upstream_request?: boolean;
        images?: (
          | string
          | {
              base64: string;
              content_type: "image/png" | "image/jpeg" | "image/webp";
            }
        )[];
        meta?: boolean;
        metadata?: {
          [key: string]: unknown;
        };
        model: string;
        models?: string[];
        provider?: {
          allow_fallbacks?: boolean | null;
          data_collection?: "allow" | "deny" | null;
          enforce_distillable_text?: boolean | null;
          ignore?: string[];
          include_alpha?: boolean;
          max_price?: {
            audio?: number | string;
            completion?: number | string;
            image?: number | string;
            prompt?: number | string;
            request?: number | string;
          };
          only?: string[];
          order?: string[];
          preferred_max_latency?:
            | number
            | {
                [key: string]: number;
              };
          preferred_min_throughput?:
            | number
            | {
                [key: string]: number;
              };
          quantizations?: string[] | null;
          require_parameters?: boolean | null;
          require_zero_data_retention?: boolean | null;
          required_data_region?: string | null;
          required_execution_region?: string | null;
          sort?:
            | string
            | {
                [key: string]: unknown;
              };
          zdr?: boolean | null;
        };
        provider_options?: {
          typesafe?: {
            long_context?: boolean;
          };
        };
        questions: {
          [key: string]:
            | {
                criteria?: {
                  false?: string;
                  true?: string;
                  [key: string]: unknown;
                };
                instructions:
                  | string
                  | {
                      [key: string]: unknown;
                    }
                  | unknown[];
                type: "noul";
              }
            | {
                criteria: {
                  [key: string]: string | null;
                };
                instructions:
                  | string
                  | {
                      [key: string]: unknown;
                    }
                  | unknown[];
                type: "choice";
              }
            | {
                criteria: string[];
                instructions:
                  | string
                  | {
                      [key: string]: unknown;
                    }
                  | unknown[];
                type: "score";
              }
            | {
                instructions:
                  | string
                  | {
                      [key: string]: unknown;
                    }
                  | unknown[];
                type: "box";
              };
        };
        routing?: {
          allow_fallbacks?: boolean | null;
          data_collection?: "allow" | "deny" | null;
          enforce_distillable_text?: boolean | null;
          ignore?: string[];
          include_alpha?: boolean;
          max_price?: {
            audio?: number | string;
            completion?: number | string;
            image?: number | string;
            prompt?: number | string;
            request?: number | string;
          };
          only?: string[];
          order?: string[];
          preferred_max_latency?:
            | number
            | {
                [key: string]: number;
              };
          preferred_min_throughput?:
            | number
            | {
                [key: string]: number;
              };
          quantizations?: string[] | null;
          require_parameters?: boolean | null;
          require_zero_data_retention?: boolean | null;
          required_data_region?: string | null;
          required_execution_region?: string | null;
          sort?:
            | string
            | {
                [key: string]: unknown;
              };
          zdr?: boolean | null;
        };
        state:
          | string
          | {
              [key: string]: unknown;
            }
          | unknown[];
      };
};

/**
 * Evaluates ordered predicate, choice, and score questions against text or inline images using the OpenAI-compatible Decisions format. Legacy state and named question maps remain supported.
 */
export async function makeDecision(
  client: Client,
  args: MakeDecisionParams = {},
): Promise<
  | {
      answers: (
        | {
            name: string | null;
            probability: number;
            type: "predicate";
          }
        | {
            choice: string | boolean;
            confidence: number;
            name: string | null;
            probabilities: {
              probability: number;
              value: string | boolean;
            }[];
            type: "choice";
          }
        | {
            confidence: number;
            name: string | null;
            probabilities: {
              label: string;
              probability: number;
              value: number;
            }[];
            score: number;
            type: "score";
          }
        | {
            name: string | null;
            type: "refusal";
          }
        | {
            box: {
              bottom: number;
              left: number;
              right: number;
              top: number;
            };
            confidence: number | null;
            name: string | null;
            type: "box";
          }
      )[];
      meta?: {
        [key: string]: unknown;
      };
      model: string;
      request_id?: string | null;
      usage: {
        input_tokens?: number;
        input_tokens_details?: {
          cache_write_tokens?: number;
          cached_tokens?: number;
        };
        output_tokens?: number;
        output_tokens_details?: {
          reasoning_tokens?: number;
        };
        total_tokens?: number;
      };
    }
  | {
      answers?: {
        [key: string]: unknown;
      };
      meta?: {
        [key: string]: unknown;
      };
      model?: string;
      request_id?: string | null;
      usage?: {
        input_tokens?: number;
        input_tokens_details?: {
          cache_write_tokens?: number;
          cached_tokens?: number;
        };
        output_tokens?: number;
        output_tokens_details?: {
          reasoning_tokens?: number;
        };
        total_tokens?: number;
      };
    }
> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/decisions";
  return client.request<
    | {
        answers: (
          | {
              name: string | null;
              probability: number;
              type: "predicate";
            }
          | {
              choice: string | boolean;
              confidence: number;
              name: string | null;
              probabilities: {
                probability: number;
                value: string | boolean;
              }[];
              type: "choice";
            }
          | {
              confidence: number;
              name: string | null;
              probabilities: {
                label: string;
                probability: number;
                value: number;
              }[];
              score: number;
              type: "score";
            }
          | {
              name: string | null;
              type: "refusal";
            }
          | {
              box: {
                bottom: number;
                left: number;
                right: number;
                top: number;
              };
              confidence: number | null;
              name: string | null;
              type: "box";
            }
        )[];
        meta?: {
          [key: string]: unknown;
        };
        model: string;
        request_id?: string | null;
        usage: {
          input_tokens?: number;
          input_tokens_details?: {
            cache_write_tokens?: number;
            cached_tokens?: number;
          };
          output_tokens?: number;
          output_tokens_details?: {
            reasoning_tokens?: number;
          };
          total_tokens?: number;
        };
      }
    | {
        answers?: {
          [key: string]: unknown;
        };
        meta?: {
          [key: string]: unknown;
        };
        model?: string;
        request_id?: string | null;
        usage?: {
          input_tokens?: number;
          input_tokens_details?: {
            cache_write_tokens?: number;
            cached_tokens?: number;
          };
          output_tokens?: number;
          output_tokens_details?: {
            reasoning_tokens?: number;
          };
          total_tokens?: number;
        };
      }
  >({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type MergeWorkspaceAppParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    target_app_id: string;
  };
};

/**
 * Atomically moves request history and analytics from the source application into another application in the same workspace, then removes the source.
 */
export async function mergeWorkspaceApp(
  client: Client,
  args: MergeWorkspaceAppParams,
): Promise<{
  data: {
    merged: true;
    source_app_id: string;
    target_app_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/apps/${encodeURIComponent(String(path["id"]))}/merge`;
  return client.request<{
    data: {
      merged: true;
      source_app_id: string;
      target_app_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type PreviewSpendRuleParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the rule's current period, spend so far, base, percent and next threshold, computed as the evaluator computes them, without sending or recording anything.
 */
export async function previewSpendRule(
  client: Client,
  args: PreviewSpendRuleParams,
): Promise<{
  data: {
    alert: {
      message: string;
      scope_label: string;
      title: string;
    } | null;
    balance: {
      armed: boolean;
      auto_top_up_covers: boolean;
      available_nanos: number;
      available_usd: number;
      balance_usd: number;
      burn_per_day_usd: number;
      burn_usd: number;
      low_balance: boolean;
      low_runway: boolean;
      reserved_usd: number;
      runway_days_left: number | null;
      window_hours: number;
    } | null;
    base_kind:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_nanos: number | null;
    base_ref: "daily" | "weekly" | "monthly" | null;
    base_usd: number | null;
    block_at_nanos: number | null;
    block_at_usd: number | null;
    computed_at: string;
    evaluated: boolean;
    forecast: {
      by: string;
      from: string | null;
      limit_nanos: number | null;
      limit_usd: number | null;
      projected_nanos: number | null;
      projected_percent: number | null;
      projected_usd: number | null;
      reaches_at: string | null;
      ready: boolean;
    } | null;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    next_threshold: {
      amount_nanos: number;
      amount_usd: number;
      percent: number | null;
    } | null;
    percent: number | null;
    period: {
      end: string;
      kind: "day" | "week" | "month" | "rolling";
      start: string;
      window_hours?: number;
    } | null;
    previous_period: {
      end: string;
      start: string;
    } | null;
    reached_threshold_percent: number | null;
    rule_id: string;
    state: {
      amount_fired_at: string | null;
      armed?: boolean;
      fire_count: number;
      highest_percent_fired: number | null;
      last_fired_at: string | null;
    } | null;
    threshold_amount_nanos: number | null;
    threshold_amount_usd: number | null;
    threshold_percents: number[] | null;
    time_zone: string;
    value_nanos: number | null;
    value_usd: number | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-rules/${encodeURIComponent(String(path["id"]))}/preview`;
  return client.request<{
    data: {
      alert: {
        message: string;
        scope_label: string;
        title: string;
      } | null;
      balance: {
        armed: boolean;
        auto_top_up_covers: boolean;
        available_nanos: number;
        available_usd: number;
        balance_usd: number;
        burn_per_day_usd: number;
        burn_usd: number;
        low_balance: boolean;
        low_runway: boolean;
        reserved_usd: number;
        runway_days_left: number | null;
        window_hours: number;
      } | null;
      base_kind:
        "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
      base_nanos: number | null;
      base_ref: "daily" | "weekly" | "monthly" | null;
      base_usd: number | null;
      block_at_nanos: number | null;
      block_at_usd: number | null;
      computed_at: string;
      evaluated: boolean;
      forecast: {
        by: string;
        from: string | null;
        limit_nanos: number | null;
        limit_usd: number | null;
        projected_nanos: number | null;
        projected_percent: number | null;
        projected_usd: number | null;
        reaches_at: string | null;
        ready: boolean;
      } | null;
      metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
      next_threshold: {
        amount_nanos: number;
        amount_usd: number;
        percent: number | null;
      } | null;
      percent: number | null;
      period: {
        end: string;
        kind: "day" | "week" | "month" | "rolling";
        start: string;
        window_hours?: number;
      } | null;
      previous_period: {
        end: string;
        start: string;
      } | null;
      reached_threshold_percent: number | null;
      rule_id: string;
      state: {
        amount_fired_at: string | null;
        armed?: boolean;
        fire_count: number;
        highest_percent_fired: number | null;
        last_fired_at: string | null;
      } | null;
      threshold_amount_nanos: number | null;
      threshold_amount_usd: number | null;
      threshold_percents: number[] | null;
      time_zone: string;
      value_nanos: number | null;
      value_usd: number | null;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type PublishPresetVersionParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    release_notes?: string;
    version_label?: string;
  };
};

/**
 * Publishes the current draft as a new immutable version using the preset versioning method.
 */
export async function publishPresetVersion(
  client: Client,
  args: PublishPresetVersionParams,
): Promise<{
  data: {
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at: string;
    created_by: string;
    description?: string | null;
    id: string;
    labels?: string[];
    name: string;
    preset_id: string;
    release_notes?: string | null;
    slug: string;
    version_label: string;
    version_number: number;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/versions`;
  return client.request<{
    data: {
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at: string;
      created_by: string;
      description?: string | null;
      id: string;
      labels?: string[];
      name: string;
      preset_id: string;
      release_notes?: string | null;
      slug: string;
      version_label: string;
      version_number: number;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RaiseRateLimitTierParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Raises an eligible workspace one tier for a limited time. Only the workspace owner can raise, with an OAuth token holding rate_limits:write; management keys are refused so a leaked key cannot lift its own workspace's limits.
 */
export async function raiseRateLimitTier(
  client: Client,
  args: RaiseRateLimitTierParams = {},
): Promise<{
  data: {
    activeUntil?: number | null;
    availableAt?: number | null;
    canRaise?: boolean;
    durationDays?: number;
    eligible?: boolean;
    refusal?: string | null;
    requestsPerMinute?: number;
    target?: string | null;
    targetRequestsPerMinute?: number | null;
    thresholds?: {
      minAgeDays?: number;
      minLifetimePaidSpendUsd?: number;
    };
    tier?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rate-limits/tier/raise";
  return client.request<{
    data: {
      activeUntil?: number | null;
      availableAt?: number | null;
      canRaise?: boolean;
      durationDays?: number;
      eligible?: boolean;
      refusal?: string | null;
      requestsPerMinute?: number;
      target?: string | null;
      targetRequestsPerMinute?: number | null;
      thresholds?: {
        minAgeDays?: number;
        minLifetimePaidSpendUsd?: number;
      };
      tier?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ReduceAuthorizedAppScopesParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    scopes: string[];
  };
};

/**
 * Narrows an app's access to the scopes given. Scopes can only be removed; adding one needs your consent in the browser. OAuth token with oauth_clients:write required.
 */
export async function reduceAuthorizedAppScopes(
  client: Client,
  args: ReduceAuthorizedAppScopesParams,
): Promise<{
  data: {
    id?: string;
    scopes?: string[];
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/me/authorized-apps/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      id?: string;
      scopes?: string[];
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RegenerateOAuthClientSecretParams = {
  path: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Replaces a confidential client's secret and returns the new value once.
 */
export async function regenerateOAuthClientSecret(
  client: Client,
  args: RegenerateOAuthClientSecretParams,
): Promise<{
  client_id: string;
  client_secret: string;
  message: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["client_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path["client_id"]))}/regenerate-secret`;
  return client.request<{
    client_id: string;
    client_secret: string;
    message: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RejectWorkspaceJoinRequestParams = {
  path: {
    id: string;
    request_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Atomically rejects a pending request. Management API key required.
 */
export async function rejectWorkspaceJoinRequest(
  client: Client,
  args: RejectWorkspaceJoinRequestParams,
): Promise<{
  data: {
    created_at?: string;
    decided_at?: string | null;
    decided_by?: string | null;
    id: string;
    invite_id?: string | null;
    requester_user_id: string;
    status: "pending" | "approved" | "denied";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["request_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/join-requests/${encodeURIComponent(String(path["request_id"]))}/reject`;
  return client.request<{
    data: {
      created_at?: string;
      decided_at?: string | null;
      decided_by?: string | null;
      id: string;
      invite_id?: string | null;
      requester_user_id: string;
      status: "pending" | "approved" | "denied";
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RemoveGuardrailKeysParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    key_ids: string[];
  };
};

/**
 * Removes one or more API-key assignments. Requires `guardrails:write`.
 */
export async function removeGuardrailKeys(
  client: Client,
  args: RemoveGuardrailKeysParams,
): Promise<{
  removed_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/keys/remove`;
  return client.request<{
    removed_count: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RemoveGuardrailMembersParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    user_ids: string[];
  };
};

/**
 * Removes workspace-member assignments. Requires `guardrails:write`.
 */
export async function removeGuardrailMembers(
  client: Client,
  args: RemoveGuardrailMembersParams,
): Promise<{
  removed_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/members/remove`;
  return client.request<{
    removed_count: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RemoveSuccessorReplacementParams = {
  path?: Record<string, never>;
  query?: {
    model: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Removes the workspace's choice for a model, so the catalogue's successor applies again. Owners and admins; settings:write required.
 */
export async function removeSuccessorReplacement(
  client: Client,
  args: RemoveSuccessorReplacementParams = {},
): Promise<{
  deleted?: boolean;
  model?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/successor/replacements";
  return client.request<{
    deleted?: boolean;
    model?: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RemoveWorkspaceMembersParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    user_ids: string[];
  };
};

/**
 * Removes non-owner members from a workspace. Management API key required.
 */
export async function removeWorkspaceMembers(
  client: Client,
  args: RemoveWorkspaceMembersParams,
): Promise<{
  removed_count: number;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/members/remove`;
  return client.request<{
    removed_count: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ReorderProviderCredentialsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    key_ids: string[];
    provider: string;
    routing_mode: "priority" | "fallback";
  };
};

/**
 * Replaces the priority order for one provider and routing group.
 */
export async function reorderProviderCredentials(
  client: Client,
  args: ReorderProviderCredentialsParams = {},
): Promise<{
  reordered: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/byok/reorder";
  return client.request<{
    reordered: boolean;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ReplaceDynamicRouteKeysParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    key_ids: string[];
  };
};

/**
 * Atomically replaces API-key attachments and refreshes affected gateway contexts.
 */
export async function replaceDynamicRouteKeys(
  client: Client,
  args: ReplaceDynamicRouteKeysParams,
): Promise<{
  data: {
    id: string;
    key_ids: string[];
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/routing/dynamic-routes/${encodeURIComponent(String(path["id"]))}/keys`;
  return client.request<{
    data: {
      id: string;
      key_ids: string[];
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ReplaceGuardrailKeysParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    key_ids: string[];
  };
};

/**
 * Replaces the complete key assignment set. Requires `guardrails:write`.
 */
export async function replaceGuardrailKeys(
  client: Client,
  args: ReplaceGuardrailKeysParams,
): Promise<{
  data: {
    guardrail_id: string;
    key_ids: string[];
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}/keys`;
  return client.request<{
    data: {
      guardrail_id: string;
      key_ids: string[];
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ReportLeakedKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    comment?: string;
    evidence_url?: string;
    reporter_email?: string;
    source?: string;
    token: string;
  };
};

/**
 * Reports a Phaseo key found in public. No authentication. Always answers 202 with the same body, whether or not the key matched, so the route cannot be used to check keys. Rate limited per address.
 */
export async function reportLeakedKey(
  client: Client,
  args: ReportLeakedKeyParams = {},
): Promise<{
  status?: "received";
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/security/report-leaked-key";
  return client.request<{
    status?: "received";
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchParams = {
  path: {
    batch_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves a previously created batch job.
 */
export async function retrieveBatch(
  client: Client,
  args: RetrieveBatchParams,
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    estimation_sample_size?: number | null;
    estimation_total_rows?: number | null;
    estimation_truncated?: boolean | null;
    finalized_at?: string | null;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
  };
  cancel_url?: string | null;
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalized_at?: string | null;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  metadata?: {};
  native_batch_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_file_id?: string;
  polling_url?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  progress?: number;
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  results_url?: string | null;
  session_id?: string;
  status?: string;
  usage?: {
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    requests?: number | null;
    total_tokens?: number | null;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["batch_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batches/${encodeURIComponent(String(path["batch_id"]))}`;
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchAliasParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/{batch_id}.
 */
export async function retrieveBatchAlias(
  client: Client,
  args: RetrieveBatchAliasParams,
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    estimated_nanos?: number | null;
    estimated_provider_cost?: string | null;
    estimated_user_cost?: string | null;
    estimation_sample_size?: number | null;
    estimation_total_rows?: number | null;
    estimation_truncated?: boolean | null;
    finalized_at?: string | null;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
    reservation_id?: string | null;
    reservation_status?: string | null;
    reserved_nanos?: number | null;
    settled_provider_cost?: string | null;
    settled_user_cost?: string | null;
    state?: "pending" | "estimated" | "settled" | "void";
    total_nanos?: number | null;
  };
  cancel_url?: string | null;
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalized_at?: string | null;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  last_webhook_dispatched_at?: string | null;
  last_webhook_progress?: number | null;
  last_webhook_progress_at?: string | null;
  lifecycle_status?:
    "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
  metadata?: {};
  native_batch_id?: string | null;
  next_webhook_retry_at?: string | null;
  object?: string;
  output_file_id?: string;
  polling_url?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  progress?: number;
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  results_url?: string | null;
  session_id?: string;
  status?: string;
  usage?: {
    cost_nanos?: number | null;
    cost_usd?: number | null;
    currency?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    requests?: number | null;
    total_tokens?: number | null;
  };
  webhook?: {
    attempts?: {
      attempt_number?: number;
      delivered_at?: string | null;
      delivery_key?: string;
      error_message?: string | null;
      event_type?: string;
      id?: string;
      max_attempts?: number;
      next_retry_at?: string | null;
      response_body_preview?: string | null;
      response_status?: number | null;
      status?: "delivered" | "scheduled_retry" | "failed_permanently";
      tried_at?: string;
    }[];
    delivery?: {
      delivered_event_types?: string[];
      delivered_events?: number;
      last_attempt_at?: string | null;
      last_attempt_status?:
        "delivered" | "scheduled_retry" | "failed_permanently" | null;
      last_delivered_at?: string | null;
      last_error_message?: string | null;
      last_failure_at?: string | null;
      last_response_status?: number | null;
      next_retry_at?: string | null;
      pending_retries?: number;
      total_attempts?: number;
    };
    events?: string[];
    has_secret?: boolean;
    url?: string | null;
  };
  websocket_url?: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batch/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      estimated_nanos?: number | null;
      estimated_provider_cost?: string | null;
      estimated_user_cost?: string | null;
      estimation_sample_size?: number | null;
      estimation_total_rows?: number | null;
      estimation_truncated?: boolean | null;
      finalized_at?: string | null;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
      reservation_id?: string | null;
      reservation_status?: string | null;
      reserved_nanos?: number | null;
      settled_provider_cost?: string | null;
      settled_user_cost?: string | null;
      state?: "pending" | "estimated" | "settled" | "void";
      total_nanos?: number | null;
    };
    cancel_url?: string | null;
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalized_at?: string | null;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    last_webhook_dispatched_at?: string | null;
    last_webhook_progress?: number | null;
    last_webhook_progress_at?: string | null;
    lifecycle_status?:
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired";
    metadata?: {};
    native_batch_id?: string | null;
    next_webhook_retry_at?: string | null;
    object?: string;
    output_file_id?: string;
    polling_url?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    progress?: number;
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    results_url?: string | null;
    session_id?: string;
    status?: string;
    usage?: {
      cost_nanos?: number | null;
      cost_usd?: number | null;
      currency?: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
      requests?: number | null;
      total_tokens?: number | null;
    };
    webhook?: {
      attempts?: {
        attempt_number?: number;
        delivered_at?: string | null;
        delivery_key?: string;
        error_message?: string | null;
        event_type?: string;
        id?: string;
        max_attempts?: number;
        next_retry_at?: string | null;
        response_body_preview?: string | null;
        response_status?: number | null;
        status?: "delivered" | "scheduled_retry" | "failed_permanently";
        tried_at?: string;
      }[];
      delivery?: {
        delivered_event_types?: string[];
        delivered_events?: number;
        last_attempt_at?: string | null;
        last_attempt_status?:
          "delivered" | "scheduled_retry" | "failed_permanently" | null;
        last_delivered_at?: string | null;
        last_error_message?: string | null;
        last_failure_at?: string | null;
        last_response_status?: number | null;
        next_retry_at?: string | null;
        pending_retries?: number;
        total_attempts?: number;
      };
      events?: string[];
      has_secret?: boolean;
      url?: string | null;
    };
    websocket_url?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchFileParams = {
  path: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves metadata for a batch file owned by the authenticated workspace.
 */
export async function retrieveBatchFile(
  client: Client,
  args: RetrieveBatchFileParams,
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["file_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batches/files/${encodeURIComponent(String(path["file_id"]))}`;
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchFileAliasParams = {
  path: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/files/{file_id}.
 */
export async function retrieveBatchFileAlias(
  client: Client,
  args: RetrieveBatchFileAliasParams,
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["file_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batch/files/${encodeURIComponent(String(path["file_id"]))}`;
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchFileContentParams = {
  path: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves content for a batch file owned by the authenticated workspace.
 */
export async function retrieveBatchFileContent(
  client: Client,
  args: RetrieveBatchFileContentParams,
): Promise<Blob> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["file_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batches/files/${encodeURIComponent(String(path["file_id"]))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchFileContentAliasParams = {
  path: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/files/{file_id}/content.
 */
export async function retrieveBatchFileContentAlias(
  client: Client,
  args: RetrieveBatchFileContentAliasParams,
): Promise<Blob> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["file_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batch/files/${encodeURIComponent(String(path["file_id"]))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchResultsParams = {
  path: {
    batch_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Streams complete provider-native result rows as JSONL for a terminal batch owned by the authenticated workspace. Combines success and error files, converts inline outputs, and follows provider result pagination. Use a Phaseo API key. Downloads do not submit inference or add usage charges. Existing file endpoints remain available. Inline rows are limited to 8 MiB; interrupted downloads must be discarded and downloaded again. Limited to 10 download attempts per workspace per batch in a rolling 30-minute window, shared across API keys and aliases. Failed or cancelled upstream attempts count. A 429 response includes Retry-After in seconds.
 */
export async function retrieveBatchResults(
  client: Client,
  args: RetrieveBatchResultsParams,
): Promise<string> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["batch_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batches/${encodeURIComponent(String(path["batch_id"]))}/results`;
  return client.request<string>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchResultsAliasParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Streams complete provider-native result rows as JSONL for a terminal batch owned by the authenticated workspace. Combines success and error files, converts inline outputs, and follows provider result pagination. Use a Phaseo API key. Downloads do not submit inference or add usage charges. Existing file endpoints remain available. Inline rows are limited to 8 MiB; interrupted downloads must be discarded and downloaded again. Limited to 10 download attempts per workspace per batch in a rolling 30-minute window, shared across API keys and aliases. Failed or cancelled upstream attempts count. A 429 response includes Retry-After in seconds.
 */
export async function retrieveBatchResultsAlias(
  client: Client,
  args: RetrieveBatchResultsAliasParams,
): Promise<string> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/batch/${encodeURIComponent(String(path["id"]))}/results`;
  return client.request<string>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveFileParams = {
  path: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves metadata for a file that belongs to the authenticated workspace.
 */
export async function retrieveFile(
  client: Client,
  args: RetrieveFileParams,
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["file_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/files/${encodeURIComponent(String(path["file_id"]))}`;
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveFileContentParams = {
  path: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves binary content for a previously uploaded file that belongs to the authenticated workspace.
 */
export async function retrieveFileContent(
  client: Client,
  args: RetrieveFileContentParams,
): Promise<Blob> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["file_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/files/${encodeURIComponent(String(path["file_id"]))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RevokeAuthorizedAppParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Revokes an app's access so its tokens stop working. Revoking the calling app's own authorization signs it out. OAuth token with oauth_clients:delete required.
 */
export async function revokeAuthorizedApp(
  client: Client,
  args: RevokeAuthorizedAppParams,
): Promise<{
  id?: string;
  revoked?: boolean;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/me/authorized-apps/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    id?: string;
    revoked?: boolean;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RevokeWorkspaceScimTokenParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Revokes a provisioning token. Requires `settings:write`.
 */
export async function revokeWorkspaceScimToken(
  client: Client,
  args: RevokeWorkspaceScimTokenParams,
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/scim/tokens/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RotateApiKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name?: string;
    previous_key_expires_at?: string | null;
  };
};

/**
 * Creates a replacement with the same limits and optionally sets the previous key expiry. The replacement secret is returned once. Requires `keys:write`.
 */
export async function rotateApiKey(
  client: Client,
  args: RotateApiKeyParams,
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    key: string;
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    storage_locations?: string[];
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  };
  previous_key_expires_at: string | null;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/keys/${encodeURIComponent(String(path["id"]))}/rotate`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      creator_user_id: string | null;
      department_id?: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      include_byok_in_limit: boolean;
      ip_allowlist?: {
        address: string;
        label: string;
      }[];
      key: string;
      label: string | null;
      last_used_at: string | null;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: "daily" | "weekly" | "monthly" | null;
      limits: {
        daily: {
          cost: number | null;
          requests: number | null;
        };
        monthly: {
          cost: number | null;
          requests: number | null;
        };
        weekly: {
          cost: number | null;
          requests: number | null;
        };
      };
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      storage_locations?: string[];
      updated_at: string | null;
      usage: number;
      usage_daily: number;
      usage_details: {
        daily: {
          cost: number;
          requests: number;
        };
        monthly: {
          cost: number;
          requests: number;
        };
        total: {
          cost: number;
          requests: number;
        };
        weekly: {
          cost: number;
          requests: number;
        };
      };
      usage_monthly: number;
      usage_weekly: number;
      workspace_id: string;
    };
    previous_key_expires_at: string | null;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RotateWebhookEndpointSecretParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Replaces the signing secret and returns the new value once.
 */
export async function rotateWebhookEndpointSecret(
  client: Client,
  args: RotateWebhookEndpointSecretParams,
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events: string[];
  hasSecret: boolean;
  id: string;
  name: string;
  signing_secret: string;
  status: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url: string;
  workspaceId: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path["id"]))}/rotate-secret`;
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events: string[];
    hasSecret: boolean;
    id: string;
    name: string;
    signing_secret: string;
    status: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url: string;
    workspaceId: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RotateWorkspaceNotificationDestinationSecretParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Generates a new signing secret for a custom webhook destination and returns it once. Destinations created before signing get their first secret this way. Later deliveries are signed with the new secret and the previous secret stops being used.
 */
export async function rotateWorkspaceNotificationDestinationSecret(
  client: Client,
  args: RotateWorkspaceNotificationDestinationSecretParams,
): Promise<{
  data: {
    created_at?: string | null;
    has_signing_secret?: boolean;
    id: string;
    name: string;
    signing_secret?: string;
    signing_secret_rotated_at?: string | null;
    status: "active" | "disabled";
    target_preview: string;
    type:
      | "email"
      | "discord"
      | "discord_webhook"
      | "slack"
      | "microsoft_teams"
      | "custom_webhook";
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/notifications/destinations/${encodeURIComponent(String(path["id"]))}/rotate-secret`;
  return client.request<{
    data: {
      created_at?: string | null;
      has_signing_secret?: boolean;
      id: string;
      name: string;
      signing_secret?: string;
      signing_secret_rotated_at?: string | null;
      status: "active" | "disabled";
      target_preview: string;
      type:
        | "email"
        | "discord"
        | "discord_webhook"
        | "slack"
        | "microsoft_teams"
        | "custom_webhook";
      updated_at?: string | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type SaveSuccessorReplacementParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    model: string;
    successor: string | null;
  };
};

/**
 * Sets the model that requests for model are sent to, replacing any earlier choice. A null successor means requests for model are never redirected. Both models must be in the catalogue and the successor must be served. At most 500 per workspace. Owners and admins; settings:write required.
 */
export async function saveSuccessorReplacement(
  client: Client,
  args: SaveSuccessorReplacementParams = {},
): Promise<{
  data: {
    model?: string;
    successor?: string | null;
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/successor/replacements";
  return client.request<{
    data: {
      model?: string;
      successor?: string | null;
      updated_at?: string | null;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type SendObservabilityDestinationSampleParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Sends a sample trace to a saved destination, with its messages unless the destination leaves prompts and outputs out. Owners and admins; settings:write required.
 */
export async function sendObservabilityDestinationSample(
  client: Client,
  args: SendObservabilityDestinationSampleParams,
): Promise<{
  data: {
    error?: string | null;
    http_status?: number | null;
    ok?: boolean;
    status?: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/observability/destinations/${encodeURIComponent(String(path["id"]))}/sample`;
  return client.request<{
    data: {
      error?: string | null;
      http_status?: number | null;
      ok?: boolean;
      status?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type SetPresetLabelParams = {
  path: {
    id: string;
    label: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    version?: string;
    version_id?: string;
  };
};

/**
 * Points a label at a published version, creating the label or moving it. Requests that pin the label, such as @support-triage@production, use the new version within about 2 minutes. Moving a label back to an earlier version is a rollback.
 */
export async function setPresetLabel(
  client: Client,
  args: SetPresetLabelParams,
): Promise<{
  data: {
    created_at?: string | null;
    label: string;
    updated_at?: string | null;
    updated_by?: string | null;
    version_id: string;
    version_label: string | null;
    version_number: number | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["label"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}/labels/${encodeURIComponent(String(path["label"]))}`;
  return client.request<{
    data: {
      created_at?: string | null;
      label: string;
      updated_at?: string | null;
      updated_by?: string | null;
      version_id: string;
      version_label: string | null;
      version_number: number | null;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type SetWorkspaceDepartmentMemberParams = {
  path: {
    departmentId: string;
    userId: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    position?: "member" | "lead";
    primary?: boolean;
  };
};

/**
 * Adds or updates a manual department membership for a workspace user.
 */
export async function setWorkspaceDepartmentMember(
  client: Client,
  args: SetWorkspaceDepartmentMemberParams,
): Promise<{
  data: {
    department_id: string;
    is_primary: boolean;
    position: "member" | "lead";
    user_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["departmentId"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["userId"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/departments/${encodeURIComponent(String(path["departmentId"]))}/members/${encodeURIComponent(String(path["userId"]))}`;
  return client.request<{
    data: {
      department_id: string;
      is_primary: boolean;
      position: "member" | "lead";
      user_id: string;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type SummarizeGatewayFeedbackParams = {
  path?: Record<string, never>;
  query?: {
    group_by?: "preset" | "preset_id" | "test_run" | "test_run_id" | "metadata";
    metadata_key?: string;
    preset_id?: string;
    since?: string;
    test_run_id?: string;
    until?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Aggregates workspace feedback by preset, test run, or metadata dimension.
 */
export async function summarizeGatewayFeedback(
  client: Client,
  args: SummarizeGatewayFeedbackParams = {},
): Promise<{
  data: {
    average_score: number | null;
    count: number;
    last_feedback_at: string | null;
    metadata_key?: string;
    metadata_value?: string | null;
    negative: number;
    partial: number;
    positive: number;
    preset_id?: string | null;
    ratings: {
      [key: string]: number;
    };
    test_run_id?: string | null;
  }[];
  group_by: "preset_id" | "test_run_id" | "metadata";
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/feedback/summary";
  return client.request<{
    data: {
      average_score: number | null;
      count: number;
      last_feedback_at: string | null;
      metadata_key?: string;
      metadata_value?: string | null;
      negative: number;
      partial: number;
      positive: number;
      preset_id?: string | null;
      ratings: {
        [key: string]: number;
      };
      test_run_id?: string | null;
    }[];
    group_by: "preset_id" | "test_run_id" | "metadata";
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestClassifierParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    classifier?: {
      dimensions?: {
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
      instructions?: string;
      model?: string;
    };
    classifier_id?: string;
    sample: {
      prompt: string;
      response?: string;
    };
  };
};

/**
 * Runs a draft or saved classifier once on a sample prompt and response, with the same request the gateway sends for it. The request is a real, billed model request made with your own credential and labelled phaseo.classifier_test. Owners and admins; the credential needs classifiers:write and gateway:access. Management keys cannot make model requests and are refused.
 */
export async function testClassifier(
  client: Client,
  args: TestClassifierParams = {},
): Promise<{
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
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/classifiers/test";
  return client.request<{
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
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestObservabilityDestinationParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Sends a sample trace without its messages to a saved destination, as the dashboard's status check does. The destination's health is not changed. Owners and admins; settings:write required.
 */
export async function testObservabilityDestination(
  client: Client,
  args: TestObservabilityDestinationParams,
): Promise<{
  data: {
    error?: string | null;
    http_status?: number | null;
    ok?: boolean;
    status?: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/observability/destinations/${encodeURIComponent(String(path["id"]))}/test`;
  return client.request<{
    data: {
      error?: string | null;
      http_status?: number | null;
      ok?: boolean;
      status?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestObservabilityDestinationConfigParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config: {
      [key: string]: string;
    };
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
  };
};

/**
 * Sends a sample trace without its messages to the settings given, the way the gateway delivers traces. Nothing is saved. Owners and admins; settings:write required.
 */
export async function testObservabilityDestinationConfig(
  client: Client,
  args: TestObservabilityDestinationConfigParams = {},
): Promise<{
  data: {
    error?: string | null;
    http_status?: number | null;
    ok?: boolean;
    status?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/observability/destinations/test";
  return client.request<{
    data: {
      error?: string | null;
      http_status?: number | null;
      ok?: boolean;
      status?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestSpendRuleParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Renders the rule's alert from its current value, marked TEST, and sends it now to the rule's destinations, or to the Spend Alerts route when the rule has none. Nothing is recorded. A workspace can send 5 tests a minute.
 */
export async function testSpendRule(
  client: Client,
  args: TestSpendRuleParams,
): Promise<{
  data: {
    delivered: number;
    deliveries: {
      delivered: boolean;
      destination_id: string;
      error: string | null;
      name: string;
      status: number | null;
      type: string;
    }[];
    failed: number;
    message: string;
    rule_id: string;
    rule_name: string;
    source: "rule" | "routes";
    test: boolean;
    title: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-rules/${encodeURIComponent(String(path["id"]))}/test`;
  return client.request<{
    data: {
      delivered: number;
      deliveries: {
        delivered: boolean;
        destination_id: string;
        error: string | null;
        name: string;
        status: number | null;
        type: string;
      }[];
      failed: number;
      message: string;
      rule_id: string;
      rule_name: string;
      source: "rule" | "routes";
      test: boolean;
      title: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestWebhookEndpointParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Sends one signed `webhook.test` event without retries or delivery-history persistence.
 */
export async function testWebhookEndpoint(
  client: Client,
  args: TestWebhookEndpointParams,
): Promise<{
  error: string | null;
  event_id: string;
  ok: boolean;
  response_body_preview: string | null;
  status_code: number | null;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path["id"]))}/test`;
  return client.request<{
    error: string | null;
    event_id: string;
    ok: boolean;
    response_body_preview: string | null;
    status_code: number | null;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestWorkspaceNotificationDestinationParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Delivers a test through an existing encrypted workspace destination.
 */
export async function testWorkspaceNotificationDestination(
  client: Client,
  args: TestWorkspaceNotificationDestinationParams,
): Promise<{
  data: {
    delivered: true;
    status: number | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/notifications/destinations/${encodeURIComponent(String(path["id"]))}/test`;
  return client.request<{
    data: {
      delivered: true;
      status: number | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type TestWorkspaceNotificationDestinationConfigParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    target: string;
    type:
      | "email"
      | "discord"
      | "discord_webhook"
      | "slack"
      | "microsoft_teams"
      | "custom_webhook";
  };
};

/**
 * Validates and delivers a test to an unsaved destination configuration. The target is not persisted.
 */
export async function testWorkspaceNotificationDestinationConfig(
  client: Client,
  args: TestWorkspaceNotificationDestinationConfigParams = {},
): Promise<{
  data: {
    delivered: true;
    status: number | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/notifications/destinations/test";
  return client.request<{
    data: {
      delivered: true;
      status: number | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateApiKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    department_id?: string | null;
    disabled?: boolean;
    expires_at?: string | null;
    include_byok_in_limit?: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    limit?: number | null;
    limit_reset?: "daily" | "weekly" | "monthly";
    limits?: {
      daily?: {
        cost?: number | null;
        requests?: number | null;
      };
      monthly?: {
        cost?: number | null;
        requests?: number | null;
      };
      weekly?: {
        cost?: number | null;
        requests?: number | null;
      };
    };
    name?: string;
    scopes?: string | string[];
    soft_blocked?: boolean;
    storage_locations?: string[] | null;
  };
};

/**
 * Updates API key metadata or status. Management API key required.
 */
export async function updateApiKey(
  client: Client,
  args: UpdateApiKeyParams,
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    ip_allowlist?: {
      address: string;
      label: string;
    }[];
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    storage_locations?: string[];
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/keys/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      creator_user_id: string | null;
      department_id?: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      include_byok_in_limit: boolean;
      ip_allowlist?: {
        address: string;
        label: string;
      }[];
      label: string | null;
      last_used_at: string | null;
      limit: number | null;
      limit_remaining: number | null;
      limit_reset: "daily" | "weekly" | "monthly" | null;
      limits: {
        daily: {
          cost: number | null;
          requests: number | null;
        };
        monthly: {
          cost: number | null;
          requests: number | null;
        };
        weekly: {
          cost: number | null;
          requests: number | null;
        };
      };
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      storage_locations?: string[];
      updated_at: string | null;
      usage: number;
      usage_daily: number;
      usage_details: {
        daily: {
          cost: number;
          requests: number;
        };
        monthly: {
          cost: number;
          requests: number;
        };
        total: {
          cost: number;
          requests: number;
        };
        weekly: {
          cost: number;
          requests: number;
        };
      };
      usage_monthly: number;
      usage_weekly: number;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateAutoRoutingSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allow_fallbacks?: boolean;
    allowed_patterns?: string[];
    max_input_price_per_million?: number | null;
    max_output_price_per_million?: number | null;
    objective?: "balanced" | "quality" | "cost" | "latency";
    spend_profile?:
      "economy" | "standard" | "premium" | "unrestricted" | "custom";
  };
};

/**
 * Changes the fields sent; the result is validated as a whole, as the dashboard saves it. A custom spend_profile needs both price limits. Owners and admins; settings:write required.
 */
export async function updateAutoRoutingSettings(
  client: Client,
  args: UpdateAutoRoutingSettingsParams = {},
): Promise<{
  data: {
    allow_fallbacks?: boolean;
    allowed_patterns?: string[];
    max_input_price_per_million?: number | null;
    max_output_price_per_million?: number | null;
    objective?: "balanced" | "quality" | "cost" | "latency";
    revision?: string | null;
    spend_profile?:
      "economy" | "standard" | "premium" | "unrestricted" | "custom";
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/routing/auto";
  return client.request<{
    data: {
      allow_fallbacks?: boolean;
      allowed_patterns?: string[];
      max_input_price_per_million?: number | null;
      max_output_price_per_million?: number | null;
      objective?: "balanced" | "quality" | "cost" | "latency";
      revision?: string | null;
      spend_profile?:
        "economy" | "standard" | "premium" | "unrestricted" | "custom";
      updated_at?: string | null;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateClassifierParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    description?: string | null;
    dimensions?: {
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
    model?: string;
    monthly_budget_usd?: number | null;
    name?: string;
    sample_by?: "request" | "session";
    sample_rate?: number;
    scope?: {
      app_ids?: string[];
      key_ids?: string[];
      models?: string[];
    };
  };
};

/**
 * Updates the fields you send. Changes reach the gateway within about a minute. Labels already written to past requests are not changed.
 */
export async function updateClassifier(
  client: Client,
  args: UpdateClassifierParams,
): Promise<{
  data: {
    created_at: string;
    created_by: string | null;
    description: string | null;
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
    enabled: boolean;
    id: string;
    input_scope: "prompt" | "prompt_and_response";
    instructions: string;
    model: string;
    monthly_budget_usd: number | null;
    name: string;
    sample_by: "request" | "session";
    sample_rate: number;
    scope: {
      app_ids?: string[];
      key_ids?: string[];
      models?: string[];
    };
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/classifiers/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by: string | null;
      description: string | null;
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
      enabled: boolean;
      id: string;
      input_scope: "prompt" | "prompt_and_response";
      instructions: string;
      model: string;
      monthly_budget_usd: number | null;
      name: string;
      sample_by: "request" | "session";
      sample_rate: number;
      scope: {
        app_ids?: string[];
        key_ids?: string[];
        models?: string[];
      };
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateDataContributionClassifierParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    categories?: {
      [key: string]: string[];
    };
    description?: string | null;
    enabled?: boolean;
    instructions?: string;
    model?: string;
    name?: string;
    sampleRateBps?: number;
    serviceTier?: "standard" | "flex";
  };
};

/**
 * Updates a custom workspace classifier. Requires `settings:write` and feature access.
 */
export async function updateDataContributionClassifier(
  client: Client,
  args: UpdateDataContributionClassifierParams,
): Promise<{
  data: {
    categories: {
      [key: string]: string[];
    };
    created_at?: string | null;
    description?: string | null;
    enabled: boolean;
    id: string;
    instructions: string;
    kind: "starter" | "custom";
    model: string;
    name: string;
    sample_rate_bps: number;
    service_tier: "standard" | "flex";
    slug: string;
    updated_at?: string | null;
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/data-contribution/classifiers/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      categories: {
        [key: string]: string[];
      };
      created_at?: string | null;
      description?: string | null;
      enabled: boolean;
      id: string;
      instructions: string;
      kind: "starter" | "custom";
      model: string;
      name: string;
      sample_rate_bps: number;
      service_tier: "standard" | "flex";
      slug: string;
      updated_at?: string | null;
      [key: string]: unknown;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateDataContributionConsentParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    enabled: boolean;
    reason?: string;
  };
};

/**
 * Enables or disables workspace data contribution and refreshes gateway policy state. Requires `settings:write` and feature access.
 */
export async function updateDataContributionConsent(
  client: Client,
  args: UpdateDataContributionConsentParams = {},
): Promise<{
  data: {
    classifierSampleRateBps: number;
    discountBps: number;
    enabled: boolean;
    policyVersion: string;
    sampleRateBps: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/data-contribution/consent";
  return client.request<{
    data: {
      classifierSampleRateBps: number;
      discountBps: number;
      enabled: boolean;
      policyVersion: string;
      sampleRateBps: number;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateDepartmentBudgetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    interval?: "daily" | "weekly" | "monthly";
    limit?: number;
  };
};

/**
 * Changes the period or USD amount of a department budget.
 */
export async function updateDepartmentBudget(
  client: Client,
  args: UpdateDepartmentBudgetParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    department_id: string;
    department_name: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/department-budgets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      department_id: string;
      department_name: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateDynamicRouteParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config?: {
      cacheAwareRouting?: boolean;
      defaultAction?: {
        allowFallbacks?: boolean;
        model?: string;
        modelFallbacks?: string[];
        providerIgnore?: string[];
        providerOnly?: string[];
        providerOrder?: string[];
        routingMode?: "balanced" | "price" | "latency" | "throughput";
      };
      edges?: {
        id: string;
        source: string;
        sourceHandle?: string | null;
        target: string;
      }[];
      entryNodeId?: string | null;
      nodes?: {
        data: {
          [key: string]: unknown;
        };
        id: string;
        position?: {
          x: number;
          y: number;
        } | null;
        type:
          | "start"
          | "condition"
          | "percentage"
          | "model"
          | "rate_limit"
          | "budget_limit"
          | "end";
      }[];
      rules?: {
        action: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        condition: {
          field: "always" | "endpoint" | "model" | "session_id" | "metadata";
          metadataKey?: string | null;
          operator:
            "equals" | "not_equals" | "contains" | "starts_with" | "exists";
          value?: string | null;
        };
        enabled: boolean;
        id: string;
        name: string;
      }[];
      schemaVersion?: 2;
      sessionAffinity?: boolean;
    };
    description?: string | null;
    name?: string;
    status?: "active" | "paused";
  };
};

/**
 * Updates route metadata and creates a new immutable version when configuration changes.
 */
export async function updateDynamicRoute(
  client: Client,
  args: UpdateDynamicRouteParams,
): Promise<{
  data: {
    config: {
      cacheAwareRouting?: boolean;
      defaultAction?: {
        allowFallbacks?: boolean;
        model?: string;
        modelFallbacks?: string[];
        providerIgnore?: string[];
        providerOnly?: string[];
        providerOrder?: string[];
        routingMode?: "balanced" | "price" | "latency" | "throughput";
      };
      edges?: {
        id: string;
        source: string;
        sourceHandle?: string | null;
        target: string;
      }[];
      entryNodeId?: string | null;
      nodes?: {
        data: {
          [key: string]: unknown;
        };
        id: string;
        position?: {
          x: number;
          y: number;
        } | null;
        type:
          | "start"
          | "condition"
          | "percentage"
          | "model"
          | "rate_limit"
          | "budget_limit"
          | "end";
      }[];
      rules?: {
        action: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        condition: {
          field: "always" | "endpoint" | "model" | "session_id" | "metadata";
          metadataKey?: string | null;
          operator:
            "equals" | "not_equals" | "contains" | "starts_with" | "exists";
          value?: string | null;
        };
        enabled: boolean;
        id: string;
        name: string;
      }[];
      schemaVersion?: 2;
      sessionAffinity?: boolean;
    };
    created_at?: string | null;
    deployed_version?: number | null;
    description?: string | null;
    id: string;
    key_ids: string[];
    name: string;
    slug: string;
    status: "active" | "paused";
    updated_at?: string | null;
    version: number;
    versions: {
      created_at?: string | null;
      created_by?: string | null;
      status: "draft" | "deployed" | "superseded";
      version: number;
    }[];
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/routing/dynamic-routes/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      config: {
        cacheAwareRouting?: boolean;
        defaultAction?: {
          allowFallbacks?: boolean;
          model?: string;
          modelFallbacks?: string[];
          providerIgnore?: string[];
          providerOnly?: string[];
          providerOrder?: string[];
          routingMode?: "balanced" | "price" | "latency" | "throughput";
        };
        edges?: {
          id: string;
          source: string;
          sourceHandle?: string | null;
          target: string;
        }[];
        entryNodeId?: string | null;
        nodes?: {
          data: {
            [key: string]: unknown;
          };
          id: string;
          position?: {
            x: number;
            y: number;
          } | null;
          type:
            | "start"
            | "condition"
            | "percentage"
            | "model"
            | "rate_limit"
            | "budget_limit"
            | "end";
        }[];
        rules?: {
          action: {
            allowFallbacks?: boolean;
            model?: string;
            modelFallbacks?: string[];
            providerIgnore?: string[];
            providerOnly?: string[];
            providerOrder?: string[];
            routingMode?: "balanced" | "price" | "latency" | "throughput";
          };
          condition: {
            field: "always" | "endpoint" | "model" | "session_id" | "metadata";
            metadataKey?: string | null;
            operator:
              "equals" | "not_equals" | "contains" | "starts_with" | "exists";
            value?: string | null;
          };
          enabled: boolean;
          id: string;
          name: string;
        }[];
        schemaVersion?: 2;
        sessionAffinity?: boolean;
      };
      created_at?: string | null;
      deployed_version?: number | null;
      description?: string | null;
      id: string;
      key_ids: string[];
      name: string;
      slug: string;
      status: "active" | "paused";
      updated_at?: string | null;
      version: number;
      versions: {
        created_at?: string | null;
        created_by?: string | null;
        status: "draft" | "deployed" | "superseded";
        version: number;
      }[];
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateGuardrailParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allowedApiModelIds?: string[];
    budgets?: {
      dailyCostNanos?: number | null;
      dailyRequests?: number | null;
      monthlyCostNanos?: number | null;
      monthlyRequests?: number | null;
      weeklyCostNanos?: number | null;
      weeklyRequests?: number | null;
    };
    description?: string | null;
    enabled?: boolean;
    modelRestrictionMode?: "none" | "allowlist" | "blocklist";
    name?: string;
    privacyEnableFreeMayPublishPrompts?: boolean | null;
    privacyEnableFreeMayTrain?: boolean | null;
    privacyEnableInputOutputLogging?: boolean | null;
    privacyEnablePaidMayTrain?: boolean | null;
    privacyZdrOnly?: boolean | null;
    promptInjectionAction?: "flag" | "block";
    promptInjectionEnabled?: boolean;
    providerRestrictionEnforceAllowed?: boolean;
    providerRestrictionMode?: "none" | "allowlist" | "blocklist";
    providerRestrictionProviderIds?: string[];
    sensitiveInfoDefaultAction?: "flag" | "redact" | "block";
    sensitiveInfoEnabled?: boolean;
    sensitiveInfoRules?: {
      [key: string]: unknown;
    }[];
  };
};

/**
 * Updates guardrail policy fields. Requires `guardrails:write`.
 */
export async function updateGuardrail(
  client: Client,
  args: UpdateGuardrailParams,
): Promise<{
  data: {
    allowed_api_model_ids?: string[] | null;
    created_at?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    description?: string | null;
    enabled?: boolean | null;
    id: string;
    model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    prompt_injection_action?: "flag" | "block" | null;
    prompt_injection_enabled?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    sensitive_info_default_action?: "flag" | "redact" | "block" | null;
    sensitive_info_enabled?: boolean | null;
    sensitive_info_rules?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/guardrails/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      allowed_api_model_ids?: string[] | null;
      created_at?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      description?: string | null;
      enabled?: boolean | null;
      id: string;
      model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      privacy_enable_free_may_publish_prompts?: boolean | null;
      privacy_enable_free_may_train?: boolean | null;
      privacy_enable_input_output_logging?: boolean | null;
      privacy_enable_paid_may_train?: boolean | null;
      privacy_zdr_only?: boolean | null;
      prompt_injection_action?: "flag" | "block" | null;
      prompt_injection_enabled?: boolean | null;
      provider_restriction_enforce_allowed?: boolean | null;
      provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      provider_restriction_provider_ids?: string[] | null;
      sensitive_info_default_action?: "flag" | "redact" | "block" | null;
      sensitive_info_enabled?: boolean | null;
      sensitive_info_rules?:
        | {
            [key: string]: unknown;
          }[]
        | null;
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateManagementKeyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    dailyCostNanos?: number | null;
    dailyRequests?: number | null;
    expires_at?: string | null;
    monthlyCostNanos?: number | null;
    monthlyRequests?: number | null;
    name?: string;
    paused?: boolean;
    scopes?: string | string[];
    softBlocked?: boolean;
    template?: "read-only" | "read-write" | "full-control";
    weeklyCostNanos?: number | null;
    weeklyRequests?: number | null;
  };
};

/**
 * Updates scopes, limits, expiry, name, or paused state. Requires `management_keys:write`.
 */
export async function updateManagementKey(
  client: Client,
  args: UpdateManagementKeyParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    daily_limit_cost_nanos?: number | null;
    daily_limit_requests?: number | null;
    expires_at?: string | null;
    id: string;
    last_used_at?: string | null;
    monthly_limit_cost_nanos?: number | null;
    monthly_limit_requests?: number | null;
    name: string;
    prefix: string;
    scopes: string[];
    soft_blocked?: boolean | null;
    status: "active" | "paused";
    updated_at?: string | null;
    weekly_limit_cost_nanos?: number | null;
    weekly_limit_requests?: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/management-keys/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      daily_limit_cost_nanos?: number | null;
      daily_limit_requests?: number | null;
      expires_at?: string | null;
      id: string;
      last_used_at?: string | null;
      monthly_limit_cost_nanos?: number | null;
      monthly_limit_requests?: number | null;
      name: string;
      prefix: string;
      scopes: string[];
      soft_blocked?: boolean | null;
      status: "active" | "paused";
      updated_at?: string | null;
      weekly_limit_cost_nanos?: number | null;
      weekly_limit_requests?: number | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateMyProfileParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    default_workspace_id?: string | null;
    display_name?: string;
    obfuscate_info?: boolean;
  };
};

/**
 * Changes your display name, default workspace (one you belong to) or whether your details are hidden on screen. Password, MFA and passkeys are managed in the browser only. OAuth token with settings:write required.
 */
export async function updateMyProfile(
  client: Client,
  args: UpdateMyProfileParams = {},
): Promise<{
  data: {
    default_workspace_id?: string | null;
    display_name?: string | null;
    obfuscate_info?: boolean;
    user_id?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/me/profile";
  return client.request<{
    data: {
      default_workspace_id?: string | null;
      display_name?: string | null;
      obfuscate_info?: boolean;
      user_id?: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateOAuthClientParams = {
  path: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allowed_scopes?: string[];
    description?: string;
    homepage_url?: string;
    logo_url?: string;
    name?: string;
    privacy_policy_url?: string;
    redirect_uris?: string[];
    terms_of_service_url?: string;
  };
};

/**
 * Updates OAuth application metadata, scopes, or redirect URIs. Requires `oauth_clients:write`.
 */
export async function updateOAuthClient(
  client: Client,
  args: UpdateOAuthClientParams,
): Promise<{
  active_authorizations?: number;
  allowed_scopes?: string[];
  client_id: string;
  client_type: "public" | "confidential";
  created_at?: string | null;
  description?: string | null;
  homepage_url?: string | null;
  last_used_at?: string | null;
  logo_url?: string | null;
  name: string;
  privacy_policy_url?: string | null;
  redirect_uris: string[];
  requests_last_30d?: number;
  status: string;
  terms_of_service_url?: string | null;
  total_authorizations?: number;
  updated_at?: string | null;
  workspace_id: string;
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["client_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path["client_id"]))}`;
  return client.request<{
    active_authorizations?: number;
    allowed_scopes?: string[];
    client_id: string;
    client_type: "public" | "confidential";
    created_at?: string | null;
    description?: string | null;
    homepage_url?: string | null;
    last_used_at?: string | null;
    logo_url?: string | null;
    name: string;
    privacy_policy_url?: string | null;
    redirect_uris: string[];
    requests_last_30d?: number;
    status: string;
    terms_of_service_url?: string | null;
    total_authorizations?: number;
    updated_at?: string | null;
    workspace_id: string;
    [key: string]: unknown;
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateObservabilityDestinationParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config?: {
      [key: string]: string;
    };
    enabled?: boolean;
    group_join?: "and" | "or";
    include_cost_metadata?: boolean;
    include_generation_metadata?: boolean;
    include_identity_metadata?: boolean;
    include_request_context?: boolean;
    key_filters?: {
      key_id: string;
      mode: "include" | "exclude";
    }[];
    name?: string;
    privacy_mode?: boolean;
    rule_groups?: {
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
    sampling_rate?: number;
  };
};

/**
 * Updates destination policy, filters, or write-only configuration.
 */
export async function updateObservabilityDestination(
  client: Client,
  args: UpdateObservabilityDestinationParams,
): Promise<{
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
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/observability/destinations/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
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
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateObservabilityLoggingPolicyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    enabled?: boolean;
    include_provider_payloads?: boolean;
    retention_days?: number;
  };
};

/**
 * Updates log storage, retention, and provider-payload capture settings.
 */
export async function updateObservabilityLoggingPolicy(
  client: Client,
  args: UpdateObservabilityLoggingPolicyParams = {},
): Promise<{
  data: {
    billing_status: "active" | "grace" | "suspended";
    enabled: boolean;
    grace_until?: string | null;
    include_provider_payloads: boolean;
    price_per_million_units_nanos: number;
    retention_days: number;
    updated_at?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/observability/logging-policy";
  return client.request<{
    data: {
      billing_status: "active" | "grace" | "suspended";
      enabled: boolean;
      grace_until?: string | null;
      include_provider_payloads: boolean;
      price_per_million_units_nanos: number;
      retention_days: number;
      updated_at?: string | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdatePresetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    config?: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    description?: string | null;
    name?: string;
    replace_config?: boolean;
    slug?: string;
    versioning_method?: "sequential" | "semver" | "date";
    visibility?: "private" | "team" | "public";
  };
};

/**
 * Updates draft metadata or configuration without changing the active published version.
 */
export async function updatePreset(
  client: Client,
  args: UpdatePresetParams,
): Promise<{
  data: {
    active_version_id?: string | null;
    config: {
      prompt?: {
        messages: {
          content:
            | string
            | {
                name?: string;
                text?: string;
                type: "text" | "variable";
              }[];
          role: "system" | "developer" | "user" | "assistant";
        }[];
        response_format?: {
          [key: string]: unknown;
        };
        syntax?: "mustache-v1";
        tool_choice?: unknown;
        tools?: {
          [key: string]: unknown;
        }[];
        variables?: {
          [key: string]: {
            default?: unknown;
            description?: string;
            enum?: string[];
            max_length?: number;
            required?: boolean;
            type:
              | "string"
              | "number"
              | "boolean"
              | "enum"
              | "array"
              | "object"
              | "any"
              | "image";
          };
        };
      };
      [key: string]: unknown;
    };
    created_at?: string | null;
    created_by?: string | null;
    description?: string | null;
    id: string;
    name: string;
    slug: string;
    source_preset_id?: string | null;
    source_preset_version_id?: string | null;
    updated_at?: string | null;
    upstream_version_id?: string | null;
    versioning_method: "sequential" | "semver" | "date";
    visibility: "private" | "team" | "public";
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/presets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      active_version_id?: string | null;
      config: {
        prompt?: {
          messages: {
            content:
              | string
              | {
                  name?: string;
                  text?: string;
                  type: "text" | "variable";
                }[];
            role: "system" | "developer" | "user" | "assistant";
          }[];
          response_format?: {
            [key: string]: unknown;
          };
          syntax?: "mustache-v1";
          tool_choice?: unknown;
          tools?: {
            [key: string]: unknown;
          }[];
          variables?: {
            [key: string]: {
              default?: unknown;
              description?: string;
              enum?: string[];
              max_length?: number;
              required?: boolean;
              type:
                | "string"
                | "number"
                | "boolean"
                | "enum"
                | "array"
                | "object"
                | "any"
                | "image";
            };
          };
        };
        [key: string]: unknown;
      };
      created_at?: string | null;
      created_by?: string | null;
      description?: string | null;
      id: string;
      name: string;
      slug: string;
      source_preset_id?: string | null;
      source_preset_version_id?: string | null;
      updated_at?: string | null;
      upstream_version_id?: string | null;
      versioning_method: "sequential" | "semver" | "date";
      visibility: "private" | "team" | "public";
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdatePresetPublisherParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    handle: string;
  };
};

/**
 * Renames the workspace publisher handle while retaining its prior handle as an alias.
 */
export async function updatePresetPublisher(
  client: Client,
  args: UpdatePresetPublisherParams = {},
): Promise<{
  data: {
    handle: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/presets/publisher";
  return client.request<{
    data: {
      handle: string | null;
      workspace_id: string;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdatePresetTestRunParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    completed_at?: string | null;
    description?: string | null;
    name?: string | null;
    started_at?: string | null;
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    summary?: {
      [key: string]: unknown;
    };
  };
};

/**
 * Updates test-run lifecycle state, summary, timestamps, name, or description. Requires `feedback:write` and an owner or admin identity.
 */
export async function updatePresetTestRun(
  client: Client,
  args: UpdatePresetTestRunParams,
): Promise<{
  data: {
    baseline_preset_id: string | null;
    completed_at: string | null;
    config: {
      [key: string]: unknown;
    };
    created_at: string;
    created_by_user_id: string | null;
    dataset_name: string | null;
    description: string | null;
    id: string;
    name: string | null;
    preset_id: string | null;
    started_at: string | null;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    summary: {
      [key: string]: unknown;
    };
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/preset-test-runs/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      baseline_preset_id: string | null;
      completed_at: string | null;
      config: {
        [key: string]: unknown;
      };
      created_at: string;
      created_by_user_id: string | null;
      dataset_name: string | null;
      description: string | null;
      id: string;
      name: string | null;
      preset_id: string | null;
      started_at: string | null;
      status: "pending" | "running" | "completed" | "failed" | "cancelled";
      summary: {
        [key: string]: unknown;
      };
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdatePrivateModelParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    base_url?: string;
    context_length?: number | null;
    credential?: string;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string | null;
    enabled?: boolean;
    host_provider_id?: string | null;
    max_output_tokens?: number | null;
    model_reference?: string;
    name?: string;
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses?: boolean;
    upstream_model_id?: string;
  };
};

/**
 * Updates private model metadata or replaces its write-only encrypted credential.
 */
export async function updatePrivateModel(
  client: Client,
  args: UpdatePrivateModelParams,
): Promise<{
  data: {
    base_url: string;
    catalog_model_id?: string | null;
    context_length?: number | null;
    created_at?: string | null;
    created_by?: string | null;
    credential_prefix?: string | null;
    credential_suffix?: string | null;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string | null;
    enabled: boolean;
    host_provider_id?: string | null;
    id: string;
    input_modalities?: string[];
    local_slug?: string;
    max_output_tokens?: number | null;
    model_id: string;
    name: string;
    output_modalities?: string[];
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses: boolean;
    updated_at?: string | null;
    upstream_model_id: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/private-models/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      base_url: string;
      catalog_model_id?: string | null;
      context_length?: number | null;
      created_at?: string | null;
      created_by?: string | null;
      credential_prefix?: string | null;
      credential_suffix?: string | null;
      custom_provider_name?: string | null;
      custom_provider_url?: string | null;
      description?: string | null;
      enabled: boolean;
      host_provider_id?: string | null;
      id: string;
      input_modalities?: string[];
      local_slug?: string;
      max_output_tokens?: number | null;
      model_id: string;
      name: string;
      output_modalities?: string[];
      routing_policy?: "preferred" | "balanced" | "fallback";
      supports_responses: boolean;
      updated_at?: string | null;
      upstream_model_id: string;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateProviderCredentialParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    allowed_api_key_ids?: string[];
    allowed_models?: string[];
    enabled?: boolean;
    key?: string;
    name?: string;
    routing_mode?: "priority" | "fallback";
  };
};

/**
 * Updates credential metadata, filters, routing group, or replaces the write-only secret.
 */
export async function updateProviderCredential(
  client: Client,
  args: UpdateProviderCredentialParams,
): Promise<{
  data: {
    allowed_api_key_ids?: string[];
    allowed_model_slugs?: string[];
    always_use?: boolean;
    created_at?: string | null;
    created_by?: string | null;
    disabled: boolean;
    enabled: boolean;
    error_message?: string | null;
    id: string;
    is_fallback: boolean;
    last_used_at?: string | null;
    last_verified_at?: string | null;
    name: string;
    prefix?: string | null;
    provider_id: string;
    routing_mode: "priority" | "fallback";
    sort_order: number;
    suffix?: string | null;
    verification_status?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/byok/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      allowed_api_key_ids?: string[];
      allowed_model_slugs?: string[];
      always_use?: boolean;
      created_at?: string | null;
      created_by?: string | null;
      disabled: boolean;
      enabled: boolean;
      error_message?: string | null;
      id: string;
      is_fallback: boolean;
      last_used_at?: string | null;
      last_verified_at?: string | null;
      name: string;
      prefix?: string | null;
      provider_id: string;
      routing_mode: "priority" | "fallback";
      sort_order: number;
      suffix?: string | null;
      verification_status?: string | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateRateLimitAssignmentParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    policy_id: string;
  };
};

/**
 * Switches the policy applied to an assignment's target. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function updateRateLimitAssignment(
  client: Client,
  args: UpdateRateLimitAssignmentParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    id: string;
    policy_id: string;
    target_id: string | null;
    target_type:
      "key" | "member" | "department" | "guardrail" | "end_user_default";
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/rate-limits/assignments/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      id: string;
      policy_id: string;
      target_id: string | null;
      target_type:
        "key" | "member" | "department" | "guardrail" | "end_user_default";
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateRateLimitPolicyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    concurrent_requests?: number | null;
    description?: string | null;
    fail_closed?: boolean;
    name?: string;
    requests_per_minute?: number | null;
    tokens_per_minute?: number | null;
  };
};

/**
 * Changes a policy's name, description, limits, or fail-closed setting. Set a limit to null to remove it; at least one limit must remain. The gateway enforces requests_per_minute, tokens_per_minute and concurrent_requests for key, member, department, guardrail and end-user-default assignments.
 */
export async function updateRateLimitPolicy(
  client: Client,
  args: UpdateRateLimitPolicyParams,
): Promise<{
  data: {
    concurrent_requests: number | null;
    created_at: string;
    created_by?: string | null;
    description: string | null;
    fail_closed: boolean;
    id: string;
    name: string;
    requests_per_minute: number | null;
    tokens_per_minute: number | null;
    updated_at: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/rate-limits/policies/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      concurrent_requests: number | null;
      created_at: string;
      created_by?: string | null;
      description: string | null;
      fail_closed: boolean;
      id: string;
      name: string;
      requests_per_minute: number | null;
      tokens_per_minute: number | null;
      updated_at: string;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateSpendRuleParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    action?: "notify" | "block";
    base_amount_nanos?: number | null;
    base_amount_usd?: number | null;
    base_kind?:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_ref?: "daily" | "weekly" | "monthly" | null;
    block_at_amount_nanos?: number | null;
    block_at_amount_usd?: number | null;
    block_at_percent?: number;
    block_free_models?: boolean;
    cooldown_minutes?: number;
    destination_ids?: string[];
    enabled?: boolean;
    metric?: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    name?: string;
    period?: "day" | "week" | "month" | "rolling";
    runway_days?: number | null;
    scope_id?: string | null;
    scope_type?:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spike_floor_nanos?: number | null;
    spike_floor_usd?: number | null;
    spike_multiplier?: number | null;
    threshold_amount_nanos?: number | null;
    threshold_amount_usd?: number | null;
    threshold_percents?: number[] | null;
    time_zone?: string | null;
    window_hours?: number | null;
  };
};

/**
 * Changes a spend rule. The fields sent are merged over the stored rule and the whole rule is checked again. destination_ids replaces the rule's destinations; leave it out to keep them.
 */
export async function updateSpendRule(
  client: Client,
  args: UpdateSpendRuleParams,
): Promise<{
  data: {
    action: "notify" | "block";
    base_amount_nanos: number | null;
    base_amount_usd: number | null;
    base_kind:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_ref: "daily" | "weekly" | "monthly" | null;
    block_at_amount_nanos: number | null;
    block_at_amount_usd: number | null;
    block_at_percent: number;
    block_free_models: boolean;
    cooldown_minutes: number;
    created_at: string;
    created_by: string | null;
    destination_ids: string[];
    enabled: boolean;
    evaluated: boolean;
    id: string;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    name: string;
    period: "day" | "week" | "month" | "rolling";
    runway_days: number | null;
    scope_id: string | null;
    scope_type:
      "workspace" | "key" | "member" | "department" | "model" | "provider";
    spike_floor_nanos: number | null;
    spike_floor_usd: number | null;
    spike_multiplier: number | null;
    threshold_amount_nanos: number | null;
    threshold_amount_usd: number | null;
    threshold_percents: number[] | null;
    time_zone: string | null;
    updated_at: string;
    window_hours: number | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/spend-rules/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      action: "notify" | "block";
      base_amount_nanos: number | null;
      base_amount_usd: number | null;
      base_kind:
        "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
      base_ref: "daily" | "weekly" | "monthly" | null;
      block_at_amount_nanos: number | null;
      block_at_amount_usd: number | null;
      block_at_percent: number;
      block_free_models: boolean;
      cooldown_minutes: number;
      created_at: string;
      created_by: string | null;
      destination_ids: string[];
      enabled: boolean;
      evaluated: boolean;
      id: string;
      metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
      name: string;
      period: "day" | "week" | "month" | "rolling";
      runway_days: number | null;
      scope_id: string | null;
      scope_type:
        "workspace" | "key" | "member" | "department" | "model" | "provider";
      spike_floor_nanos: number | null;
      spike_floor_usd: number | null;
      spike_multiplier: number | null;
      threshold_amount_nanos: number | null;
      threshold_amount_usd: number | null;
      threshold_percents: number[] | null;
      time_zone: string | null;
      updated_at: string;
      window_hours: number | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWebhookEndpointParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    events?: (
      | "job.created"
      | "job.status_changed"
      | "job.progress"
      | "job.completed"
      | "job.failed"
      | "job.cancelled"
      | "job.expired"
      | "video.created"
      | "video.status_changed"
      | "video.progress"
      | "video.completed"
      | "video.failed"
      | "video.cancelled"
      | "video.expired"
      | "batch.created"
      | "batch.status_changed"
      | "batch.progress"
      | "batch.completed"
      | "batch.failed"
      | "batch.cancelled"
      | "batch.expired"
    )[];
    name?: string;
    status?: "active" | "disabled";
    url?: string;
  };
};

/**
 * Updates endpoint delivery settings. Requires `settings:write`.
 */
export async function updateWebhookEndpoint(
  client: Client,
  args: UpdateWebhookEndpointParams,
): Promise<{
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events: (
    | "job.created"
    | "job.status_changed"
    | "job.progress"
    | "job.completed"
    | "job.failed"
    | "job.cancelled"
    | "job.expired"
    | "video.created"
    | "video.status_changed"
    | "video.progress"
    | "video.completed"
    | "video.failed"
    | "video.cancelled"
    | "video.expired"
    | "batch.created"
    | "batch.status_changed"
    | "batch.progress"
    | "batch.completed"
    | "batch.failed"
    | "batch.cancelled"
    | "batch.expired"
  )[];
  hasSecret: boolean;
  id: string;
  name: string;
  status: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url: string;
  workspaceId: string;
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/webhook-endpoints/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    createdAt?: string | null;
    createdBy?: string | null;
    deletedAt?: string | null;
    events: (
      | "job.created"
      | "job.status_changed"
      | "job.progress"
      | "job.completed"
      | "job.failed"
      | "job.cancelled"
      | "job.expired"
      | "video.created"
      | "video.status_changed"
      | "video.progress"
      | "video.completed"
      | "video.failed"
      | "video.cancelled"
      | "video.expired"
      | "batch.created"
      | "batch.status_changed"
      | "batch.progress"
      | "batch.completed"
      | "batch.failed"
      | "batch.cancelled"
      | "batch.expired"
    )[];
    hasSecret: boolean;
    id: string;
    name: string;
    status: "active" | "disabled" | "deleted";
    updatedAt?: string | null;
    url: string;
    workspaceId: string;
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkloadIdentityPolicyParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    claim_conditions?: {
      [key: string]: string[];
    };
    max_token_lifetime_seconds?: number;
    name?: string;
    status?: "active" | "disabled";
  };
};

/**
 * Changes a policy's name, status, claim conditions or maximum token lifetime. The provider, issuer and owner cannot change; create a new policy instead. Changes reach the gateway within a minute. Requires keys:write on management keys and OAuth tokens, or a workspace owner or admin. Available only to workspaces in the trusted workloads beta; other workspaces get 404.
 */
export async function updateWorkloadIdentityPolicy(
  client: Client,
  args: UpdateWorkloadIdentityPolicyParams,
): Promise<{
  data: {
    audience: string;
    claim_conditions: {
      [key: string]: string[];
    };
    created_at: string;
    created_by: string | null;
    id: string;
    issuer: string;
    key_id: string;
    last_used_at: string | null;
    max_token_lifetime_seconds: number;
    name: string;
    owner_id: string;
    provider: "vercel" | "github_actions";
    status: "active" | "disabled";
    updated_at: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workload-identity/policies/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      audience: string;
      claim_conditions: {
        [key: string]: string[];
      };
      created_at: string;
      created_by: string | null;
      id: string;
      issuer: string;
      key_id: string;
      last_used_at: string | null;
      max_token_lifetime_seconds: number;
      name: string;
      owner_id: string;
      provider: "vercel" | "github_actions";
      status: "active" | "disabled";
      updated_at: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name?: string;
    slug?: string;
  };
};

/**
 * Updates workspace metadata. Management API key required.
 */
export async function updateWorkspace(
  client: Client,
  args: UpdateWorkspaceParams,
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug?: string | null;
    updated_at: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug?: string | null;
      updated_at: string | null;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceAppParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    category?: string | null;
    docs_url?: string | null;
    image_url?: string | null;
    is_active?: boolean;
    is_public?: boolean;
    title?: string;
    url?: string | null;
  };
};

/**
 * Updates display metadata, catalogue visibility, or active status for an attributed application. Managed platform applications cannot be edited.
 */
export async function updateWorkspaceApp(
  client: Client,
  args: UpdateWorkspaceAppParams,
): Promise<{
  data: {
    app_key: string;
    category: string | null;
    created_at: string | null;
    docs_url: string | null;
    id: string;
    image_url: string | null;
    is_active: boolean;
    is_managed: boolean;
    is_public: boolean;
    last_seen: string | null;
    title: string;
    url: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/apps/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      app_key: string;
      category: string | null;
      created_at: string | null;
      docs_url: string | null;
      id: string;
      image_url: string | null;
      is_active: boolean;
      is_managed: boolean;
      is_public: boolean;
      last_seen: string | null;
      title: string;
      url: string | null;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceBudgetParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    interval?: "daily" | "weekly" | "monthly" | "lifetime";
    limit?: number;
  };
};

/**
 * Changes the interval or USD ceiling for an existing workspace budget.
 */
export async function updateWorkspaceBudget(
  client: Client,
  args: UpdateWorkspaceBudgetParams,
): Promise<{
  data: {
    created_at: string;
    created_by?: string | null;
    exceeded: boolean;
    id: string;
    interval: "daily" | "weekly" | "monthly" | "lifetime";
    limit: number;
    limit_nanos: number;
    remaining: number;
    remaining_nanos: number;
    reset_at?: string | null;
    updated_at: string;
    usage: number;
    usage_nanos: number;
    window_start?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/budgets/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      created_at: string;
      created_by?: string | null;
      exceeded: boolean;
      id: string;
      interval: "daily" | "weekly" | "monthly" | "lifetime";
      limit: number;
      limit_nanos: number;
      remaining: number;
      remaining_nanos: number;
      reset_at?: string | null;
      updated_at: string;
      usage: number;
      usage_nanos: number;
      window_start?: string | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceDepartmentParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    color?:
      | "blue"
      | "emerald"
      | "amber"
      | "rose"
      | "violet"
      | "slate"
      | "cyan"
      | "teal"
      | "lime"
      | "yellow"
      | "orange"
      | "red"
      | "pink"
      | "fuchsia"
      | "indigo"
      | "sky"
      | "green"
      | "purple";
    description?: string | null;
    icon?:
      | "users"
      | "briefcase"
      | "megaphone"
      | "code"
      | "palette"
      | "headphones"
      | "landmark"
      | "scale"
      | "heart-pulse"
      | "globe"
      | "flask"
      | "graduation-cap"
      | "shield-check"
      | "shopping-bag"
      | "wrench"
      | "truck"
      | "handshake"
      | "chart";
    name?: string;
  };
};

/**
 * Updates department name, description, icon, or color without removing its directory mapping.
 */
export async function updateWorkspaceDepartment(
  client: Client,
  args: UpdateWorkspaceDepartmentParams,
): Promise<{
  data: {
    color?: string;
    created_at?: string | null;
    description?: string | null;
    directory_name?: string | null;
    icon?: string;
    id: string;
    name: string;
    name_overridden?: boolean;
    source_id?: string | null;
    source_type?: "manual" | "scim_group";
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/departments/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      color?: string;
      created_at?: string | null;
      description?: string | null;
      directory_name?: string | null;
      icon?: string;
      id: string;
      name: string;
      name_overridden?: boolean;
      source_id?: string | null;
      source_type?: "manual" | "scim_group";
      updated_at?: string | null;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceDirectoryMemberParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    access_role?: "directory" | "admin" | "member" | null;
    department_id?: string | null;
    department_mode?: "directory" | "department" | "none";
    department_position?: "member" | "lead";
  };
};

/**
 * Sets or clears effective role and department overrides for a workspace member. Requires `settings:write`.
 */
export async function updateWorkspaceDirectoryMember(
  client: Client,
  args: UpdateWorkspaceDirectoryMemberParams,
): Promise<{
  data: {
    updated: boolean;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/directory/members/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      updated: boolean;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceGroupMappingParams = {
  path: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    access_role?: "member" | "admin";
    department_position?: "member" | "lead";
  };
};

/**
 * Updates the access role or department position assigned by a mapping.
 */
export async function updateWorkspaceGroupMapping(
  client: Client,
  args: UpdateWorkspaceGroupMappingParams,
): Promise<{
  data: {
    access_role: "member" | "admin";
    created_at?: string | null;
    department_id: string;
    department_position: "member" | "lead";
    id: string;
    scim_group_id: string;
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/identity/group-mappings/${encodeURIComponent(String(path["id"]))}`;
  return client.request<{
    data: {
      access_role: "member" | "admin";
      created_at?: string | null;
      department_id: string;
      department_position: "member" | "lead";
      id: string;
      scim_group_id: string;
      updated_at?: string | null;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceMemberRoleParams = {
  path: {
    id: string;
    user_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    role: "admin" | "member";
  };
};

/**
 * Changes a non-owner member between admin and member. Workspace owner and management API key required.
 */
export async function updateWorkspaceMemberRole(
  client: Client,
  args: UpdateWorkspaceMemberRoleParams,
): Promise<{
  data: {
    display_name?: string | null;
    joined_at?: string | null;
    role: "owner" | "admin" | "member";
    user_id: string;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["id"])))
    throw new Error("Dot segments are not valid path parameters");
  if ([".", ".."].includes(String(path?.["user_id"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path["id"]))}/members/${encodeURIComponent(String(path["user_id"]))}`;
  return client.request<{
    data: {
      display_name?: string | null;
      joined_at?: string | null;
      role: "owner" | "admin" | "member";
      user_id: string;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceNotificationRouteParams = {
  path: {
    eventKind:
      | "low_balance"
      | "auto_top_up_failed"
      | "payment_method_expiring"
      | "model_deprecation"
      | "model_substitution"
      | "rate_limit_throttled"
      | "broadcast_destination_failing"
      | "spend_alert"
      | "spend_blocked"
      | "spend_report";
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    destination_ids: string[];
  };
};

/**
 * Replaces the destination assignments for a supported event kind.
 */
export async function updateWorkspaceNotificationRoute(
  client: Client,
  args: UpdateWorkspaceNotificationRouteParams,
): Promise<{
  data: {
    destination_ids: string[];
    event_kind:
      | "low_balance"
      | "auto_top_up_failed"
      | "payment_method_expiring"
      | "model_deprecation"
      | "model_substitution"
      | "rate_limit_throttled"
      | "broadcast_destination_failing"
      | "spend_alert"
      | "spend_blocked"
      | "spend_report";
  };
}> {
  const { path, query, headers, body } = args;
  if ([".", ".."].includes(String(path?.["eventKind"])))
    throw new Error("Dot segments are not valid path parameters");
  const resolvedPath = `/notifications/routes/${encodeURIComponent(String(path["eventKind"]))}`;
  return client.request<{
    data: {
      destination_ids: string[];
      event_kind:
        | "low_balance"
        | "auto_top_up_failed"
        | "payment_method_expiring"
        | "model_deprecation"
        | "model_substitution"
        | "rate_limit_throttled"
        | "broadcast_destination_failing"
        | "spend_alert"
        | "spend_blocked"
        | "spend_report";
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceNotificationSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    auto_top_up?: {
      amount_nanos?: number;
      balance_threshold_nanos?: number;
      enabled: boolean;
      mfa_bypass_acknowledged?: boolean;
      mfa_bypass_phrase?: string;
      payment_method_id?: string | null;
    };
    email_preferences?: {
      auto_top_up_failure?: boolean;
      model_deprecation?: boolean;
      payment_method_expiring?: boolean;
    };
    low_balance_email?: {
      enabled: boolean;
      threshold_usd?: number;
    };
    spend?: {
      billing_time_zone?: string;
      department_attribution?: "all" | "primary";
    };
  };
};

/**
 * Updates one or more durable notification-policy sections. Enabling auto top-up requires an existing saved payment method identifier and verified two-factor authentication. An existing auto top-up configuration may be updated without repeating the MFA acknowledgement. To enable auto top-up without MFA, clients must explicitly set `mfa_bypass_acknowledged` to true and provide the exact `mfa_bypass_phrase` value `I ACCEPT THE RISK`; payment collection remains an interactive account flow.
 */
export async function updateWorkspaceNotificationSettings(
  client: Client,
  args: UpdateWorkspaceNotificationSettingsParams = {},
): Promise<{
  data: {
    auto_top_up: {
      amount_nanos: number;
      balance_threshold_nanos: number;
      enabled: boolean;
      payment_method_id: string | null;
    };
    email_preferences: {
      auto_top_up_failure: boolean;
      model_deprecation: boolean;
      payment_method_expiring: boolean;
    };
    low_balance_email: {
      enabled: boolean;
      threshold_usd: number;
    };
    spend: {
      billing_time_zone: string;
      department_attribution: "all" | "primary";
    };
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/notifications/settings";
  return client.request<{
    data: {
      auto_top_up: {
        amount_nanos: number;
        balance_threshold_nanos: number;
        enabled: boolean;
        payment_method_id: string | null;
      };
      email_preferences: {
        auto_top_up_failure: boolean;
        model_deprecation: boolean;
        payment_method_expiring: boolean;
      };
      low_balance_email: {
        enabled: boolean;
        threshold_usd: number;
      };
      spend: {
        billing_time_zone: string;
        department_attribution: "all" | "primary";
      };
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceScimParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    enabled: boolean;
  };
};

/**
 * Updates the workspace SCIM endpoint. Enabling SCIM requires the identity add-on and `settings:write`.
 */
export async function updateWorkspaceScim(
  client: Client,
  args: UpdateWorkspaceScimParams = {},
): Promise<{
  data: {
    created_at?: string | null;
    enabled: boolean;
    id: string;
    updated_at?: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/scim";
  return client.request<{
    data: {
      created_at?: string | null;
      enabled: boolean;
      id: string;
      updated_at?: string | null;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceSettingsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    alpha_channel_enabled?: boolean;
    beta_channel_enabled?: boolean;
    byok_fallback_enabled?: boolean;
    io_logging_enabled?: boolean;
    io_logging_include_provider_payloads?: boolean;
    model_successor_max_price_increase_percent?: number;
    model_successor_price_policy?: "never" | "limit" | "any";
    model_successor_redirect_enabled?: boolean;
    privacy_enable_free_may_publish_prompts?: boolean;
    privacy_enable_free_may_train?: boolean;
    privacy_enable_input_output_logging?: boolean;
    privacy_enable_paid_may_train?: boolean;
    privacy_zdr_only?: boolean;
    provider_restriction_enforce_allowed?: boolean;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist";
    provider_restriction_provider_ids?: string[];
    response_healing_enabled?: boolean;
    response_healing_locked?: boolean;
    response_healing_mode?: "safe" | "strict";
    routing_mode?: "balanced" | "price" | "latency" | "throughput";
  };
};

/**
 * Updates workspace routing, provider, privacy, or gateway defaults and refreshes affected gateway policy caches.
 */
export async function updateWorkspaceSettings(
  client: Client,
  args: UpdateWorkspaceSettingsParams = {},
): Promise<{
  data: {
    alpha_channel_enabled?: boolean | null;
    beta_channel_enabled?: boolean | null;
    byok_fallback_enabled?: boolean | null;
    io_logging_enabled?: boolean | null;
    io_logging_include_provider_payloads?: boolean | null;
    model_successor_max_price_increase_percent?: number | null;
    model_successor_price_policy?: "never" | "limit" | "any" | null;
    model_successor_redirect_enabled?: boolean | null;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    response_healing_enabled?: boolean | null;
    response_healing_locked?: boolean | null;
    response_healing_mode?: "safe" | "strict" | null;
    routing_mode?: "balanced" | "price" | "latency" | "throughput" | null;
    updated_at?: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/settings";
  return client.request<{
    data: {
      alpha_channel_enabled?: boolean | null;
      beta_channel_enabled?: boolean | null;
      byok_fallback_enabled?: boolean | null;
      io_logging_enabled?: boolean | null;
      io_logging_include_provider_payloads?: boolean | null;
      model_successor_max_price_increase_percent?: number | null;
      model_successor_price_policy?: "never" | "limit" | "any" | null;
      model_successor_redirect_enabled?: boolean | null;
      privacy_enable_free_may_publish_prompts?: boolean | null;
      privacy_enable_free_may_train?: boolean | null;
      privacy_enable_input_output_logging?: boolean | null;
      privacy_enable_paid_may_train?: boolean | null;
      privacy_zdr_only?: boolean | null;
      provider_restriction_enforce_allowed?: boolean | null;
      provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
      provider_restriction_provider_ids?: string[] | null;
      response_healing_enabled?: boolean | null;
      response_healing_locked?: boolean | null;
      response_healing_mode?: "safe" | "strict" | null;
      routing_mode?: "balanced" | "price" | "latency" | "throughput" | null;
      updated_at?: string | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceSsoParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    domains?: string[];
    enabled: boolean;
    enforced?: false;
    mode: "none" | "saml" | "custom_oidc";
    provider_identifier?: string | null;
  };
};

/**
 * Updates SAML or custom OIDC settings. Enabling SSO requires the identity add-on and `settings:write`.
 */
export async function updateWorkspaceSso(
  client: Client,
  args: UpdateWorkspaceSsoParams = {},
): Promise<{
  data: {
    domains: string[];
    enabled: boolean;
    enforced: false;
    mode: "none" | "saml" | "custom_oidc";
    provider_identifier: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/identity/sso";
  return client.request<{
    data: {
      domains: string[];
      enabled: boolean;
      enforced: false;
      mode: "none" | "saml" | "custom_oidc";
      provider_identifier: string | null;
    };
  }>({
    method: "PUT",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UploadBatchFileParams = {
  path?: Record<string, never>;
  query?: {
    model?: string;
    provider?: "openai" | "groq" | "together" | "mistral";
  };
  headers?: {
    "x-phaseo-provider"?: string;
  };
  body?: {
    file: Blob;
    purpose: string;
  };
};

/**
 * Uploads a provider file for batch processing and stores ownership in the authenticated workspace. Pass `model` so Phaseo can infer the upstream provider. Defaults to OpenAI when both `model` and `provider` are omitted.
 */
export async function uploadBatchFile(
  client: Client,
  args: UploadBatchFileParams = {},
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches/files";
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UploadBatchFileAliasParams = {
  path?: Record<string, never>;
  query?: {
    model?: string;
    provider?: string;
  };
  headers?: {
    "x-ai-stats-provider"?: string;
  };
  body?: {
    file: Blob;
    purpose: string;
  };
};

/**
 * Alias of /batches/files.
 */
export async function uploadBatchFileAlias(
  client: Client,
  args: UploadBatchFileAliasParams = {},
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch/files";
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UploadFileParams = {
  path?: Record<string, never>;
  query?: {
    model?: string;
    provider?: "openai" | "groq" | "together" | "mistral";
  };
  headers?: {
    "x-ai-stats-provider"?: string;
  };
  body?: {
    file: Blob;
    purpose: string;
  };
};

/**
 * Compatibility alias for `/batches/files`. Uploads a file for batch processing and returns the upstream file metadata. Pass `model` so Phaseo can infer the upstream provider. Defaults to OpenAI for legacy clients that omit both `model` and `provider`.
 */
export async function uploadFile(
  client: Client,
  args: UploadFileParams = {},
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/files";
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}
