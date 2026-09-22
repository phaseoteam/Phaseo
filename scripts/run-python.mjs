import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2);
const separatorIndex = rawArgs.indexOf("--");
const launcherArgs = separatorIndex === -1 ? [] : rawArgs.slice(0, separatorIndex);
const pythonArgs = separatorIndex === -1 ? rawArgs : rawArgs.slice(separatorIndex + 1);
const ensureIndex = launcherArgs.indexOf("--ensure");
const requiredModule = ensureIndex === -1 ? null : launcherArgs[ensureIndex + 1]?.trim();
const uvRequirements = [];
for (let index = 0; index < launcherArgs.length; index += 1) {
	if (launcherArgs[index] !== "--with") continue;
	const requirement = launcherArgs[index + 1]?.trim();
	if (!requirement) {
		console.error("--with requires a Python package requirement.");
		process.exit(2);
	}
	uvRequirements.push(requirement);
}

if (ensureIndex !== -1 && !requiredModule) {
	console.error("--ensure requires a Python module name.");
	process.exit(2);
}
if (pythonArgs.length === 0) {
	console.error("Usage: node scripts/run-python.mjs [--ensure module] -- <python arguments>");
	process.exit(2);
}

const configuredPython = String(process.env.PHASEO_PYTHON ?? "").trim();
const uvProbe = spawnSync("uv", ["--version"], { stdio: "ignore" });
const hasUv = !uvProbe.error && uvProbe.status === 0;
const runWithUv = () => {
	const requirements = [requiredModule, ...uvRequirements].filter(Boolean);
	const withArgs = requirements.flatMap((requirement) => ["--with", requirement]);
	const result = spawnSync("uv", ["run", "--no-project", ...withArgs, "python", ...pythonArgs], {
		stdio: "inherit",
	});
	if (result.error) console.error(result.error.message);
	process.exit(result.status ?? 1);
};

// `--with` requests an isolated environment. Prefer uv when it is available so
// an otherwise usable local interpreter cannot silently ignore those packages.
if (uvRequirements.length > 0 && hasUv) {
	runWithUv();
}

const candidates = configuredPython
	? [{ command: configuredPython, prefix: [] }]
	: process.platform === "win32"
		? [
			{ command: "py", prefix: ["-3"] },
			{ command: "python", prefix: [] },
			{ command: "python3", prefix: [] },
		]
		: [
			{ command: "python3", prefix: [] },
			{ command: "python", prefix: [] },
		];

let interpreterFound = false;
for (const candidate of candidates) {
	const probe = spawnSync(candidate.command, [...candidate.prefix, "--version"], { stdio: "ignore" });
	if (probe.error || probe.status !== 0) continue;
	interpreterFound = true;
	if (requiredModule) {
		const moduleProbe = spawnSync(candidate.command, [
			...candidate.prefix,
			"-c",
			"import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(sys.argv[1]) else 1)",
			requiredModule,
		], { stdio: "ignore" });
		if (moduleProbe.error || moduleProbe.status !== 0) continue;
	}
	const result = spawnSync(candidate.command, [...candidate.prefix, ...pythonArgs], { stdio: "inherit" });
	if (result.error) {
		console.error(result.error.message);
		process.exit(1);
	}
	process.exit(result.status ?? 1);
}

if (requiredModule && hasUv) {
	runWithUv();
}

const requirement = requiredModule ? ` with the '${requiredModule}' module` : "";
console.error(`No usable Python 3 interpreter${requirement} was found.${interpreterFound ? " Install the required module or uv." : " Set PHASEO_PYTHON or install Python 3."}`);
process.exit(1);
