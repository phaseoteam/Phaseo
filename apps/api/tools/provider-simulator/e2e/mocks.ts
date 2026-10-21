// Purpose: Module-boundary replacements for the end-to-end harness (auth, context, workspace policy, pricing loader, charge, audit).
// Why: Only the modules that read or write the database are replaced; everything between them runs as in production.
// How: Each factory receives the real module, checks the export it overrides still exists, and swaps only that export.

import { buildGatewayContext, lookupPriceCard } from "./context";
import { currentCase, harnessState, type AuditRecord } from "./state";

/** Fails loudly when a mocked export disappears, so a gateway refactor cannot silently bypass a mock. */
export function requireExport(moduleName: string, original: Record<string, unknown>, name: string): void {
	if (typeof original[name] !== "function") {
		throw new Error(
			`e2e harness: ${moduleName} no longer exports a function named "${name}". `
			+ `Update tools/provider-simulator/e2e/mocks.ts to the new module boundary before trusting e2e results.`,
		);
	}
}

export function mockAuth(original: Record<string, unknown>) {
	requireExport("@pipeline/before/auth", original, "authenticate");
	return {
		...original,
		authenticate: async () => {
			const runtime = currentCase();
			return {
				ok: true as const,
				workspaceId: runtime.workspaceId,
				apiKeyId: runtime.apiKeyId,
				apiKeyRef: "kid_sim_e2e",
				apiKeyKid: "sim_e2e_kid",
				userId: null,
				internal: false,
				authMethod: "api_key" as const,
				scopes: [],
			};
		},
	};
}

export function mockContext(original: Record<string, unknown>) {
	requireExport("@pipeline/before/context", original, "fetchGatewayContext");
	return {
		...original,
		fetchGatewayContext: async (args: { workspaceId: string; model: string; endpoint: string }) => buildGatewayContext(args),
	};
}

export function mockWorkspacePolicy(original: Record<string, unknown>) {
	requireExport("@pipeline/before/workspacePolicy", original, "fetchWorkspacePolicy");
	requireExport("@pipeline/before/workspacePolicy", original, "buildWorkspacePolicy");
	const build = original.buildWorkspacePolicy as (args: Record<string, unknown>) => unknown;
	return {
		...original,
		// The real builder turns the case's settings into a policy, so applyWorkspacePolicy and dynamic routes run unchanged.
		fetchWorkspacePolicy: async () => build({ globalSettings: null, guardrails: [], dynamicRoute: currentCase().dynamicRoute }),
	};
}

export function mockPriceLoader(original: Record<string, unknown>) {
	requireExport("@pipeline/pricing/loader", original, "loadPriceCard");
	return {
		...original,
		loadPriceCard: async (provider: string, model: string, endpoint: string) => lookupPriceCard(provider, model, endpoint),
	};
}

export function mockPersist(original: Record<string, unknown>) {
	requireExport("@pipeline/pricing/persist", original, "recordUsageAndCharge");
	return {
		...original,
		recordUsageAndCharge: async (args: { requestId: string; workspaceId: string; cost_nanos: number; creditSnapshotBalanceNanos?: number | null }) => {
			harnessState.captures.charges.push({
				requestId: args.requestId,
				workspaceId: args.workspaceId,
				costNanos: Number(args.cost_nanos),
				creditSnapshotBalanceNanos: args.creditSnapshotBalanceNanos ?? null,
			});
			return { ok: true, balance_nanos: 0 } as unknown;
		},
	};
}

function pricingLines(usage: any): AuditRecord["pricingLines"] {
	const lines = usage?.pricing?.lines;
	if (!Array.isArray(lines)) return [];
	return lines.map((line: any) => ({
		meter: String(line.dimension ?? line.meter ?? "?"),
		quantity: Number(line.quantity ?? 0),
		lineNanos: Number(line.line_nanos ?? 0),
		unitPriceUsd: line.unit_price_usd,
	}));
}

function stripPricing(usage: any): Record<string, unknown> | null {
	if (!usage || typeof usage !== "object") return null;
	const { pricing: _pricing, byok_billing: _byok, ...rest } = usage;
	return rest;
}

export function mockAudit(original: Record<string, unknown>) {
	requireExport("@pipeline/audit", original, "auditSuccess");
	requireExport("@pipeline/audit", original, "auditFailure");
	return {
		...original,
		auditSuccess: async (input: any) => {
			harnessState.captures.audits.push({
				kind: "success",
				provider: input.provider ?? null,
				model: input.model ?? null,
				byok: typeof input.byok === "boolean" ? input.byok : null,
				statusCode: input.statusCode ?? null,
				totalNanos: typeof input.totalNanos === "number" ? input.totalNanos : null,
				currency: input.currency ?? null,
				finishReason: input.finishReason ?? null,
				usage: stripPricing(input.usagePriced),
				pricingLines: pricingLines(input.usagePriced),
				byokBilling: input.usagePriced?.byok_billing ?? null,
				errorCode: null,
				errorMessage: null,
				stage: null,
				providerAttempts: Array.isArray(input.providerAttempts) ? input.providerAttempts : null,
			});
		},
		auditFailure: async (input: any) => {
			harnessState.captures.audits.push({
				kind: "failure",
				provider: input.provider ?? null,
				model: input.model ?? null,
				byok: typeof input.byok === "boolean" ? input.byok : null,
				statusCode: input.statusCode ?? null,
				totalNanos: null,
				currency: input.currency ?? null,
				finishReason: null,
				usage: input.usage ?? null,
				pricingLines: Array.isArray(input.pricingLines) ? pricingLines({ pricing: { lines: input.pricingLines } }) : [],
				byokBilling: null,
				errorCode: input.errorCode ?? null,
				errorMessage: typeof input.errorMessage === "string" ? input.errorMessage.slice(0, 400) : null,
				stage: input.stage ?? null,
				providerAttempts: Array.isArray(input.providerAttempts) ? input.providerAttempts : null,
			});
		},
	};
}
