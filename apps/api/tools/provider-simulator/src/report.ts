// Purpose: Turn simulator results into summary.json and a Markdown matrix.
// Why: The audit and the PR need per-provider verdicts and counts that can be regenerated, not hand-tallied.
// How: Rolls each provider's route results into counts of dropped, invented and mistranslated fields,
//      lost response fields and billing problems, then applies fixed verdict rules.

import fs from "node:fs";
import path from "node:path";
import type { ClientMatrix } from "./client-requests";
import type { ProviderResult, RequestResult, ResponseResult, RouteResult } from "./run";

/**
 * Fields some specs mark required that the APIs default in practice (OpenAI's own spec requires
 * input_image.detail, function strict, output annotations and item status; Vertex takes the model
 * from the URL). Reported, but not counted as a violation.
 */
const TOLERATED_REQUIRED = /\.(detail|strict|annotations|status|model|id)$/;

/** Client params the gateway consumes itself; never expected upstream. */
const GATEWAY_ONLY_PARAMS = new Set(["usage", "meta", "echo_upstream_request", "debug", "session_id", "provider", "models", "preset", "stream_options"]);

export type Verdict = "works" | "partial" | "broken" | "not routable";

export type ProviderSummary = {
	providerId: string;
	registeredIds: string[];
	activeRoutes: number;
	sampledModels: string[];
	dialects: string[];
	spec: string;
	verdict: Verdict;
	reasons: string[];
	counts: {
		droppedParams: number;
		droppedValues: number;
		invented: number;
		mistranslated: number;
		specUnknownFields: number;
		rejectedScenarios: number;
		rejectedParams: number;
		lostResponseFields: number;
		finishMismatches: number;
		billingDeltas: number;
		pricingThrowsSampled: number;
		pricingThrowsSweep: number;
		framePricingErrors: number;
		unstablePrefix: number;
		nondeterministic: number;
	};
	droppedParams: string[];
	invented: string[];
	specIssues: string[];
	lost: string[];
	finishMismatches: string[];
	billing: string[];
	rejected: string[];
	paramRejected: string[];
	errors: string[];
};

function sig(path: string): string {
	return path.replace(/\[\d+\]/g, "[]");
}

function routeLabel(route: RouteResult): string {
	return route.model;
}

function uniq<T>(values: T[]): T[] {
	return Array.from(new Set(values));
}

function summariseRequests(routes: RouteResult[]) {
	const droppedParams: string[] = [];
	const droppedValues: string[] = [];
	const specIssues: string[] = [];
	const unknownFields: string[] = [];
	const changed: string[] = [];
	const rejected: string[] = [];
	const paramRejected: string[] = [];
	const executorErrors: string[] = [];
	for (const route of routes) {
		for (const request of route.requests) {
			if (request.outcome !== "sent") {
				if (request.outcome === "executor_error" || request.outcome === "no_upstream_call") executorErrors.push(`${request.scenario}: ${request.detail ?? request.outcome}`.slice(0, 220));
				else if (request.kind === "param") paramRejected.push(`${request.scenario}${request.documented === false ? " [not in public spec]" : " [documented]"} (${request.outcome}): ${request.detail ?? ""}`.slice(0, 240));
				else rejected.push(`${request.scenario} (${request.outcome}): ${request.detail ?? ""}`.slice(0, 220));
				continue;
			}
			if (request.kind === "param" && request.param && !GATEWAY_ONLY_PARAMS.has(request.param) && request.effect === "no_upstream_change") {
				droppedParams.push(request.param);
			}
			if (request.kind !== "param") {
				for (const dropped of request.dropped ?? []) droppedValues.push(`${request.surface}:${sig(dropped)}`);
			}
			for (const change of request.changed ?? []) changed.push(`${request.scenario}: ${change}`);
			for (const issue of request.specIssues ?? []) {
				const tolerated = issue.kind === "missing_required" && TOLERATED_REQUIRED.test(issue.path);
				const line = `${request.surface} ${sig(issue.path)} ${tolerated ? "spec_marks_required" : issue.kind} (${issue.detail})`;
				specIssues.push(line);
				if (issue.kind === "unknown_field") unknownFields.push(line);
			}
		}
	}
	return {
		droppedParams: uniq(droppedParams).sort(),
		droppedValues: uniq(droppedValues).sort(),
		specIssues: uniq(specIssues).sort(),
		unknownFields: uniq(unknownFields),
		changed: uniq(changed),
		rejected: uniq(rejected),
		paramRejected: uniq(paramRejected),
		executorErrors: uniq(executorErrors),
	};
}

function summariseResponses(routes: RouteResult[]) {
	const lost: string[] = [];
	const finish: string[] = [];
	const billing: string[] = [];
	const errors: string[] = [];
	let throwsSampled = 0;
	let frameErrors = 0;
	for (const route of routes) {
		for (const response of route.responses) {
			const where = `${routeLabel(route)} ${response.surface}/${response.mode}`;
			if (response.outcome === "executor_error" || response.outcome === "materialise_error" || response.outcome === "no_call") {
				errors.push(`${where} ${response.variant}: ${response.outcome} ${response.detail ?? ""}`.slice(0, 240));
			}
			for (const id of response.lost ?? []) lost.push(`${response.surface}/${response.mode}: ${id}`);
			if (response.finishOk === false) finish.push(`${response.surface}/${response.mode} ${response.variant} -> ${response.finishReason} (expected ${response.finishExpected?.join("|")})`);
			if (response.variant === "max") {
				if (response.pricing && !response.pricing.ok) {
					throwsSampled += 1;
					billing.push(`${where}: pricing threw ${response.pricing.error}`);
				}
				if (response.billingDelta && Object.keys(response.billingDelta).length) {
					billing.push(`${where}: metered minus expected ${JSON.stringify(response.billingDelta)}`);
				}
				if (response.wouldPin === false && response.pricing?.ok) billing.push(`${where}: no sticky pin would be written`);
			}
			if (response.outcome === "ok" && response.billed && (!response.billed.usage || (response.billed.inputTokens === 0 && response.billed.outputTokens === 0))) {
				billing.push(`${where} ${response.variant}: response delivered but no usage reached billing`);
			}
			if (response.framePricingErrors?.length) {
				frameErrors += 1;
				billing.push(`${where} ${response.variant}: inline frame pricing threw (${response.framePricingErrors.join(", ")}); frame forwarded unrewritten`);
			}
			if (response.error && response.variant !== "error:mid-stream") {
				const e = response.error;
				if (e.retryAfterForwarded === false) errors.push(`${where} ${response.variant}: Retry-After not forwarded to client`);
			}
		}
	}
	return { lost: uniq(lost), finish: uniq(finish), billing: uniq(billing), errors: uniq(errors), throwsSampled, frameErrors };
}

export function summariseProvider(result: ProviderResult): ProviderSummary {
	const requests = summariseRequests(result.routes);
	const responses = summariseResponses(result.routes);
	const invented = uniq(result.routes.flatMap((route) =>
		Object.entries(route.invented).flatMap(([surface, fields]) => (fields ?? []).map((field) => `${surface} ${sig(field.path)}=${JSON.stringify(field.value)}`.slice(0, 160))),
	));
	const unstable = result.routes.flatMap((route) => route.prefix.filter((entry) => !entry.stable).map((entry) => `${route.model} ${entry.conversation} step ${entry.step}: ${entry.divergence}`));
	const nondeterministic = result.routes.flatMap((route) => route.nondeterminism.map((entry) => `${route.model} ${entry.scenario}: ${entry.paths.slice(0, 3).join("; ")}`));
	const sweepThrows = result.pricingSweep.throws.length;
	const mistranslated = requests.specIssues.filter((line) => / (type_mismatch|missing_required|enum_mismatch|no_variant_matched) /.test(line)).length + requests.changed.length + responses.finish.length;

	const reasons: string[] = [];
	let verdict: Verdict = "works";
	if (result.placeholder || result.activeRoutes === 0) {
		verdict = "not routable";
		reasons.push(result.placeholder ? "no catalogue routes; simulated with a placeholder model" : "no active catalogue routes; simulated with inactive routes");
	} else {
		const breakers = [
			result.crash ? `crash: ${result.crash}` : null,
			requests.executorErrors.some((line) => /agent|base/.test(line)) ? "base or agent request did not reach the provider" : null,
			responses.errors.some((line) => / (text|max): /.test(line)) ? "text or max response not delivered" : null,
			responses.throwsSampled ? "pricing throws on the sampled route's usage" : null,
			responses.lost.some((line) => /tool_call|: text$/.test(line)) ? "tool calls or text lost in responses" : null,
			unstable.length ? "cacheable prefix changes between agent steps" : null,
			requests.specIssues.some((line) => / (type_mismatch|missing_required) /.test(line)) ? "request body violates the provider schema" : null,
		].filter((line): line is string => Boolean(line));
		const partials = [
			requests.droppedParams.length ? `${requests.droppedParams.length} documented params have no upstream effect` : null,
			requests.unknownFields.length ? `${requests.unknownFields.length} fields not in the provider schema` : null,
			responses.lost.length ? "response fields lost" : null,
			responses.finish.length ? "finish reasons mis-mapped" : null,
			responses.billing.length ? "billing deltas" : null,
			sweepThrows ? `${sweepThrows} active routes throw pricing_rule_missing` : null,
			requests.rejected.length ? "documented request shapes rejected" : null,
		].filter((line): line is string => Boolean(line));
		if (breakers.length) verdict = "broken";
		else if (partials.length) verdict = "partial";
		reasons.push(...breakers, ...partials);
	}

	return {
		providerId: result.providerId,
		registeredIds: result.registeredIds,
		activeRoutes: result.activeRoutes,
		sampledModels: result.routes.map(routeLabel),
		dialects: uniq(result.routes.flatMap((route) => route.dialects)),
		spec: uniq(result.routes.flatMap((route) => Object.entries(route.specs ?? {}).map(([dialect, spec]) => `${dialect}=${spec!.kind}:${spec!.id}`))).join("; ") || "none",
		verdict,
		reasons,
		counts: {
			droppedParams: requests.droppedParams.length,
			droppedValues: requests.droppedValues.length,
			invented: invented.length,
			mistranslated,
			specUnknownFields: requests.unknownFields.length,
			rejectedScenarios: requests.rejected.length,
			rejectedParams: requests.paramRejected.length,
			lostResponseFields: responses.lost.length,
			finishMismatches: responses.finish.length,
			billingDeltas: responses.billing.length,
			pricingThrowsSampled: responses.throwsSampled,
			pricingThrowsSweep: sweepThrows,
			framePricingErrors: responses.frameErrors,
			unstablePrefix: unstable.length,
			nondeterministic: nondeterministic.length,
		},
		droppedParams: requests.droppedParams,
		invented,
		specIssues: requests.specIssues.slice(0, 30),
		lost: responses.lost,
		finishMismatches: responses.finish,
		billing: [...responses.billing, ...result.pricingSweep.throws.map((entry) => `sweep ${entry.model}: ${entry.error}`)].slice(0, 40),
		rejected: requests.rejected,
		paramRejected: requests.paramRejected,
		errors: [...requests.executorErrors, ...responses.errors, ...unstable, ...nondeterministic].slice(0, 30),
	};
}

function mdEscape(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderMatrix(summaries: ProviderSummary[], matrix: ClientMatrix, meta: { durationMs: number; partial: boolean }): string {
	const byVerdict = new Map<Verdict, number>();
	for (const summary of summaries) byVerdict.set(summary.verdict, (byVerdict.get(summary.verdict) ?? 0) + 1);
	const routable = summaries.filter((summary) => summary.verdict !== "not routable");
	const total = (key: keyof ProviderSummary["counts"]) => routable.reduce((sum, summary) => sum + summary.counts[key], 0);
	const lines: string[] = [];
	lines.push("# Provider simulator matrix");
	lines.push("");
	lines.push("Generated by `tools/provider-simulator` (offline; catalogue fixtures; no provider calls).");
	lines.push(`Scenarios per route: ${matrix.scenarios.length}. Providers: ${summaries.length}${meta.partial ? " (partial run)" : ""}. Run time: ${Math.round(meta.durationMs / 1000)} s.`);
	lines.push("");
	lines.push("| Verdict | Providers |");
	lines.push("|---|---|");
	for (const verdict of ["works", "partial", "broken", "not routable"] as Verdict[]) lines.push(`| ${verdict} | ${byVerdict.get(verdict) ?? 0} |`);
	lines.push("");
	lines.push(`| Totals over the ${routable.length} routable providers | Count |`);
	lines.push("|---|---|");
	lines.push(`| Documented params with no upstream effect (provider × param) | ${total("droppedParams")} |`);
	lines.push(`| Client values dropped in content/tool/agent scenarios (provider × path) | ${total("droppedValues")} |`);
	lines.push(`| Fields the gateway invents (provider × path) | ${total("invented")} |`);
	lines.push(`| Mistranslated (schema type/enum/required, changed values, finish reasons) | ${total("mistranslated")} |`);
	lines.push(`| Fields sent that the provider schema does not define | ${total("specUnknownFields")} |`);
	lines.push(`| Response fields lost (provider × surface/mode × field) | ${total("lostResponseFields")} |`);
	lines.push(`| Sampled routes whose max usage throws in pricing | ${total("pricingThrowsSampled")} |`);
	lines.push(`| Active routes that throw pricing_rule_missing on max usage | ${total("pricingThrowsSweep")} |`);
	lines.push("");
	lines.push("| Provider | Active routes | Sampled models | Upstream dialects | Spec | Verdict | Dropped params | Dropped values | Invented | Mistranslated | Unknown to spec | Rejected (shapes/params) | Lost (resp) | Finish | Pricing throws (sampled/sweep) | Prefix unstable | Non-det |");
	lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
	for (const s of summaries) {
		lines.push(`| ${mdEscape(s.providerId)} | ${s.activeRoutes} | ${mdEscape(s.sampledModels.join(", "))} | ${s.dialects.join(", ")} | ${s.spec} | **${s.verdict}** | ${s.counts.droppedParams} | ${s.counts.droppedValues} | ${s.counts.invented} | ${s.counts.mistranslated} | ${s.counts.specUnknownFields} | ${s.counts.rejectedScenarios}/${s.counts.rejectedParams} | ${s.counts.lostResponseFields} | ${s.counts.finishMismatches} | ${s.counts.pricingThrowsSampled}/${s.counts.pricingThrowsSweep} | ${s.counts.unstablePrefix} | ${s.counts.nondeterministic} |`);
	}
	lines.push("");
	lines.push("## Coverage of the public OpenAPI request schemas");
	lines.push("");
	for (const [surface, coverage] of Object.entries(matrix.coverage)) {
		lines.push(`- **${surface}**: ${coverage.documented.length} documented top-level params exercised; schema-derived values for: ${coverage.schemaDerived.join(", ") || "none"}.`);
	}
	lines.push("");
	lines.push("## Per provider");
	for (const s of summaries) {
		lines.push("");
		lines.push(`### ${s.providerId} — ${s.verdict}`);
		if (s.registeredIds.length > 1 || s.registeredIds[0] !== s.providerId) lines.push(`Registered ids: ${s.registeredIds.join(", ")}.`);
		if (s.reasons.length) lines.push(`Reasons: ${s.reasons.join("; ")}.`);
		const section = (title: string, items: string[], limit = 12) => {
			if (!items.length) return;
			lines.push(`- ${title} (${items.length}):`);
			for (const item of items.slice(0, limit)) lines.push(`  - \`${mdEscape(item).replace(/`/g, "'")}\``);
			if (items.length > limit) lines.push(`  - … ${items.length - limit} more in providers/${s.providerId}.json`);
		};
		section("Documented params with no upstream effect", s.droppedParams, 40);
		section("Invented upstream fields", s.invented);
		section("Schema issues in sent bodies", s.specIssues);
		section("Lost response fields", s.lost);
		section("Finish reason mismatches", s.finishMismatches);
		section("Billing", s.billing);
		section("Rejected request shapes", s.rejected);
		section("Parameter variants rejected before the provider", s.paramRejected, 20);
		section("Errors, prefix and determinism", s.errors);
	}
	lines.push("");
	return lines.join("\n");
}

export function writeReports(args: { resultsDir: string; matrix: ClientMatrix; results: ProviderResult[]; durationMs: number; partial: boolean }) {
	const summaries = args.results.map(summariseProvider);
	fs.writeFileSync(path.join(args.resultsDir, "summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), partial: args.partial, durationMs: args.durationMs, providers: summaries }, null, 1)}\n`);
	fs.writeFileSync(path.join(args.resultsDir, "MATRIX.md"), renderMatrix(summaries, args.matrix, { durationMs: args.durationMs, partial: args.partial }));
	return summaries;
}

export type { RequestResult, ResponseResult };
