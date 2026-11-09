import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";

/** Cache routing hints must not group customers sharing a gateway credential. */
export async function withScopedPromptCacheKey(
	ir: IRChatRequest,
	args: Pick<ExecutorExecuteArgs, "workspaceId" | "providerId">,
	keySource: "gateway" | "byok",
): Promise<IRChatRequest> {
	if (!["openai", "openai-eu", "mistral"].includes(args.providerId)) return ir;
	if (!args.workspaceId) return ir;
	// Customer-owned credentials already provide the upstream account boundary.
	if (keySource === "byok" && typeof ir.promptCacheKey === "string") return ir;
	const material = JSON.stringify([
		"phaseo-prompt-cache-v1", args.workspaceId, args.providerId,
		ir.promptCacheKey ?? "default",
	]);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
	const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	// Stay within OpenAI's 64-character limit without sending customer identifiers.
	return { ...ir, promptCacheKey: `ph_${hash.slice(0, 60)}` };
}
