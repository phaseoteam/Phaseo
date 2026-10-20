import {
	applyPreset,
	draftFromClassifier,
	draftToPayload,
	emptyDimension,
	emptyDraft,
	formatPercent,
	formatUsd,
	keyFromName,
	logsHrefForLabel,
	moveItem,
	problemLocation,
	type ClassifierDraft,
} from "./classifierForm";
import { CLASSIFIER_PRESETS, getClassifierPreset } from "./classifierPresets";
import { buildClassifierRequestBody, parseClassifierFields, parseDimensions } from "./requestClassifiers";
import type { SettingsClassifier } from "@/lib/fetchers/internal/settingsTypes";

function presetDraft(id: string, overrides: Partial<ClassifierDraft> = {}): ClassifierDraft {
	return { ...applyPreset(emptyDraft(), getClassifierPreset(id)!, "Preset name"), ...overrides };
}

describe("classifier presets", () => {
	it.each(CLASSIFIER_PRESETS.map((preset) => [preset.id, preset] as const))("%s passes the shared validation", (_id, preset) => {
		expect(parseDimensions(preset.dimensions)).toEqual({ ok: true, value: preset.dimensions });
		const built = draftToPayload(presetDraft(preset.id));
		expect(built.ok).toBe(true);
	});

	it("covers the requested taxonomies", () => {
		const keys = (id: string) => getClassifierPreset(id)!.dimensions.map((dimension) => [dimension.key, dimension.values.map((entry) => entry.value)]);
		expect(keys("department")).toEqual([["department", ["engineering", "sales", "marketing", "legal", "hr", "finance", "operations", "support"]]]);
		expect(keys("audience")).toEqual([["audience", ["internal", "customer_facing", "regulator", "public"]]]);
		expect(keys("task_type")).toEqual([["task_type", ["coding", "agent_workflow", "data_processing", "content_writing", "analysis", "translation", "support", "other"]]]);
		expect(keys("engineering_work")).toEqual([["engineering_work", ["feature", "bug_fix", "refactor", "docs", "code_review", "testing", "devops"]]]);
		expect(keys("agent_complexity")[0]).toEqual(["difficulty", ["trivial", "simple", "moderate", "complex", "expert"]]);
		expect(keys("agent_complexity")[1]?.[0]).toBe("task_family");
		expect(keys("compliance")).toEqual([["pii_present", ["yes", "no"]], ["regulated_topic", ["none", "health", "finance", "legal", "children"]]]);
	});

	it("replaces dimensions but keeps a name and instructions the user already typed", () => {
		const draft = applyPreset({ ...emptyDraft(), name: "Mine", instructions: "Be strict" }, getClassifierPreset("compliance")!, "Compliance");
		expect(draft.name).toBe("Mine");
		expect(draft.instructions).toBe("Be strict");
		expect(draft.dimensions.map((dimension) => dimension.key)).toEqual(["pii_present", "regulated_topic"]);
		const fresh = applyPreset(emptyDraft(), getClassifierPreset("compliance")!, "Compliance");
		expect(fresh.name).toBe("Compliance");
		expect(fresh.instructions).toContain("personal data");
	});
});

describe("draft serialization", () => {
	it("converts percent and dollars to API units and builds the scope", () => {
		const built = draftToPayload(presetDraft("department", {
			samplePercent: "12.5", budgetUsd: "$20", sampleBy: "session", includeResponse: true,
			keyIds: ["00000000-0000-4000-8000-0000000000a1"], models: ["openai/gpt-5"],
		}));
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.payload).toMatchObject({
			name: "Preset name", sample_rate: 0.125, monthly_budget_usd: 20, sample_by: "session", input_scope: "prompt_and_response",
			scope: { key_ids: ["00000000-0000-4000-8000-0000000000a1"], models: ["openai/gpt-5"] },
		});
		const parsed = parseClassifierFields(built.payload);
		expect(parsed.ok && parsed.value).toMatchObject({ sample_rate_bps: 1_250, monthly_budget_nanos: 20_000_000_000 });
	});

	it("drops blank value rows and sends no budget when empty", () => {
		const draft = presetDraft("audience");
		draft.dimensions[0]!.values.push({ uid: "blank", value: " ", description: "" });
		const built = draftToPayload({ ...draft, budgetUsd: "" });
		expect(built.ok && (built.payload.dimensions as any[])[0].values).toHaveLength(4);
		expect(built.ok && built.payload.monthly_budget_usd).toBeNull();
	});

	it.each([["0"], ["0.001"], ["101"], ["abc"], [""]])("rejects a sample share of %j", (samplePercent) => {
		expect(draftToPayload(presetDraft("audience", { samplePercent }))).toEqual({ ok: false, problem: { field: "samplePercent" } });
	});

	it.each([["0"], ["-5"], ["lots"]])("rejects a budget of %j", (budgetUsd) => {
		expect(draftToPayload(presetDraft("audience", { budgetUsd }))).toEqual({ ok: false, problem: { field: "budgetUsd" } });
	});

	it("reports the shared validator's message and where it points", () => {
		const draft = presetDraft("department");
		draft.dimensions[0]!.values[1] = { uid: "bad", value: "other", description: "" };
		const built = draftToPayload(draft);
		expect(built.ok).toBe(false);
		if (built.ok || built.problem.field !== "api") throw new Error("expected an API problem");
		expect(built.problem.message).toContain("dimensions[0].values");
		expect(problemLocation(built.problem.message)).toEqual({ dimension: 0, value: null });
		expect(problemLocation("dimensions[2].values[3].value must be 1 to 64 letters")).toEqual({ dimension: 2, value: 3 });
		expect(problemLocation("name must be 1 to 100 characters")).toEqual({ dimension: null, value: null });
	});

	it("rejects dimension keys in the reserved phaseo. namespace", () => {
		const draft = presetDraft("audience");
		draft.dimensions[0]!.key = "phaseo.classifier";
		const built = draftToPayload(draft);
		expect(!built.ok && built.problem.field === "api" && built.problem.message).toContain("reserved");
	});

	it("needs a name and a key for every dimension", () => {
		expect(draftToPayload({ ...presetDraft("audience"), name: "" }).ok).toBe(false);
		expect(draftToPayload({ ...presetDraft("audience"), dimensions: [emptyDimension()] }).ok).toBe(false);
	});

	it("round-trips a saved classifier", () => {
		const saved: SettingsClassifier = {
			id: "c1", workspace_id: "w1", name: "Department", description: null, enabled: false, model: "google/gemini-2.5-flash-lite",
			instructions: "x", dimensions: getClassifierPreset("department")!.dimensions, sample_rate: 0.0525, sample_by: "request",
			input_scope: "prompt", scope: { app_ids: ["00000000-0000-4000-8000-0000000000b1"] }, monthly_budget_usd: 7.5,
			created_by: null, created_at: "", updated_at: "", usage: { classifications: 0, costUsd: 0 },
		};
		const draft = draftFromClassifier(saved);
		expect(draft).toMatchObject({ samplePercent: "5.25", budgetUsd: "7.5", enabled: false, appIds: ["00000000-0000-4000-8000-0000000000b1"] });
		const built = draftToPayload(draft);
		expect(built.ok && built.payload).toMatchObject({ sample_rate: 0.0525, monthly_budget_usd: 7.5, scope: { app_ids: ["00000000-0000-4000-8000-0000000000b1"] } });
		expect(built.ok && built.payload.dimensions).toEqual(saved.dimensions);
	});

	it("tests a draft with the same request body the gateway builds", () => {
		const built = draftToPayload(presetDraft("department"));
		if (!built.ok) throw new Error("expected a valid draft");
		const body = buildClassifierRequestBody({ model: String(built.payload.model), instructions: "" }, built.payload.dimensions as never, "USER: hi");
		expect(body).toMatchObject({ store: false, temperature: 0, text: { format: { type: "json_schema", strict: true } } });
	});
});

describe("editor helpers", () => {
	it("moves items within bounds only", () => {
		expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
		expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
		const list = ["a", "b"];
		expect(moveItem(list, 0, 5)).toBe(list);
	});

	it("derives a valid label key from a name", () => {
		expect(keyFromName("Cost centre")).toBe("cost_centre");
		expect(keyFromName("  Équipe / région ")).toBe("equipe_region");
		expect(keyFromName("x".repeat(80))).toHaveLength(64);
	});

	it("formats money in US dollars and keeps sub-cent costs visible", () => {
		expect(formatUsd(12.5)).toBe("$12.50");
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(0.000042)).toBe("$0.000042");
		expect(formatUsd(1234.5)).toBe("$1,234.50");
	});

	it("formats sample rates as percentages", () => {
		expect(formatPercent(1)).toBe("100");
		expect(formatPercent(0.0001)).toBe("0.01");
		expect(formatPercent(0.333)).toBe("33.3");
	});

	it("links to Logs filtered by a label", () => {
		expect(logsHrefForLabel("department", "legal")).toBe("/settings/usage/logs/requests?label_key=department&label_value=legal");
		expect(logsHrefForLabel("phaseo.classifier", "c1")).toBe("/settings/usage/logs/requests?label_key=phaseo.classifier&label_value=c1");
	});
});
