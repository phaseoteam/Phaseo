import { WEB_ORIGIN } from "@/lib/config";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type AccessTokenSource = () => Promise<string | null>;
let accessTokenSource: AccessTokenSource = async () => null;

/** The auth provider registers how to get a fresh Supabase access token. */
export function setAccessTokenSource(source: AccessTokenSource) {
  accessTokenSource = source;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(path, WEB_ORIGIN);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Web chat picks its workspace from this cookie (checked against the user's memberships). */
export function workspaceCookie(workspaceId: string | null | undefined): Record<string, string> {
  return workspaceId ? { cookie: `activeWorkspaceId=${encodeURIComponent(workspaceId)}` } : {};
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessTokenSource();
  if (!token) throw new ApiError(401, "Sign in to see this.", "signed_out");
  return { authorization: `Bearer ${token}` };
}

function messageFor(status: number, body: Record<string, unknown> | null) {
  const message = typeof body?.message === "string" ? body.message : typeof body?.error === "string" && body.error.includes(" ") ? body.error : null;
  if (message) return message;
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "You don't have access to this.";
  if (status === 404) return "This couldn't be found.";
  if (status >= 500) return "Phaseo is having trouble right now. Try again shortly.";
  return "Phaseo couldn't load this.";
}

/** A public page as text (the docs' Markdown copies), for feeds that aren't JSON. */
export async function requestText(path: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(buildUrl(path), { headers: { accept: "text/markdown, text/plain;q=0.9" }, signal });
  if (!response.ok) throw new ApiError(response.status, messageFor(response.status, null));
  return response.text();
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.auth) Object.assign(headers, await authHeaders());
  if (options.headers) Object.assign(headers, options.headers);
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
    const code = typeof record?.code === "string" ? record.code : typeof record?.error === "string" ? record.error : undefined;
    throw new ApiError(response.status, messageFor(response.status, record), code);
  }
  return body as T;
}
