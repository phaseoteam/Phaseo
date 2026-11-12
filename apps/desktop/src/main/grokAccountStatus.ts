import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";
import type { Account, AccountStatus } from "../shared/workspace";
import { resolveGrokCommand } from "./grokLaunch";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

export function grokAuthenticationStatus(output: string): AccountStatus {
	const lines = stripVTControlCharacters(output).split(/\r?\n/).map(line => line.trim());
	const signedOut = lines.includes("You are not authenticated.");
	const signedIn = lines.filter(line => /^You are logged in with [a-zA-Z0-9.-]+\.$/.test(line));
	return { checkedAt: new Date().toISOString(), authenticated: signedOut && !signedIn.length ? false : !signedOut && signedIn.length === 1 ? true : null, ...(signedIn.length === 1 && !signedOut ? { method: signedIn[0].slice("You are logged in with ".length, -1) } : {}) };
}

export async function grokAccountStatus(cwd: string, account?: Account, signal: AbortSignal = AbortSignal.timeout(30000)): Promise<AccountStatus> {
	if (account && (account.harness !== "grok" || account.kind !== "native" || !account.configDirectory)) throw new Error("Choose a native Grok profile.");
	const command = await resolveGrokCommand();
	if (signal.aborted) throw new Error("Account status check cancelled.");
	const child = spawn(command.executable, [...command.prefix, "--no-auto-update", "models"], { cwd, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...nativeAccountEnvironment(account) } });
	child.stderr.resume();
	let rejectStatus: ((error: Error) => void) | undefined;
	const abort = () => { rejectStatus?.(new Error("Account status check cancelled.")); child.kill(); };
	signal.addEventListener("abort", abort, { once: true });
	try {
		return await new Promise<AccountStatus>((resolve, reject) => {
			rejectStatus = reject; const decoder = new StringDecoder("utf8"); let output = ""; let size = 0;
			child.stdout.on("data", chunk => { size += Buffer.byteLength(chunk); if (size > 64 * 1024) { reject(new Error("Grok returned an oversized account status.")); child.kill(); return; } output += decoder.write(chunk); });
			child.once("error", () => reject(new Error("Grok account status failed.")));
			child.once("exit", code => { if (signal.aborted || code !== 0) reject(new Error("Grok account status did not complete.")); else resolve(grokAuthenticationStatus(output + decoder.end())); });
			if (signal.aborted) abort();
		});
	} finally { signal.removeEventListener("abort", abort); child.kill(); }
}
