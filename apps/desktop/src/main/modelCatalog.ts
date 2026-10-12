import type { Account, ModelOption } from "../shared/workspace";
import { spawnNative } from "./nativeProcess";
import { JsonRpc } from "./jsonRpc";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
export { apiModels } from "./apiModelCatalog";

export async function codexModels(cwd: string, account?: Account): Promise<ModelOption[]> {
	const child = await spawnNative("codex", ["app-server", "--stdio"], cwd, "@openai/codex/bin/codex.js", nativeAccountEnvironment(account));
	const rpc = new JsonRpc(child.stdout, child.stdin); child.stderr.resume();
	child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close());
	try {
		await rpc.request("initialize", { clientInfo: { name: "phaseo_desktop", title: "Phaseo", version: "0.1.0" }, capabilities: { experimentalApi: true } }); rpc.notify("initialized");
		return await readCodexModels(rpc);
	} finally { rpc.close(); child.kill(); }
}

export async function readCodexModels(rpc: Pick<JsonRpc, "request">): Promise<ModelOption[]> {
	const models: ModelOption[] = []; let cursor: string | null = null;
	const seen = new Set<string>();
	do {
		const page: { data: { model: string; displayName: string; description: string; hidden: boolean; isDefault: boolean; supportedReasoningEfforts?: { reasoningEffort: string; description: string }[]; defaultReasoningEffort?: string; serviceTiers?: { id: string; name: string; description: string }[]; defaultServiceTier?: string }[]; nextCursor: string | null } = await rpc.request("model/list", { cursor, limit: 100 });
		models.push(...page.data.filter(model => !model.hidden).map(model => ({
			id: model.model, name: model.displayName, description: model.description, default: model.isDefault,
			serviceTiers: model.serviceTiers?.filter(tier => typeof tier.id === "string" && tier.id.length > 0 && tier.id.length <= 100 && typeof tier.name === "string").slice(0, 20).map(tier => ({ id: tier.id, name: tier.name.slice(0, 100), description: typeof tier.description === "string" ? tier.description.slice(0, 2000) : "" })),
			defaultServiceTier: model.defaultServiceTier,
			reasoningEfforts: model.supportedReasoningEfforts?.filter(option => typeof option.reasoningEffort === "string" && option.reasoningEffort.length > 0 && option.reasoningEffort.length <= 100).slice(0, 100).map(option => ({ id: option.reasoningEffort, description: typeof option.description === "string" ? option.description.slice(0, 2000) : "" })),
			defaultReasoningEffort: typeof model.defaultReasoningEffort === "string" && model.defaultReasoningEffort.length <= 100 ? model.defaultReasoningEffort : undefined,
		})));
		cursor = page.nextCursor;
		if (cursor && seen.has(cursor)) throw new Error("Model catalog repeated a page.");
		if (cursor) seen.add(cursor);
		if (models.length > 10000) throw new Error("Model catalog exceeded the limit.");
	} while (cursor);
	return models;
}
