import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

// Mobile push settings for the Phaseo app: a master switch, quiet hours, a daily cap, one Expo
// token per app installation, and up to 50 rules. Matching, quiet hours and the cap are applied
// by the database when an event fans out (enqueue_mobile_push_deliveries); this router only
// validates and stores. The tables deny browser access, so every query runs as the service role
// scoped to the signed-in user.

export const MOBILE_NOTIFICATION_EVENT_KINDS = [
	"model_released",
	"gateway_available",
	"price_changed",
	"deprecation_announced",
	"provider_added",
] as const;
export const MAX_MOBILE_NOTIFICATION_RULES = 50;
const MAX_LIST_IDS = 200;
const DEFAULT_DAILY_CAP = 10;
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const MOBILE_PUSH_CHANNEL_ID = "model-updates";
const INSTALLATION_ID = /^[A-Za-z0-9._:-]{8,200}$/;
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_SLUG = /^[a-z0-9][a-z0-9._:/+@-]*$/;
const SHORT_SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const MODALITY = /^[a-z0-9][a-z0-9_-]*$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const RULE_SELECT =
	"id,name,enabled,action,event_kinds,lab_mode,lab_slugs,provider_mode,provider_slugs,model_slugs,input_modalities,output_modalities,only_on_phaseo,include_free_variants,position";

type EventKind = (typeof MOBILE_NOTIFICATION_EVENT_KINDS)[number];
type ScopeMode = "all" | "only" | "except";

type RuleRow = {
	id: string;
	name: string | null;
	enabled: boolean;
	action: "notify" | "mute";
	event_kinds: string[] | null;
	lab_mode: ScopeMode;
	lab_slugs: string[] | null;
	provider_mode: ScopeMode;
	provider_slugs: string[] | null;
	model_slugs: string[] | null;
	input_modalities: string[] | null;
	output_modalities: string[] | null;
	only_on_phaseo: boolean;
	include_free_variants: boolean;
	position: number;
};

export type MobileNotificationRule = {
	id: string;
	name: string | null;
	enabled: boolean;
	action: "notify" | "mute";
	events: EventKind[];
	labs: { mode: ScopeMode; ids: string[] };
	providers: { mode: ScopeMode; ids: string[] };
	models: string[];
	inputModalities: string[];
	outputModalities: string[];
	onlyOnPhaseo: boolean;
	includeFreeVariants: boolean;
	position: number;
};

export type MobileNotificationSettings = {
	enabled: boolean;
	quietHours: { start: string; end: string } | null;
	dailyCap: number;
	deviceRegistered: boolean;
	rules: MobileNotificationRule[];
	eventKinds: EventKind[];
};

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function slugList(pattern: RegExp, plural: string, maxLength = 200) {
	return z
		.array(
			z.string({ message: `${plural} must be a list of ids.` }).trim().toLowerCase()
				.min(1, { message: `${plural} cannot contain empty ids.` })
				.max(maxLength, { message: `Each of the ${plural} must be at most ${maxLength} characters.` })
				.regex(pattern, { message: `${plural} must be lowercase ids such as "openai".` }),
			{ message: `${plural} must be a list of ids.` },
		)
		.max(MAX_LIST_IDS, { message: `List at most ${MAX_LIST_IDS} ${plural}.` })
		.transform(unique);
}

function scopeSchema(singular: string, plural: string) {
	return z
		.object({
			mode: z.enum(["all", "only", "except"], { message: `${singular} mode must be "all", "only" or "except".` }),
			ids: slugList(SHORT_SLUG, plural, 64).optional(),
		}, { message: `${plural} must be an object with a mode and ids.` })
		.strict()
		.transform((scope) => ({ mode: scope.mode, ids: scope.mode === "all" ? [] : scope.ids ?? [] }))
		.refine((scope) => scope.mode === "all" || scope.ids.length > 0, {
			message: `Choose at least one ${singular} for "only" or "except", or use "all".`,
			path: ["ids"],
		});
}

const modalityList = z
	.array(
		z.string({ message: "Modalities must be a list of words." }).trim().toLowerCase().min(1).max(32)
			.regex(MODALITY, { message: 'Modalities must be lowercase words such as "text" or "image".' }),
		{ message: "Modalities must be a list of words." },
	)
	.max(20, { message: "List at most 20 modalities." })
	.transform(unique);

const ruleFields = {
	name: z.string({ message: "name must be text or null." }).trim()
		.max(80, { message: "Rule names must be at most 80 characters." })
		.nullable()
		.transform((value) => value || null),
	enabled: z.boolean({ message: "enabled must be true or false." }),
	action: z.enum(["notify", "mute"], { message: 'action must be "notify" or "mute".' }),
	events: z
		.array(
			z.enum(MOBILE_NOTIFICATION_EVENT_KINDS, { message: `Events must be any of: ${MOBILE_NOTIFICATION_EVENT_KINDS.join(", ")}.` }),
			{ message: "events must be a list." },
		)
		.min(1, { message: "Choose at least one event." })
		.max(20, { message: "List each event once." })
		.transform(unique),
	labs: scopeSchema("lab", "labs"),
	providers: scopeSchema("provider", "providers"),
	models: slugList(MODEL_SLUG, "models"),
	inputModalities: modalityList,
	outputModalities: modalityList,
	onlyOnPhaseo: z.boolean({ message: "onlyOnPhaseo must be true or false." }),
	includeFreeVariants: z.boolean({ message: "includeFreeVariants must be true or false." }),
};
// Clients may send a rule back as they received it; id and position are ignored.
const echoedFields = { id: z.unknown().optional(), position: z.unknown().optional() };

const createRuleSchema = z
	.object({
		...echoedFields,
		name: ruleFields.name.optional(),
		enabled: ruleFields.enabled.optional(),
		action: ruleFields.action.optional(),
		events: ruleFields.events,
		labs: ruleFields.labs.optional(),
		providers: ruleFields.providers.optional(),
		models: ruleFields.models.optional(),
		inputModalities: ruleFields.inputModalities.optional(),
		outputModalities: ruleFields.outputModalities.optional(),
		onlyOnPhaseo: ruleFields.onlyOnPhaseo.optional(),
		includeFreeVariants: ruleFields.includeFreeVariants.optional(),
	}, { message: "Send the rule as a JSON object." })
	.strict();

const updateRuleSchema = z
	.object({
		...echoedFields,
		name: ruleFields.name.optional(),
		enabled: ruleFields.enabled.optional(),
		action: ruleFields.action.optional(),
		events: ruleFields.events.optional(),
		labs: ruleFields.labs.optional(),
		providers: ruleFields.providers.optional(),
		models: ruleFields.models.optional(),
		inputModalities: ruleFields.inputModalities.optional(),
		outputModalities: ruleFields.outputModalities.optional(),
		onlyOnPhaseo: ruleFields.onlyOnPhaseo.optional(),
		includeFreeVariants: ruleFields.includeFreeVariants.optional(),
	}, { message: "Send the changes as a JSON object." })
	.strict();

type RuleChanges = z.infer<typeof updateRuleSchema>;

const clockTime = (example: string) => z.string({ message: `Quiet hours use 24-hour "HH:MM" times, such as "${example}".` })
	.regex(CLOCK, { message: `Quiet hours use 24-hour "HH:MM" times, such as "${example}".` });
const dailyCapMessage = { message: "dailyCap must be a whole number from 1 to 100." };

const settingsSchema = z
	.object({
		enabled: z.boolean({ message: "enabled must be true or false." }).optional(),
		quietHours: z
			.object({ start: clockTime("22:00"), end: clockTime("07:00") }, { message: "quietHours must be an object with start and end, or null." })
			.strict()
			.refine((hours) => hours.start !== hours.end, { message: "Quiet hours must start and end at different times." })
			.nullable()
			.optional(),
		dailyCap: z.number(dailyCapMessage).int(dailyCapMessage).min(1, dailyCapMessage).max(100, dailyCapMessage).optional(),
	}, { message: "Send the settings as a JSON object." })
	.strict();

function isTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

const deviceSchema = z
	.object({
		expoPushToken: z.string({ message: "expoPushToken is required." }).trim().max(300)
			.regex(EXPO_PUSH_TOKEN, { message: 'expoPushToken must be an Expo push token such as "ExponentPushToken[...]".' }),
		platform: z.enum(["android", "ios"], { message: 'platform must be "android" or "ios".' }),
		timeZone: z.string({ message: "timeZone is required." }).trim().min(1, { message: "timeZone is required." }).max(64)
			.refine(isTimeZone, { message: 'timeZone must be an IANA time zone such as "Europe/London".' }),
		deviceName: z.string().trim().max(100, { message: "deviceName must be at most 100 characters." }).nullable().optional(),
		appVersion: z.string().trim().max(40, { message: "appVersion must be at most 40 characters." }).nullable().optional(),
	}, { message: "Send the device as a JSON object." })
	.strict();

const orderSchema = z
	.object({
		ids: z.array(z.string().regex(UUID, { message: "ids must be rule ids." }), { message: "ids must be a list of rule ids." })
			.max(MAX_MOBILE_NOTIFICATION_RULES, { message: `List at most ${MAX_MOBILE_NOTIFICATION_RULES} rule ids.` }),
	}, { message: "Send the order as a JSON object." })
	.strict();

const testSchema = z
	.object({
		installationId: z.string({ message: "installationId is required." }).regex(INSTALLATION_ID, { message: "installationId is not valid." }),
	}, { message: "Send the installation as a JSON object." })
	.strict();

type AppContext = Context<{ Bindings: Env }>;

function invalid(c: AppContext, error: string, message: string) {
	return c.json({ error, message }, 400, PRIVATE_NO_STORE_HEADERS);
}

function notFound(c: AppContext) {
	return c.json({ error: "rule_not_found", message: "That rule does not exist." }, 404, PRIVATE_NO_STORE_HEADERS);
}

function unauthorized(c: AppContext) {
	return c.json({ error: "unauthorized", message: "Sign in to manage notifications." }, 401, PRIVATE_NO_STORE_HEADERS);
}

function unavailable(c: AppContext, error: string) {
	return c.json({ error, message: "Notification settings are unavailable right now. Try again shortly." }, 503, PRIVATE_NO_STORE_HEADERS);
}

function tooLarge(c: AppContext) {
	return c.json({ error: "request_body_too_large", message: "The request is too large." }, 413, PRIVATE_NO_STORE_HEADERS);
}

export function describeIssue(error: z.ZodError): string {
	const issue = error.issues[0];
	if (!issue) return "The request is not valid.";
	if (issue.code === "unrecognized_keys") {
		return `Unknown field${issue.keys.length === 1 ? "" : "s"}: ${issue.keys.join(", ")}.`;
	}
	const message = /[.!?]$/.test(issue.message) ? issue.message : `${issue.message}.`;
	const path = issue.path.map(String).join(".");
	return path ? `${path}: ${message}` : message;
}

async function parseBody<T extends z.ZodType>(c: AppContext, schema: T, error: string): Promise<{ data: z.infer<T> } | { response: Response }> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return { response: invalid(c, "invalid_json", "Send a JSON body.") };
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) return { response: invalid(c, error, describeIssue(parsed.error)) };
	return { data: parsed.data };
}

function clock(value: unknown): string | null {
	return typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null;
}

export function ruleFromRow(row: RuleRow): MobileNotificationRule {
	return {
		id: row.id,
		name: row.name ?? null,
		enabled: row.enabled,
		action: row.action,
		events: (row.event_kinds ?? []).filter((kind): kind is EventKind => (MOBILE_NOTIFICATION_EVENT_KINDS as readonly string[]).includes(kind)),
		labs: { mode: row.lab_mode, ids: row.lab_slugs ?? [] },
		providers: { mode: row.provider_mode, ids: row.provider_slugs ?? [] },
		models: row.model_slugs ?? [],
		inputModalities: row.input_modalities ?? [],
		outputModalities: row.output_modalities ?? [],
		onlyOnPhaseo: row.only_on_phaseo,
		includeFreeVariants: row.include_free_variants,
		position: row.position,
	};
}

function ruleChangesToRow(changes: RuleChanges): Record<string, unknown> {
	const row: Record<string, unknown> = {};
	if (changes.name !== undefined) row.name = changes.name;
	if (changes.enabled !== undefined) row.enabled = changes.enabled;
	if (changes.action !== undefined) row.action = changes.action;
	if (changes.events !== undefined) row.event_kinds = changes.events;
	if (changes.labs !== undefined) {
		row.lab_mode = changes.labs.mode;
		row.lab_slugs = changes.labs.ids;
	}
	if (changes.providers !== undefined) {
		row.provider_mode = changes.providers.mode;
		row.provider_slugs = changes.providers.ids;
	}
	if (changes.models !== undefined) row.model_slugs = changes.models;
	if (changes.inputModalities !== undefined) row.input_modalities = changes.inputModalities;
	if (changes.outputModalities !== undefined) row.output_modalities = changes.outputModalities;
	if (changes.onlyOnPhaseo !== undefined) row.only_on_phaseo = changes.onlyOnPhaseo;
	if (changes.includeFreeVariants !== undefined) row.include_free_variants = changes.includeFreeVariants;
	return row;
}

async function loadSettings(env: Env, userId: string, installationId: string | null): Promise<MobileNotificationSettings | null> {
	const client = getDataClient(env);
	const [preferences, rules, device] = await Promise.all([
		client.from("mobile_notification_preferences").select("enabled,quiet_start,quiet_end,daily_cap").eq("user_id", userId).maybeSingle(),
		client.from("mobile_notification_rules").select(RULE_SELECT).eq("user_id", userId)
			.order("position", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true })
			.limit(MAX_MOBILE_NOTIFICATION_RULES),
		installationId
			? client.from("mobile_push_devices").select("status").eq("user_id", userId).eq("installation_id", installationId).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
	]);
	if (preferences.error || rules.error || device.error) return null;
	const stored = preferences.data as { enabled?: unknown; quiet_start?: unknown; quiet_end?: unknown; daily_cap?: unknown } | null;
	const start = clock(stored?.quiet_start);
	const end = clock(stored?.quiet_end);
	return {
		enabled: stored?.enabled === true,
		quietHours: start && end ? { start, end } : null,
		dailyCap: typeof stored?.daily_cap === "number" ? stored.daily_cap : DEFAULT_DAILY_CAP,
		deviceRegistered: (device.data as { status?: unknown } | null)?.status === "active",
		rules: ((rules.data ?? []) as unknown as RuleRow[]).map(ruleFromRow),
		eventKinds: [...MOBILE_NOTIFICATION_EVENT_KINDS],
	};
}

function queryInstallationId(c: AppContext): string | null {
	const value = c.req.query("installationId")?.trim();
	return value && INSTALLATION_ID.test(value) ? value : null;
}

async function sendTestPush(env: Env, expoPushToken: string): Promise<"sent" | "device_not_registered" | "failed"> {
	const accessToken = env.EXPO_ACCESS_TOKEN?.trim();
	try {
		const response = await fetch(EXPO_PUSH_SEND_URL, {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
			},
			body: JSON.stringify([{
				to: expoPushToken,
				title: "Phaseo test notification",
				body: "Notifications from Phaseo will look like this.",
				data: { href: "/", kind: "test", modelId: null },
				channelId: MOBILE_PUSH_CHANNEL_ID,
				sound: null,
			}]),
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) return "failed";
		const payload = await response.json().catch(() => null) as { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
		const ticket = Array.isArray(payload?.data) ? payload.data[0] : undefined;
		if (ticket?.status === "ok") return "sent";
		return ticket?.details?.error === "DeviceNotRegistered" ? "device_not_registered" : "failed";
	} catch {
		return "failed";
	}
}

export const accountSettingsMobileNotificationsRouter = new Hono<{ Bindings: Env }>();

accountSettingsMobileNotificationsRouter.get("/mobile-notifications", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const settings = await loadSettings(c.env, user.id, queryInstallationId(c));
	if (!settings) return unavailable(c, "mobile_notification_settings_unavailable");
	return c.json(settings, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.put("/mobile-notifications", bodyLimit({ maxSize: 4096, onError: tooLarge }), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const parsed = await parseBody(c, settingsSchema, "invalid_settings");
	if ("response" in parsed) return parsed.response;
	const changes: Record<string, unknown> = {};
	if (parsed.data.enabled !== undefined) changes.enabled = parsed.data.enabled;
	if (parsed.data.quietHours !== undefined) {
		changes.quiet_start = parsed.data.quietHours?.start ?? null;
		changes.quiet_end = parsed.data.quietHours?.end ?? null;
	}
	if (parsed.data.dailyCap !== undefined) changes.daily_cap = parsed.data.dailyCap;
	if (Object.keys(changes).length > 0) {
		const saved = await getDataClient(c.env).from("mobile_notification_preferences")
			.upsert({ user_id: user.id, ...changes, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
		if (saved.error) return unavailable(c, "mobile_notification_settings_write_failed");
	}
	const settings = await loadSettings(c.env, user.id, queryInstallationId(c));
	if (!settings) return unavailable(c, "mobile_notification_settings_unavailable");
	return c.json(settings, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.put("/mobile-notifications/devices/:installationId", bodyLimit({ maxSize: 4096, onError: tooLarge }), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const installationId = c.req.param("installationId");
	if (!INSTALLATION_ID.test(installationId)) return invalid(c, "invalid_device", "installationId is not valid.");
	const parsed = await parseBody(c, deviceSchema, "invalid_device");
	if ("response" in parsed) return parsed.response;
	// One row per installation and per token; a token that moves account moves with it.
	const registered = await getDataClient(c.env).rpc("register_mobile_push_device", {
		p_user_id: user.id,
		p_installation_id: installationId,
		p_expo_push_token: parsed.data.expoPushToken,
		p_platform: parsed.data.platform,
		p_time_zone: parsed.data.timeZone,
		p_device_name: parsed.data.deviceName || null,
		p_app_version: parsed.data.appVersion || null,
	});
	if (registered.error) return unavailable(c, "mobile_notification_device_write_failed");
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.delete("/mobile-notifications/devices/:installationId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const installationId = c.req.param("installationId");
	if (!INSTALLATION_ID.test(installationId)) return invalid(c, "invalid_device", "installationId is not valid.");
	const removed = await getDataClient(c.env).from("mobile_push_devices")
		.update({ status: "disabled", updated_at: new Date().toISOString() })
		.eq("user_id", user.id).eq("installation_id", installationId);
	if (removed.error) return unavailable(c, "mobile_notification_device_write_failed");
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.post("/mobile-notifications/rules", bodyLimit({ maxSize: 131_072, onError: tooLarge }), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const parsed = await parseBody(c, createRuleSchema, "invalid_rule");
	if ("response" in parsed) return parsed.response;
	// One locked database call counts the user's rules, picks the next position and inserts,
	// so concurrent creates cannot pass the limit or share a position. Fields left out take the
	// table's defaults.
	const created = await getDataClient(c.env).rpc("create_mobile_notification_rule", {
		p_user_id: user.id,
		p_rule: ruleChangesToRow(parsed.data),
		p_max_rules: MAX_MOBILE_NOTIFICATION_RULES,
	});
	if (created.error) return unavailable(c, "mobile_notification_rule_write_failed");
	const result = (created.data ?? {}) as { error?: unknown; rule?: RuleRow };
	if (result.error === "rule_limit_reached") {
		return invalid(c, "rule_limit_reached", `You can have up to ${MAX_MOBILE_NOTIFICATION_RULES} notification rules. Delete one to add another.`);
	}
	if (!result.rule) return unavailable(c, "mobile_notification_rule_write_failed");
	return c.json({ rule: ruleFromRow(result.rule) }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.put("/mobile-notifications/rules/order", bodyLimit({ maxSize: 8192, onError: tooLarge }), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const parsed = await parseBody(c, orderSchema, "invalid_rule_order");
	if ("response" in parsed) return parsed.response;
	const reordered = await getDataClient(c.env).rpc("reorder_mobile_notification_rules", {
		p_user_id: user.id,
		p_rule_ids: parsed.data.ids.map((id) => id.toLowerCase()),
	});
	if (reordered.error) return unavailable(c, "mobile_notification_rule_write_failed");
	if (reordered.data !== true) return invalid(c, "invalid_rule_order", "List every one of your rule ids exactly once.");
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.patch("/mobile-notifications/rules/:id", bodyLimit({ maxSize: 131_072, onError: tooLarge }), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const id = c.req.param("id");
	if (!UUID.test(id)) return notFound(c);
	const parsed = await parseBody(c, updateRuleSchema, "invalid_rule");
	if ("response" in parsed) return parsed.response;
	const changes = ruleChangesToRow(parsed.data);
	if (Object.keys(changes).length === 0) return invalid(c, "invalid_rule", "Change at least one field of the rule.");
	const updated = await getDataClient(c.env).from("mobile_notification_rules")
		.update({ ...changes, updated_at: new Date().toISOString() })
		.eq("id", id.toLowerCase()).eq("user_id", user.id)
		.select(RULE_SELECT).maybeSingle();
	if (updated.error) return unavailable(c, "mobile_notification_rule_write_failed");
	if (!updated.data) return notFound(c);
	return c.json({ rule: ruleFromRow(updated.data as unknown as RuleRow) }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.delete("/mobile-notifications/rules/:id", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const id = c.req.param("id");
	if (!UUID.test(id)) return notFound(c);
	const deleted = await getDataClient(c.env).from("mobile_notification_rules")
		.delete().eq("id", id.toLowerCase()).eq("user_id", user.id).select("id");
	if (deleted.error) return unavailable(c, "mobile_notification_rule_write_failed");
	if (!deleted.data?.length) return notFound(c);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsMobileNotificationsRouter.post("/mobile-notifications/test", bodyLimit({ maxSize: 1024, onError: tooLarge }), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return unauthorized(c);
	const parsed = await parseBody(c, testSchema, "invalid_device");
	if ("response" in parsed) return parsed.response;
	const client = getDataClient(c.env);
	// Counts the attempt (three per ten minutes per user) and returns the device's token.
	const claimed = await client.rpc("claim_mobile_push_test", { p_user_id: user.id, p_installation_id: parsed.data.installationId });
	if (claimed.error) return unavailable(c, "mobile_notification_test_unavailable");
	const claim = (claimed.data ?? {}) as { error?: string; retryAfterSeconds?: number; deviceId?: string; expoPushToken?: string };
	if (claim.error === "rate_limited") {
		const retryAfter = Math.max(1, Math.trunc(Number(claim.retryAfterSeconds) || 60));
		return c.json(
			{ error: "rate_limited", message: "You can send 3 test notifications every 10 minutes. Try again shortly." },
			429,
			{ ...PRIVATE_NO_STORE_HEADERS, "Retry-After": String(retryAfter) },
		);
	}
	if (claim.error || !claim.expoPushToken || !claim.deviceId) {
		return c.json({ error: "device_not_registered", message: "Turn on notifications in the app on this device first." }, 404, PRIVATE_NO_STORE_HEADERS);
	}
	const outcome = await sendTestPush(c.env, claim.expoPushToken);
	if (outcome === "device_not_registered") {
		const now = new Date().toISOString();
		await client.from("mobile_push_devices").update({ status: "invalid", invalidated_at: now, updated_at: now })
			.eq("id", claim.deviceId).eq("user_id", user.id);
		return c.json(
			{ error: "device_not_registered", message: "This device can no longer receive notifications. Open the app to register it again." },
			404,
			PRIVATE_NO_STORE_HEADERS,
		);
	}
	if (outcome === "failed") {
		return c.json({ error: "push_failed", message: "The test notification could not be sent. Try again shortly." }, 502, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});
