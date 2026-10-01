// One delivery commitment and one accounting outcome per stream. No IO or output retention.
import type { GatewayStreamError } from "@core/stream-error";
export type StreamFinalInfo = {
	aborted: boolean;
	sawFinalUsage: boolean;
	failureOrigin?: "provider" | "gateway";
};

export type StreamState = "PRE_COMMIT" | "STREAMING" | "COMPLETED" | "FAILED" | "CANCELLED";
type TerminalState = Exclude<StreamState, "PRE_COMMIT" | "STREAMING">;

export type StreamOutcome<Usage = unknown> = Readonly<{
	state: TerminalState;
	committed: boolean;
	deliveredFrames: number;
	deliveredBytes: number;
	downstreamDisconnected: boolean;
	usage: Usage | null;
	finalInfo: Readonly<StreamFinalInfo>;
	error: GatewayStreamError | null;
}>;

export class StreamSession<Usage = unknown> {
	private current: StreamState = "PRE_COMMIT";
	private frames = 0;
	private bytes = 0;
	private disconnected = false;
	private outcome: StreamOutcome<Usage> | undefined;
	private resolve!: (outcome: StreamOutcome<Usage>) => void;
	readonly completion = new Promise<StreamOutcome<Usage>>(resolve => { this.resolve = resolve; });

	get state(): StreamState { return this.current; }
	get committed(): boolean { return this.frames > 0; }

	/** Call only after a downstream write succeeds, never on enqueue/headers. */
	delivered(byteLength: number): void {
		if (this.outcome || this.disconnected) return;
		if (!Number.isSafeInteger(byteLength) || byteLength <= 0) throw new RangeError("Invalid stream frame size");
		this.frames++;
		this.bytes += byteLength;
		this.current = "STREAMING";
	}

	/** Delivery stops now; accounting still awaits authoritative upstream usage. */
	disconnect(): void {
		if (!this.outcome) this.disconnected = true;
	}

	finish(usage: Usage | null, info: StreamFinalInfo, error: GatewayStreamError | null = null): StreamOutcome<Usage> {
		if (this.outcome) return this.outcome;
		const state = info.aborted || error ? "FAILED" : this.disconnected ? "CANCELLED" : "COMPLETED";
		this.current = state;
		this.outcome = Object.freeze({
			state, committed: this.committed, deliveredFrames: this.frames, deliveredBytes: this.bytes,
			downstreamDisconnected: this.disconnected, usage, finalInfo: Object.freeze({ ...info }), error,
		});
		this.resolve(this.outcome);
		return this.outcome;
	}
}
