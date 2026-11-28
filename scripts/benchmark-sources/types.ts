/** One benchmark a source publishes. `id` is the v2_benchmarks id; reuse an existing id when the board is the same benchmark. */
export type BenchmarkDefinition = {
	id: string;
	name: string;
	/** Board page shown as the benchmark's link. */
	url: string;
	category: string;
	/** "percentage" when values are 0–100 shares, otherwise "numerical". */
	type: "percentage" | "numerical";
	higherIsBetter: boolean;
	unit?: string;
	/** What the model is asked to do, then how it is scored. Only what the publisher states. */
	description: string;
};

/** One score as the leaderboard prints it, before catalogue matching. */
export type SourceObservation = {
	benchmarkId: string;
	/** The model as the leaderboard names it, e.g. "GPT-6.2 Astra (high)". */
	label: string;
	value: number;
	/** Reasoning effort when the board states it separately from the label. */
	effort?: string;
	harness?: string;
	/**
	 * The publisher's configuration when it is neither effort nor harness, e.g. "with fallback", "PGN", "w/ refuse", "CoT".
	 * Rows that differ only here are kept apart and the configuration is shown in the variant label.
	 */
	config?: string;
	ciLow?: number;
	ciHigh?: number;
	costUsd?: number;
	durationSeconds?: number;
	/** Mean output tokens as published; fractional means are kept. */
	outputTokens?: number;
	observedOn?: string;
	note?: string;
	/** Deep link for this row when the board has one. */
	url?: string;
};

export type BenchmarkSource = {
	id: string;
	name: string;
	publisher: string;
	url: string;
	/** Credit line shown next to the data. */
	attribution: string;
	benchmarks: BenchmarkDefinition[];
	/** Fewest rows a healthy run returns; fewer and the run is refused rather than wiping data. */
	minRows: number;
	fetch(ctx: SourceContext): Promise<SourceObservation[]>;
};

export type SourceContext = {
	fetchText(url: string, init?: RequestInit): Promise<string>;
	fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
	/** Raw response body, for boards that publish binary data files. Optional so existing contexts still type-check. */
	fetchBytes?(url: string, init?: RequestInit): Promise<Uint8Array>;
};
