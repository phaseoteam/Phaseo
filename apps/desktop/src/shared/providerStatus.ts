import type { Harness } from "./workspace";

export type ProviderStatusId = "phaseo" | "anthropic" | "openai" | "cursor" | "google";
/** An open incident on a provider's public status page. */
export type ProviderIncident = { id: ProviderStatusId; title: string; severity: "minor" | "major" | "critical"; updatedAt?: string };

export const providerLabels: Record<ProviderStatusId, string> = { phaseo: "Phaseo", anthropic: "Anthropic", openai: "OpenAI", cursor: "Cursor", google: "Google Cloud" };

/** The status pages a chat's agent depends on: Phaseo's own gateway for Phaseo chats, the maker's service for the rest. */
export function statusSourcesFor(harness: Harness): ProviderStatusId[] {
	if (harness === "phaseo") return ["phaseo"];
	if (harness === "claude") return ["anthropic"];
	if (harness === "codex") return ["openai"];
	if (harness === "cursor") return ["cursor"];
	if (harness === "antigravity") return ["google"];
	return [];
}
