import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";

// Never include untrusted catalog fields, identities, payloads, or destination URLs.
export function providerModelReviewMessage(count: number, reviewerId?: string) {
  const mention=reviewerId && /^[UW][A-Z0-9]{8,}$/.test(reviewerId) ? `<@${reviewerId}> ` : "";
  return { text: `${mention}${count} new model proposal${count === 1 ? "" : "s"} awaiting approval. Review: https://phaseo.app/settings/internal/provider-review`, unfurl_links: false, unfurl_media: false };
}

export async function notifyPendingProviderModels(env: Env): Promise<void> {
  if (!env.PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK) return;
  let destination: URL;
  try { destination = new URL(env.PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK); }
  catch { console.error("provider_model_notification_invalid_destination"); return; }
  if (destination.protocol !== "https:" || destination.hostname !== "hooks.slack.com" || destination.username || destination.password || destination.port || destination.search || destination.hash || !destination.pathname.startsWith("/services/")) {
    console.error("provider_model_notification_invalid_destination"); return;
  }
  const client = getDataClient(env);
  const lease = crypto.randomUUID();
  const claimed = await client.rpc("claim_provider_model_notifications", { p_lease: lease });
  if (claimed.error) { console.error("provider_model_notification_claim_failed"); return; }
  const ids = (claimed.data ?? []) as string[];
  if (!ids.length) return;
  try {
    const response = await fetch(destination.toString(), { method: "POST", redirect: "manual", headers: { "content-type": "application/json" }, body: JSON.stringify(providerModelReviewMessage(ids.length,env.PROVIDER_MODEL_REVIEW_SLACK_USER_ID)), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { console.error("provider_model_notification_delivery_failed", { status: response.status }); return; }
    const marked = await client.from("provider_catalog_model_requests").update({ notification_sent_at: new Date().toISOString(), notification_lease: null }).in("id", ids).eq("notification_lease", lease);
    if (marked.error) console.error("provider_model_notification_ack_failed");
  } catch { console.error("provider_model_notification_delivery_failed"); }
}
