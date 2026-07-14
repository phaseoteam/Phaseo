"use client";

type ChatPerformanceMarkName =
	| "composer-submit"
	| "playground-send-received"
	| "user-message-created"
	| "thread-update-start"
	| "thread-update-complete"
	| "user-message-rendered"
	| "request-dispatch"
	| "response-headers"
	| "stream-first-frame"
	| "stream-first-token"
	| "stream-complete"
	| "request-error"
	| "send-complete";

type ChatPerformanceMeasureName =
	| "submit-to-send-handler"
	| "submit-to-thread-update-start"
	| "submit-to-thread-update-complete"
	| "submit-to-user-message-rendered"
	| "submit-to-request-dispatch"
	| "submit-to-response-headers"
	| "submit-to-first-frame"
	| "submit-to-first-token"
	| "request-dispatch-to-response-headers"
	| "request-dispatch-to-first-token"
	| "request-dispatch-to-complete";

type ChatPerformanceRun = {
	id: string;
	messageId: string | null;
	startedAt: number;
	contentLength: number;
	attachmentCount: number;
	marks: Partial<Record<ChatPerformanceMarkName, number>>;
	measures: Partial<Record<ChatPerformanceMeasureName, number>>;
};

type ChatPerformanceStore = {
	runs: ChatPerformanceRun[];
	activeRunId: string | null;
	start: (input: {
		contentLength: number;
		attachmentCount: number;
	}) => string;
	linkMessage: (runId: string | null | undefined, messageId: string) => void;
	mark: (
		runId: string | null | undefined,
		name: ChatPerformanceMarkName,
	) => void;
	markUserMessageRendered: (messageId: string) => void;
	getLatest: () => ChatPerformanceRun | null;
	reset: () => void;
};

declare global {
	interface Window {
		__PHASEO_CHAT_PERF__?: ChatPerformanceStore;
	}
}

const MAX_RUNS = 20;

function canMeasure() {
	return (
		typeof window !== "undefined" &&
		typeof performance !== "undefined" &&
		typeof performance.mark === "function"
	);
}

function getMeasureStart(run: ChatPerformanceRun, name: ChatPerformanceMeasureName) {
	if (name.startsWith("request-dispatch")) {
		return run.marks["request-dispatch"] ?? null;
	}
	return run.marks["composer-submit"] ?? null;
}

function getMeasureEnd(
	run: ChatPerformanceRun,
	name: ChatPerformanceMeasureName,
) {
	switch (name) {
		case "submit-to-send-handler":
			return run.marks["playground-send-received"] ?? null;
		case "submit-to-thread-update-start":
			return run.marks["thread-update-start"] ?? null;
		case "submit-to-thread-update-complete":
			return run.marks["thread-update-complete"] ?? null;
		case "submit-to-user-message-rendered":
			return run.marks["user-message-rendered"] ?? null;
		case "submit-to-request-dispatch":
			return run.marks["request-dispatch"] ?? null;
		case "submit-to-response-headers":
		case "request-dispatch-to-response-headers":
			return run.marks["response-headers"] ?? null;
		case "submit-to-first-frame":
			return run.marks["stream-first-frame"] ?? null;
		case "submit-to-first-token":
		case "request-dispatch-to-first-token":
			return run.marks["stream-first-token"] ?? null;
		case "request-dispatch-to-complete":
			return run.marks["stream-complete"] ?? run.marks["request-error"] ?? null;
	}
}

function updateMeasures(run: ChatPerformanceRun) {
	const measureNames: ChatPerformanceMeasureName[] = [
		"submit-to-send-handler",
		"submit-to-thread-update-start",
		"submit-to-thread-update-complete",
		"submit-to-user-message-rendered",
		"submit-to-request-dispatch",
		"submit-to-response-headers",
		"submit-to-first-frame",
		"submit-to-first-token",
		"request-dispatch-to-response-headers",
		"request-dispatch-to-first-token",
		"request-dispatch-to-complete",
	];
	for (const name of measureNames) {
		const start = getMeasureStart(run, name);
		const end = getMeasureEnd(run, name);
		if (start == null || end == null || end < start) continue;
		run.measures[name] = Number((end - start).toFixed(2));
	}
}

function markPerformanceEntry(runId: string, name: ChatPerformanceMarkName) {
	try {
		performance.mark(`phaseo.chat.${runId}.${name}`);
	} catch {
		// User Timing marks are best-effort diagnostics.
	}
}

function createStore(): ChatPerformanceStore {
	const runs: ChatPerformanceRun[] = [];

	const getRun = (runId: string | null | undefined) => {
		if (!runId) return null;
		return runs.find((run) => run.id === runId) ?? null;
	};

	const mark = (
		runId: string | null | undefined,
		name: ChatPerformanceMarkName,
	) => {
		if (!canMeasure()) return;
		const run = getRun(runId);
		if (!run || run.marks[name] != null) return;
		run.marks[name] = performance.now();
		markPerformanceEntry(run.id, name);
		updateMeasures(run);
	};

	return {
		runs,
		activeRunId: null,
		start(input) {
			const run: ChatPerformanceRun = {
				id: `${Date.now().toString(36)}-${Math.random()
					.toString(36)
					.slice(2, 8)}`,
				messageId: null,
				startedAt: performance.now(),
				contentLength: input.contentLength,
				attachmentCount: input.attachmentCount,
				marks: {},
				measures: {},
			};
			runs.push(run);
			if (runs.length > MAX_RUNS) {
				runs.splice(0, runs.length - MAX_RUNS);
			}
			this.activeRunId = run.id;
			mark(run.id, "composer-submit");
			return run.id;
		},
		linkMessage(runId, messageId) {
			const run = getRun(runId ?? this.activeRunId);
			if (!run) return;
			run.messageId = messageId;
		},
		mark,
		markUserMessageRendered(messageId) {
			const run = runs
				.slice()
				.reverse()
				.find((candidate) => candidate.messageId === messageId);
			if (!run) return;
			mark(run.id, "user-message-rendered");
		},
		getLatest() {
			return runs[runs.length - 1] ?? null;
		},
		reset() {
			runs.splice(0, runs.length);
			this.activeRunId = null;
		},
	};
}

export function getChatPerformanceStore() {
	if (!canMeasure()) return null;
	window.__PHASEO_CHAT_PERF__ ??= createStore();
	return window.__PHASEO_CHAT_PERF__;
}

export function startChatSendPerformanceRun(input: {
	contentLength: number;
	attachmentCount: number;
}) {
	return getChatPerformanceStore()?.start(input) ?? null;
}

export function linkChatPerformanceMessage(
	runId: string | null | undefined,
	messageId: string,
) {
	getChatPerformanceStore()?.linkMessage(runId, messageId);
}

export function markChatPerformance(
	runId: string | null | undefined,
	name: ChatPerformanceMarkName,
) {
	getChatPerformanceStore()?.mark(runId, name);
}

export function markChatUserMessageRendered(messageId: string) {
	getChatPerformanceStore()?.markUserMessageRendered(messageId);
}
