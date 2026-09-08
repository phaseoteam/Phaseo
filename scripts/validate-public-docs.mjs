import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { load } from "js-yaml";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEXT_EXTENSIONS = new Set([".json", ".md", ".mdx", ".ts", ".tsx", ".yaml", ".yml"]);
const OPENAPI_PATH = resolve(REPOSITORY_ROOT, "apps/docs/openapi/v1/openapi.yaml");
const DOCS_CONFIG_PATH = resolve(REPOSITORY_ROOT, "apps/docs/docs.json");

const ALLOWED_ENGINEERING_DOCS = new Set([
	"apps/api/docs/database-driven-provider-adapters.md",
	"apps/api/docs/executor-capability-matrix.md",
	"apps/api/docs/gateway-performance-20260905.json",
	"apps/api/docs/gateway-performance-20260905.md",
	"apps/api/docs/params-jsonb-schema.md",
	"apps/api/docs/provider-executor-architecture.md",
	"apps/api/docs/public-documentation-policy.md",
	"apps/api/docs/catalogue-status-model.md",
	"apps/api/docs/provider-geographic-availability.md",
	"apps/api/docs/v2-data-model.md",
]);

const PUBLIC_CONTENT_ROOTS = [
	"apps/docs",
	"apps/mcp/submission",
	"apps/web/src/content",
	"apps/web/src/lib/content",
	"apps/api/docs",
];
const PUBLIC_DOCUMENT_FILES = [
	"apps/mcp/README.md",
	"apps/web-api/README.md",
	"apps/web-api/src/scim/README.md",
];
const PUBLIC_PATH_GUARD_ROOTS = [
	"apps/mcp",
	"apps/web-api",
	"packages/sdk",
];
const LOCAL_PRIVATE_DOC_ROOTS = new Set([
	resolve(REPOSITORY_ROOT, "apps/api/docs/internal"),
]);

const FORBIDDEN_CONTENT = [
	["an Internal navigation tag", /(?:^tag:\s*["']Internal["']|["']tag["']:\s*["']Internal["'])/im],
	["an Internal testing notice", /\*\*Internal testing\.\*\*/i],
	["a production service-role secret name", /\b[A-Z0-9_]*SERVICE_ROLE_KEY\b/],
	["an internal test-token name", /\b[A-Z0-9_]*INTERNAL_TEST_TOKEN\b/],
	["a key-pepper secret name", /\b[A-Z0-9_]*KEY_PEPPER(?:_ACTIVE)?\b/],
	["an internal Phaseo secret name", /\bPHASEO_[A-Z0-9_]+_SECRET\b/],
	["a workers.dev deployment address", /https?:\/\/[^\s)`"']+\.workers\.dev\b/i],
	["internal unit-economics language", /\bunit economics\b/i],
	["internal margin language", /\bgross margin\b/i],
	["internal subsidy language", /\bcross-subsid(?:y|ies|ize|ise|ized|ised)\b/i],
	["contract-dependent cost language", /\bcontract-dependent\b/i],
	["production-evidence planning language", /\bproduction evidence\b/i],
	["production Supabase topology", /\bproduction Supabase\b/i],
	["dedicated KV topology", /\bdedicated KV\b/i],
	["dedicated R2 topology", /\bdedicated R2\b/i],
	["a deployed Worker version", /\bCloudflare Worker version\b/i],
	["detailed security-finding language", /\b(?:high-severity findings|remediation update)\b/i],
];

const PROHIBITED_PUBLIC_PATHS = [
	/^apps\/docs\/v1\/api-reference\/async-lifecycle-updates\.mdx$/,
	/^apps\/docs\/v1\/api-reference\/endpoint\/realtime/,
	/^apps\/docs\/v1\/developers\/gateway-architecture\//,
	/^apps\/docs\/v1\/guides\/gateway-rollout-checklists\.mdx$/,
	/^apps\/mcp\/submission\//,
	/^apps\/web-api\/SCIM_PRODUCTION\.md$/,
	/^packages\/sdk\/[^/]*(?:AUDIT|CHECKLIST|DECK|REVIEW|ROADMAP|ROLLOUT)[^/]*\.md$/i,
];
const PREVIEW_OPENAPI_PATHS = [
	/^\/videos(?:\/|$)/,
	/^\/video\/generations(?:\/|$)/,
	/^\/batches(?:\/|$)/,
	/^\/batch(?:\/|$)/,
];

function toRepositoryPath(path) {
	return relative(REPOSITORY_ROOT, path).replaceAll("\\", "/");
}

function listFiles(directory) {
	if (!existsSync(directory)) return [];
	if (LOCAL_PRIVATE_DOC_ROOTS.has(resolve(directory))) return [];
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(path));
		else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
	}
	return files;
}

const files = [
	...PUBLIC_CONTENT_ROOTS.flatMap((root) => listFiles(resolve(REPOSITORY_ROOT, root))),
	...PUBLIC_DOCUMENT_FILES
		.map((path) => resolve(REPOSITORY_ROOT, path))
		.filter((path) => existsSync(path)),
];
const pathGuardFiles = PUBLIC_PATH_GUARD_ROOTS.flatMap((root) =>
	listFiles(resolve(REPOSITORY_ROOT, root)),
);
const errors = [];

const docsConfig = JSON.parse(readFileSync(DOCS_CONFIG_PATH, "utf8"));
// Use canonical asset names, not React export aliases that Mintlify cannot render.
const webRequire = createRequire(resolve(REPOSITORY_ROOT, "apps/web/package.json"));
const lucideRoot = resolve(webRequire.resolve("lucide-react/package.json"), "..");
const lucideIcons = new Set(readdirSync(join(lucideRoot, "dist/esm/icons"))
	.filter((file) => /\.(?:js|mjs)$/.test(file))
	.map((file) => file.replace(/\.(?:js|mjs)$/, "")));

function validateIcon(icon, location) {
	if (typeof icon !== "string" || !icon) {
		errors.push(`${location}: main sidebar pages require an icon`);
	} else if (icon.startsWith("/")) {
		if (!existsSync(resolve(REPOSITORY_ROOT, "apps/docs", icon.slice(1)))) {
			errors.push(`${location}: missing icon asset ${icon}`);
		}
	} else if (!lucideIcons.has(icon)) {
		errors.push(`${location}: ${icon} is not a canonical Lucide icon name`);
	}
}

function navigationPages(value, pages = new Set()) {
	if (Array.isArray(value)) {
		for (const child of value) navigationPages(child, pages);
	} else if (value && typeof value === "object") {
		if (value.icon) validateIcon(value.icon, `navigation ${value.group ?? value.tab ?? value.dropdown ?? "entry"}`);
		for (const [key, child] of Object.entries(value)) {
			if (key === "pages" && Array.isArray(child)) {
				for (const page of child) if (typeof page === "string") pages.add(page);
			}
			navigationPages(child, pages);
		}
	}
	return pages;
}

for (const page of navigationPages(docsConfig.navigation)) {
	const file = resolve(REPOSITORY_ROOT, "apps/docs", `${page}.mdx`);
	if (!existsSync(file)) continue;
	const frontmatter = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const metadata = frontmatter ? load(frontmatter[1]) : null;
	if (!metadata?.openapi) validateIcon(metadata?.icon, page);
}

if (docsConfig?.api?.openapi !== "openapi/v1/openapi.yaml") {
	errors.push("apps/docs/docs.json: must use the canonical SDK OpenAPI specification");
}

if (!existsSync(OPENAPI_PATH)) {
	errors.push("apps/docs/openapi/v1/openapi.yaml: canonical specification is missing");
} else {
	const openapi = load(readFileSync(OPENAPI_PATH, "utf8"));
	for (const [path, item] of Object.entries(openapi?.paths ?? {})) {
		for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "trace"]) {
			const operation = item?.[method];
			if (!operation) continue;
			if ((item["x-internal"] === true || operation["x-internal"] === true) && operation["x-excluded"] !== true) {
				errors.push(`${method.toUpperCase()} ${path}: internal operations must use x-excluded for Mintlify`);
			}
			if (PREVIEW_OPENAPI_PATHS.some((pattern) => pattern.test(path)) && operation["x-beta"] !== true) {
				errors.push(`${method.toUpperCase()} ${path}: preview operations must retain x-beta`);
			}
		}
	}
}

for (const path of new Set([...files, ...pathGuardFiles])) {
	const repositoryPath = toRepositoryPath(path);
	if (PROHIBITED_PUBLIC_PATHS.some((pattern) => pattern.test(repositoryPath))) {
		errors.push(`${repositoryPath}: documents an internal feature or operation in public source`);
	}
}

for (const path of files) {
	const repositoryPath = toRepositoryPath(path);

	if (
		repositoryPath.startsWith("apps/api/docs/") &&
		!ALLOWED_ENGINEERING_DOCS.has(repositoryPath)
	) {
		errors.push(`${repositoryPath}: is not an approved public engineering document`);
	}

	if (repositoryPath === "apps/api/docs/public-documentation-policy.md") continue;

	const content = readFileSync(path, "utf8");
	for (const [description, pattern] of FORBIDDEN_CONTENT) {
		if (pattern.test(content)) errors.push(`${repositoryPath}: contains ${description}`);
	}
}

if (errors.length > 0) {
	console.error("Public documentation safety validation failed:\n");
	for (const error of errors) console.error(`- ${error}`);
	process.exitCode = 1;
} else {
	console.log(`Public documentation safety validation passed (${files.length} files checked).`);
}
