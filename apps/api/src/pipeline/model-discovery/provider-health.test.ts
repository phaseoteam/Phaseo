import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
const deliverMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => getSupabaseAdminMock(),
}));
vi.mock("./private-model-discovery-notifications", () => ({
	deliverPrivateModelDiscoveryMessage: (message: string) => deliverMock(message),
}));

import {
	batchProviderHealthAlerts,
	buildProviderHealthMessage,
	nextProviderStatus,
	redactProviderError,
	runProviderHealthCheck,
	selectProviderHealthAlerts,
	type ProviderCheckOutcome,
	type ProviderStatusRow,
} from "./provider-health";

const NOW = new Date("2026-10-17T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function outcome(status: ProviderCheckOutcome["status"], overrides: Partial<ProviderCheckOutcome> = {}): ProviderCheckOutcome {
	return {
		providerId: "stepfun",
		providerName: "StepFun",
		status,
		reason: status === "ok" ? null : "HTTP 401: Incorrect API key provided",
		modelCount: status === "ok" ? 12 : null,
		durationMs: status === "skipped" ? null : 250,
		...overrides,
	};
}

function row(overrides: Partial<ProviderStatusRow> = {}): ProviderStatusRow {
	return {
		provider_id: "stepfun",
		provider_name: "StepFun",
		status: "error",
		reason: "HTTP 401",
		model_count: null,
		duration_ms: 250,
		consecutive_failures: 1,
		failing_since: minutesAgo(15),
		alerted_at: null,
		skip_notice_pending: false,
		payload_fingerprint: null,
		last_checked_at: minutesAgo(15),
		last_success_at: minutesAgo(600),
		last_run_id: "run-0",
		...overrides,
	};
}

describe("nextProviderStatus", () => {
	it("starts a failure streak on the first failed check", () => {
		const next = nextProviderStatus(undefined, outcome("error"), { nowIso: NOW.toISOString(), runId: "run-1" });

		expect(next).toMatchObject({ status: "error", consecutive_failures: 1, failing_since: NOW.toISOString(), last_success_at: null });
	});

	it("extends a streak without moving its start", () => {
		const next = nextProviderStatus(row({ consecutive_failures: 4, failing_since: minutesAgo(45) }), outcome("error"), {
			nowIso: NOW.toISOString(),
			runId: "run-2",
		});

		expect(next).toMatchObject({ consecutive_failures: 5, failing_since: minutesAgo(45), last_success_at: minutesAgo(600) });
	});

	it("clears the streak on success but keeps alerted_at until a recovery notice is delivered", () => {
		const next = nextProviderStatus(row({ alerted_at: minutesAgo(30) }), outcome("ok"), { nowIso: NOW.toISOString(), runId: "run-3" });

		expect(next).toMatchObject({
			status: "ok",
			consecutive_failures: 0,
			failing_since: null,
			alerted_at: minutesAgo(30),
			last_success_at: NOW.toISOString(),
			model_count: 12,
		});
	});

	it("moves last_success_at and model_count only for recorded successes, and keeps them through failures", () => {
		const args = { nowIso: NOW.toISOString(), runId: "run" };
		const healthy = row({ status: "ok", failing_since: null, consecutive_failures: 0, model_count: 0, last_success_at: minutesAgo(15) });

		expect(nextProviderStatus(healthy, outcome("ok", { modelCount: 54 }), args)).toMatchObject({ model_count: 54, last_success_at: NOW.toISOString() });
		// A success whose models were not persisted proves nothing about what is stored.
		expect(nextProviderStatus(healthy, outcome("ok", { modelCount: 54, recorded: false }), args)).toMatchObject({
			status: "ok", model_count: 0, last_success_at: minutesAgo(15),
		});
		expect(nextProviderStatus(healthy, outcome("error"), args)).toMatchObject({ model_count: 0, last_success_at: minutesAgo(15) });
	});

	it("records the processed response fingerprint, keeps it when the sweep did not persist, and clears it on failure", () => {
		const args = { nowIso: NOW.toISOString(), runId: "run" };
		const healthy = row({ status: "ok", failing_since: null, consecutive_failures: 0, payload_fingerprint: "old" });

		expect(nextProviderStatus(healthy, outcome("ok", { payloadFingerprint: "new" }), args).payload_fingerprint).toBe("new");
		expect(nextProviderStatus(healthy, outcome("ok", { payloadFingerprint: undefined }), args).payload_fingerprint).toBe("old");
		expect(nextProviderStatus(healthy, outcome("error", { payloadFingerprint: undefined }), args).payload_fingerprint).toBeNull();
	});

	it("caps stored reasons", () => {
		const next = nextProviderStatus(undefined, outcome("error", { reason: "x".repeat(1_000) }), { nowIso: NOW.toISOString(), runId: "run" });

		expect(next.reason).toHaveLength(300);
	});
});

describe("selectProviderHealthAlerts", () => {
	it("alerts once a streak has lasted an hour over at least three checks", () => {
		const longStreak = row({ consecutive_failures: 5, failing_since: minutesAgo(61) });
		const shortStreak = row({ provider_id: "nvidia", consecutive_failures: 5, failing_since: minutesAgo(30) });
		const fewChecks = row({ provider_id: "z-ai", consecutive_failures: 2, failing_since: minutesAgo(90) });
		const alreadyAlerted = row({ provider_id: "cloudflare", consecutive_failures: 9, failing_since: minutesAgo(600), alerted_at: minutesAgo(500) });

		const alerts = selectProviderHealthAlerts(new Map(), [longStreak, shortStreak, fewChecks, alreadyAlerted], NOW);

		expect(alerts.failing.map((alert) => alert.row.provider_id)).toEqual(["stepfun"]);
		expect(alerts.recovered).toEqual([]);
	});

	it("reports recoveries only for providers operators were told about", () => {
		const alerted = row({ status: "ok", consecutive_failures: 0, failing_since: null, alerted_at: minutesAgo(30) });
		const silent = row({ provider_id: "z-ai", status: "ok", consecutive_failures: 0, failing_since: null });

		const alerts = selectProviderHealthAlerts(new Map(), [alerted, silent], NOW);

		expect(alerts.recovered.map((alert) => alert.row.provider_id)).toEqual(["stepfun"]);
	});

	it("says once when a checked provider stops being checked", () => {
		const args = { nowIso: NOW.toISOString(), runId: "run" };
		const wasChecked = row({ provider_id: "mistral", provider_name: "Mistral", status: "ok", failing_since: null, consecutive_failures: 0 });
		const neverChecked = row({ provider_id: "avian", provider_name: "Avian", status: "skipped", failing_since: null, consecutive_failures: 0 });
		const skipped = nextProviderStatus(wasChecked, outcome("skipped", { providerId: "mistral", providerName: "Mistral" }), args);
		const stillSkipped = nextProviderStatus(neverChecked, outcome("skipped", { providerId: "avian", providerName: "Avian" }), args);

		const alerts = selectProviderHealthAlerts(new Map([["mistral", wasChecked], ["avian", neverChecked]]), [skipped, stillSkipped], NOW);

		expect(skipped.skip_notice_pending).toBe(true);
		expect(stillSkipped.skip_notice_pending).toBe(false);
		expect(alerts.stoppedChecking.map((alert) => alert.row.provider_id)).toEqual(["mistral"]);
	});

	it("keeps an undelivered no-longer-checked notice pending on later sweeps", () => {
		const args = { nowIso: NOW.toISOString(), runId: "run" };
		const pending = row({ status: "skipped", skip_notice_pending: true, failing_since: null, consecutive_failures: 0 });

		const next = nextProviderStatus(pending, outcome("skipped"), args);

		expect(next.skip_notice_pending).toBe(true);
		expect(selectProviderHealthAlerts(new Map([["stepfun", pending]]), [next], NOW).stoppedChecking).toHaveLength(1);
		expect(nextProviderStatus(pending, outcome("ok"), args).skip_notice_pending).toBe(false);
	});
});

describe("buildProviderHealthMessage", () => {
	it("lists failing, recovered and stopped providers with durations", () => {
		const message = buildProviderHealthMessage({
			failing: [{ row: row({ consecutive_failures: 6, failing_since: minutesAgo(125) }), previous: undefined }],
			recovered: [{
				row: row({ provider_id: "cloudflare", provider_name: "Cloudflare Workers AI", status: "ok", model_count: 30 }),
				previous: row({ provider_id: "cloudflare", failing_since: minutesAgo(605) }),
			}],
			stoppedChecking: [{ row: row({ provider_id: "mistral", provider_name: "Mistral", status: "skipped", reason: "Missing env: MISTRAL_API_KEY" }), previous: undefined }],
		}, NOW);

		expect(message).toBe([
			"Model watcher provider checks",
			"",
			"Failing for over an hour (1):",
			"- StepFun (stepfun): 6 failed checks over 2h 5m. HTTP 401",
			"",
			"Recovered (1):",
			"- Cloudflare Workers AI (cloudflare): checking again after 10h 5m, 30 models.",
			"",
			"No longer checked (1):",
			"- Mistral (mistral): Missing env: MISTRAL_API_KEY",
		].join("\n"));
	});
});

describe("redactProviderError", () => {
	it("removes the provider key and key-shaped tokens", () => {
		expect(redactProviderError("bad key abcd1234efgh5678 for sk-proj-ABCDEFGHIJKLMNOP", "abcd1234efgh5678"))
			.toBe("bad key [redacted] for [redacted]");
	});

	it("leaves ordinary errors alone", () => {
		expect(redactProviderError("HTTP 410: host_retired", "short")).toBe("HTTP 410: host_retired");
	});
});

describe("runProviderHealthCheck", () => {
	function supabaseWith(previous: ProviderStatusRow[]) {
		const upserts: ProviderStatusRow[][] = [];
		const deletes: string[][] = [];
		const table = {
			select: vi.fn(async () => ({ data: previous, error: null })),
			upsert: vi.fn(async (rows: ProviderStatusRow[]) => {
				upserts.push(rows);
				return { error: null };
			}),
			delete: vi.fn(() => ({
				in: vi.fn(async (_column: string, ids: string[]) => {
					deletes.push(ids);
					return { error: null };
				}),
			})),
		};
		const fingerprintChanges: unknown[][] = [];
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn(() => table),
			rpc: vi.fn(async (_name: string, params: { p_rows: unknown[] }) => {
				fingerprintChanges.push(params.p_rows);
				return { data: 0, error: null };
			}),
		});
		return { upserts, deletes, fingerprintChanges };
	}

	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
		deliverMock.mockReset();
	});

	it("marks a delivered failure alert so it is not repeated", async () => {
		const db = supabaseWith([row({ consecutive_failures: 3, failing_since: minutesAgo(70) })]);
		deliverMock.mockResolvedValue({ delivered: true, skipped: false });

		const summary = await runProviderHealthCheck({ runId: "run-9", outcomes: [outcome("error")], notify: true, coversAllProviders: false, now: NOW });

		expect(deliverMock).toHaveBeenCalledTimes(1);
		expect(deliverMock.mock.calls[0]?.[0]).toContain("StepFun (stepfun): 4 failed checks over 1h 10m");
		expect(db.upserts[0]?.[0]).toMatchObject({ alerted_at: NOW.toISOString(), consecutive_failures: 4 });
		expect(summary).toEqual({ checked: 1, failing: 1, alertsSent: 1, error: null });
	});

	it("keeps alert state when delivery fails so the next sweep retries", async () => {
		const db = supabaseWith([row({ consecutive_failures: 3, failing_since: minutesAgo(70) })]);
		deliverMock.mockRejectedValue(new Error("Discord webhook failed with HTTP 500"));

		const summary = await runProviderHealthCheck({ runId: "run-9", outcomes: [outcome("error")], notify: true, coversAllProviders: false, now: NOW });

		expect(db.upserts[0]?.[0]?.alerted_at).toBeNull();
		expect(summary.alertsSent).toBe(0);
		expect(summary.error).toContain("HTTP 500");
	});

	it("clears alert state once a recovery is delivered", async () => {
		const db = supabaseWith([row({ consecutive_failures: 8, alerted_at: minutesAgo(60), failing_since: minutesAgo(130) })]);
		deliverMock.mockResolvedValue({ delivered: true, skipped: false });

		await runProviderHealthCheck({ runId: "run-10", outcomes: [outcome("ok")], notify: true, coversAllProviders: false, now: NOW });

		expect(deliverMock.mock.calls[0]?.[0]).toContain("checking again after 2h 10m, 12 models.");
		expect(db.upserts[0]?.[0]).toMatchObject({ status: "ok", alerted_at: null });
	});

	it("records outcomes without alerting when notifications are off", async () => {
		const db = supabaseWith([row({ consecutive_failures: 3, failing_since: minutesAgo(70) })]);

		await runProviderHealthCheck({ runId: "run-11", outcomes: [outcome("error")], notify: false, coversAllProviders: false, now: NOW });

		expect(deliverMock).not.toHaveBeenCalled();
		expect(db.upserts[0]?.[0]).toMatchObject({ consecutive_failures: 4, alerted_at: null });
	});

	it("removes rows for providers no longer watched only after a full sweep", async () => {
		const removed = row({ provider_id: "clarifai", status: "error" });
		const partial = supabaseWith([removed]);
		await runProviderHealthCheck({ runId: "run-12", outcomes: [outcome("ok")], notify: false, coversAllProviders: false, now: NOW });
		expect(partial.deletes).toEqual([]);

		const full = supabaseWith([removed]);
		await runProviderHealthCheck({ runId: "run-13", outcomes: [outcome("ok")], notify: false, coversAllProviders: true, now: NOW });
		expect(full.deletes).toEqual([["clarifai"]]);
	});

	it("retries a no-longer-checked notice that was not delivered, then clears it", async () => {
		const wasChecked = row({ status: "ok", failing_since: null, consecutive_failures: 0 });
		const first = supabaseWith([wasChecked]);
		await runProviderHealthCheck({ runId: "run-14", outcomes: [outcome("skipped")], notify: false, coversAllProviders: false, now: NOW });
		const savedAfterSilentSweep = first.upserts[0]?.[0];
		expect(savedAfterSilentSweep).toMatchObject({ status: "skipped", skip_notice_pending: true });

		const second = supabaseWith([savedAfterSilentSweep!]);
		deliverMock.mockResolvedValue({ delivered: true, skipped: false });
		await runProviderHealthCheck({ runId: "run-15", outcomes: [outcome("skipped")], notify: true, coversAllProviders: false, now: NOW });

		expect(deliverMock.mock.calls[0]?.[0]).toContain("No longer checked (1):");
		expect(second.upserts[0]?.[0]).toMatchObject({ status: "skipped", skip_notice_pending: false });
	});

	it("splits long alert lists into messages under the limit and acknowledges only delivered batches", async () => {
		const failing = Array.from({ length: 12 }, (_, i) => row({
			provider_id: `provider-${i}`,
			provider_name: `Provider ${i}`,
			consecutive_failures: 5,
			failing_since: minutesAgo(90),
			reason: `HTTP 500: ${"upstream error detail ".repeat(12)}`.slice(0, 300),
		}));
		const batches = batchProviderHealthAlerts({ failing: failing.map((r) => ({ row: r, previous: r })), recovered: [], stoppedChecking: [] }, NOW);
		expect(batches.length).toBeGreaterThan(1);
		expect(batches.every((batch) => batch.text.length <= 1_900)).toBe(true);
		expect(batches.flatMap((batch) => batch.alerts.failing.map((alert) => alert.row.provider_id))).toEqual(failing.map((r) => r.provider_id));

		const db = supabaseWith(failing);
		deliverMock.mockResolvedValueOnce({ delivered: true, skipped: false }).mockRejectedValueOnce(new Error("Discord webhook failed with HTTP 429"));
		const summary = await runProviderHealthCheck({
			runId: "run-17",
			outcomes: failing.map((r) => outcome("error", { providerId: r.provider_id, providerName: r.provider_name, reason: r.reason })),
			notify: true,
			coversAllProviders: false,
			now: NOW,
		});

		const acknowledged = db.upserts[0]!.filter((saved) => saved.alerted_at === NOW.toISOString()).map((saved) => saved.provider_id);
		expect(acknowledged).toEqual(batches[0]!.alerts.failing.map((alert) => alert.row.provider_id));
		expect(summary.alertsSent).toBe(acknowledged.length);
		expect(summary.error).toContain("HTTP 429");
	});

	it("keeps fingerprints out of the status upsert and records changed ones by compare-and-set", async () => {
		const db = supabaseWith([
			row({ status: "ok", failing_since: null, consecutive_failures: 0, payload_fingerprint: "F" }),
			row({ provider_id: "vercel", provider_name: "Vercel", status: "ok", failing_since: null, consecutive_failures: 0, payload_fingerprint: "V" }),
		]);

		await runProviderHealthCheck({
			runId: "run-16",
			outcomes: [
				outcome("ok", { payloadFingerprint: "G" }),
				outcome("ok", { providerId: "vercel", providerName: "Vercel", payloadFingerprint: "V" }),
			],
			notify: false,
			coversAllProviders: false,
			now: NOW,
		});

		expect(db.upserts[0]?.every((saved) => !("payload_fingerprint" in saved))).toBe(true);
		// Only the changed fingerprint is sent, with the value this sweep started from.
		expect(db.fingerprintChanges).toEqual([[{ provider_id: "stepfun", expected: "F", next: "G" }]]);
	});
});
