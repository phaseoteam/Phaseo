import type { Account, ModelOption } from "../shared/workspace";
import { spawnNative } from "./nativeProcess";
import { JsonRpc } from "./jsonRpc";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

export async function apiModels(account: Account, key: string, fetcher: typeof fetch = fetch): Promise<ModelOption[]> {
	if (!account.endpoint || account.kind !== "api") throw new Error("Choose an API account.");
	const response = await fetcher(`${account.endpoint.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
	if (!response.ok) throw new Error(`Model discovery returned HTTP ${response.status}.`);
	const result = await response.json() as { data?: { id?: unknown; name?: unknown }[] };
	if (!Array.isArray(result.data)) throw new Error("The endpoint returned an invalid model catalog.");
	return result.data.slice(0, 10000).filter(model => typeof model.id === "string").map(model => ({ id: model.id as string, name: typeof model.name === "string" ? model.name : model.id as string }));
}

export async function codexModels(cwd: string, account?: Account): Promise<ModelOption[]> {
	const child = await spawnNative("codex", ["app-server", "--stdio"], cwd, "@openai/codex/bin/codex.js", nativeAccountEnvironment(account));
	const rpc = new JsonRpc(child.stdout, child.stdin); child.stderr.resume();
	child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close());
	try {
		await rpc.request("initialize", { clientInfo: { name: "phaseo_desktop", title: "Phaseo", version: "0.1.0" }, capabilities: { experimentalApi: true } }); rpc.notify("initialized");
		const models: ModelOption[] = []; let cursor: string | null = null;
		const seen = new Set<string>();
		do {
			const page: { data: { model: string; displayName: string; description: string; hidden: boolean; isDefault: boolean }[]; nextCursor: string | null } = await rpc.request("model/list", { cursor, limit: 100 });
			models.push(...page.data.filter(model => !model.hidden).map(model => ({ id: model.model, name: model.displayName, description: model.description, default: model.isDefault })));
			cursor = page.nextCursor;
			if (cursor && seen.has(cursor)) throw new Error("Model catalog repeated a page.");
			if (cursor) seen.add(cursor);
			if (models.length > 10000) throw new Error("Model catalog exceeded the limit.");
		} while (cursor);
		return models;
	} finally { rpc.close(); child.kill(); }
}
