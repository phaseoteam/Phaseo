import { spawn } from "node:child_process";
import type { Account } from "../shared/workspace";
import { resolveGrokCommand } from "./grokLaunch";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

export async function grokSignIn(account: Account, signal: AbortSignal): Promise<void> {
	if (account.harness !== "grok" || account.kind !== "native" || !account.configDirectory) throw new Error("Choose a native Grok profile.");
	if (signal.aborted) throw new Error("Sign-in cancelled.");
	const command = await resolveGrokCommand();
	if (signal.aborted) throw new Error("Sign-in cancelled.");
	// The native CLI owns the OAuth browser and credential persistence. Never
	// capture authentication output in a conversation or infer success from it.
	const child = spawn(command.executable, [...command.prefix, "--no-auto-update", "login", "--oauth"], { cwd: account.configDirectory, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...nativeAccountEnvironment(account) } });
	child.stdout.resume(); child.stderr.resume();
	let rejectLogin: ((error: Error) => void) | undefined;
	const cancel = () => { rejectLogin?.(new Error("Sign-in cancelled.")); child.kill(); };
	signal.addEventListener("abort", cancel, { once: true });
	const deadline = setTimeout(() => { rejectLogin?.(new Error("Grok sign-in timed out.")); child.kill(); }, 10 * 60 * 1000);
	try {
		await new Promise<void>((resolve, reject) => {
			rejectLogin = reject;
			child.once("error", () => reject(new Error("Grok sign-in could not start.")));
			child.once("exit", code => code === 0 && !signal.aborted ? resolve() : reject(new Error("Grok sign-in did not complete.")));
			if (signal.aborted) cancel();
		});
	} finally { clearTimeout(deadline); signal.removeEventListener("abort", cancel); child.kill(); }
}
