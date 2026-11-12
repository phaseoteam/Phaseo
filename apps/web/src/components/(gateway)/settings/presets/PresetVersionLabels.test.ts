import { describe, it, expect, vi } from "vitest";
import { labelMoveFor, labelReference, labelsSummary, normalizeLabelInput, versionName, versionRunInput } from "./PresetVersionLabels";

vi.mock("@/features/settings/presets/actions", () => ({}));

const versions = [
	{ id: "v3", version_number: 3, version_label: "v3", release_notes: null, visibility: "team", created_at: null, labels: ["staging"] },
	{ id: "v2", version_number: 2, version_label: "v2", release_notes: null, visibility: "team", created_at: null, labels: ["production"] },
	{ id: "s1", version_number: 4, version_label: null, release_notes: null, visibility: "team", created_at: null, labels: [] },
];
const labels = [
	{ label: "production", version_id: "v2", updated_at: null },
	{ label: "staging", version_id: "v3", updated_at: null },
];

describe("preset version labels", () => {
	it("accepts the labels the database accepts, lowercased", () => {
		expect(normalizeLabelInput(" Production ")).toBe("production");
		expect(normalizeLabelInput("canary_2-eu")).toBe("canary_2-eu");
		for (const bad of ["", "v2", "V10", "2fast", "has space", "a".repeat(33), "-x"]) expect(normalizeLabelInput(bad)).toBeNull();
	});

	it("names versions the way requests pin them", () => {
		expect(versionName(versions[0])).toBe("v3");
		expect(versionName(versions[2])).toBe("v4");
		expect(labelReference("@acme/support-triage", "production")).toBe("@acme/support-triage@production");
	});

	it("moves a label when its version picker changes, and says where it was", () => {
		// Rolling production back from v2 to an earlier pick is one change of the picker.
		expect(labelMoveFor("production", "v3", { versions, labels })).toEqual({ label: "production", version: versions[0], from: "v2" });
		expect(labelMoveFor("production", "s1", { versions, labels })?.from).toBe("v2");
	});

	it("does nothing when the picker keeps the same version or names a version that is gone", () => {
		expect(labelMoveFor("production", "v2", { versions, labels })).toBeNull();
		expect(labelMoveFor("production", "deleted", { versions, labels })).toBeNull();
	});

	it("summarises where labels point for the overview row", () => {
		expect(labelsSummary({ versions, labels })).toBe("production → v2, staging → v3");
		expect(labelsSummary({ versions, labels: [...labels, { label: "canary", version_id: "s1", updated_at: null }] })).toBe("production → v2, staging → v3 +1");
		expect(labelsSummary({ versions, labels: [{ label: "old", version_id: "missing", updated_at: null }] })).toBe("old → ?");
	});
});

describe("running a published version", () => {
	const prompt = {
		messages: [{ role: "user", content: "Ticket {{ticket}} for {{company}}" }],
		variables: { ticket: { type: "string", required: true }, company: { type: "string", default: "Acme" } },
	};

	it("types the test values by that version's template", () => {
		expect(versionRunInput(prompt, { ticket: "Refund please" })).toEqual({ ok: true, variables: { ticket: "Refund please" } });
	});

	it("explains a missing required value instead of sending a request that fails", () => {
		const input = versionRunInput(prompt, {});
		expect(input.ok).toBe(false);
		expect(input).toMatchObject({ reason: "values" });
		expect(input.ok === false && input.issue).toContain("ticket");
	});

	it("does not run a version that has no template", () => {
		expect(versionRunInput(null, {})).toEqual({ ok: false, reason: "no_template" });
		expect(versionRunInput({ messages: [] }, {})).toEqual({ ok: false, reason: "no_template" });
	});
});
