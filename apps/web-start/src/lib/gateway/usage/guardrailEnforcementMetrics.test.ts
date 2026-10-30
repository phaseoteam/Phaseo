import {
	buildGuardrailBlockMetrics,
	buildGuardrailEnforcementMetrics,
	type GuardrailEnforcementEventRow,
} from "./guardrailEnforcementMetrics";

describe("buildGuardrailBlockMetrics", () => {
	test("places exact block counts in the chart's buckets", () => {
		const metrics = buildGuardrailBlockMetrics({
			blocks: [
				{ bucket: new Date(2026, 9, 15, 9).toISOString(), blocked: 2 },
				{ bucket: new Date(2026, 9, 15, 9).toISOString(), blocked: 1 },
				{ bucket: new Date(2026, 9, 15, 10).toISOString(), blocked: 0 },
			],
			timeRange: { from: new Date(2026, 9, 15, 8).toISOString(), to: new Date(2026, 9, 15, 11).toISOString() },
			range: "1d",
		});
		expect(metrics.totals).toEqual({ blocked: 3, redacted: 0, flagged: 0 });
		expect(metrics.buckets.map((bucket) => bucket.blocked)).toEqual([0, 3, 0, 0]);
		expect(metrics.signalsRecorded).toEqual({ blocked: true, redacted: false, flagged: false });
	});
});

describe("buildGuardrailEnforcementMetrics", () => {
	test("counts workspace-policy blocks and top guardrails", () => {
		const rows: GuardrailEnforcementEventRow[] = [
			{
				createdAt: "2026-05-09T10:02:00.000Z",
				errorPayload: {
					error: "validation_error",
					routing_diagnostics: {
						workspacePolicy: {
							activeGuardrailIds: ["gr_alpha"],
						},
					},
				},
			},
			{
				createdAt: "2026-05-09T10:04:00.000Z",
				errorPayload: {
					error: "validation_error",
					details: [
						{
							keyword: "model_not_allowed_by_workspace_policy",
							params: {
								activeGuardrailIds: ["gr_alpha", "gr_beta"],
							},
						},
					],
				},
			},
		];

		const metrics = buildGuardrailEnforcementMetrics({
			rows,
			timeRange: {
				from: "2026-05-09T10:00:00.000Z",
				to: "2026-05-09T11:00:00.000Z",
			},
			range: "1h",
		});

		expect(metrics.totals).toEqual({
			blocked: 2,
			redacted: 0,
			flagged: 0,
		});
		expect(metrics.topGuardrails).toEqual([
			{ id: "gr_alpha", count: 2 },
			{ id: "gr_beta", count: 1 },
		]);
		expect(metrics.signalsRecorded).toEqual({
			blocked: true,
			redacted: false,
			flagged: false,
		});
		expect(metrics.buckets.some((bucket) => bucket.blocked === 2)).toBe(true);
	});

	test("counts redact and flag signals from enforcement payloads", () => {
		const metrics = buildGuardrailEnforcementMetrics({
			rows: [
				{
					createdAt: "2026-05-09T10:15:00.000Z",
					errorPayload: {
						guardrail_enforcement: {
							actions: ["redact", "flag"],
							guardrail_ids: ["gr_sensitive"],
						},
					},
				},
			],
			timeRange: {
				from: "2026-05-09T10:00:00.000Z",
				to: "2026-05-09T11:00:00.000Z",
			},
			range: "1h",
		});

		expect(metrics.totals).toEqual({
			blocked: 0,
			redacted: 1,
			flagged: 1,
		});
		expect(metrics.topGuardrails).toEqual([{ id: "gr_sensitive", count: 1 }]);
		expect(metrics.signalsRecorded).toEqual({
			blocked: false,
			redacted: true,
			flagged: true,
		});
	});
});
