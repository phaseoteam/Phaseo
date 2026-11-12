/**
 * How a failed answer is presented, ported from apps/web/src/components/(chat)/chatRequestErrorPresentation.ts
 * with the website's copy (Product.chat.errorNotice): a title, a next step and the buttons that fit.
 */
export type ChatErrorKind = "payment" | "authentication" | "validation" | "forbidden" | "model-unavailable" | "timeout" | "conflict" | "rate-limit" | "service" | "stream" | "generic";

export type ChatErrorPresentation = {
  kind: ChatErrorKind;
  title: string;
  description: string | null;
  canRetry: boolean;
  canChooseModel: boolean;
  /** The fix is in the model's settings (max output). */
  canOpenSettings?: boolean;
};

const present = (kind: ChatErrorKind, title: string, description: string | null, canRetry: boolean, canChooseModel: boolean): ChatErrorPresentation => ({ kind, title, description, canRetry, canChooseModel });

export function chatErrorPresentation(error: { code: string | null; status: number | null }): ChatErrorPresentation {
  const code = String(error.code ?? "").toLowerCase();
  const status = error.status;
  if (/(pricing_not_configured|missing_pricing)/.test(code)) return present("model-unavailable", "This model isn't available in Chat", "Choose another model and try again.", false, true);
  if (status === 402 || /(insufficient_(funds|credits)|payment_required|credit_balance)/.test(code)) return present("payment", "Please add credits to use this model", "Or try a free model.", false, false);
  if (status === 401 || /(unauthorized|authentication|invalid_token|signed_out)/.test(code)) return present("authentication", "Please sign in again", "Your session may have expired.", false, false);
  if (status === 400 || status === 422 || /(validation|invalid_request)/.test(code)) return present("validation", "This request needs a change", null, false, false);
  if (status === 403 || /(forbidden|permission_denied|access_denied)/.test(code)) return present("forbidden", "This request isn't allowed", null, false, false);
  if (status === 404 || /(model_not_found|not_found|no_candidates)/.test(code)) return present("model-unavailable", "This model isn't available", "Choose another model and try again.", false, true);
  if (status === 408 || status === 504 || /(timeout|timed_out|stream_idle)/.test(code)) return present("timeout", "The request timed out", "The model took too long to respond. Try again.", true, false);
  if (status === 409 || code.includes("conflict")) return present("conflict", "The request couldn't be completed", "The chat state changed while it was running. Try again.", true, false);
  if (status === 429 || /(rate_limit|resource_exhausted|quota_exceeded)/.test(code)) return present("rate-limit", "This model is busy right now", "Wait a moment and try again, or choose another model.", true, true);
  if ((status != null && status >= 500) || /(upstream_error|all_failed|service_unavailable|empty_response)/.test(code)) return present("service", "The model is temporarily unavailable", "Try again, or choose another model.", true, true);
  // The phone's own stream errors: the connection or the answer stopped partway.
  if (code === "max_output_tokens") return { ...present("stream", "The answer hit its length limit", "Raise max output in this model's settings, then try again.", true, false), canOpenSettings: true };
  if (/^(stream_|no_stream|content_filter)/.test(code)) return present("stream", code === "content_filter" ? "The provider's filter stopped the answer" : "The answer stopped partway", null, code !== "content_filter", code === "content_filter");
  return present("generic", "Request failed", null, false, false);
}
