import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = join(root, "supabase", "migrations");
const snapshot = () => new Map(readdirSync(migrations)
	.filter((name) => name.endsWith(".sql"))
	.map((name) => [name, readFileSync(join(migrations, name), "utf8")]));
const before = snapshot();

// Keep this version aligned with the schema commands and verification workflow.
const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [
	"--yes", "supabase@2.119.0", "db", "schema", "declarative", "sync",
	"--no-apply", "--no-cache", "--strict-coverage", "-f", "declarative_check",
], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

if (result.error) throw result.error;
const after = snapshot();
const changed = [...after.keys()].filter((name) => before.get(name) !== after.get(name));
const removed = [...before.keys()].filter((name) => !after.has(name));
if (changed.length || removed.length) {
	console.error("Declarative schemas differ from migration history:", [...changed, ...removed].join(", "));
	console.error("Inspect generated review migrations; do not deploy them as an adoption shortcut.");
	process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Declarative schemas match migration history; no migration was generated or applied.");
