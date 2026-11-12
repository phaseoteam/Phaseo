import { compactGatewayModels, type GatewayChatModel } from "@/features/chat/gatewayModels";
import { request } from "./http";

/**
 * Every model the web chat can run, with each provider route's reasoning efforts and service tiers:
 * the feed the website's chat picker and model settings read (fetchFrontendGatewayModels). Reduced
 * on arrival, so the cached copy is a fraction of the ~1.5 MB response.
 */
export async function getGatewayChatModels(): Promise<GatewayChatModel[]> {
  const raw = await request<{ models?: unknown }>("/api/_web/gateway/models", { query: { available_only: "true" } });
  return compactGatewayModels(raw?.models);
}
