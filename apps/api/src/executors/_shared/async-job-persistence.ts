import type { Bill, ExecutorCompletedResult } from "@executors/types";

export function asyncVideoJobPersistenceFailureResult(args: {
	providerLabel: string;
	nativeVideoId: string;
	reservationId?: string | null;
	reservationStatus?: string | null;
	bill: Bill;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	mappedRequest?: string;
	rawResponse?: unknown;
}): ExecutorCompletedResult {
	return {
		kind: "completed",
		ir: undefined,
		bill: args.bill,
		upstream: new Response(
			JSON.stringify({
				error: {
					type: "async_job_persistence_failed",
					message: `${args.providerLabel} video job was created upstream, but Phaseo could not persist gateway ownership metadata.`,
					native_video_id: args.nativeVideoId,
					reservation_id: args.reservationId,
					reservation_status: args.reservationStatus,
				},
			}),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		),
		keySource: args.keySource,
		byokKeyId: args.byokKeyId,
		mappedRequest: args.mappedRequest,
		rawResponse: args.rawResponse,
	};
}
