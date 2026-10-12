import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { Account, ModelOption } from "../shared/workspace";
import { grokLaunchArgs, resolveGrokCommand } from "./grokLaunch";
import { grokModels } from "./grokModels";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

export async function grokModelCatalog(cwd: string, account?: Account): Promise<ModelOption[]> {
	if (account && (account.harness !== "grok" || account.kind !== "native" || !account.configDirectory || account.archived)) throw new Error("Choose an active native Grok profile.");
	const command = await resolveGrokCommand();
	const child = spawn(command.executable, [...command.prefix, ...grokLaunchArgs("plan")], { cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...nativeAccountEnvironment(account) } });
	child.stderr.resume();
	const connection = client({ name: "phaseo-model-catalog" }).connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
	child.on("error", () => connection.close(new Error("Grok model discovery failed.")));
	child.on("exit", () => connection.close(new Error("Grok model discovery stopped.")));
	const deadline = setTimeout(() => connection.close(new Error("Grok model discovery timed out.")), 15000);
	try {
		const initialized = await connection.agent.request("initialize", { protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "phaseo-desktop", version: "0.1.0" }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, _meta: { clientType: "extension" } });
		if (initialized.protocolVersion !== PROTOCOL_VERSION || initialized._meta?.grokShell !== true) throw new Error("Grok returned an unsupported model catalog.");
		const models = grokModels(initialized._meta.modelState);
		if (!models.length) throw new Error("Grok did not provide a model catalog.");
		return models;
	} finally { clearTimeout(deadline); connection.close(); child.kill(); }
}
