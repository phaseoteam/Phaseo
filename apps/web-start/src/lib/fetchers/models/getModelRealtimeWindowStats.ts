export type ModelRealtimeWindowStats = {
	requestsInWindow: number;
	latencyP50Ms: number | null;
	throughputP50TokPerSec: number | null;
};
