const { spawnSync } = require("node:child_process");

const entries = [
	{ label: "ts", command: "pnpm", args: ["--filter", "@ai-stats/sdk", "smoke:chat"] },
	{ label: "py", command: "pnpm", args: ["--filter", "@ai-stats/py-sdk", "smoke:chat"] },
	{ label: "go", command: "pnpm", args: ["--filter", "@ai-stats/go-sdk", "smoke:chat"] },
	{ label: "ruby", command: "pnpm", args: ["--filter", "@ai-stats/ruby-sdk", "smoke:chat"] },
	{ label: "php", command: "pnpm", args: ["--filter", "@ai-stats/php-sdk", "smoke:chat"] },
	{ label: "csharp", command: "pnpm", args: ["--filter", "@ai-stats/csharp-sdk", "smoke:chat"] },
	{ label: "java", command: "pnpm", args: ["--filter", "@ai-stats/java-sdk", "smoke:chat"] },
	{ label: "rust", command: "pnpm", args: ["--filter", "@ai-stats/rust-sdk", "smoke:chat"] },
	{ label: "cpp", command: "pnpm", args: ["--filter", "@ai-stats/cpp-sdk", "smoke:chat"] }
];

const results = [];

for (const entry of entries) {
	const result = spawnSync(entry.command, entry.args, {
		stdio: "pipe",
		encoding: "utf8"
	});
	const errorMessage = result.error ? result.error.message : "";
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	results.push({
		label: entry.label,
		status: result.status === 0 ? "pass" : "fail",
		code: result.status,
		output: [output, errorMessage].filter(Boolean).join("\n").trim()
	});
}

const longestLabel = Math.max(...results.map((result) => result.label.length), 4);
const header = `| ${pad("sdk", longestLabel)} | status | code |`;
const divider = `|-${"-".repeat(longestLabel)}-|--------|------|`;
console.log(header);
console.log(divider);
for (const result of results) {
	console.log(
		`| ${pad(result.label, longestLabel)} | ${pad(result.status, 6)} | ${pad(
			result.code === null ? "?" : String(result.code),
			4
		)} |`
	);
}

for (const result of results) {
	if (result.status === "fail") {
		console.log(`\n[${result.label}] output:\n${result.output || "(no output)"}`);
	}
}

function pad(value, length) {
	if (value.length >= length) return value;
	return value + " ".repeat(length - value.length);
}
