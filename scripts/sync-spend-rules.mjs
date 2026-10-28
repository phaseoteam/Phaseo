// Copies packages/shared/spend-rules into each app that validates or shows spend
// rules, and checks its lists and caps against the database: the table's CHECK
// constraints, the per-workspace cap trigger, the evaluator's switch
// (private.spend_rule_evaluable), the destination cap and the test-send limit.
// Run with --check in CI to fail on drift instead of writing.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "packages/shared/spend-rules/index.ts";
const TARGETS = [
	"apps/api/src/core/spend-rules.ts",
	"apps/web-api/src/routes/account/spend-rules.ts",
	"apps/web/src/components/(gateway)/settings/spend-rules/spendRules.ts",
];
const TABLE = "supabase/schemas/public/tables/workspace_spend_rules.sql";
const LIMIT_TRIGGER = "supabase/schemas/public/functions/enforce_workspace_spend_rule_limit.sql";
const EVALUABLE = "supabase/schemas/private/functions/spend_rule_evaluable.sql";
const SAVE = "supabase/schemas/public/functions/save_workspace_spend_rule.sql";
const TEST_SENDS = "supabase/schemas/public/functions/consume_spend_rule_test_send.sql";
const BLOCKS_TABLE = "supabase/schemas/public/tables/workspace_spend_blocks.sql";

const check = process.argv.includes("--check");
const read = (file) => readFile(path.join(root, file), "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n");
const source = await read(SOURCE);
const output = normalize(`// Generated from ${SOURCE} by scripts/sync-spend-rules.mjs. Do not edit.\n${source}`);
const problems = [];

for (const target of TARGETS) {
	const current = await read(target).catch(() => null);
	if (current != null && normalize(current) === output) continue;
	if (check) problems.push(`${target} is out of date`);
	else {
		await mkdir(path.dirname(path.join(root, target)), { recursive: true });
		await writeFile(path.join(root, target), output, "utf8");
	}
}

const constant = (name) => source.match(new RegExp(`export const ${name} = ([\\d_]+);`))?.[1]?.replaceAll("_", "");
const values = (name) => {
	const body = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const;`))?.[1];
	return body ? [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]) : null;
};
const same = (a, b) => Boolean(a?.length && b?.length) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const table = await read(TABLE);
const checkValues = (constraint, column) => {
	const line = table.split("\n").find((text) => text.includes(`"${constraint}"`));
	const list = line?.match(new RegExp(`\\(${column} = ANY \\(ARRAY\\[([^\\]]*)\\]`))?.[1];
	return list ? [...list.matchAll(/'([^']+)'::text/g)].map((match) => match[1]) : null;
};
for (const [name, constraint, column] of [
	["SPEND_RULE_METRICS", "workspace_spend_rules_metric_check", "metric"],
	["SPEND_RULE_SCOPES", "workspace_spend_rules_scope_check", "scope_type"],
	["SPEND_RULE_PERIODS", "workspace_spend_rules_period_check", "period"],
	["SPEND_RULE_ACTIONS", "workspace_spend_rules_action_check", "action"],
]) {
	if (!same(values(name), checkValues(constraint, column))) problems.push(`${name} does not match ${constraint} in ${TABLE}`);
}

const blocksTable = await read(BLOCKS_TABLE);
const liftReasons = blocksTable.split("\n").find((text) => text.includes('"workspace_spend_blocks_lift_reason_check"'))
	?.match(/lift_reason = ANY \(ARRAY\[([^\]]*)\]/)?.[1];
if (!same(values("SPEND_BLOCK_LIFT_REASONS"), liftReasons ? [...liftReasons.matchAll(/'([^']+)'::text/g)].map((match) => match[1]) : null)) {
	problems.push(`SPEND_BLOCK_LIFT_REASONS does not match workspace_spend_blocks_lift_reason_check in ${BLOCKS_TABLE}`);
}

const limit = (await read(LIMIT_TRIGGER)).match(/v_limit constant integer := (\d+);/)?.[1];
if (!limit || limit !== constant("MAX_SPEND_RULES_PER_WORKSPACE")) problems.push(`${LIMIT_TRIGGER} limit does not match MAX_SPEND_RULES_PER_WORKSPACE`);

const evaluable = await read(EVALUABLE);
for (const [name, parameter] of [["EVALUATED_METRICS", "p_metric"], ["EVALUATED_PERIODS", "p_period"], ["EVALUATED_BASE_KINDS", "p_base_kind"]]) {
	const list = evaluable.match(new RegExp(`${parameter} in \\(([^)]*)\\)`))?.[1];
	const sql = list ? [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]) : null;
	if (!same(values(name), sql)) problems.push(`${name} does not match ${parameter} in ${EVALUABLE}`);
}

const destinations = (await read(SAVE)).match(/cardinality\(p_destination_ids\) > (\d+)/)?.[1];
if (!destinations || destinations !== constant("MAX_SPEND_RULE_DESTINATIONS")) problems.push(`${SAVE} destination cap does not match MAX_SPEND_RULE_DESTINATIONS`);
const testSends = (await read(TEST_SENDS)).match(/p_limit\s+integer DEFAULT (\d+)/)?.[1];
if (!testSends || testSends !== constant("SPEND_RULE_TEST_SENDS_PER_MINUTE")) problems.push(`${TEST_SENDS} default does not match SPEND_RULE_TEST_SENDS_PER_MINUTE`);

if (problems.length) {
	for (const problem of problems) console.error(problem);
	if (check) console.error("Run `node scripts/sync-spend-rules.mjs` after editing the shared module, and keep the database lists in step.");
	process.exit(1);
}
console.log(check ? "Spend rule copies are up to date." : "Spend rule copies synced.");
