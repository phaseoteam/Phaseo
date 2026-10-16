#!/usr/bin/env node
// Validate the agent skills in `.agents/skills` and the Phaseo plugin and marketplaces.
//
// Every skill: Agent Skills frontmatter (https://agentskills.io/specification) and working relative links.
// Public skills also need a third-person description with "Use when" and "Not for", agents/openai.yaml, at least
// three evals (one negative), reference files with a table of contents past 100 lines, and examples that use
// catalogue model IDs, the right request body for each endpoint, and no key-like strings.
//
// Usage: node scripts/skills/validate.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { PLUGIN_ONLY_SKILLS, PUBLIC_SKILLS } from "./public-skills.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = join(repoRoot, ".agents/skills");
const catalogueRoot = join(repoRoot, "packages/data/catalog/src/data");
const pluginRoot = join(repoRoot, "apps/mcp/plugin/phaseo");

const errors = [];
const warnings = [];
const rel = (path) => relative(repoRoot, path).replaceAll("\\", "/");
const error = (path, message) => errors.push(`${rel(path)}: ${message}`);
const warn = (path, message) => warnings.push(`${rel(path)}: ${message}`);

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Routers that are not catalogue models.
const ROUTER_MODELS = new Set(["phaseo/free", "phaseo/auto"]);

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (cause) {
		error(path, `invalid JSON (${cause.message})`);
		return null;
	}
}

function frontmatterOf(path) {
	const match = readFileSync(path, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!match) return null;
	try {
		return yaml.load(match[1]) ?? {};
	} catch (cause) {
		error(path, `invalid frontmatter (${cause.message})`);
		return {};
	}
}

function listFiles(dir) {
	const files = [];
	const walk = (current) => {
		for (const name of readdirSync(current)) {
			const path = join(current, name);
			if (statSync(path).isDirectory()) walk(path);
			else files.push(path);
		}
	};
	walk(dir);
	return files;
}

// Model IDs Phaseo knows: catalogue models (model_id and api_model_id) and aliases. Retired ones are kept with
// their retirement date so an example that uses one fails.
function loadCatalogue() {
	const models = new Map();
	const modelsRoot = join(catalogueRoot, "models");
	for (const org of readdirSync(modelsRoot)) {
		for (const model of readdirSync(join(modelsRoot, org))) {
			const file = join(modelsRoot, org, model, "model.json");
			if (!existsSync(file)) continue;
			const data = JSON.parse(readFileSync(file, "utf8"));
			const entry = { retirement: data.retirement_date ?? null, deprecation: data.deprecation_date ?? null };
			for (const id of [data.model_id, data.api_model_id]) if (id) models.set(id, entry);
		}
	}
	const aliasesRoot = join(catalogueRoot, "aliases");
	for (const alias of readdirSync(aliasesRoot)) {
		const file = join(aliasesRoot, alias, "alias.json");
		if (!existsSync(file)) continue;
		const data = JSON.parse(readFileSync(file, "utf8"));
		if (data.alias_slug && data.is_enabled !== false) models.set(data.alias_slug, { retirement: null, deprecation: null });
	}
	return models;
}

function codeBlocks(markdown) {
	return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]);
}

const MODEL_PATTERNS = [
	/["']model["']\s*:\s*["']([^"'\s]+)["']/g, // JSON
	/\bmodel\s*[:=]\s*["']([^"'\s]+)["']/g, // JS and Python arguments
	/--model[ =]["']?([^"'\s]+)/g, // CLI flags
];
const PLACEHOLDER = /[<>{}$@]|\.\.\.|…|^(your|my|example)[-_/]/i;

function checkExamples(path, markdown, catalogue, today) {
	for (const block of codeBlocks(markdown)) {
		for (const pattern of MODEL_PATTERNS) {
			for (const [, id] of block.matchAll(pattern)) {
				if (PLACEHOLDER.test(id) || !id.includes("/") || ROUTER_MODELS.has(id)) continue;
				const model = catalogue.get(id);
				if (!model) error(path, `example model "${id}" is not in the catalogue (packages/data/catalog/src/data)`);
				else if (model.retirement && model.retirement.slice(0, 10) <= today) error(path, `example model "${id}" retired on ${model.retirement.slice(0, 10)}`);
				else if (model.deprecation && model.deprecation.slice(0, 10) <= today) warn(path, `example model "${id}" is deprecated`);
			}
		}
		// Responses API bodies take `input`; chat completions and messages take `messages`.
		const responses = /\/v1\/responses\b|\bresponses\.create\(/.test(block);
		const chat = /\/v1\/(chat\/completions|messages)\b|\bchat\.completions\.create\(|\bmessages\.create\(/.test(block);
		if (responses && !chat && /["']?messages["']?\s*[:=]\s*\[/.test(block) && !/["']?input["']?\s*[:=]/.test(block)) {
			error(path, "a /v1/responses example sends `messages`; the Responses API takes `input`");
		}
		if (chat && !responses && /["']?input["']?\s*[:=]\s*["'[]/.test(block) && !/["']?messages["']?\s*[:=]/.test(block)) {
			error(path, "a chat completions or messages example sends `input`; those endpoints take `messages`");
		}
	}
	for (const [secret] of markdown.matchAll(/\b(sk-[A-Za-z0-9_-]{20,}|Bearer\s+(?!\$|<|\{)[A-Za-z0-9_.-]{30,})/g)) {
		error(path, `looks like a real API key: ${secret.slice(0, 12)}…`);
	}
}

// Published skills are installed one by one, so their links must stay inside the skill.
function checkLinks(path, markdown, skillDir, isPublic) {
	for (const [, target] of markdown.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
		if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
		const file = resolve(dirname(path), target);
		if (!existsSync(file)) error(path, `broken link ${target}`);
		else if (isPublic && !file.startsWith(skillDir)) error(path, `link ${target} leaves the skill directory`);
	}
}

function checkOpenAiYaml(skillDir, name) {
	const path = join(skillDir, "agents/openai.yaml");
	if (!existsSync(path)) return error(path, "missing (public skills need Codex and ChatGPT metadata)");
	let data;
	try {
		data = yaml.load(readFileSync(path, "utf8")) ?? {};
	} catch (cause) {
		return error(path, `invalid YAML (${cause.message})`);
	}
	const ui = data.interface ?? {};
	if (!ui.display_name) error(path, "interface.display_name is required");
	const short = ui.short_description ?? "";
	if (short.length < 25 || short.length > 64) error(path, `interface.short_description must be 25 to 64 characters (has ${short.length})`);
	if (short.endsWith(".")) error(path, "interface.short_description should not end with a full stop");
	if (!String(ui.default_prompt ?? "").includes(`$${name}`)) error(path, `interface.default_prompt should mention $${name}`);
	if (ui.brand_color && !/^#[0-9A-Fa-f]{6}$/.test(ui.brand_color)) error(path, "interface.brand_color must be a hex colour");
	for (const icon of [ui.icon_small, ui.icon_large].filter(Boolean)) {
		if (!existsSync(join(skillDir, icon))) error(path, `icon ${icon} does not exist`);
	}
	if (data.policy && typeof data.policy.allow_implicit_invocation !== "boolean") error(path, "policy.allow_implicit_invocation must be a boolean");
	for (const tool of data.dependencies?.tools ?? []) {
		if (tool.type !== "mcp" || !tool.value || !/^https:\/\//.test(tool.url ?? "")) error(path, `dependency ${JSON.stringify(tool.value)} needs type "mcp", a value and an https url`);
	}
}

function checkEvals(skillDir) {
	const path = join(skillDir, "evals/evals.json");
	if (!existsSync(path)) return error(path, "missing (public skills need at least three evals)");
	const cases = readJson(path);
	if (!Array.isArray(cases)) return error(path, "must be an array of eval cases");
	if (cases.length < 3) error(path, `needs at least three cases (has ${cases.length})`);
	if (!cases.some((item) => item.should_trigger === false)) error(path, "needs at least one case with should_trigger: false");
	const ids = new Set();
	for (const item of cases) {
		const label = item.id ?? "(no id)";
		if (!item.id || !NAME.test(item.id)) error(path, `case ${label}: id must be kebab-case`);
		if (ids.has(item.id)) error(path, `case ${label}: duplicate id`);
		ids.add(item.id);
		if (typeof item.query !== "string" || item.query.length < 10) error(path, `case ${label}: query is required`);
		if (typeof item.should_trigger !== "boolean") error(path, `case ${label}: should_trigger must be true or false`);
		if (!Array.isArray(item.expected_behavior) || item.expected_behavior.length === 0) error(path, `case ${label}: expected_behavior needs at least one item`);
		for (const file of item.files ?? []) if (!existsSync(join(skillDir, "evals", file))) error(path, `case ${label}: fixture ${file} does not exist`);
	}
}

function checkSkill(skillDir, catalogue, today) {
	const name = skillDir.split(/[\\/]/).pop();
	const skillFile = join(skillDir, "SKILL.md");
	if (!existsSync(skillFile)) return error(skillDir, "missing SKILL.md");
	const meta = frontmatterOf(skillFile);
	if (!meta) return error(skillFile, "missing YAML frontmatter");
	if (meta.name !== name) error(skillFile, `name "${meta.name}" must match the directory "${name}"`);
	if (!NAME.test(String(meta.name)) || String(meta.name).length > 64) error(skillFile, "name must be lowercase letters, digits and single hyphens, at most 64 characters");
	const description = typeof meta.description === "string" ? meta.description.trim() : "";
	if (!description) error(skillFile, "description is required");
	if (description.length > 1024) error(skillFile, `description is ${description.length} characters (limit 1,024)`);
	if (/<[a-z/][^>]*>/i.test(description)) error(skillFile, "description must not contain XML tags");
	const body = readFileSync(skillFile, "utf8");
	if (body.split("\n").length > 500) error(skillFile, "SKILL.md must stay under 500 lines; move detail to references/");
	const isPublic = PUBLIC_SKILLS.includes(name);
	for (const file of listFiles(skillDir).filter((path) => path.endsWith(".md"))) {
		const markdown = readFileSync(file, "utf8");
		checkLinks(file, markdown, skillDir, isPublic);
		if (!isPublic) continue;
		checkExamples(file, markdown, catalogue, today);
		if (file !== skillFile && markdown.split("\n").length > 100 && !/^#+\s*(table of )?contents\b/im.test(markdown)) {
			error(file, "reference files over 100 lines need a table of contents");
		}
	}
	if (!isPublic) return;
	if (description.length > 600) error(skillFile, `public skill descriptions stay within 600 characters (has ${description.length})`);
	if (!/^[A-Z][a-z]+s\b/.test(description)) error(skillFile, 'description should start in the third person ("Builds…", "Migrates…")');
	if (!/\bUse when\b/.test(description)) error(skillFile, 'description needs a "Use when …" clause');
	if (!/\bNot for\b/.test(description)) error(skillFile, 'description needs a "Not for …" boundary');
	checkOpenAiYaml(skillDir, name);
	checkEvals(skillDir);
}

// Codex, ChatGPT and Claude Code read different manifests for the same plugin; keep them in step.
function checkPlugin() {
	const manifests = {
		portable: join(pluginRoot, "plugin.json"),
		codex: join(pluginRoot, ".codex-plugin/plugin.json"),
		claude: join(pluginRoot, ".claude-plugin/plugin.json"),
	};
	const data = {};
	for (const [key, path] of Object.entries(manifests)) {
		if (!existsSync(path)) error(path, "missing plugin manifest");
		else data[key] = readJson(path);
	}
	const versions = new Set(Object.values(data).filter(Boolean).map((manifest) => manifest.version));
	if (versions.size > 1) error(pluginRoot, `plugin manifests disagree on version: ${[...versions].join(", ")}`);
	for (const [key, manifest] of Object.entries(data)) {
		if (!manifest) continue;
		if (manifest.name !== "phaseo") error(manifests[key], 'name must be "phaseo"');
		const paths = [];
		const collect = (value) => {
			if (typeof value === "string" && value.startsWith("./")) paths.push(value);
			else if (Array.isArray(value)) value.forEach(collect);
			else if (value && typeof value === "object") Object.values(value).forEach(collect);
		};
		collect(manifest);
		for (const path of paths) if (!existsSync(join(pluginRoot, path))) error(manifests[key], `path ${path} does not exist`);
	}
	for (const file of [".mcp.json", "mcp.json"]) {
		const config = readJson(join(pluginRoot, file));
		for (const [server, entry] of Object.entries(config?.mcpServers ?? {})) {
			if (!/^https:\/\//.test(entry.url ?? "")) error(join(pluginRoot, file), `server ${server} needs an https url`);
		}
	}
	const skills = readdirSync(join(pluginRoot, "skills"));
	for (const skill of [...PUBLIC_SKILLS, ...PLUGIN_ONLY_SKILLS]) {
		if (!skills.includes(skill)) error(join(pluginRoot, "skills"), `missing skill ${skill} (run pnpm skills:sync)`);
	}
	for (const skill of PLUGIN_ONLY_SKILLS) {
		const path = join(pluginRoot, "skills", skill, "SKILL.md");
		const meta = existsSync(path) ? frontmatterOf(path) : null;
		if (meta?.name !== skill) error(path, `name must be "${skill}"`);
	}
}

function checkMarketplaces() {
	const marketplaces = [join(repoRoot, ".claude-plugin/marketplace.json"), join(repoRoot, ".agents/plugins/marketplace.json")];
	for (const path of marketplaces) {
		if (!existsSync(path)) {
			error(path, "missing marketplace");
			continue;
		}
		const data = readJson(path);
		if (!data) continue;
		if (!NAME.test(data.name ?? "")) error(path, "name must be kebab-case");
		for (const plugin of data.plugins ?? []) {
			const source = typeof plugin.source === "string" ? plugin.source : plugin.source?.path;
			if (!source?.startsWith("./")) error(path, `plugin ${plugin.name}: source must be a ./ path`);
			else if (!existsSync(join(repoRoot, source, "skills"))) error(path, `plugin ${plugin.name}: ${source} is not a plugin directory`);
		}
	}
}

const catalogue = loadCatalogue();
const today = new Date().toISOString().slice(0, 10);
const skillDirs = readdirSync(skillsRoot)
	.map((name) => join(skillsRoot, name))
	.filter((path) => statSync(path).isDirectory());
for (const skill of PUBLIC_SKILLS) if (!existsSync(join(skillsRoot, skill))) error(join(skillsRoot, skill), "public skill directory is missing");
for (const skillDir of skillDirs) checkSkill(skillDir, catalogue, today);
for (const skill of PLUGIN_ONLY_SKILLS) checkSkill(join(pluginRoot, "skills", skill), catalogue, today);
checkPlugin();
checkMarketplaces();

for (const message of warnings) process.stdout.write(`warning ${message}\n`);
if (errors.length) {
	process.stderr.write(`${errors.map((message) => `error ${message}`).join("\n")}\n${errors.length} skill or plugin problem(s).\n`);
	process.exit(1);
}
process.stdout.write(`Validated ${skillDirs.length} skills (${PUBLIC_SKILLS.length} public), the plugin and the marketplaces.\n`);
