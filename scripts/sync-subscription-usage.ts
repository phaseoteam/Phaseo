import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { SOURCE_CSV_URL, SOURCE_NAME, buildUsageRows, diffUsage, parsePoints, type CurrentRow } from "./subscription-usage/core";

for (const file of ["apps/web/.env.local", ".env.local", ".env"]) {
	if (existsSync(resolve(file))) loadEnvFile(resolve(file));
}

function writeJson(file: string, value: unknown) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
	const response = await fetch(SOURCE_CSV_URL, { headers: { "user-agent": "Phaseo subscription usage sync (https://phaseo.app)" } });
	if (!response.ok) throw new Error(`Subscription usage download failed with ${response.status}.`);
	const points = parsePoints(await response.text());
	if (!points.length) throw new Error("Subscription usage source returned no rows.");

	const db = createAdminClient();
	const { data: plans, error: plansError } = await db.from("v2_subscription_plans").select("plan_uuid,plan_id,price").eq("status", "active").is("effective_to", null);
	if (plansError) throw plansError;
	const slugs = new Set<string>();
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await db.from("v2_models").select("model_slug").order("model_slug").range(offset, offset + 999);
		if (error) throw error;
		for (const row of data ?? []) slugs.add(row.model_slug);
		if ((data ?? []).length < 1000) break;
	}

	const { rows, skipped, priceMismatches } = buildUsageRows(points, (plans ?? []).map((plan) => ({ ...plan, price: plan.price === null ? null : Number(plan.price) })), slugs);
	const { data: current, error: currentError } = await db.from("v2_subscription_plan_model_usage").select("*").eq("source_name", SOURCE_NAME).is("effective_to", null);
	if (currentError) throw currentError;
	const diff = diffUsage((current ?? []) as CurrentRow[], rows);
	const subscriptionPoints = points.filter((point) => point.billing === "subscription").length;
	// A source outage or format change can make most rows vanish at once; don't retire rows on that signal.
	const keepRemoved = rows.length < Math.max(1, (current ?? []).length) * 0.5;

	const report = {
		source: SOURCE_CSV_URL, fetchedAt: new Date().toISOString(), subscriptionPoints, matched: rows.length,
		insert: diff.insert.length, changed: diff.close.length, removed: keepRemoved ? 0 : diff.removed.length, unchanged: diff.unchanged,
		removalsSkipped: keepRemoved && diff.removed.length > 0, priceMismatches,
		skipped: Object.entries(skipped.reduce<Record<string, string[]>>((groups, item) => ((groups[item.reason] ??= []).push(item.id), groups), {})).map(([reason, ids]) => ({ reason, count: ids.length, ids })),
	};
	const reportArg = process.argv.find((argument) => argument.startsWith("--report="));
	if (reportArg) writeJson(resolve(reportArg.slice("--report=".length)), report);
	console.log(`Subscription usage: ${rows.length}/${subscriptionPoints} subscription points matched; ${diff.insert.length - diff.close.length} new, ${diff.close.length} changed, ${report.removed} removed, ${diff.unchanged} unchanged.`);
	for (const mismatch of priceMismatches) console.warn(`Price differs for ${mismatch.id}: source $${mismatch.sourcePrice}, catalogue $${mismatch.ourPrice}.`);
	if (report.removalsSkipped) console.warn(`Only ${rows.length} rows matched against ${(current ?? []).length} current rows; kept rows the source no longer lists.`);
	if (!rows.length) throw new Error("No subscription usage rows matched; nothing was written.");
	if (!process.argv.includes("--write")) { console.log("Dry run complete. Use --write to update the catalogue."); return; }

	const now = report.fetchedAt;
	const retire = [...diff.close, ...(keepRemoved ? [] : diff.removed)];
	for (let index = 0; index < retire.length; index += 200) {
		const { error } = await db.from("v2_subscription_plan_model_usage").update({ effective_to: now }).is("effective_to", null).in("usage_uuid", retire.slice(index, index + 200));
		if (error) throw error;
	}
	const verifiedAt = now;
	for (let index = 0; index < diff.insert.length; index += 200) {
		const { error } = await db.from("v2_subscription_plan_model_usage").insert(diff.insert.slice(index, index + 200).map((row) => ({ ...row, verified_at: verifiedAt, effective_from: now })));
		if (error) throw error;
	}
	console.log("Subscription usage written.");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
