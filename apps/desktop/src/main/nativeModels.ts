import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import type { ModelOption } from "../shared/workspace";
import { spawnNative } from "./nativeProcess";
import { PiRpc } from "./piRpc";
import { piEntries } from "./piLaunch";
import type { Endpoint } from "@opencode/client/service";

export async function openCodeModels(cwd: string, connected?: Endpoint): Promise<ModelOption[]> {
	const endpoint = connected ?? await Service.discover({ version: version => version.startsWith("2.") });
	if (!endpoint) throw new Error("Start an OpenCode 2 service to discover its configured models.");
	const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
	const catalog = await client.model.list({ location: { directory: cwd } }, { signal: AbortSignal.timeout(15000) });
	return catalog.data.filter(model => model.enabled && model.status !== "deprecated").slice(0, 10000).map(model => ({ id: `${model.providerID}/${model.id}`, name: model.name, description: `${model.providerID} · ${model.limit.context.toLocaleString()} context` }));
}

export async function piModels(cwd: string): Promise<ModelOption[]> {
	const child = await spawnNative("pi", ["--mode", "rpc", "--no-tools", "--no-session"], cwd, piEntries);
	const rpc = new PiRpc(child.stdout, child.stdin); child.stderr.resume();
	child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close());
	try {
		const catalog = await rpc.request<{ models?: unknown }>({ type: "get_available_models" }, 15000);
		if (!Array.isArray(catalog?.models)) throw new Error("Pi returned an invalid model catalog.");
		return catalog.models.slice(0, 10000).flatMap((value: unknown) => {
			if (!value || typeof value !== "object") return [];
			const model = value as Record<string, unknown>;
			if (typeof model.provider !== "string" || typeof model.id !== "string") return [];
			return [{ id: `${model.provider}/${model.id}`, name: typeof model.name === "string" ? model.name : model.id, description: model.provider }];
		});
	} finally { rpc.close(); child.stdin.end(); child.kill(); }
}
