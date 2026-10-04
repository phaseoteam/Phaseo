import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const MIGRATIONS_DIRECTORY = join(REPOSITORY_ROOT, "supabase", "migrations");
const MIGRATION_NAME = /^(\d{8}|\d{14})_[a-z0-9][a-z0-9_]*\.sql$/;
const NEW_MIGRATION_NAME = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/;
const DESTRUCTIVE_APPROVAL = /^\s*--\s*phaseo:allow-destructive-migration\s+reason:\s*(.+)$/im;
const HISTORY_BACKFILL_APPROVAL = /^\s*--\s*phaseo:allow-production-history-backfill\s+reason:\s*(.+)$/im;
const DESTRUCTIVE_PATTERNS = [
	["DROP TABLE", /\bdrop\s+table\b/i],
	["DROP SCHEMA", /\bdrop\s+schema\b/i],
	["DROP TYPE", /\bdrop\s+type\b/i],
	["DROP VIEW", /\bdrop\s+(?:materialized\s+)?view\b/i],
	["TRUNCATE", /\btruncate(?:\s+table)?\b/i],
	["DROP COLUMN", /\balter\s+table[\s\S]*?\bdrop\s+column\b/i],
	["DELETE", /\bdelete\s+from\b/i],
];

function listMigrationFiles() {
	if (!existsSync(MIGRATIONS_DIRECTORY)) {
		throw new Error("Missing supabase/migrations directory");
	}

	return readdirSync(MIGRATIONS_DIRECTORY)
		.filter((name) => name.endsWith(".sql"))
		.sort();
}

function validateNames(files) {
	const errors = [];

	for (const file of files) {
		if (!MIGRATION_NAME.test(file)) {
			errors.push(
				`${file}: expected a timestamped lower_snake_case.sql filename`,
			);
		}
	}

	return errors;
}

function getMigrationChanges(baseSha) {
	if (!baseSha || /^0+$/.test(baseSha)) return [];

	const output = execFileSync(
		"git",
		[
			"diff",
			"--name-status",
			"--find-renames",
			`${baseSha}...HEAD`,
			"--",
			"supabase/migrations",
			"supabase/baseline/schema.sql",
			"supabase/baseline/history.sha256",
		],
		{ cwd: REPOSITORY_ROOT, encoding: "utf8" },
	).trim();

	if (!output) return [];

	return output.split(/\r?\n/).map((line) => {
		const [status, ...paths] = line.split("\t");
		return { status, paths };
	});
}

function listBaseMigrationFiles(baseSha) {
	if (!baseSha || /^0+$/.test(baseSha)) return [];

	const output = execFileSync(
		"git",
		["ls-tree", "-r", "--name-only", baseSha, "--", "supabase/migrations"],
		{ cwd: REPOSITORY_ROOT, encoding: "utf8" },
	).trim();

	if (!output) return [];
	return output
		.split(/\r?\n/)
		.filter((path) =>
			/^supabase\/migrations\/[^/]+$/.test(path.replaceAll("\\", "/")),
		)
		.map((path) => path.split("/").at(-1) ?? "")
		.filter((file) => MIGRATION_NAME.test(file))
		.sort();
}

export function validateMigrationOrder(
	baseFiles,
	addedPaths,
	readMigration = (path) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8"),
) {
	const errors = [];
	const latestBaseVersion = baseFiles
		.map((file) => file.match(MIGRATION_NAME)?.[1] ?? "")
		.filter(Boolean)
		.sort()
		.at(-1);

	if (!latestBaseVersion) return errors;

	for (const path of addedPaths) {
		const file = path.split("/").at(-1) ?? "";
		const version = file.match(NEW_MIGRATION_NAME)?.[1];
		if (version && version <= latestBaseVersion) {
			const approval = readMigration(path).match(HISTORY_BACKFILL_APPROVAL);
			const reason = approval?.[1]?.trim() ?? "";
			if (reason.length >= 12) continue;
			errors.push(
				`${path}: migration version ${version} must be newer than the base branch's latest version ${latestBaseVersion}. ` +
				"Rebase onto the current target branch and create a new migration with `supabase migration new`. " +
				"For an already-applied production history backfill, add '-- phaseo:allow-production-history-backfill reason: <specific justification>'.",
			);
		}
	}

	return errors;
}

function stripSqlComments(sql) {
	return sql
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/--.*$/gm, " ");
}

function validateAddedMigration(path, files) {
	const errors = [];
	const absolutePath = resolve(REPOSITORY_ROOT, path);
	const relativeParent = dirname(path.replaceAll("\\", "/"));
	if (
		relativeParent !== "supabase/migrations" ||
		!absolutePath.startsWith(`${MIGRATIONS_DIRECTORY}${sep}`)
	) {
		return [`${path}: migration path escaped supabase/migrations`];
	}

	const fileStat = lstatSync(absolutePath);
	if (!fileStat.isFile()) {
		return [`${path}: migration must be a direct regular file, not a symlink or special file`];
	}
	const realPath = realpathSync(absolutePath);
	if (!realPath.startsWith(`${realpathSync(MIGRATIONS_DIRECTORY)}${sep}`)) {
		return [`${path}: migration resolved outside supabase/migrations`];
	}
	const gitEntry = execFileSync("git", ["ls-files", "-s", "--", path], {
		cwd: REPOSITORY_ROOT,
		encoding: "utf8",
	}).trim();
	const gitMode = gitEntry.split(/\s+/, 1)[0];
	if (gitMode !== "100644" && gitMode !== "100755") {
		return [`${path}: migration must be stored as a regular Git file`];
	}

	const file = path.split("/").at(-1) ?? "";
	const nameMatch = file.match(NEW_MIGRATION_NAME);
	if (!nameMatch) {
		errors.push(`${path}: new migrations require YYYYMMDDHHMMSS_lower_snake_case.sql`);
	} else {
		const [, version] = nameMatch;
		const conflict = files.find(
			(candidate) => candidate !== file && candidate.startsWith(`${version}_`),
		);
		if (conflict) {
			errors.push(`${path}: migration version is already used by ${conflict}`);
		}
	}

	const sql = readFileSync(absolutePath, "utf8");
	if (!sql.trim()) return [...errors, `${path}: migration is empty`];

	const statements = stripSqlComments(sql);
	const dangerous = DESTRUCTIVE_PATTERNS
		.filter(([, pattern]) => pattern.test(statements))
		.map(([label]) => label);

	if (dangerous.length === 0) return errors;

	const approval = sql.match(DESTRUCTIVE_APPROVAL);
	const reason = approval?.[1]?.trim() ?? "";
	if (reason.length < 12) {
		errors.push(
			`${path}: destructive SQL detected (${dangerous.join(", ")}). ` +
			"Add '-- phaseo:allow-destructive-migration reason: <specific justification>' " +
			"and call it out in the pull request.",
		);
	}

	return errors;
}

export function validateSupabaseMigrations(baseSha = "") {
	const files = listMigrationFiles();
	const errors = validateNames(files);
	const changes = getMigrationChanges(baseSha);
	const added = [];

	for (const change of changes) {
		if (change.status === "A" && change.paths.length === 1 && change.paths[0].startsWith("supabase/baseline/")) continue;
		if (change.status === "A" && change.paths.length === 1) {
			added.push(change.paths[0]);
			continue;
		}

		errors.push(
			`${change.paths.join(" -> ")}: existing migrations and replay baseline are immutable; ` +
			"add a new migration instead of modifying, deleting, or renaming one",
		);
	}

	for (const path of added) {
		errors.push(...validateAddedMigration(path, files));
	}
	errors.push(...validateMigrationOrder(listBaseMigrationFiles(baseSha), added));

	if (errors.length > 0) {
		throw new Error(`Invalid Supabase migrations:\n- ${errors.join("\n- ")}`);
	}

	return { total: files.length, added: added.length };
}

const isDirectRun =
	process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
	const { total, added } = validateSupabaseMigrations(process.argv[2]);
	console.log(
		`Supabase migration history is valid (${total} total, ${added} added in this change).`,
	);
}
