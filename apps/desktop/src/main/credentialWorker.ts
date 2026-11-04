import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { parentPort } from "node:worker_threads";

export type CredentialHelperRequest = { id: number; executable: string; args: string[]; options: ExecFileOptionsWithStringEncoding; input: string };
export type CredentialHelperResult = { failed: boolean; killed: boolean; inputFailed?: boolean; stdout: string; stderr: string };

/** Runs the credential helper process and reports how it ended; the caller decides what any of it may reveal. */
export function runCredentialHelper({ executable, args, options, input }: Omit<CredentialHelperRequest, "id">) {
	return new Promise<CredentialHelperResult>(resolve => {
		const child = execFile(executable, args, options, (error, stdout, stderr) => resolve({ failed: Boolean(error), killed: Boolean(error?.killed), stdout, stderr }));
		child.stdin?.on("error", () => resolve({ failed: true, killed: false, inputFailed: true, stdout: "", stderr: "" }));
		child.stdin?.end(input);
	});
}

// Starting a process blocks the thread that starts it, for over a second on some Windows machines, so the app's main
// thread hands the helper to this worker instead of freezing every window while a credential is read.
parentPort?.on("message", (request: CredentialHelperRequest) => {
	void runCredentialHelper(request).then(result => parentPort?.postMessage({ id: request.id, ...result }));
});
