import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import type { ModelOption, ModelOptionDescriptor } from "../shared/workspace";
import { spawnNative } from "./nativeProcess";
import { PiRpc } from "./piRpc";
import { piEntries } from "./piLaunch";
import type { Endpoint } from "@opencode/client/service";

const titleCaseSlug = (value: string) => value.split(/[-_/]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(" ");
function defaultVariant(providerID: string, variants: string[]) {
	if (variants.length === 1) return variants[0];
	if (providerID === "anthropic" || providerID.startsWith("google")) return variants.includes("high") ? "high" : undefined;
	if (providerID === "openai" || providerID === "opencode") return variants.includes("medium") ? "medium" : variants.includes("high") ? "high" : undefined;
	return undefined;
}
/** OpenCode 2 reasoning variants as a "variant" setting; none when the model has no variants. */
export function openCodeVariantOptions(model: { providerID: string; variants?: readonly { id: string }[] }): ModelOptionDescriptor[] {
	const variants = (model.variants ?? []).map(variant => variant.id).filter(id => typeof id === "string" && id.length > 0 && id.length <= 100);
	if (!variants.length) return [];
	const fallback = defaultVariant(model.providerID, variants);
	return [{ id: "variant", label: "Reasoning", type: "select", options: variants.map(id => ({ id, label: titleCaseSlug(id), ...(id === fallback ? { isDefault: true } : {}) })) }];
}

export async function openCodeModels(cwd: string, connected?: Endpoint): Promise<ModelOption[]> {
	const endpoint = connected ?? await Service.discover({ version: version => version.startsWith("2.") });
	if (!endpoint) throw new Error("Start an OpenCode 2 service to discover its configured models.");
	const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
	const catalog = await client.model.list({ location: { directory: cwd } }, { signal: AbortSignal.timeout(15000) });
	return catalog.data.filter(model => model.enabled && model.status !== "deprecated").slice(0, 10000).map(model => {
		const options = openCodeVariantOptions(model);
		return { id: `${model.providerID}/${model.id}`, name: model.name, description: `${model.providerID} · ${model.limit.context.toLocaleString()} context`, ...(options.length ? { options } : {}) };
	});
}

const piLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const piLevelLabels = ["Off", "Minimal", "Low", "Medium", "High", "Extra High", "Max"];
/** Pi's `getSupportedThinkingLevels`: reasoning models offer off–high unless mapped to null; Extra High and Max only when mapped. */
export function piThinkingLevels(model: unknown): string[] {
	const record = model && typeof model === "object" ? model as Record<string, unknown> : {};
	if (record.reasoning !== true) return [];
	const map = record.thinkingLevelMap && typeof record.thinkingLevelMap === "object" && !Array.isArray(record.thinkingLevelMap) ? record.thinkingLevelMap as Record<string, unknown> : {};
	return piLevels.filter(level => map[level] !== null && (map[level] !== undefined || (level !== "xhigh" && level !== "max")));
}
/** Pi's `clampThinkingLevel`: the requested level, else the nearest higher one, else the nearest lower one. */
function clampPiLevel(input: unknown, levels: string[]) {
	const index = typeof input === "string" ? piLevels.indexOf(input) : -1;
	if (index < 0) return undefined;
	return [...piLevels.slice(index), ...piLevels.slice(0, index).reverse()].find(level => levels.includes(level));
}
export function piThinkingOptions(model: unknown, defaultLevel?: unknown): ModelOptionDescriptor[] {
	const levels = piThinkingLevels(model);
	if (!levels.length) return [];
	const fallback = clampPiLevel(defaultLevel, levels);
	return [{ id: "thinking", label: "Thinking", type: "select", options: levels.map(id => ({ id, label: piLevelLabels[piLevels.indexOf(id)], ...(id === fallback ? { isDefault: true } : {}) })) }];
}

export async function piModels(cwd: string): Promise<ModelOption[]> {
	const child = await spawnNative("pi", ["--mode", "rpc", "--no-tools", "--no-session"], cwd, piEntries);
	const rpc = new PiRpc(child.stdout, child.stdin); child.stderr.resume();
	child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close());
	try {
		const state = await rpc.request<{ thinkingLevel?: unknown } | undefined>({ type: "get_state" }, 15000).catch(() => undefined);
		const catalog = await rpc.request<{ models?: unknown }>({ type: "get_available_models" }, 15000);
		if (!Array.isArray(catalog?.models)) throw new Error("Pi returned an invalid model catalog.");
		return catalog.models.slice(0, 10000).flatMap((value: unknown) => {
			if (!value || typeof value !== "object") return [];
			const model = value as Record<string, unknown>;
			if (typeof model.provider !== "string" || typeof model.id !== "string") return [];
			const options = piThinkingOptions(model, state?.thinkingLevel);
			return [{ id: `${model.provider}/${model.id}`, name: typeof model.name === "string" ? model.name : model.id, description: model.provider, ...(options.length ? { options } : {}) }];
		});
	} finally { rpc.close(); child.stdin.end(); child.kill(); }
}
