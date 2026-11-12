// Purpose: Automatic per-workspace customer rate-limit tiers (the trust ladder).
// Why: New workspaces get a conservative limit; established, paying and
//      invoiced customers earn more headroom without manual work.
// How: Pure functions. The tier publisher classifies every workspace from
//      `gateway_customer_rate_limit_inputs` and publishes the tier (plus any
//      active override) to KV; the request path resolves it to limits with
//      the same configuration. The highest matching tier wins:
//
//        tier        RPM  rule (defaults)
//        new          10  default
//        standard     25  any paid top-up OR workspace age >= 7 days
//        trusted      60  >= $50 lifetime paid spend AND age >= 30 days
//        enterprise  120  billing_mode = 'invoice'
//        override    any  unexpired row in public.workspace_rate_limit_overrides
//
// Self-serve raises (public.workspace_rate_limit_raises): a workspace owner
// can move a standard workspace to trusted for a limited time, if it meets the
// selfServeRaise thresholds (a paid top-up, some paid spend, a minimum age, and
// no raise in the cooldown). The publisher writes an active raise next to the
// tier; the request path applies it only while
// CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED is "true", so turning that off
// stops every raise at once. Operators revoke one raise by setting revoked_at,
// and a succeeded refund after the raise revokes it. Overrides still win.
//
// Overrides are managed by inserting/updating rows in
// public.workspace_rate_limit_overrides as service_role, e.g.
//   insert into public.workspace_rate_limit_overrides
//     (workspace_id, requests_per_minute, reason, set_by, expires_at)
//   values ('<workspace>', 300, 'launch week', '<operator user id>', now() + interval '14 days')
//   on conflict (workspace_id) do update set requests_per_minute = excluded.requests_per_minute,
//     reason = excluded.reason, set_by = excluded.set_by, expires_at = excluded.expires_at;
// A NULL limit column keeps the ladder value; a NULL expires_at never expires.
// Changes reach the gateway within about five minutes (publisher cadence) plus
// one minute of isolate caching; expiry itself is applied at request time.
//
// Tuning: CUSTOMER_RATE_LIMIT_LADDER is optional partial JSON, e.g.
//   {"freeRequestsPerDay":1500,"tiers":{"new":{"requestsPerMinute":15},
//    "trusted":{"minLifetimePaidSpendUsd":100}},"selfServeRaise":{"durationDays":14}}
// Set the same value on every worker that serves requests or runs the publisher.
import type { CustomerLimits } from "@core/customer-rate-limits";

export const CUSTOMER_TIERS = ["new", "standard", "trusted", "enterprise"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

type TierLimits = { requestsPerMinute: number; freeRequestsPerDay?: number };
export type CustomerRateLimitLadder = {
	freeRequestsPerDay: number;
	tiers: {
		new: TierLimits;
		standard: TierLimits & { minAgeDays: number };
		trusted: TierLimits & { minAgeDays: number; minLifetimePaidSpendUsd: number };
		enterprise: TierLimits & { billingModes: string[] };
	};
	/** Who may raise a standard workspace to trusted themselves, and for how long. */
	selfServeRaise: {
		durationDays: number;
		cooldownDays: number;
		minAgeDays: number;
		minLifetimePaidSpendUsd: number;
	};
};

export const DEFAULT_CUSTOMER_RATE_LIMIT_LADDER: CustomerRateLimitLadder = Object.freeze({
	freeRequestsPerDay: 1500,
	tiers: {
		new: { requestsPerMinute: 10 },
		standard: { requestsPerMinute: 25, minAgeDays: 7 },
		trusted: { requestsPerMinute: 60, minAgeDays: 30, minLifetimePaidSpendUsd: 50 },
		enterprise: { requestsPerMinute: 120, billingModes: ["invoice"] },
	},
	selfServeRaise: { durationDays: 30, cooldownDays: 60, minAgeDays: 7, minLifetimePaidSpendUsd: 10 },
}) as CustomerRateLimitLadder;

/** Row shape returned by public.gateway_customer_rate_limit_inputs. */
export type CustomerRateLimitInputs = {
	workspace_id: string;
	created_at: string;
	billing_mode: string | null;
	has_paid_top_up: boolean | null;
	lifetime_paid_spend_nanos: number | string | null;
	override_requests_per_minute: number | null;
	override_free_requests_per_day: number | null;
	override_expires_at: string | null;
	/** Absent from rows returned before self-serve raises existed. */
	raise_tier?: string | null;
	raise_expires_at?: string | null;
};

/** Value published to KV under `customer-quota:v2:{workspaceId}`. */
export type PublishedCustomerTier = {
	tier: CustomerTier;
	override?: { requestsPerMinute?: number; freeRequestsPerDay?: number; expiresAt?: number };
	/** An active self-serve raise to a higher tier; applied only while raises are enabled. */
	raise?: { tier: CustomerTier; expiresAt: number };
};

export type ResolvedCustomerLimits = CustomerLimits & { tier: CustomerTier | "override" };

export function customerTierKey(workspaceId: string): string {
	return `customer-quota:v2:${workspaceId}`;
}

const DAY_MS = 86_400_000;

function invalid(path: string): never {
	throw new Error(`invalid_customer_rate_limit_ladder: ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isLimit = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isThreshold = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Parses optional partial JSON over the defaults. Throws on any invalid or unknown field. */
export function parseCustomerRateLimitLadder(raw: string | undefined | null): CustomerRateLimitLadder {
	const ladder = structuredClone(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER) as CustomerRateLimitLadder;
	if (raw == null || raw.trim() === "") return ladder;
	let parsed: unknown;
	try { parsed = JSON.parse(raw); } catch { invalid("json"); }
	if (!isRecord(parsed)) invalid("root");
	for (const [key, value] of Object.entries(parsed)) {
		if (key === "freeRequestsPerDay") {
			if (!isLimit(value)) invalid(key);
			ladder.freeRequestsPerDay = value;
		} else if (key === "tiers") {
			if (!isRecord(value)) invalid(key);
			for (const [tier, fields] of Object.entries(value)) {
				if (!(CUSTOMER_TIERS as readonly string[]).includes(tier)) invalid(`tiers.${tier}`);
				if (!isRecord(fields)) invalid(`tiers.${tier}`);
				const target = ladder.tiers[tier as CustomerTier] as Record<string, unknown>;
				for (const [field, fieldValue] of Object.entries(fields)) {
					const path = `tiers.${tier}.${field}`;
					if (field === "requestsPerMinute" || field === "freeRequestsPerDay") {
						if (!isLimit(fieldValue)) invalid(path);
					} else if (field === "billingModes" && tier === "enterprise") {
						if (!Array.isArray(fieldValue) || !fieldValue.every(mode => typeof mode === "string")) invalid(path);
					} else if ((field === "minAgeDays" && (tier === "standard" || tier === "trusted")) ||
						(field === "minLifetimePaidSpendUsd" && tier === "trusted")) {
						if (!isThreshold(fieldValue)) invalid(path);
					} else invalid(path);
					target[field] = fieldValue;
				}
			}
		} else if (key === "selfServeRaise") {
			if (!isRecord(value)) invalid(key);
			for (const [field, fieldValue] of Object.entries(value)) {
				const path = `selfServeRaise.${field}`;
				if (field === "durationDays" || field === "cooldownDays") {
					if (!isLimit(fieldValue)) invalid(path);
				} else if (field === "minAgeDays" || field === "minLifetimePaidSpendUsd") {
					if (!isThreshold(fieldValue)) invalid(path);
				} else invalid(path);
				(ladder.selfServeRaise as Record<string, unknown>)[field] = fieldValue;
			}
		} else invalid(key);
	}
	// A higher tier must never grant less than the tier below it.
	for (let index = 1; index < CUSTOMER_TIERS.length; index++) {
		if (ladder.tiers[CUSTOMER_TIERS[index]].requestsPerMinute < ladder.tiers[CUSTOMER_TIERS[index - 1]].requestsPerMinute) {
			invalid(`tiers.${CUSTOMER_TIERS[index]}.requestsPerMinute`);
		}
	}
	return ladder;
}

let cachedLadder: { raw: string | undefined; ladder: CustomerRateLimitLadder } | null = null;

/** Like {@link parseCustomerRateLimitLadder}, but logs once and uses the defaults when invalid. */
export function customerRateLimitLadder(raw: string | undefined): CustomerRateLimitLadder {
	if (cachedLadder && cachedLadder.raw === raw) return cachedLadder.ladder;
	let ladder: CustomerRateLimitLadder;
	try {
		ladder = parseCustomerRateLimitLadder(raw);
	} catch (error) {
		console.error("customer_rate_limit_ladder_invalid", { error: error instanceof Error ? error.message : String(error) });
		ladder = structuredClone(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER) as CustomerRateLimitLadder;
	}
	cachedLadder = { raw, ladder };
	return ladder;
}

export function classifyCustomerTier(inputs: CustomerRateLimitInputs, ladder: CustomerRateLimitLadder, now: number): CustomerTier {
	const { tiers } = ladder;
	if (inputs.billing_mode && tiers.enterprise.billingModes.includes(inputs.billing_mode)) return "enterprise";
	const createdAt = Date.parse(inputs.created_at);
	const ageDays = Number.isFinite(createdAt) ? (now - createdAt) / DAY_MS : 0;
	const spendUsd = Number(inputs.lifetime_paid_spend_nanos ?? 0) / 1e9;
	if (ageDays >= tiers.trusted.minAgeDays && Number.isFinite(spendUsd) && spendUsd >= tiers.trusted.minLifetimePaidSpendUsd) return "trusted";
	if (inputs.has_paid_top_up === true || ageDays >= tiers.standard.minAgeDays) return "standard";
	return "new";
}

/** The KV value for one workspace. Expired overrides are omitted. */
export function publishedCustomerTier(inputs: CustomerRateLimitInputs, ladder: CustomerRateLimitLadder, now: number): PublishedCustomerTier {
	const published: PublishedCustomerTier = { tier: classifyCustomerTier(inputs, ladder, now) };
	const expiresAt = inputs.override_expires_at ? Date.parse(inputs.override_expires_at) : undefined;
	const active = expiresAt === undefined || (Number.isFinite(expiresAt) && expiresAt > now);
	const requestsPerMinute = isLimit(inputs.override_requests_per_minute) ? inputs.override_requests_per_minute : undefined;
	const freeRequestsPerDay = isLimit(inputs.override_free_requests_per_day) ? inputs.override_free_requests_per_day : undefined;
	if (active && (requestsPerMinute !== undefined || freeRequestsPerDay !== undefined)) {
		published.override = {};
		if (requestsPerMinute !== undefined) published.override.requestsPerMinute = requestsPerMinute;
		if (freeRequestsPerDay !== undefined) published.override.freeRequestsPerDay = freeRequestsPerDay;
		if (expiresAt !== undefined) published.override.expiresAt = expiresAt;
	}
	const raiseExpiresAt = inputs.raise_expires_at ? Date.parse(inputs.raise_expires_at) : Number.NaN;
	const raiseTier = inputs.raise_tier as CustomerTier | null | undefined;
	if (raiseTier && (CUSTOMER_TIERS as readonly string[]).includes(raiseTier) && tierRank(raiseTier) > tierRank(published.tier)
		&& Number.isFinite(raiseExpiresAt) && raiseExpiresAt > now) {
		published.raise = { tier: raiseTier, expiresAt: raiseExpiresAt };
	}
	return published;
}

function tierRank(tier: CustomerTier): number {
	return CUSTOMER_TIERS.indexOf(tier);
}

export function isPublishedCustomerTier(value: unknown): value is PublishedCustomerTier {
	if (!isRecord(value) || !(CUSTOMER_TIERS as readonly unknown[]).includes(value.tier)) return false;
	if (value.override === undefined) return isPublishedRaise(value.raise);
	const override = value.override;
	return isRecord(override) &&
		(override.requestsPerMinute === undefined || isLimit(override.requestsPerMinute)) &&
		(override.freeRequestsPerDay === undefined || isLimit(override.freeRequestsPerDay)) &&
		(override.expiresAt === undefined || (typeof override.expiresAt === "number" && Number.isFinite(override.expiresAt))) &&
		isPublishedRaise(value.raise);
}

function isPublishedRaise(raise: unknown): boolean {
	return raise === undefined || (isRecord(raise) && (CUSTOMER_TIERS as readonly unknown[]).includes(raise.tier)
		&& typeof raise.expiresAt === "number" && Number.isFinite(raise.expiresAt));
}

/**
 * Limits for a workspace; a missing publication means the `new` tier. An
 * active self-serve raise lifts the tier only when `raisesEnabled`.
 */
export function resolveCustomerLimits(
	published: PublishedCustomerTier | null | undefined,
	ladder: CustomerRateLimitLadder,
	now: number,
	options: { raisesEnabled?: boolean } = {},
): ResolvedCustomerLimits {
	const raise = published?.raise;
	const raised = options.raisesEnabled && raise && raise.expiresAt > now && tierRank(raise.tier) > tierRank(published.tier);
	const tier = raised ? raise.tier : published?.tier ?? "new";
	const base = ladder.tiers[tier];
	const resolved: ResolvedCustomerLimits = {
		tier,
		requestsPerMinute: base.requestsPerMinute,
		freeRequestsPerDay: base.freeRequestsPerDay ?? ladder.freeRequestsPerDay,
	};
	const override = published?.override;
	if (override && (override.expiresAt === undefined || override.expiresAt > now)) {
		if (override.requestsPerMinute !== undefined) {
			resolved.requestsPerMinute = override.requestsPerMinute;
			resolved.tier = "override";
		}
		if (override.freeRequestsPerDay !== undefined) resolved.freeRequestsPerDay = override.freeRequestsPerDay;
	}
	return resolved;
}

export type SelfServeRaiseRefusal =
	| "disabled" | "override" | "raised" | "top_tier" | "no_paid_top_up" | "too_new" | "not_enough_spend" | "cooldown";

export type SelfServeRaiseStatus = {
	tier: CustomerTier;
	requestsPerMinute: number;
	/** The tier a raise would move to, when there is one above. */
	target: CustomerTier | null;
	targetRequestsPerMinute: number | null;
	eligible: boolean;
	/** Why a raise is not available now; null when eligible. */
	refusal: SelfServeRaiseRefusal | null;
	/** When an active raise ends, or when the next one may be requested. */
	activeUntil: number | null;
	availableAt: number | null;
	durationDays: number;
	thresholds: { minAgeDays: number; minLifetimePaidSpendUsd: number };
};

/**
 * Whether the workspace may raise itself one tier now. Only a standard
 * workspace can, to trusted, and only with a paid top-up, at least
 * minLifetimePaidSpendUsd paid, an age of minAgeDays, and no raise requested
 * in the last cooldownDays. `lastRequestedAt` is the newest raise of any state.
 */
export function selfServeRaiseStatus(args: {
	inputs: CustomerRateLimitInputs;
	ladder: CustomerRateLimitLadder;
	now: number;
	enabled: boolean;
	lastRequestedAt: number | null;
}): SelfServeRaiseStatus {
	const { inputs, ladder, now } = args;
	const rules = ladder.selfServeRaise;
	const published = publishedCustomerTier(inputs, ladder, now);
	const resolved = resolveCustomerLimits(published, ladder, now, { raisesEnabled: args.enabled });
	const tier = resolved.tier === "override" ? published.tier : resolved.tier;
	const target: CustomerTier | null = published.tier === "standard" || published.tier === "new" ? "trusted" : null;
	const createdAt = Date.parse(inputs.created_at);
	const ageDays = Number.isFinite(createdAt) ? (now - createdAt) / DAY_MS : 0;
	const paidUsd = Number(inputs.lifetime_paid_spend_nanos ?? 0) / 1e9;
	const availableAt = args.lastRequestedAt === null ? null : args.lastRequestedAt + rules.cooldownDays * DAY_MS;
	const refusal: SelfServeRaiseRefusal | null =
		!args.enabled ? "disabled"
		: published.override ? "override"
		: published.raise ? "raised"
		: target === null ? "top_tier"
		: inputs.has_paid_top_up !== true ? "no_paid_top_up"
		: ageDays < rules.minAgeDays ? "too_new"
		: !(paidUsd >= rules.minLifetimePaidSpendUsd) ? "not_enough_spend"
		: availableAt !== null && availableAt > now ? "cooldown"
		: null;
	return {
		tier,
		requestsPerMinute: resolved.requestsPerMinute,
		target,
		targetRequestsPerMinute: target ? ladder.tiers[target].requestsPerMinute : null,
		eligible: refusal === null,
		refusal,
		activeUntil: published.raise?.expiresAt ?? null,
		availableAt: refusal === "cooldown" ? availableAt : null,
		durationDays: rules.durationDays,
		thresholds: { minAgeDays: rules.minAgeDays, minLifetimePaidSpendUsd: rules.minLifetimePaidSpendUsd },
	};
}
