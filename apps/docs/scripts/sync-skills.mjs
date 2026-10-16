#!/usr/bin/env node
// Publish the public Phaseo agent skills from `.agents/skills` (the source of truth) to
// `.mintlify/skills`, where Mintlify serves them at /.well-known/agent-skills, lists them as MCP
// resources, and lets `npx skills add https://phaseo.app/docs` install them.
//
// Usage: node scripts/sync-skills.mjs          copy the skills
//        node scripts/sync-skills.mjs --check  fail if the published copies are out of date
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(docsRoot, "../../.agents/skills");
const targetRoot = join(docsRoot, ".mintlify/skills");

// Skills for people building on Phaseo. Internal ones (catalogue onboarding, database changes,
// release notes, generic helpers) stay out.
const PUBLIC_SKILLS = [
	"phaseo-gateway",
	"phaseo-sdk-typescript",
	"phaseo-sdk-python",
	"phaseo-agent-sdk-typescript",
	"openrouter-to-phaseo-migration",
	"phaseo-routing-presets",
	"phaseo-guardrails",
	"phaseo-async-webhooks",
	"phaseo-web-search-tools",
	"phaseo-response-healing",
	"phaseo-cli",
];

// SKILL.md and the reference files it links to. `agents/` holds Codex UI metadata, not instructions.
function publishedFiles(skillDir) {
	const files = ["SKILL.md"];
	const references = join(skillDir, "references");
	if (existsSync(references)) {
		for (const name of readdirSync(references).sort()) {
			if (statSync(join(references, name)).isFile()) files.push(`references/${name}`);
		}
	}
	return files;
}

// A skill's SKILL.md points at its reference files with relative paths. On the docs site those resolve as docs
// pages (and fail `mint broken-links`), so the published copy links to the files in the public repository.
const RAW_SKILLS = "https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills";
function publishSkillFile(skill, content) {
	const url = (file) => `${RAW_SKILLS}/${skill}/references/${file}`;
	return content
		.replace(/\]\(references\/([\w.-]+)\)/g, (_, file) => `](${url(file)})`)
		.replace(/(?<!\[)`references\/([\w.-]+)`/g, (_, file) => `[\`references/${file}\`](${url(file)})`);
}

function expected() {
	const result = new Map();
	for (const skill of PUBLIC_SKILLS) {
		const skillDir = join(sourceRoot, skill);
		const skillFile = join(skillDir, "SKILL.md");
		if (!existsSync(skillFile)) throw new Error(`Missing ${relative(docsRoot, skillFile)}`);
		const frontmatter = readFileSync(skillFile, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
		if (!new RegExp(`^name:\\s*["']?${skill}["']?\\s*$`, "m").test(frontmatter) || !/^description:/m.test(frontmatter)) {
			throw new Error(`${skill}/SKILL.md needs frontmatter with name: ${skill} and a description`);
		}
		for (const file of publishedFiles(skillDir)) {
			const content = readFileSync(join(skillDir, file), "utf8");
			result.set(join(skill, file), file === "SKILL.md" ? publishSkillFile(skill, content) : content);
		}
	}
	return result;
}

function published() {
	const result = new Map();
	if (!existsSync(targetRoot)) return result;
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) walk(path);
			else result.set(relative(targetRoot, path), readFileSync(path, "utf8"));
		}
	};
	walk(targetRoot);
	return result;
}

const want = expected();
if (process.argv.includes("--check")) {
	const have = published();
	const problems = [];
	for (const [file, content] of want) {
		if (!have.has(file)) problems.push(`missing ${file}`);
		else if (have.get(file) !== content) problems.push(`out of date ${file}`);
	}
	for (const file of have.keys()) if (!want.has(file)) problems.push(`not a public skill file ${file}`);
	if (problems.length) {
		process.stderr.write(`Published skills differ from .agents/skills:\n  ${problems.join("\n  ")}\nRun: pnpm --filter @phaseo/docs skills:sync\n`);
		process.exit(1);
	}
	process.stdout.write(`Published skills match .agents/skills: ${PUBLIC_SKILLS.length} skills, ${want.size} files.\n`);
} else {
	rmSync(targetRoot, { recursive: true, force: true });
	for (const [file, content] of want) {
		mkdirSync(dirname(join(targetRoot, file)), { recursive: true });
		writeFileSync(join(targetRoot, file), content);
	}
	process.stdout.write(`Published ${PUBLIC_SKILLS.length} skills (${want.size} files) to .mintlify/skills.\n`);
}
