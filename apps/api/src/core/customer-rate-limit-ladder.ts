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
//    "trusted":{"minLifetimePaidSpendUsd":100}}}
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
};

export const DEFAULT_CUSTOMER_RATE_LIMIT_LADDER: CustomerRateLimitLadder = Object.freeze({
	freeRequestsPerDay: 1500,
	tiers: {
		new: { requestsPerMinute: 10 },
		standard: { requestsPerMinute: 25, minAgeDays: 7 },
		trusted: { requestsPerMinute: 60, minAgeDays: 30, minLifetimePaidSpendUsd: 50 },
		enterprise: { requestsPerMinute: 120, billingModes: ["invoice"] },
	},
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
};

/** Value published to KV under `customer-quota:v2:{workspaceId}`. */
export type PublishedCustomerTier = {
	tier: CustomerTier;
	override?: { requestsPerMinute?: number; freeRequestsPerDay?: number; expiresAt?: number };
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
	return published;
}

export function isPublishedCustomerTier(value: unknown): value is PublishedCustomerTier {
	if (!isRecord(value) || !(CUSTOMER_TIERS as readonly unknown[]).includes(value.tier)) return false;
	if (value.override === undefined) return true;
	const override = value.override;
	return isRecord(override) &&
		(override.requestsPerMinute === undefined || isLimit(override.requestsPerMinute)) &&
		(override.freeRequestsPerDay === undefined || isLimit(override.freeRequestsPerDay)) &&
		(override.expiresAt === undefined || (typeof override.expiresAt === "number" && Number.isFinite(override.expiresAt)));
}

/** Limits for a workspace; a missing publication means the `new` tier. */
export function resolveCustomerLimits(
	published: PublishedCustomerTier | null | undefined,
	ladder: CustomerRateLimitLadder,
	now: number,
): ResolvedCustomerLimits {
	const tier = published?.tier ?? "new";
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
