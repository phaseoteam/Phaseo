import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "supabase");
const migrations = join(source, "migrations");
const baseline = join(source, "baseline");
const mode = process.argv[2];
if (!["bootstrap", "check", "sync", "smoke"].includes(mode)) throw new Error("Expected bootstrap, check, sync, or smoke");
const files = readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort();
const hash = (name) => createHash("sha256").update(readFileSync(join(migrations, name), "utf8").replaceAll("\r\n", "\n")).digest("hex");
const workspace = mkdtempSync(join(tmpdir(), "phaseo-schema-"));
const projectId = `phaseo-schema-${workspace.split(/[\\/]/).at(-1)}`;
const temporary = join(workspace, "supabase");
mkdirSync(join(temporary, "migrations"), { recursive: true });
writeFileSync(join(temporary, "config.toml"), readFileSync(join(source, "config.toml"), "utf8")
	.replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`));
cpSync(join(source, "schemas"), join(temporary, "schemas"), { recursive: true });

if (mode !== "bootstrap") {
	if (!existsSync(join(baseline, "history.sha256"))) throw new Error("Missing verified replay baseline; bootstrap it in isolated CI first");
	const history = readFileSync(join(baseline, "history.sha256"), "utf8").trim().split(/\r?\n/).map((line) => line.split("  "));
	for (const [expected, name] of history) {
		if (!files.includes(name) || hash(name) !== expected) throw new Error(`Historical migration changed: ${name}`);
	}
	const cutoff = history.at(-1)[1].split("_")[0];
	const historical = new Set(history.map(([, name]) => name));
	for (const name of files.filter((name) => !historical.has(name))) {
		if (name.split("_")[0] <= cutoff) throw new Error(`Migration predates replay baseline: ${name}`);
		cpSync(join(migrations, name), join(temporary, "migrations", name));
	}
	cpSync(join(baseline, "schema.sql"), join(temporary, "migrations", `${cutoff}_schema_baseline.sql`));
}

const before = new Set(readdirSync(join(temporary, "migrations")));
const run = (args) => {
	const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "supabase@2.119.0", ...args], {
		cwd: workspace, stdio: "inherit", shell: process.platform === "win32",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		console.error(`Isolated review workspace: ${workspace}`);
		throw new Error(`Supabase command failed (${result.status ?? 1})`);
	}
};
if (mode === "smoke") {
	// psql accepts rollback-only multi-statement tests; CLI db query uses prepared statements.
	const query = (sql) => {
		const result = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
			input: sql, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"],
		});
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(`SQL smoke test failed (${result.status ?? 1})`);
	};
	try {
		run(["db", "start"]);
		run(["migration", "up", "--local"]);
		for (const file of ["declarative_schema.sql", "stealth_catalogue_security_smoke.sql", "workspace_user_usage_security_smoke.sql", "key_ip_allowlist.sql"]) {
			query(readFileSync(join(source, "tests", file), "utf8"));
		}
		writeFileSync(join(temporary, "schemas", "public", "tables", "phaseo_declarative_smoke.sql"),
			"CREATE TABLE public.phaseo_declarative_smoke (id bigint PRIMARY KEY);\nALTER TABLE public.phaseo_declarative_smoke ENABLE ROW LEVEL SECURITY;\n");
		run(["db", "schema", "declarative", "sync", "--no-apply", "--strict-coverage", "-f", "trial_incremental_change"]);
		run(["migration", "up", "--local"]);
		query("DO $$ BEGIN ASSERT to_regclass('public.phaseo_declarative_smoke') IS NOT NULL; ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.phaseo_declarative_smoke'::regclass); END $$;");
		console.log("Replay, SQL smoke tests, and a generated incremental migration passed");
	} finally {
		run(["stop", "--no-backup"]);
	}
	process.exit(0);
}
run(["db", "schema", "declarative", "sync", "--no-apply", "--no-cache", "--strict-coverage", "-f", mode === "bootstrap" ? "schema_baseline" : "declarative_change", ...(mode === "sync" ? process.argv.slice(3) : [])]);
const generated = readdirSync(join(temporary, "migrations")).filter((name) => name.endsWith(".sql") && !before.has(name)).sort();
if (mode === "bootstrap") {
	if (!generated.length) throw new Error("Empty baseline generated");
	const candidate = join(source, ".temp", "baseline-candidate");
	mkdirSync(candidate, { recursive: true });
	// Keep every ordered unit separate if the engine splits transaction boundaries.
	if (generated.length !== 1) throw new Error("Baseline spans multiple transaction units; inspect and preserve them before adoption");
	cpSync(join(temporary, "migrations", generated[0]), join(candidate, "schema.sql"));
	writeFileSync(join(candidate, "history.sha256"), files.map((name) => `${hash(name)}  ${name}`).join("\n") + "\n");
	console.log(`Baseline candidate saved to ${candidate}; review and freeze before verification`);
} else if (mode === "check") {
	if (generated.length) throw new Error(`Schema differs from baseline plus forward migrations: ${generated.join(", ")}. Inspect ${workspace}`);
	console.log("Declarative schemas match frozen baseline plus forward migrations; no SQL was applied");
} else {
	for (const name of generated) {
		if (existsSync(join(migrations, name))) throw new Error(`Migration already exists: ${name}`);
		cpSync(join(temporary, "migrations", name), join(migrations, name));
	}
	console.log(`Generated ${generated.length} forward migration(s); review before deployment`);
}
