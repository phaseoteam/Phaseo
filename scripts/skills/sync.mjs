#!/usr/bin/env node
// Publish the public Phaseo agent skills from `.agents/skills` (the source of truth) to:
//   - apps/docs/.mintlify/skills, where Mintlify serves them at /.well-known/agent-skills, lists them as Docs MCP
//     resources, and lets `npx skills add https://phaseo.app/docs` install them (phaseoteam/skills mirrors this copy);
//   - apps/mcp/plugin/phaseo/skills, bundled in the Phaseo plugin for Codex, ChatGPT and Claude Code.
//
// Usage: node scripts/skills/sync.mjs          copy the skills
//        node scripts/skills/sync.mjs --check  fail if a published copy is out of date
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_ONLY_SKILLS, PUBLIC_SKILLS } from "./public-skills.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(repoRoot, ".agents/skills");

// Skill files link to each other with relative paths. On the docs site those resolve as docs pages (and fail
// `mint broken-links`), so the docs copy links to the files in the public repository instead.
const RAW_SKILLS = "https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills";
function linkFilesToRepository(skill, file, content) {
	const url = (target) => `${RAW_SKILLS}/${skill}/${posix.normalize(posix.join(posix.dirname(file), target))}`;
	const linked = content.replace(/\]\((?![a-z]+:|[#/])([\w./-]+\.md)\)/gi, (_, target) => `](${url(target)})`);
	if (file !== "SKILL.md") return linked;
	return linked.replace(/(?<!\[)`references\/([\w.-]+)`/g, (_, target) => `[\`references/${target}\`](${url(`references/${target}`)})`);
}

const TARGETS = [
	{ name: "docs", root: join(repoRoot, "apps/docs/.mintlify/skills"), rewriteMarkdown: linkFilesToRepository, keep: [] },
	{ name: "plugin", root: join(repoRoot, "apps/mcp/plugin/phaseo/skills"), rewriteMarkdown: null, keep: PLUGIN_ONLY_SKILLS },
];

// Every file in the skill except `evals/`, which holds test prompts rather than instructions.
function publishedFiles(skillDir) {
	const files = [];
	const walk = (dir) => {
		for (const name of readdirSync(dir).sort()) {
			const path = join(dir, name);
			const file = relative(skillDir, path).replaceAll("\\", "/");
			if (statSync(path).isDirectory()) {
				if (file !== "evals") walk(path);
			} else files.push(file);
		}
	};
	walk(skillDir);
	return files;
}

function expected(target) {
	const result = new Map();
	for (const skill of PUBLIC_SKILLS) {
		const skillDir = join(sourceRoot, skill);
		const skillFile = join(skillDir, "SKILL.md");
		if (!existsSync(skillFile)) throw new Error(`Missing ${relative(repoRoot, skillFile)}`);
		const frontmatter = readFileSync(skillFile, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
		if (!new RegExp(`^name:\\s*["']?${skill}["']?\\s*$`, "m").test(frontmatter) || !/^description:/m.test(frontmatter)) {
			throw new Error(`${skill}/SKILL.md needs frontmatter with name: ${skill} and a description`);
		}
		for (const file of publishedFiles(skillDir)) {
			const content = readFileSync(join(skillDir, file), "utf8");
			const rewrite = file.endsWith(".md") && target.rewriteMarkdown;
			result.set(`${skill}/${file}`, rewrite ? target.rewriteMarkdown(skill, file, content) : content);
		}
	}
	return result;
}

function published(target) {
	const result = new Map();
	if (!existsSync(target.root)) return result;
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			const file = relative(target.root, path).replaceAll("\\", "/");
			if (target.keep.includes(file.split("/")[0])) continue;
			if (statSync(path).isDirectory()) walk(path);
			else result.set(file, readFileSync(path, "utf8"));
		}
	};
	walk(target.root);
	return result;
}

const check = process.argv.includes("--check");
let failed = false;
for (const target of TARGETS) {
	const want = expected(target);
	const where = relative(repoRoot, target.root).replaceAll("\\", "/");
	if (check) {
		const have = published(target);
		const problems = [];
		for (const [file, content] of want) {
			if (!have.has(file)) problems.push(`missing ${file}`);
			else if (have.get(file) !== content) problems.push(`out of date ${file}`);
		}
		for (const file of have.keys()) if (!want.has(file)) problems.push(`not a public skill file ${file}`);
		if (problems.length) {
			failed = true;
			process.stderr.write(`${where} differs from .agents/skills:\n  ${problems.join("\n  ")}\n`);
		} else {
			process.stdout.write(`${where} matches .agents/skills: ${PUBLIC_SKILLS.length} skills, ${want.size} files.\n`);
		}
	} else {
		mkdirSync(target.root, { recursive: true });
		for (const name of readdirSync(target.root)) {
			if (!target.keep.includes(name)) rmSync(join(target.root, name), { recursive: true, force: true });
		}
		for (const [file, content] of want) {
			mkdirSync(dirname(join(target.root, file)), { recursive: true });
			writeFileSync(join(target.root, file), content);
		}
		process.stdout.write(`Published ${PUBLIC_SKILLS.length} skills (${want.size} files) to ${where}.\n`);
	}
}
if (failed) {
	process.stderr.write("Run: pnpm skills:sync\n");
	process.exit(1);
}
