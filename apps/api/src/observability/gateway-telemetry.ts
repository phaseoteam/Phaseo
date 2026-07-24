export type GatewayTelemetrySink = "axiom" | "supabase";

export type GatewayTelemetryDelivery = {
	sink: GatewayTelemetrySink;
	delivered: boolean;
	error: string | null;
};

type GatewayTelemetryPipelineArgs = {
	requestId: string;
	workspaceId?: string | null;
	writeSupabase?: (() => Promise<unknown>) | null;
	writeAxiom: () => Promise<unknown>;
	onDeliveryFailure?: (failure: {
		sink: "supabase";
		requestId: string;
		workspaceId: string | null;
		error: string;
	}) => Promise<unknown>;
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the durable Supabase projection and the operational Axiom projection as
 * independent drains of the same completed gateway request.
 *
 * The drains deliberately use Promise.allSettled: observability must not make
 * billing persistence dependent on Axiom availability (or vice versa).
 */
export async function runGatewayTelemetryPipelines(
	args: GatewayTelemetryPipelineArgs,
): Promise<GatewayTelemetryDelivery[]> {
	const sinks: Array<{
		sink: GatewayTelemetrySink;
		write: () => Promise<unknown>;
	}> = [];

	if (args.writeSupabase) {
		sinks.push({ sink: "supabase", write: args.writeSupabase });
	}
	sinks.push({ sink: "axiom", write: args.writeAxiom });

	const settled = await Promise.allSettled(sinks.map(({ write }) => write()));
	const deliveries = settled.map<GatewayTelemetryDelivery>((result, index) => {
		const reportedFailure = result.status === "fulfilled" && result.value === false;
		return {
			sink: sinks[index].sink,
			delivered: result.status === "fulfilled" && !reportedFailure,
			error: result.status === "rejected"
				? errorMessage(result.reason)
				: reportedFailure
					? "sink reported delivery failure"
					: null,
		};
	});

	for (const delivery of deliveries) {
		if (delivery.delivered || !delivery.error) continue;
		console.error("[observability] gateway telemetry delivery failed", {
			sink: delivery.sink,
			requestId: args.requestId,
			workspaceId: args.workspaceId ?? null,
			error: delivery.error,
		});

		// A failing Axiom drain cannot report its own failure to Axiom. Supabase
		// failures can, without coupling the primary request event to the retry.
		if (delivery.sink === "supabase" && args.onDeliveryFailure) {
			try {
				await args.onDeliveryFailure({
					sink: delivery.sink,
					requestId: args.requestId,
					workspaceId: args.workspaceId ?? null,
					error: delivery.error,
				});
			} catch (reportError) {
				console.error("[observability] telemetry failure reporting failed", {
					requestId: args.requestId,
					error: errorMessage(reportError),
				});
			}
		}
	}

	return deliveries;
}
