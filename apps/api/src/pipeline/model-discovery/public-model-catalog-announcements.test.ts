import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	bindings: {} as Record<string, string>,
	getSupabaseAdmin: vi.fn(),
	buildPublicModelAnnouncementPayload: vi.fn(),
	sendDiscordWebhookPayload: vi.fn(),
	deliverPrivateModelDiscoveryMessage: vi.fn(),
}));

vi.mock("./private-model-discovery-notifications", () => ({
	deliverPrivateModelDiscoveryMessage: (...args: unknown[]) => mocks.deliverPrivateModelDiscoveryMessage(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));

vi.mock("./helpers", () => ({
	readBindingEnv: (names: string[]) => names.map((name) => mocks.bindings[name]).find(Boolean) ?? null,
	toBool: (value: string | null | undefined, fallback = false) => {
		if (value === null || value === undefined) return fallback;
		return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
	},
}));

vi.mock("./public-model-announcement-discord", () => ({
	buildPublicModelAnnouncementPayload: (...args: unknown[]) => {
		mocks.buildPublicModelAnnouncementPayload(...args);
		const models = args[0] as Array<{ modelId: string; modelUrl: string; imageUrl?: string }>;
		const options = args[2] as { message?: string; username?: string } | undefined;
		return {
			content: options?.message ?? "",
			allowed_mentions: { parse: [], roles: [], users: [] },
			username: options?.username ?? "Phaseo",
			embeds: models.map((model) => ({ title: model.modelId, url: model.modelUrl, image: { url: model.imageUrl } })),
		};
	},
}));

vi.mock("./discord-webhook", () => ({
	sendDiscordWebhookPayload: (...args: unknown[]) => mocks.sendDiscordWebhookPayload(...args),
}));

import { buildOverCapNotice, isTooOldToAnnounce, runPublicModelAnnouncementCheck } from "./public-model-catalog-announcements";

/** Fixtures were written around this date; pin the clock so the age window does not drift with time. */
const NOW = new Date("2026-10-20T00:00:00Z");

type ModelRow = {
	model_slug: string;
	name: string;
	known?: boolean;
	lab_slug: string;
	hidden: boolean;
	status: string;
	catalogue_status?: string | null;
	released_at?: string | null;
	announced_at?: string | null;
	lab?: { name: string; metadata: { colour: string } };
};

type StateRow = {
	model_slug: string;
	status: string;
	attempt_count: number;
	first_seen_at?: string;
	catalogue_status_snapshot?: string | null;
	public_visibility_snapshot?: boolean | null;
};

function buildClient(
	models: ModelRow[],
	stateRows: StateRow[],
	claimedRows: StateRow[] = [],
) {
	const upserts: Array<{ table: string; rows: unknown[] }> = [];
	const updates: Array<{ table: string; values: unknown; filters: Array<[string, string, unknown]> }> = [];
	const client = {
		from: vi.fn((table: string) => {
			const query: Record<string, any> = {};
			query.select = vi.fn(() => query);
			query.order = vi.fn(() => query);
			query.range = vi.fn(async () => ({
				data: table === "v2_models" ? models : stateRows,
				error: null,
			}));
			query.upsert = vi.fn(async (rows: unknown[]) => {
				upserts.push({ table, rows });
				return { error: null };
			});
			let filters: Array<[string, string, unknown]> = [];
			query.update = vi.fn((values: unknown) => {
				filters = [];
				updates.push({ table, values, filters });
				return query;
			});
			query.in = vi.fn((column: string, value: unknown) => {
				filters.push(["in", column, value]);
				return query;
			});
			query.eq = vi.fn((column: string, value: unknown) => {
				filters.push(["eq", column, value]);
				return query;
			});
			query.is = vi.fn((column: string, value: unknown) => {
				filters.push(["is", column, value]);
				return query;
			});
			query.or = vi.fn((value: string) => {
				filters.push(["or", "", value]);
				return query;
			});
			// Awaiting a write chain resolves like PostgREST: no error.
			query.then = (resolve: (value: { error: null }) => unknown) => resolve({ error: null });
			return query;
		}),
		rpc: vi.fn(async (name: string) => ({ data: name === "catalog_model_is_public" ? true : claimedRows, error: null })),
	};
	return { client, upserts, updates };
}

describe("runPublicModelAnnouncementCheck", () => {
	it("checks authoritative visibility after claiming and skips a newly private model", async () => {
		const model = { model_slug: "private/model", name: "Private", lab_slug: "private", hidden: false, status: "active", catalogue_status: "available" };
		const supabase = buildClient([model], [{ model_slug: "old/model", status: "announced", attempt_count: 0 }], [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }]);
		supabase.client.rpc.mockImplementation(async name => ({ data: name === "catalog_model_is_public" ? false : [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }] as any, error: null }));
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		expect(await runPublicModelAnnouncementCheck({ runId: "private-run", notify: true })).toMatchObject({ notified: 0, pending: 0, skipped: 1, error: null });
		expect(supabase.client.rpc).toHaveBeenCalledWith("catalog_model_is_public", { p_model_slug: model.model_slug });
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
		// "skipped" is not an allowed status; the claim goes back to baseline as not public.
		expect(supabase.updates.at(-1)?.values).toMatchObject({ status: "baseline", public_visibility_snapshot: false, claim_run_id: null });
	});
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		mocks.bindings = {};
		mocks.getSupabaseAdmin.mockReset();
		mocks.buildPublicModelAnnouncementPayload.mockReset();
		mocks.sendDiscordWebhookPayload.mockReset();
		mocks.sendDiscordWebhookPayload.mockResolvedValue(undefined);
		mocks.deliverPrivateModelDiscoveryMessage.mockReset();
		mocks.deliverPrivateModelDiscoveryMessage.mockResolvedValue({ delivered: true, skipped: false });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("records a long-known model that becomes public without announcing it (the 11-13 bulk edit)", async () => {
		// Shaped like the 175 models posted on 2026-11-13: in the catalogue since September, released months
		// ago, hidden until a bulk edit flipped them public.
		const model = { model_slug: "meta/llama-2-7b-chat", name: "Llama 2 7B Chat", lab_slug: "meta", hidden: false, status: "active", catalogue_status: "available", released_at: "2023-07-18T00:00:00Z" };
		const supabase = buildClient([model], [
			{ model_slug: model.model_slug, status: "baseline", attempt_count: 0, first_seen_at: "2026-09-17T01:30:17Z", catalogue_status_snapshot: "available", public_visibility_snapshot: false },
		]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";

		const summary = await runPublicModelAnnouncementCheck({ runId: "old-run", notify: true });

		expect(summary).toMatchObject({ detected: 0, notified: 0, pending: 0, tooOld: 1, error: null });
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
		expect(supabase.client.rpc).not.toHaveBeenCalled();
		// Marked handled (announced, no announced_at) with a public snapshot, so the next run does not pick it
		// up again; nothing was promoted.
		expect(supabase.updates.map((entry) => entry.values)).toEqual([
			expect.objectContaining({ status: "announced", public_visibility_snapshot: true, catalogue_status_snapshot: "available" }),
		]);
		expect(supabase.updates[0]?.values).not.toHaveProperty("announced_at");
		expect(supabase.updates.some((entry) => (entry.values as { status?: string }).status === "pending")).toBe(false);
	});

	it("still announces a staged model whose release date is recent even though it was first seen long ago", async () => {
		const model = { model_slug: "google/gemini-4-carbon", name: "Gemini 4 Carbon", lab_slug: "google", hidden: false, status: "active", catalogue_status: "available", released_at: "2026-10-19T00:00:00Z" };
		const supabase = buildClient([model], [
			{ model_slug: model.model_slug, status: "baseline", attempt_count: 0, first_seen_at: "2026-08-01T00:00:00Z", catalogue_status_snapshot: "available", public_visibility_snapshot: false },
		], [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";

		expect(await runPublicModelAnnouncementCheck({ runId: "staged-run", notify: true })).toMatchObject({ detected: 1, notified: 1, tooOld: 0 });
	});

	it("takes a stale pending row only when no live claim holds it", async () => {
		const model = { model_slug: "ibm/granite-20b", name: "Granite 20B", lab_slug: "ibm", hidden: false, status: "active", catalogue_status: "available", released_at: "2024-05-06T00:00:00Z" };
		const supabase = buildClient([model], [
			{ model_slug: model.model_slug, status: "pending", attempt_count: 1, first_seen_at: "2026-09-17T01:30:17Z" },
		]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";

		expect(await runPublicModelAnnouncementCheck({ runId: "stale-pending", notify: true })).toMatchObject({ notified: 0, pending: 0, tooOld: 1 });
		const release = supabase.updates.find((entry) => (entry.values as { status?: string }).status === "announced");
		expect(release?.values).toMatchObject({ claim_run_id: null, claim_expires_at: null });
		expect(release?.filters).toEqual(expect.arrayContaining([
			["in", "status", ["baseline", "pending", "announced"]],
			["or", "", `claim_run_id.is.null,claim_expires_at.lt."${NOW.toISOString()}"`],
		]));
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
	});

	it("announces nothing publicly when a run exceeds the per-run cap, and tells the private channel", async () => {
		const models = Array.from({ length: 4 }, (_, index) => ({
			model_slug: `lab/model-${index}`, name: `Model ${index}`, lab_slug: "lab", hidden: false, status: "active", catalogue_status: "available",
		}));
		const supabase = buildClient(models, [{ model_slug: "openai/existing", status: "baseline", attempt_count: 0 }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		mocks.bindings.PUBLIC_MODEL_ANNOUNCEMENT_MAX_PER_RUN = "3";

		const summary = await runPublicModelAnnouncementCheck({ runId: "bulk-run", notify: true });

		expect(summary).toMatchObject({ detected: 4, notified: 0, pending: 0, overCap: 4 });
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
		expect(supabase.client.rpc).not.toHaveBeenCalled();
		expect(mocks.deliverPrivateModelDiscoveryMessage).toHaveBeenCalledTimes(1);
		expect(mocks.deliverPrivateModelDiscoveryMessage.mock.calls[0]?.[0]).toContain("4 models became public in one run");
		// The rows inserted as pending are marked handled straight away.
		expect(supabase.updates.at(-1)?.values).toMatchObject({ status: "announced", claim_run_id: null });
		expect(supabase.updates.at(-1)?.values).not.toHaveProperty("announced_at");
	});

	it("does not post suppressed previews on the next scan through legacy preview recovery", async () => {
		// Second scan after an over-cap run: rows first seen after the original baseline with a preview
		// snapshot. As `baseline` they would match the legacy recovery branch; marked handled, they do not.
		const previews = Array.from({ length: 2 }, (_, index) => ({
			model_slug: `lab/preview-${index}`, name: `Preview ${index}`, lab_slug: "lab", hidden: false, status: "active", catalogue_status: "preview",
		}));
		const supabase = buildClient(previews, [
			{ model_slug: "openai/existing", status: "baseline", attempt_count: 0, first_seen_at: "2026-09-17T00:00:00Z" },
			...previews.map((model) => ({
				model_slug: model.model_slug, status: "announced", attempt_count: 0, first_seen_at: "2026-10-19T00:00:00Z",
				catalogue_status_snapshot: "preview", public_visibility_snapshot: true,
			})),
		]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";

		expect(await runPublicModelAnnouncementCheck({ runId: "second-scan", notify: true })).toMatchObject({ detected: 0, notified: 0, pending: 0, overCap: 0 });
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
		expect(mocks.deliverPrivateModelDiscoveryMessage).not.toHaveBeenCalled();
	});

	it("announces a batch at the cap as normal", async () => {
		const models = Array.from({ length: 3 }, (_, index) => ({
			model_slug: `lab/model-${index}`, name: `Model ${index}`, lab_slug: "lab", hidden: false, status: "active", catalogue_status: "available",
		}));
		const supabase = buildClient(models, [{ model_slug: "openai/existing", status: "baseline", attempt_count: 0 }],
			models.map((model) => ({ model_slug: model.model_slug, status: "pending", attempt_count: 0 })));
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		mocks.bindings.PUBLIC_MODEL_ANNOUNCEMENT_MAX_PER_RUN = "3";

		expect(await runPublicModelAnnouncementCheck({ runId: "cap-run", notify: true })).toMatchObject({ notified: 3, overCap: 0 });
		expect(mocks.deliverPrivateModelDiscoveryMessage).not.toHaveBeenCalled();
	});

	describe("isTooOldToAnnounce", () => {
		const nowMs = NOW.getTime();
		const window = 30 * 24 * 60 * 60_000;
		it.each([
			["first seen recently", { released_at: "2020-01-01T00:00:00Z" }, "2026-10-15T00:00:00Z", false],
			["no state row yet", { released_at: "2020-01-01T00:00:00Z" }, null, false],
			["old, no dates", {}, "2026-09-01T00:00:00Z", true],
			["old, old release", { released_at: "2025-01-01T00:00:00Z" }, "2026-09-01T00:00:00Z", true],
			["old, recent release", { released_at: "2026-10-10T00:00:00Z" }, "2026-09-01T00:00:00Z", false],
			["old, recent announcement", { announced_at: "2026-10-10T00:00:00Z" }, "2026-09-01T00:00:00Z", false],
		])("%s", (_label, model, firstSeenAt, expected) => {
			expect(isTooOldToAnnounce(model, firstSeenAt, nowMs, window)).toBe(expected);
		});
		it("is off when the window is 0", () => {
			expect(isTooOldToAnnounce({}, "2020-01-01T00:00:00Z", nowMs, 0)).toBe(false);
		});
	});

	it("lists at most 15 models in the over-cap notice", () => {
		const notice = buildOverCapNotice(Array.from({ length: 20 }, (_, index) => ({ modelSlug: `lab/m-${index}` })), 25);
		expect(notice).toContain("- lab/m-14");
		expect(notice).not.toContain("- lab/m-15");
		expect(notice).toContain("...and 5 more");
	});

	it("baselines the existing database catalog without announcing it", async () => {
		const supabase = buildClient(
			[
				{ model_slug: "openai/gpt-existing", name: "GPT Existing", lab_slug: "openai", hidden: false, status: "active" },
				{ model_slug: "openai/internal", name: "Internal", lab_slug: "openai", hidden: true, status: "active" },
			],
			[],
		);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";

		const ensureRun = vi.fn(async () => {});
		const summary = await runPublicModelAnnouncementCheck({ runId: "run-1", notify: true, ensureRun });

		expect(summary).toMatchObject({
			enabled: true,
			executed: true,
			baselineInitialized: true,
			detected: 0,
			notified: 0,
			pending: 0,
		});
		expect(supabase.upserts[0]?.rows).toEqual([
			expect.objectContaining({ model_slug: "openai/gpt-existing", status: "baseline", last_run_id: "run-1" }),
			expect.objectContaining({ model_slug: "openai/internal", status: "baseline", last_run_id: "run-1" }),
		]);
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
		expect(ensureRun).toHaveBeenCalledTimes(1);
	});

	it("does not create a run for an unchanged catalog", async () => {
		const supabase = buildClient(
			[{ model_slug: "openai/gpt-existing", name: "GPT Existing", lab_slug: "openai", hidden: false, status: "active", catalogue_status: "available" }],
			[{ model_slug: "openai/gpt-existing", status: "announced", attempt_count: 0, catalogue_status_snapshot: "available", public_visibility_snapshot: true }],
		);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		const ensureRun = vi.fn(async () => {});

		const summary = await runPublicModelAnnouncementCheck({ runId: "run-idle", notify: true, ensureRun });

		expect(summary).toMatchObject({ error: null, detected: 0, pending: 0 });
		expect(ensureRun).not.toHaveBeenCalled();
		expect(supabase.upserts).toHaveLength(0);
		expect(supabase.updates).toHaveLength(0);
	});

	it("announces new and previously pending available models with OG image URLs", async () => {
		const supabase = buildClient(
			[
				{ model_slug: "openai/gpt-new", name: "GPT New", lab_slug: "openai", hidden: false, status: "active", catalogue_status: "available" },
				{ model_slug: "anthropic/claude-pending", name: "Claude Pending", lab_slug: "anthropic", hidden: false, status: "active", catalogue_status: "available" },
				{ model_slug: "openai/gpt-old", name: "GPT Old", lab_slug: "openai", hidden: false, status: "active", catalogue_status: "available" },
			],
			[
				{ model_slug: "anthropic/claude-pending", status: "pending", attempt_count: 2 },
				{ model_slug: "openai/gpt-old", status: "announced", attempt_count: 0, catalogue_status_snapshot: "available", public_visibility_snapshot: true },
			],
			[
				{ model_slug: "openai/gpt-new", status: "pending", attempt_count: 0 },
				{ model_slug: "anthropic/claude-pending", status: "pending", attempt_count: 2 },
			],
		);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		mocks.bindings.DISCORD_ROLE_ID = "role-model-updates";

		const summary = await runPublicModelAnnouncementCheck({ runId: "run-2", notify: true });

		expect(summary).toMatchObject({ detected: 1, notified: 2, pending: 0, error: null });
		expect(mocks.sendDiscordWebhookPayload).toHaveBeenCalledTimes(1);
		const announcedModels = mocks.buildPublicModelAnnouncementPayload.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
		for (const model of announcedModels) {
			expect(model).not.toHaveProperty("changeSummaryLines");
		}
		const buildRoleId = mocks.buildPublicModelAnnouncementPayload.mock.calls[0]?.[1];
		const buildOptions = mocks.buildPublicModelAnnouncementPayload.mock.calls[0]?.[2] as {
			includeMentions?: boolean;
		};
		expect(buildRoleId).toBe("role-model-updates");
		expect(buildOptions.includeMentions).toBe(true);
		const payload = mocks.sendDiscordWebhookPayload.mock.calls[0]?.[1] as { embeds: Array<{ image: { url: string } }> };
		expect(payload.embeds.map((embed) => embed.image.url)).toEqual([
			"https://phaseo.app/og/models/openai/gpt-new",
			"https://phaseo.app/og/models/anthropic/claude-pending",
		]);
		expect(supabase.upserts[0]?.rows).toEqual([
			expect.objectContaining({ model_slug: "openai/gpt-new", status: "pending" }),
		]);
		expect(supabase.updates.map((entry) => entry.values)).toEqual([
			{
				status: "announced",
				catalogue_status_snapshot: "available",
				last_run_id: "run-2",
				announced_at: expect.any(String),
				last_attempt_at: expect.any(String),
				last_error: null,
				claim_run_id: null,
				claim_expires_at: null,
				updated_at: expect.any(String),
			},
		]);
	});

	it.each(["available", "preview"])("promotes a baseline model when it becomes %s", async (catalogueStatus) => {
		const supabase = buildClient(
			[
				{ model_slug: "openai/gpt-promoted", name: "GPT Promoted", lab_slug: "openai", hidden: false, status: "active", catalogue_status: catalogueStatus },
			],
			[
				{ model_slug: "openai/gpt-promoted", status: "baseline", attempt_count: 0 },
			],
			[
				{ model_slug: "openai/gpt-promoted", status: "pending", attempt_count: 0 },
			],
		);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";

		const summary = await runPublicModelAnnouncementCheck({ runId: "run-3", notify: true });

		expect(summary).toMatchObject({ detected: 1, notified: 1, pending: 0, error: null });
		expect(supabase.upserts).toHaveLength(0);
		expect(supabase.updates.map((entry) => entry.values)).toEqual([
			expect.objectContaining({ status: "pending", last_run_id: "run-3" }),
			expect.objectContaining({ status: "announced", catalogue_status_snapshot: catalogueStatus, claim_run_id: null }),
		]);
	});

	it.each(["preview", "available"])("recovers a legacy preview baseline now marked %s", async (catalogueStatus) => {
		const model = { model_slug: "mistral/mistral-large-4.0", name: "Mistral Large 4", lab_slug: "mistral", hidden: false, status: "active", catalogue_status: catalogueStatus };
		const supabase = buildClient([model], [
			{ model_slug: "openai/existing", status: "baseline", attempt_count: 0, first_seen_at: "2026-09-17T00:00:00Z" },
			{ model_slug: model.model_slug, status: "baseline", attempt_count: 0, first_seen_at: "2026-10-06T00:00:00Z", catalogue_status_snapshot: "preview", public_visibility_snapshot: true },
		], [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		expect(await runPublicModelAnnouncementCheck({ runId: "recover-run", notify: true })).toMatchObject({ detected: 1, notified: 1, pending: 0 });
	});

	it("preserves previews from the original baseline", async () => {
		const supabase = buildClient([
			{ model_slug: "mistral/existing", name: "Existing", lab_slug: "mistral", hidden: false, status: "active", catalogue_status: "preview" },
		], [{ model_slug: "mistral/existing", status: "baseline", attempt_count: 0, first_seen_at: "2026-09-17T00:00:00Z", catalogue_status_snapshot: "preview", public_visibility_snapshot: true }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		expect(await runPublicModelAnnouncementCheck({ runId: "baseline-run", notify: true })).toMatchObject({ detected: 0, notified: 0, pending: 0 });
	});

	it.each(["new", "pending"])("announces a %s preview release", async (state) => {
		const model = { model_slug: "mistral/mistral-large-4.0", name: "Mistral Large 4", lab_slug: "mistral", hidden: false, status: "active", catalogue_status: "preview", lab: { name: "Mistral AI", metadata: { colour: "#e97a35" } } };
		const supabase = buildClient([model], [
			{ model_slug: "openai/existing", status: "baseline", attempt_count: 0 },
			...(state === "pending" ? [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }] : []),
		], [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		expect(await runPublicModelAnnouncementCheck({ runId: "preview-run", notify: true })).toMatchObject({ notified: 1, pending: 0, error: null });
		expect(supabase.updates.at(-1)?.values).toMatchObject({ status: "announced", catalogue_status_snapshot: "preview" });
		expect(mocks.buildPublicModelAnnouncementPayload.mock.calls[0]?.[0]).toEqual([
			expect.objectContaining({ creatorName: "Mistral AI", creatorColor: "#e97a35" }),
		]);
	});

	it.each([
		{ hidden: true, status: "active", catalogue_status: "preview" },
		{ hidden: false, status: "draft", catalogue_status: "preview" },
		{ hidden: false, status: "active", catalogue_status: "announced" },
		{ hidden: false, status: "active", catalogue_status: "rumoured" },
	])("does not announce an unreleased or private model: %j", async (lifecycle) => {
		const supabase = buildClient([{ model_slug: "mistral/test", name: "Test", lab_slug: "mistral", ...lifecycle }], [
			{ model_slug: "openai/existing", status: "baseline", attempt_count: 0 },
		]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		expect(await runPublicModelAnnouncementCheck({ runId: "skip-run", notify: true })).toMatchObject({ detected: 0, notified: 0, pending: 0 });
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
	});

	it.each(["preview", "available"])("does not repeat an announced preview when its lifecycle is %s", async (catalogueStatus) => {
		const supabase = buildClient([
			{ model_slug: "mistral/mistral-large-4.0", name: "Mistral Large 4", lab_slug: "mistral", hidden: false, status: "active", catalogue_status: catalogueStatus },
		], [{ model_slug: "mistral/mistral-large-4.0", status: "announced", attempt_count: 0, catalogue_status_snapshot: "preview", public_visibility_snapshot: true }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		expect(await runPublicModelAnnouncementCheck({ runId: "repeat-run", notify: true })).toMatchObject({ detected: 0, notified: 0, pending: 0 });
		expect(mocks.sendDiscordWebhookPayload).not.toHaveBeenCalled();
	});
});
