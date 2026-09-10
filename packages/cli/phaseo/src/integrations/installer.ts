import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { detectInstalledPackageManager, type PackageManager } from "../installation.js";
import { isCommandAvailable } from "./files.js";
import type { IntegrationId } from "./types.js";

export type RunnerInstallId = "cline" | "kilo" | "omp" | "muse";

export const PRIMARY_HARNESSES = ["codex", "claude-code", "hermes", "opencode", "pi", "prime-agent", "deepseek-harness", "openclaw"] as const satisfies readonly IntegrationId[];

const PACKAGES: Partial<Record<(typeof PRIMARY_HARNESSES)[number], string>> = {
	codex: "@openai/codex",
	"claude-code": "@anthropic-ai/claude-code",
	opencode: "opencode-ai",
	"deepseek-harness": "@deepseek-ai/dsh",
	pi: "@earendil-works/pi-coding-agent",
	openclaw: "openclaw@latest",
};

const COMMANDS: Record<(typeof PRIMARY_HARNESSES)[number], string[]> = {
	codex: ["codex", "codex.exe", "codex.cmd", "codex.ps1"],
	"claude-code": ["claude", "claude.exe", "claude.cmd", "claude.ps1"],
	opencode: ["opencode", "opencode.exe", "opencode.cmd", "opencode.ps1"],
	"deepseek-harness": ["dsh", "dsh.exe", "dsh.cmd", "dsh.ps1"],
	pi: ["pi", "pi.exe", "pi.cmd", "pi.ps1"],
	"prime-agent": ["prime-agent", "prime-agent.exe", "prime-agent.cmd"],
	hermes: ["hermes", "hermes.exe", "hermes.cmd"],
	openclaw: ["openclaw", "openclaw.exe", "openclaw.cmd"],
};

const RUNNER_PACKAGES: Record<RunnerInstallId, string> = {
	cline: "cline",
	kilo: "@kilocode/cli",
	omp: "@oh-my-pi/pi-coding-agent",
	muse: "",
};

const RUNNER_COMMANDS: Record<RunnerInstallId, string[]> = {
	cline: ["cline", "cline.exe", "cline.cmd", "cline.ps1"],
	kilo: ["kilo", "kilo.exe", "kilo.cmd", "kilo.ps1"],
	omp: ["omp", "omp.exe", "omp.cmd", "omp.ps1"],
	muse: ["muse", "muse.exe", "muse.cmd", "muse.ps1"],
};

export type InstallInvocation = { command: string; args: string[]; executable?: string };

export function isPrimaryHarness(value: IntegrationId): value is (typeof PRIMARY_HARNESSES)[number] {
	return (PRIMARY_HARNESSES as readonly IntegrationId[]).includes(value);
}

export function installInvocationFor(
	integration: (typeof PRIMARY_HARNESSES)[number],
	manager: PackageManager,
	options: { allowPackageScripts?: boolean } = {},
): InstallInvocation {
	if (integration === "prime-agent") {
		return { command: "sh", args: ["-c", "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh"] };
	}
	if (integration === "hermes") {
		return process.platform === "win32"
			? { command: "powershell.exe", args: ["-NoProfile", "-Command", "& ([scriptblock]::Create((irm https://hermes-agent.nousresearch.com/install.ps1))) -SkipSetup"] }
			: { command: "sh", args: ["-c", "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup"] };
	}
	const packageName = PACKAGES[integration];
	if (!packageName) throw new Error(`No installer is defined for ${integration}`);
	const extraArgs = integration === "pi" ? ["--ignore-scripts"] : [];
	const openClawArgs = integration === "openclaw"
		? manager === "pnpm"
			? ["--allow-build=openclaw"]
			: manager === "npm" && options.allowPackageScripts
				? ["--allow-scripts=openclaw"]
				: []
		: [];
	switch (manager) {
		case "pnpm": return { command: "pnpm", args: ["add", "-g", ...extraArgs, ...openClawArgs, packageName] };
		case "yarn": return { command: "yarn", args: ["global", "add", ...extraArgs, ...openClawArgs, packageName] };
		case "bun": return { command: "bun", args: ["install", "-g", ...extraArgs, ...openClawArgs, packageName] };
		default: return { command: "npm", args: ["install", "-g", ...extraArgs, packageName, ...openClawArgs] };
	}
}

export function runnerInstallInvocationFor(runner: RunnerInstallId, manager: PackageManager): InstallInvocation {
	if (runner === "muse") {
		return { command: "sh", args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | bash"] };
	}
	const packageName = RUNNER_PACKAGES[runner];
	switch (manager) {
		case "pnpm": return { command: "pnpm", args: ["add", "-g", packageName] };
		case "yarn": return { command: "yarn", args: ["global", "add", packageName] };
		case "bun": return { command: "bun", args: ["install", "-g", packageName] };
		default: return { command: "npm", args: ["install", "-g", packageName] };
	}
}

export function renderInstallInvocation(invocation: InstallInvocation): string {
	if (invocation.command === "sh" && invocation.args[0] === "-c") return `sh -c ${JSON.stringify(invocation.args[1])}`;
	return [invocation.command, ...invocation.args.map((value, index) => invocation.args[index - 1] === "-Command" ? JSON.stringify(value) : value)].join(" ");
}

export function acceptsInstallConfirmation(value: string): boolean {
	return /^(?:y|yes)$/i.test(value.trim());
}

export async function confirmHarnessInstall(
	name: string,
	invocation: InstallInvocation,
	options: { input?: Readable; output?: Writable } = {},
): Promise<boolean> {
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stderr;
	const prompt = createInterface({ input, output });
	try {
		const answer = await prompt.question(
			`${name} is not installed.\nInstall command: ${renderInstallInvocation(invocation)}\nInstall now? [y/N] `,
		);
		return acceptsInstallConfirmation(answer);
	} finally {
		prompt.close();
	}
}

type AvailablePackageManager = { manager: PackageManager; executable: string };

export function packageManagerCandidates(manager: PackageManager, platform: NodeJS.Platform = process.platform): string[] {
	return platform === "win32" ? [`${manager}.cmd`, `${manager}.exe`, manager] : [manager];
}

async function findPackageManagerExecutable(manager: PackageManager): Promise<string | null> {
	const candidates = packageManagerCandidates(manager);
	for (const directory of (process.env.PATH || "").split(delimiter)) {
		if (!directory) continue;
		for (const candidate of candidates) {
			const path = join(directory, candidate);
			try {
				await access(path, constants.F_OK);
				return candidate;
			} catch {}
		}
	}
	return null;
}

async function availableManager(): Promise<AvailablePackageManager> {
	const detected = detectInstalledPackageManager();
	if (detected) {
		const executable = await findPackageManagerExecutable(detected);
		if (executable) return { manager: detected, executable };
	}
	for (const manager of ["npm", "pnpm", "yarn", "bun"] as const) {
		const executable = await findPackageManagerExecutable(manager);
		if (executable) return { manager, executable };
	}
	throw new Error("A Node.js package manager is required to install coding harnesses");
}

export function packageManagerChildInvocation(
	invocation: InstallInvocation,
	platform: NodeJS.Platform = process.platform,
	commandInterpreter = process.env.ComSpec || "cmd.exe",
): { command: string; args: string[] } {
	const executable = invocation.executable ?? invocation.command;
	if (platform !== "win32" || !/\.cmd$/i.test(executable)) return { command: executable, args: invocation.args };
	const tokens = [executable, ...invocation.args];
	if (tokens.some((value) => !/^[A-Za-z0-9@._/+,:=-]+$/.test(value))) {
		throw new Error("Package-manager installation contains an unsupported Windows command token");
	}
	return {
		command: commandInterpreter,
		args: ["/d", "/s", "/c", tokens.join(" ")],
	};
}

function supportsNpmAllowScripts(version: string): boolean {
	const match = /^(\d+)\.(\d+)/.exec(version.trim());
	if (!match) return false;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	return major > 11 || (major === 11 && minor >= 16);
}

async function commandOutput(invocation: InstallInvocation): Promise<string> {
	return new Promise((resolve, reject) => {
		const childInvocation = packageManagerChildInvocation(invocation);
		const child = spawn(childInvocation.command, childInvocation.args, {
			shell: false,
			stdio: "pipe",
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (value) => { stdout += value; });
		child.stderr.on("data", (value) => { stderr += value; });
		child.once("error", reject);
		child.once("exit", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${invocation.command} exited with code ${code ?? "unknown"}`)));
	});
}

async function packageInstallInvocation(integration: (typeof PRIMARY_HARNESSES)[number]): Promise<InstallInvocation> {
	const npmExecutable = integration === "pi" ? await findPackageManagerExecutable("npm") : null;
	const available = npmExecutable
		? { manager: "npm" as const, executable: npmExecutable }
		: await availableManager();
	const allowPackageScripts = integration === "openclaw" && available.manager === "npm"
		? supportsNpmAllowScripts(await commandOutput({ command: "npm", executable: available.executable, args: ["--version"] }))
		: false;
	return { ...installInvocationFor(integration, available.manager, { allowPackageScripts }), executable: available.executable };
}

export async function harnessInstallPlan(integration: IntegrationId): Promise<InstallInvocation | null> {
	if (!isPrimaryHarness(integration) || await isCommandAvailable(COMMANDS[integration])) return null;
	if (integration === "prime-agent") {
		if (process.platform === "win32") throw new Error("Prime Agent supports macOS and Linux. Run Phaseo setup inside WSL, or use --skip-install for a separately managed installation.");
		if (!await isCommandAvailable(["sh"]) || !await isCommandAvailable(["curl"])) {
			throw new Error("Prime Agent installation requires sh and curl");
		}
		return installInvocationFor(integration, "npm");
	}
	if (integration === "hermes") {
		if (process.platform !== "win32" && (!await isCommandAvailable(["sh"]) || !await isCommandAvailable(["curl"]) || !await isCommandAvailable(["bash"]))) {
			throw new Error("Hermes Agent installation requires sh, bash, and curl");
		}
		return installInvocationFor(integration, "npm");
	}
	return packageInstallInvocation(integration);
}

export async function runnerInstallPlan(runner: RunnerInstallId): Promise<InstallInvocation | null> {
	if (await isCommandAvailable(RUNNER_COMMANDS[runner])) return null;
	if (runner === "muse") {
		if (process.platform === "win32") {
			throw new Error("Muse Code is not auto-installed by Phaseo on Windows. Install Muse Code from Meta, verify `muse --version`, then rerun with --skip-install.");
		}
		if (!await isCommandAvailable(["sh"]) || !await isCommandAvailable(["curl"])) {
			throw new Error("Muse Code installation requires sh and curl");
		}
		return runnerInstallInvocationFor(runner, "npm");
	}
	return packageInstallInvocationForRunner(runner);
}

async function packageInstallInvocationForRunner(runner: RunnerInstallId): Promise<InstallInvocation> {
	const available = await availableManager();
	return { ...runnerInstallInvocationFor(runner, available.manager), executable: available.executable };
}

export async function installHarness(invocation: InstallInvocation, options: { quiet?: boolean; capture?: boolean } = {}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const packageManagers = new Set(["npm", "pnpm", "yarn", "bun"]);
		const childInvocation = packageManagers.has(invocation.command)
			? packageManagerChildInvocation(invocation)
			: invocation;
		const child = spawn(childInvocation.command, childInvocation.args, {
			stdio: options.quiet ? "ignore" : options.capture ? "pipe" : "inherit",
			shell: false,
			windowsHide: true,
		});
		let captured = "";
		if (options.capture) {
			child.stdout?.on("data", (chunk) => { captured = `${captured}${String(chunk)}`.slice(-8000); });
			child.stderr?.on("data", (chunk) => { captured = `${captured}${String(chunk)}`.slice(-8000); });
		}
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Harness installation failed with exit code ${code ?? "unknown"}: ${renderInstallInvocation(invocation)}${captured.trim() ? `\n${captured.trim()}` : ""}`));
		});
	});
}
