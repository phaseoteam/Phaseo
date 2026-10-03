import type { Account } from "../shared/workspace";
import { JsonRpc } from "./jsonRpc";
import { spawnNative } from "./nativeProcess";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

export function isNativeAuthUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && ["auth.openai.com", "auth0.openai.com"].includes(url.hostname) && !url.username && !url.password;
	} catch { return false; }
}

export async function signInNative(account: Account, openUrl: (url: string) => Promise<void>, signal: AbortSignal): Promise<void> {
	if (!account.configDirectory || account.kind !== "native") throw new Error("Choose a native account to sign in.");
	const isCodex = account.harness === "codex";
	if (!isCodex && account.harness !== "claude") throw new Error("Sign-in is unavailable for this harness.");
	const child = await spawnNative(isCodex ? "codex" : "claude", isCodex ? ["app-server", "--stdio"] : ["auth", "login"], account.configDirectory,
		isCodex ? "@openai/codex/bin/codex.js" : undefined,
		nativeAccountEnvironment(account));
	const cancel = () => child.kill(); signal.addEventListener("abort", cancel, { once: true });
	child.stderr.resume();
	const deadline = setTimeout(cancel, 10 * 60 * 1000);
	let rpc: JsonRpc | undefined;
	try {
		if (signal.aborted) throw new Error("Sign-in canceled.");
		if (!isCodex) {
			child.stdout.resume();
			await new Promise<void>((resolve, reject) => {
				child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error("Claude sign-in did not complete.")));
			}); return;
		}
		rpc = new JsonRpc(child.stdout, child.stdin);
		child.on("error", error => rpc?.close(error)); child.on("exit", () => rpc?.close());
		await rpc.request("initialize", { clientInfo: { name: "phaseo_desktop", version: "0.1.0" }, capabilities: {} }); rpc.notify("initialized");
		let resolveLogin: () => void = () => {};
		let rejectLogin: (error: Error) => void = () => {};
		const completed = new Promise<void>((resolve, reject) => { resolveLogin = resolve; rejectLogin = reject; });
		rpc.onClose = rejectLogin;
		// Register before launching OAuth; completion may arrive immediately.
		rpc.onNotification = (method, params) => {
			if (method !== "account/login/completed") return;
			const result = params as { success: boolean };
			if (result.success) resolveLogin(); else rejectLogin(new Error("OpenAI sign-in did not complete."));
		};
		child.once("exit", () => rejectLogin(new Error("Sign-in stopped before completion.")));
		// Attach rejection handling before any request can fail.
		void completed.catch(() => {});
		const login = await rpc.request<{ authUrl: string }>("account/login/start", { type: "chatgpt" });
		if (!isNativeAuthUrl(login.authUrl)) throw new Error("The provider returned an unsupported sign-in URL.");
		await openUrl(login.authUrl); await completed;
	} finally { clearTimeout(deadline); signal.removeEventListener("abort", cancel); rpc?.close(); child.kill(); }
}
