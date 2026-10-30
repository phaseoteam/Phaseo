import type { FormattedRoomError } from "@/lib/chat/formatRoomError";

function formatLabel(value: string): string {
	return value
		.split("_")
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ");
}

function topRankFactors(scoreFactors: NonNullable<
	NonNullable<FormattedRoomError["routingDiagnostics"]>["rankedProviders"][number]["scoreFactors"]
>): string[] {
	const weighted = [
		{ key: "success rate", value: scoreFactors.successRate ?? -1 },
		{ key: "latency", value: scoreFactors.latencyScore ?? -1 },
		{ key: "tail latency", value: scoreFactors.tailLatencyScore ?? -1 },
		{ key: "throughput", value: scoreFactors.throughputScore ?? -1 },
		{ key: "price", value: scoreFactors.priceScore ?? -1 },
		{ key: "token fit", value: scoreFactors.tokenAffinity ?? -1 },
	]
		.filter((entry) => entry.value >= 0)
		.sort((a, b) => b.value - a.value)
		.slice(0, 2)
		.map((entry) => entry.key);

	if ((scoreFactors.cacheBoostMultiplier ?? 1) > 1) {
		weighted.unshift("cached context reuse");
	}

	return Array.from(new Set(weighted)).slice(0, 3);
}

function describeConcreteModel(candidate: {
	apiModelId?: string | null;
	providerModelSlug?: string | null;
} | null | undefined): string | null {
	if (candidate?.apiModelId) return candidate.apiModelId;
	if (candidate?.providerModelSlug) return candidate.providerModelSlug;
	return null;
}

export function buildRoutingExplanation(
	formattedError: Pick<
		FormattedRoomError,
		"routingDiagnostics" | "reason" | "providerFailureCategory"
	> | null,
): string[] {
	const diagnostics = formattedError?.routingDiagnostics;
	if (!diagnostics) return [];

	const lines: string[] = [];
	const consideredCount = diagnostics.consideredProviders.length;
	const rankedCount = diagnostics.rankedProviders.length;

	if (consideredCount > 0) {
		lines.push(
			`Routing considered ${consideredCount} provider${
				consideredCount === 1 ? "" : "s"
			} before execution.`,
		);
	}

	const workspacePolicy = diagnostics.workspacePolicy;
	if (
		workspacePolicy &&
		workspacePolicy.beforeCount != null &&
		workspacePolicy.afterCount != null &&
		workspacePolicy.afterCount < workspacePolicy.beforeCount
	) {
		const restrictions: string[] = [];
		if (workspacePolicy.allowedApiModels.length > 0) {
			restrictions.push("model allowlist");
		}
		if (workspacePolicy.providerAllowlist.length > 0) {
			restrictions.push("provider allowlist");
		}
		if (workspacePolicy.providerBlocklist.length > 0) {
			restrictions.push("provider blocklist");
		}
		if (workspacePolicy.requestProviderOnly.length > 0) {
			restrictions.push("request provider.only");
		}
		if (workspacePolicy.requestProviderIgnore.length > 0) {
			restrictions.push("request provider.ignore");
		}
		lines.push(
			`Workspace policy reduced the candidate pool from ${workspacePolicy.beforeCount} to ${workspacePolicy.afterCount}${
				restrictions.length > 0 ? ` using ${restrictions.join(", ")}` : ""
			}.`,
		);
	}

	const terminalStage = diagnostics.filterStages.find(
		(stage) =>
			stage.afterCount === 0 &&
			stage.droppedProviders.length > 0,
	);
	if (terminalStage) {
		const distinctReasons = Array.from(
			new Set(
				terminalStage.droppedProviders
					.map((entry) => entry.reason)
					.filter((value): value is string => Boolean(value)),
			),
		);
		lines.push(
			`The ${terminalStage.stage ? formatLabel(terminalStage.stage) : "final"} filter stage removed every remaining provider${
				distinctReasons.length > 0
					? `, mainly because of ${distinctReasons
							.slice(0, 3)
							.map((reason) => formatLabel(reason))
							.join(", ")}`
					: ""
			}.`,
		);
	} else if (diagnostics.filterStages.length > 0) {
		const mostSelectiveStage = diagnostics.filterStages
			.filter(
				(stage) =>
					stage.beforeCount != null &&
					stage.afterCount != null &&
					stage.beforeCount > stage.afterCount,
			)
			.sort(
				(a, b) =>
					(b.beforeCount ?? 0) -
					(b.afterCount ?? 0) -
					((a.beforeCount ?? 0) - (a.afterCount ?? 0)),
			)[0];
		if (mostSelectiveStage) {
			lines.push(
				`The biggest routing drop happened at ${formatLabel(
					mostSelectiveStage.stage ?? "filter stage",
				)}, which cut the pool from ${mostSelectiveStage.beforeCount} to ${mostSelectiveStage.afterCount}.`,
			);
		}
	}

	if (rankedCount > 0) {
		const top = diagnostics.rankedProviders[0];
		const factors = topRankFactors(top.scoreFactors);
		const concreteModel = describeConcreteModel(top);
		lines.push(
			`The top-ranked provider was ${top.providerId ?? "the selected provider"}${
				concreteModel ? ` using ${concreteModel}` : ""
			}${
				factors.length > 0 ? `, driven mostly by ${factors.join(", ")}` : ""
			}.`,
		);
		if (rankedCount > 1 && diagnostics.rankedProviders[1]?.providerId) {
			const runnerUpModel = describeConcreteModel(diagnostics.rankedProviders[1]);
			lines.push(
				`Routing still had ${rankedCount} executable provider${
					rankedCount === 1 ? "" : "s"
				} after filtering, with ${top.providerId ?? "the top provider"} ahead of ${
					diagnostics.rankedProviders[1]?.providerId
				}${runnerUpModel ? ` using ${runnerUpModel}` : ""}.`,
			);
		}
	}

	if (formattedError?.providerFailureCategory) {
		lines.push(
			`Execution ultimately failed because the leading provider attempts were classified as ${formatLabel(
				formattedError.providerFailureCategory,
			).toLowerCase()}.`,
		);
	} else if (formattedError?.reason) {
		lines.push(
			`The final gateway failure reason was ${formatLabel(
				formattedError.reason,
			).toLowerCase()}.`,
		);
	}

	return lines;
}
