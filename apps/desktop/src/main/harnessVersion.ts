import { execFile } from "node:child_process";

/** Probe the resolved launch target without a shell, login or model request. */
export async function harnessVersion(command: { executable: string; prefix: string[] }, cwd: string): Promise<string> {
	const environment: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
	delete environment.NODE_OPTIONS;
	delete environment.NODE_PATH;
	const output = await new Promise<string>((resolve, reject) => {
		execFile(command.executable, [...command.prefix, "--version"], {
			cwd, env: environment, windowsHide: true, shell: false,
			timeout: 5_000, maxBuffer: 16 * 1024, encoding: "utf8",
		}, (error, stdout) => {
			if (error) reject(new Error("The harness version check failed. Check its installation and try again."));
			else resolve(stdout);
		});
	});
	// Do not render arbitrary CLI output, terminal escapes or diagnostic content.
	const version = output.trim().match(/^(?:[A-Za-z][A-Za-z0-9 ._-]{0,64}\s+)?v?(\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[A-Za-z0-9.-]{1,64})?(?:\+[A-Za-z0-9.-]{1,64})?)(?:\s+\([A-Za-z0-9 ._-]{1,64}\))?$/)?.[1];
	if (!version) throw new Error("The harness did not return a recognized version. Check its installation and try again.");
	return version;
}
