import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	bindings: {} as Record<string, string>,
	getSupabaseAdmin: vi.fn(),
	buildPublicModelAnnouncementPayload: vi.fn(),
	sendDiscordWebhookPayload: vi.fn(),
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

import { runPublicModelAnnouncementCheck } from "./public-model-catalog-announcements";

type ModelRow = {
	model_slug: string;
	name: string;
	known?: boolean;
	lab_slug: string;
	hidden: boolean;
	status: string;
	catalogue_status?: string | null;
};

type StateRow = {
	model_slug: string;
	status: string;
	attempt_count: number;
	catalogue_status_snapshot?: string | null;
	public_visibility_snapshot?: boolean | null;
};

function buildClient(
	models: ModelRow[],
	stateRows: StateRow[],
	claimedRows: StateRow[] = [],
) {
	const upserts: Array<{ table: string; rows: unknown[] }> = [];
	const updates: Array<{ table: string; values: unknown }> = [];
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
			query.update = vi.fn((values: unknown) => {
				updates.push({ table, values });
				return query;
			});
			query.in = vi.fn(() => query);
			query.eq = vi.fn(async () => ({ error: null }));
			return query;
		}),
		rpc: vi.fn(async () => ({ data: claimedRows, error: null })),
	};
	return { client, upserts, updates };
}

describe("runPublicModelAnnouncementCheck", () => {
	beforeEach(() => {
		mocks.bindings = {};
		mocks.getSupabaseAdmin.mockReset();
		mocks.buildPublicModelAnnouncementPayload.mockReset();
		mocks.sendDiscordWebhookPayload.mockReset();
		mocks.sendDiscordWebhookPayload.mockResolvedValue(undefined);
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

	it.each(["new", "pending"])("announces a %s preview release", async (state) => {
		const model = { model_slug: "mistral/mistral-large-4.0", name: "Mistral Large 4", lab_slug: "mistral", hidden: false, status: "active", catalogue_status: "preview" };
		const supabase = buildClient([model], [
			{ model_slug: "openai/existing", status: "baseline", attempt_count: 0 },
			...(state === "pending" ? [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }] : []),
		], [{ model_slug: model.model_slug, status: "pending", attempt_count: 0 }]);
		mocks.getSupabaseAdmin.mockReturnValue(supabase.client);
		mocks.bindings.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC = "https://discord.test/webhook";
		expect(await runPublicModelAnnouncementCheck({ runId: "preview-run", notify: true })).toMatchObject({ notified: 1, pending: 0, error: null });
		expect(supabase.updates.at(-1)?.values).toMatchObject({ status: "announced", catalogue_status_snapshot: "preview" });
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
