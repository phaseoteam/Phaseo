import { StringDecoder } from "node:string_decoder";
import type { Account, AccountStatus, UsageWindow } from "../shared/workspace";
import { JsonRpc } from "./jsonRpc";
import { spawnNative } from "./nativeProcess";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
import { claudeUsage } from "./claudeNativeActions";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const label = (value: unknown) => typeof value === "string" && value.length <= 500 ? value : undefined;
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const window = (value: unknown): UsageWindow | null => { const input = object(value); return typeof input.usedPercent === "number" && Number.isFinite(input.usedPercent) ? { usedPercent: Math.min(100, Math.max(0, input.usedPercent)), windowDurationMins: positive(input.windowDurationMins), resetsAt: positive(input.resetsAt) } : null; };

export function codexUsage(value: unknown): Pick<AccountStatus, "usage" | "ordinaryUsageAllowed"> {
	const input = object(value); const buckets = object(input.rateLimitsByLimitId);
	const entries = Object.keys(buckets).length ? Object.entries(buckets) : input.rateLimits ? [["codex", input.rateLimits] as const] : [];
	return { ordinaryUsageAllowed: typeof input.ordinaryUsageAllowed === "boolean" ? input.ordinaryUsageAllowed : null, usage: entries.slice(0, 100).map(([id, value]) => { const bucket = object(value); return { id, name: label(bucket.limitName) ?? label(bucket.limitId) ?? id, primary: window(bucket.primary), secondary: window(bucket.secondary), spendControlReached: typeof bucket.spendControlReached === "boolean" ? bucket.spendControlReached : null }; }) };
}

/** Plan ids as people know them: "pro" is ChatGPT Pro for Codex and Claude Pro for Claude Code. */
const planNames: Record<"codex" | "claude", Record<string, string>> = {
	codex: { free: "ChatGPT Free", go: "ChatGPT Go", plus: "ChatGPT Plus", pro: "ChatGPT Pro", team: "ChatGPT Team", business: "ChatGPT Business", enterprise: "ChatGPT Enterprise", edu: "ChatGPT Edu" },
	claude: { pro: "Claude Pro", max: "Claude Max", team: "Claude Team", enterprise: "Claude Enterprise" },
};
export const planName = (harness: "codex" | "claude", plan: string | undefined) => plan ? planNames[harness][plan.toLowerCase()] ?? plan : undefined;

export async function nativeAccountStatus(harness: "codex" | "claude", cwd: string, account?: Account, signal: AbortSignal = AbortSignal.timeout(30000)): Promise<AccountStatus> {
	const codex = harness === "codex";
	const environment = nativeAccountEnvironment(account);
	const child = await spawnNative(harness, codex ? ["app-server", "--stdio"] : ["auth", "status"], cwd, codex ? "@openai/codex/bin/codex.js" : undefined, environment);
	child.stderr.resume(); let rpc: JsonRpc | undefined; let rejectStatus: ((error: Error) => void) | undefined;
	const abort = () => { const error = new Error("Account status check cancelled."); rpc?.close(error); rejectStatus?.(error); child.kill(); };
	signal.addEventListener("abort", abort, { once: true });
	try {
		if (signal.aborted) throw new Error("Account status check cancelled.");
		if (!codex) {
			const result = await new Promise<unknown>((resolve, reject) => {
				rejectStatus = reject;
				const decoder = new StringDecoder("utf8"); let output = ""; let size = 0;
				child.stdout.on("data", chunk => { size += Buffer.byteLength(chunk); if (size > 64 * 1024) { reject(new Error("Claude returned an oversized account status.")); child.kill(); return; } output += decoder.write(chunk); });
				child.once("error", () => reject(new Error("Claude account status failed.")));
				child.once("exit", code => { try { if (signal.aborted || (code !== 0 && code !== 1)) throw new Error("Claude account status did not complete."); resolve(JSON.parse(output + decoder.end())); } catch { reject(new Error("Claude returned an invalid account status.")); } });
			});
			const status = object(result); if (typeof status.loggedIn !== "boolean") throw new Error("Claude returned an invalid account status.");
			const claudeStatus: AccountStatus = { checkedAt: new Date().toISOString(), authenticated: status.loggedIn, method: label(status.authMethod), identity: label(status.email), plan: planName("claude", label(status.subscriptionType)) };
			// Subscription logins report their limit windows; API keys and cloud providers say they have none.
			if (status.loggedIn) {
				try { const usage = await claudeUsage(cwd, signal, account); Object.assign(claudeStatus, usage, { plan: claudeStatus.plan ?? planName("claude", usage.plan) }); }
				catch { claudeStatus.usageError = "Claude Code did not provide usage limits."; }
			}
			return claudeStatus;
		}
		rpc = new JsonRpc(child.stdout, child.stdin); child.once("error", () => rpc?.close(new Error("Codex account status failed."))); child.once("exit", () => rpc?.close());
		await rpc.request("initialize", { clientInfo: { name: "phaseo_desktop", title: "Phaseo", version: "0.1.0" }, capabilities: { experimentalApi: true } }); rpc.notify("initialized");
		const result = object(await rpc.request("account/read", { refreshToken: false }));
		if (!Object.hasOwn(result, "account")) throw new Error("Codex returned an invalid account status.");
		const identity = object(result.account); const status: AccountStatus = { checkedAt: new Date().toISOString(), authenticated: result.account === null ? result.requiresOpenaiAuth === false ? null : false : true, method: label(identity.type), identity: label(identity.email), plan: planName("codex", label(identity.planType)) };
		if (result.account !== null && !["apiKey", "chatgpt", "amazonBedrock"].includes(String(identity.type))) throw new Error("Codex returned an invalid account identity.");
		if (identity.type === "chatgpt") {
			try { Object.assign(status, codexUsage(await rpc.request("account/rateLimits/read", { excludeResetCreditDetails: true, supportsLunaReserve: false }))); }
			catch { status.usageError = "Codex did not provide usage limits."; }
		}
		return status;
	} finally { signal.removeEventListener("abort", abort); rpc?.close(); child.kill(); }
}
