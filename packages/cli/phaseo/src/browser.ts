import { spawn } from "node:child_process";
import { platform } from "node:process";

/** SSH sessions and CI have no local browser to open. */
export function prefersDeviceCodeByEnvironment(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return Boolean(
		env.SSH_CONNECTION ||
			env.SSH_CLIENT ||
			env.SSH_TTY ||
			env.CI,
	);
}

export function windowsBrowserOpenArgs(url: string): string[] {
	return ["url.dll,FileProtocolHandler", url];
}

/** Opens a URL in the default browser; false when there is none to open (SSH, CI) or it couldn't start. */
export function openUrl(url: string): boolean {
	if (prefersDeviceCodeByEnvironment()) {
		return false;
	}
	try {
		if (platform === "win32") {
			// Pass the URL as data, never through a command interpreter.
			spawn("rundll32.exe", windowsBrowserOpenArgs(url), {
				detached: true,
				stdio: "ignore",
			}).unref();
			return true;
		}
		if (platform === "darwin") {
			spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
			return true;
		}
		spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
		return true;
	} catch {
		return false;
	}
}
