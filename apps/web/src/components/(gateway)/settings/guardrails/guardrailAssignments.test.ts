import type { SettingsGuardrailRow } from "@/lib/fetchers/internal/settingsTypes";
import {
	applyGuardrailAssignmentChange,
	buildGuardrailAssignmentRows,
	chunkAssignmentChange,
	directAssignmentState,
	effectiveGuardrailPolicy,
	matchesAssignmentQuery,
	withPendingChanges,
	workspaceAssignmentMap,
	WORKSPACE_TARGET_ID,
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
			noPaidTraining: false,
			noFreeTraining: false,
			noLogging: false,
			providerAllowCount: 2,
			providerBlockCount: 0,
			modelAllowCount: null,
			modelBlockCount: 2,
			promptInjection: "block",
			sensitiveInfoRuleCount: 2,
			requestsPerMinute: null,
			tokensPerMinute: null,
			concurrentRequests: null,
			spendLimits: { daily: null, weekly: null, monthly: null },
			spendBlocks: false,
		});
	});

	it("counts a training or logging rule from any guardrail, as the gateway does", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("a", { privacy_enable_paid_may_train: false }),
			guardrail("b", { privacy_enable_free_may_train: true, privacy_enable_input_output_logging: false }),
			guardrail("off", { enabled: false, privacy_enable_free_may_train: false }),
		]);
		expect(policy).toMatchObject({ noPaidTraining: true, noFreeTraining: false, noLogging: true });
	});

	it("skips guardrails that are off, and sensitive-info rules when the section is off", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("off", { enabled: false, privacy_zdr_only: true, prompt_injection_enabled: true }),
			guardrail("on", { sensitive_info_enabled: false, sensitive_info_rules: [{ id: "email_address", kind: "builtin", enabled: true, action: "redact" }] }),
		]);
		expect(policy).toMatchObject({ activeCount: 1, zdrOnly: false, promptInjection: null, sensitiveInfoRuleCount: 0 });
	});

	it("matches provider aliases to their canonical id before merging, like the gateway", () => {
		const policy = effectiveGuardrailPolicy([
			guardrail("a", { provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["xai", "NovitaAI"] }),
			guardrail("b", { provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["spacex-ai", "novita"] }),
			guardrail("c", { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["novita-ai"] }),
		]);
		expect(policy).toMatchObject({ providerAllowCount: 1, providerBlockCount: 1 });
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

describe("rate limits in the effective policy", () => {
	it("keeps the lowest of each limit from enabled rate guardrails, and names where they come from", () => {
		const rate = (id: string, fields: Record<string, unknown>) => ({ id, name: id, enabled: true, kind: "rate" as const, ...fields });
		const guardrails = [
			rate("team", { rate_requests_per_minute: 600, rate_tokens_per_minute: 2_000_000 }),
			rate("strict", { rate_requests_per_minute: 60, rate_concurrent_requests: 4 }),
			rate("paused", { enabled: false, rate_requests_per_minute: 1 }),
		];
		expect(effectiveGuardrailPolicy(guardrails)).toMatchObject({ requestsPerMinute: 60, tokensPerMinute: 2_000_000, concurrentRequests: 4 });
		expect(effectiveGuardrailPolicy([])).toMatchObject({ requestsPerMinute: null, tokensPerMinute: null, concurrentRequests: null });
		const [row] = buildGuardrailAssignmentRows({
			targetType: "key", untitled: "Untitled",
			keys: [{ id: "key-1", name: "Prod", prefix: "pk_1", status: "active" }], members: [], guardrails,
			guardrailWorkspaceIdsByGuardrailId: { team: ["workspace"] },
			guardrailKeyIdsByGuardrailId: { strict: ["key-1"], paused: ["key-1"] }, guardrailMemberIdsByGuardrailId: {},
		});
		expect(row!.rateFrom.map((guardrail) => guardrail.id)).toEqual(["strict", "team"]);
		expect(row!.accessFrom).toEqual([]);
	});
});

describe("spend limits in the effective policy", () => {
	it("keeps the lowest limit of each period from enabled spend guardrails, notes blocking, and names where they come from", () => {
		const spend = (id: string, fields: Partial<SettingsGuardrailRow>): SettingsGuardrailRow => ({ id, name: id, enabled: true, kind: "spend", spend_counting: "shared", ...fields });
		const guardrails = [
			spend("team", { spend_limit_nanos: 100_000_000_000, spend_period: "monthly", spend_action: "notify" }),
			spend("strict", { spend_limit_nanos: 40_000_000_000, spend_period: "monthly", spend_action: "block" }),
			spend("daily", { spend_limit_nanos: 5_000_000_000, spend_period: "daily", spend_action: "notify" }),
			spend("paused", { enabled: false, spend_limit_nanos: 1, spend_period: "weekly", spend_action: "block" }),
		];
		expect(effectiveGuardrailPolicy(guardrails)).toMatchObject({
			spendLimits: { daily: 5_000_000_000, weekly: null, monthly: 40_000_000_000 }, spendBlocks: true,
		});
		expect(effectiveGuardrailPolicy([guardrails[0]!, guardrails[2]!])).toMatchObject({ spendBlocks: false });
		const [row] = buildGuardrailAssignmentRows({
			targetType: "key", untitled: "Untitled",
			keys: [{ id: "key-1", name: "Prod", prefix: "pk_1", status: "active" }], members: [], guardrails,
			guardrailWorkspaceIdsByGuardrailId: { team: ["workspace"] },
			guardrailKeyIdsByGuardrailId: { strict: ["key-1"], paused: ["key-1"] }, guardrailMemberIdsByGuardrailId: {},
		});
		expect(row!.spendFrom.map((guardrail) => guardrail.id)).toEqual(["strict", "team"]);
		expect(row!.rateFrom).toEqual([]);
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
			{ id: "g-new", name: "Newest", enabled: true, source: { level: "direct" }, sources: [{ level: "direct" }], baseline: false },
			{ id: "g-old", name: "Oldest", enabled: false, source: { level: "direct" }, sources: [{ level: "direct" }], baseline: false },
			{ id: "g-member", name: "Team policy", enabled: true, source: { level: "member", id: "u1", name: "Sam" }, sources: [{ level: "member", id: "u1", name: "Sam" }], baseline: false },
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
		expect(prod.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual(["g-new:direct", "g-old:direct", "g-member:member"]);
		expect(prod.guardrails[2]?.source).toEqual({ level: "member", id: "u1", name: null });
		expect(prod.inheritedFrom).toEqual({ id: "u1", name: null });
		expect(prod.effective).toMatchObject({ activeCount: 2, zdrOnly: true });
	});

	it("does not repeat a guardrail assigned both directly and through the member", () => {
		const [prod] = buildGuardrailAssignmentRows({ ...base, targetType: "key", guardrailKeyIdsByGuardrailId: { "g-member": ["k1"] } });
		expect(prod.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual(["g-member:direct"]);
		expect(prod.guardrails[0]?.sources.map((source) => source.level)).toEqual(["direct", "member"]);
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

	describe("workspace and department levels", () => {
		const levels = {
			...base,
			guardrails: [
				...guardrails,
				guardrail("g-eng", { name: "EU only", provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["mistral"] }),
				guardrail("g-all", { name: "Block injection", prompt_injection_enabled: true, prompt_injection_action: "block" }),
				guardrail("g-base", { name: "Workspace baseline", is_workspace_baseline: true, privacy_zdr_only: true }),
			],
			departments: [{ id: "d-eng", name: "Engineering" }, { id: "d-ops", name: "Operations" }],
			guardrailWorkspaceIdsByGuardrailId: workspaceAssignmentMap(["g-base", "g-all"]),
			guardrailDepartmentIdsByGuardrailId: { "g-eng": ["d-eng"] },
			keyDepartmentIds: { k1: ["d-eng"] },
			memberDepartmentIds: { u1: ["d-eng"], u2: ["d-ops"] },
			workspace: { name: "Whole workspace", detail: "Every key" },
			departmentDetail: ({ members, keys }: { members: number; keys: number }) => `${members}m ${keys}k`,
		};

		it("shows the workspace row with its guardrails, the baseline last", () => {
			const [row] = buildGuardrailAssignmentRows({ ...levels, targetType: "workspace" });
			expect(row).toMatchObject({ type: "workspace", id: WORKSPACE_TARGET_ID, name: "Whole workspace", detail: "Every key" });
			expect(row?.guardrails.map((g) => `${g.id}:${g.source.level}:${g.baseline}`)).toEqual(["g-all:direct:false", "g-base:direct:true"]);
		});

		it("gives each department its own guardrails, the workspace's, and how many members and keys it reaches", () => {
			const rows = buildGuardrailAssignmentRows({ ...levels, targetType: "department" });
			expect(rows.map((row) => [row.name, row.detail, row.directGuardrailIds])).toEqual([["Engineering", "1m 1k", ["g-eng"]], ["Operations", "1m 0k", []]]);
			expect(rows[0]?.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual(["g-eng:direct", "g-all:workspace", "g-base:workspace"]);
		});

		it("gives a key every level, most specific first, and names where each column's rules come from", () => {
			const [prod, ci] = buildGuardrailAssignmentRows({ ...levels, targetType: "key" });
			expect(prod?.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual([
				"g-new:direct", "g-old:direct", "g-member:member", "g-eng:department", "g-all:workspace", "g-base:workspace",
			]);
			expect(prod?.guardrails.find((g) => g.id === "g-eng")?.source).toEqual({ level: "department", id: "d-eng", name: "Engineering" });
			expect(prod?.effective).toMatchObject({ zdrOnly: true, providerAllowCount: 1, promptInjection: "block" });
			expect(prod?.accessFrom.map((g) => g.id)).toEqual(["g-member", "g-eng", "g-base"]);
			expect(prod?.safetyFrom.map((g) => g.id)).toEqual(["g-all"]);
			// No department: only the workspace level reaches it.
			expect(ci?.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual(["g-all:workspace", "g-base:workspace"]);
		});

		it("gives a member their departments' guardrails and the workspace's", () => {
			const [sam, lee] = buildGuardrailAssignmentRows({ ...levels, targetType: "member" });
			expect(sam?.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual(["g-member:direct", "g-eng:department", "g-all:workspace", "g-base:workspace"]);
			expect(lee?.guardrails.map((g) => `${g.id}:${g.source.level}`)).toEqual(["g-all:workspace", "g-base:workspace"]);
		});
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

describe("withPendingChanges", () => {
	const base = { g1: ["k1"], g2: ["k2"] };

	it("applies changes still saving in order, for this target type only", () => {
		const pending = [
			{ id: 1, targetType: "key" as const, change: { targetIds: ["k2"], addGuardrailIds: ["g1"] }, savedOn: null },
			{ id: 2, targetType: "member" as const, change: { targetIds: ["u1"], addGuardrailIds: ["g1"] }, savedOn: null },
			{ id: 3, targetType: "key" as const, change: { targetIds: ["k1"], removeGuardrailIds: ["g1"] }, savedOn: null },
		];
		expect(withPendingChanges(base, "key", pending)).toEqual({ g1: ["k2"], g2: ["k2"] });
	});

	it("keeps a saved change until fresher data replaces the map it was saved on", () => {
		const saved = [{ id: 1, targetType: "key" as const, change: { targetIds: ["k2"], addGuardrailIds: ["g1"] }, savedOn: base }];
		expect(withPendingChanges(base, "key", saved).g1).toEqual(["k1", "k2"]);
		const refetched = { g1: ["k1", "k2"], g2: ["k2"] };
		expect(withPendingChanges(refetched, "key", saved)).toBe(refetched);
	});

	it("keeps a change still saving when another change's refetch arrives", () => {
		const pending = [{ id: 2, targetType: "key" as const, change: { targetIds: ["k1"], addGuardrailIds: ["g2"] }, savedOn: null }];
		const refetched = { g1: ["k1", "k2"], g2: ["k2"] };
		expect(withPendingChanges(refetched, "key", pending).g2).toEqual(["k2", "k1"]);
	});
});

describe("chunkAssignmentChange", () => {
	it("splits targets into changes of at most the limit", () => {
		const targetIds = Array.from({ length: 450 }, (_, index) => `k${index}`);
		const chunks = chunkAssignmentChange({ targetIds, addGuardrailIds: ["g1"] }, 200);
		expect(chunks.map((chunk) => chunk.targetIds.length)).toEqual([200, 200, 50]);
		expect(chunks.every((chunk) => chunk.addGuardrailIds?.[0] === "g1")).toBe(true);
		expect(chunks.flatMap((chunk) => chunk.targetIds)).toEqual(targetIds);
	});
});
