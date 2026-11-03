import type { SettingsGuardrailRow } from "@/lib/fetchers/internal/settingsTypes";
import {
	applyGuardrailAssignmentChange,
	buildGuardrailAssignmentRows,
	directAssignmentState,
	effectiveGuardrailPolicy,
	matchesAssignmentQuery,
} from "./guardrailAssignments";

function guardrail(id: string, overrides: Partial<SettingsGuardrailRow> = {}): SettingsGuardrailRow {
	return { id, name: id, enabled: true, ...overrides };
}

describe("effectiveGuardrailPolicy", () => {
	it("merges like the gateway: allowlists intersect, blocklists and rules union, strictest action wins", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("a", {
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["openai", "anthropic", "google"],
				model_restriction_mode: "blocklist",
				allowed_api_model_ids: ["m1"],
				prompt_injection_enabled: true,
				prompt_injection_action: "redact",
				sensitive_info_enabled: true,
				sensitive_info_rules: [
					{ id: "email_address", kind: "builtin", enabled: true, action: "redact" },
					{ id: "ssn", kind: "builtin", enabled: false, action: "block" },
				],
			}),
			guardrail("b", {
				privacy_zdr_only: true,
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["anthropic", "google", "mistral"],
				model_restriction_mode: "blocklist",
				allowed_api_model_ids: ["m1", "m2"],
				prompt_injection_enabled: true,
				prompt_injection_action: "block",
				sensitive_info_enabled: true,
				sensitive_info_rules: [
					{ id: "email_address", kind: "builtin", enabled: true, action: "block" },
					{ id: "ticket", kind: "custom", enabled: true, action: "flag", name: "Ticket", pattern: "T-\\d+" },
				],
			}),
		]);
		expect(policy).toEqual({
			activeCount: 2,
			zdrOnly: true,
			providerAllowCount: 2,
			providerBlockCount: 0,
			modelAllowCount: null,
			modelBlockCount: 2,
			promptInjection: "block",
			sensitiveInfoRuleCount: 2,
		});
	});

	it("skips guardrails that are off, and sensitive-info rules when the section is off", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("off", { enabled: false, privacy_zdr_only: true, prompt_injection_enabled: true }),
			guardrail("on", { sensitive_info_enabled: false, sensitive_info_rules: [{ id: "email_address", kind: "builtin", enabled: true, action: "redact" }] }),
		]);
		expect(policy).toMatchObject({ activeCount: 1, zdrOnly: false, promptInjection: null, sensitiveInfoRuleCount: 0 });
	});

	it("reports an empty allowlist intersection as zero, not as no restriction", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("a", { model_restriction_mode: "allowlist", allowed_api_model_ids: ["m1"] }),
			guardrail("b", { model_restriction_mode: "allowlist", allowed_api_model_ids: ["m2"] }),
		]);
		expect(policy.modelAllowCount).toBe(0);
	});

	it("leaves blocked ids out of the allowed counts", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("a", { provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["openai", "anthropic"], model_restriction_mode: "allowlist", allowed_api_model_ids: ["m1"] }),
			guardrail("b", { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["openai"], model_restriction_mode: "blocklist", allowed_api_model_ids: ["m1"] }),
		]);
		expect(policy).toMatchObject({ providerAllowCount: 1, providerBlockCount: 1, modelAllowCount: 0, modelBlockCount: 1 });
	});
});

describe("buildGuardrailAssignmentRows", () => {
	const guardrails = [guardrail("g-new", { name: "Newest" }), guardrail("g-old", { name: "Oldest", enabled: false }), guardrail("g-member", { name: "Team policy", privacy_zdr_only: true })];
	const base = {
		keys: [
			{ id: "k1", name: "Prod", prefix: "aistats_ab", status: "active", principalUserId: "u1" },
			{ id: "k2", name: "CI", prefix: "aistats_cd", status: "paused", principalUserId: null },
		],
		members: [{ id: "u1", name: "Sam", role: "admin" }, { id: "u2", name: "Lee", role: "member" }],
		guardrails,
		guardrailKeyIdsByGuardrailId: { "g-old": ["k1"], "g-new": ["k1"], "g-gone": ["k2"] },
		guardrailMemberIdsByGuardrailId: { "g-member": ["u1"] },
		untitled: "Untitled",
	};

	it("lists a key's direct guardrails in list order, then the ones its principal member passes on", () => {
		const [prod, ci] = buildGuardrailAssignmentRows({ ...base, targetType: "key" });
		expect(prod.guardrails).toEqual([
			{ id: "g-new", name: "Newest", enabled: true, source: "direct" },
			{ id: "g-old", name: "Oldest", enabled: false, source: "direct" },
			{ id: "g-member", name: "Team policy", enabled: true, source: "member" },
		]);
		expect(prod.directGuardrailIds).toEqual(["g-new", "g-old"]);
		expect(prod.inheritedFrom).toEqual({ id: "u1", name: "Sam" });
		expect(prod.effective).toMatchObject({ activeCount: 2, zdrOnly: true });
		// Assignments to guardrails that no longer exist are ignored.
		expect(ci.guardrails).toEqual([]);
		expect(ci.inheritedFrom).toBeNull();
		expect(ci.status).toBe("paused");
	});

	it("keeps guardrails inherited from a creator who has left the workspace", () => {
		const [prod] = buildGuardrailAssignmentRows({ ...base, targetType: "key", members: [{ id: "u2", name: "Lee", role: "member" }] });
		expect(prod.guardrails.map((g) => `${g.id}:${g.source}`)).toEqual(["g-new:direct", "g-old:direct", "g-member:member"]);
		expect(prod.inheritedFrom).toEqual({ id: "u1", name: null });
		expect(prod.effective).toMatchObject({ activeCount: 2, zdrOnly: true });
	});

	it("does not repeat a guardrail assigned both directly and through the member", () => {
		const [prod] = buildGuardrailAssignmentRows({ ...base, targetType: "key", guardrailKeyIdsByGuardrailId: { "g-member": ["k1"] } });
		expect(prod.guardrails.map((g) => `${g.id}:${g.source}`)).toEqual(["g-member:direct"]);
		expect(prod.inheritedFrom).toBeNull();
	});

	it("builds member rows from member assignments only", () => {
		const rows = buildGuardrailAssignmentRows({ ...base, targetType: "member" });
		expect(rows.map((row) => [row.name, row.detail, row.directGuardrailIds])).toEqual([["Sam", "admin", ["g-member"]], ["Lee", "member", []]]);
	});

	it("searches names, prefixes and guardrail names", () => {
		const rows = buildGuardrailAssignmentRows({ ...base, targetType: "key" });
		expect(rows.filter((row) => matchesAssignmentQuery(row, "team")).map((row) => row.id)).toEqual(["k1"]);
		expect(rows.filter((row) => matchesAssignmentQuery(row, "AISTATS_CD")).map((row) => row.id)).toEqual(["k2"]);
		expect(rows.filter((row) => matchesAssignmentQuery(row, " ")).length).toBe(2);
	});

	it("reports whether all, some or none of the rows have a guardrail directly", () => {
		const rows = buildGuardrailAssignmentRows({ ...base, targetType: "key" });
		expect(directAssignmentState(rows, "g-new")).toBe("some");
		expect(directAssignmentState(rows.slice(0, 1), "g-new")).toBe("all");
		expect(directAssignmentState(rows, "g-member")).toBe("none");
	});
});

describe("applyGuardrailAssignmentChange", () => {
	it("adds and removes only the named targets", () => {
		expect(applyGuardrailAssignmentChange(
			{ a: ["k1", "k2"], b: ["k3"] },
			{ targetIds: ["k1", "k3"], addGuardrailIds: ["b", "c"], removeGuardrailIds: ["a"] },
		)).toEqual({ a: ["k2"], b: ["k3", "k1"], c: ["k1", "k3"] });
	});
});
