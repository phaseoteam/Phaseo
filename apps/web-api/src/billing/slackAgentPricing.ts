// Generated from packages/shared/slack-agent-pricing/index.ts by scripts/sync-slack-agent-pricing.mjs. Do not edit.
// Slack agent pricing: the monthly plan price for the people who used the agent,
// the answers each plan includes, and the price of answers beyond them.
//
// This is the one definition of the price. The month-end charge (web-api), the
// Slack Worker's meter and the settings page (web) use generated copies
// (scripts/sync-slack-agent-pricing.mjs), so what we show, enforce and charge
// cannot drift apart. Keep it dependency-free.
//
// Amounts are in nanodollars (1 USD = 1,000,000,000). Model tokens are not part
// of this price: they are billed through the installation's gateway key as
// normal requests.

export const NANOS_PER_USD = 1_000_000_000;

/** Answers included per person, pooled across the workspace. */
export const INCLUDED_ANSWERS_PER_PERSON = 300;

/** Each answer beyond the pooled allowance: $0.25 per 1,000. */
export const EXTRA_ANSWER_NANOS = 250_000;

/** Plans a workspace can pick, by the most people a month. Larger plans use slackAgentPlanNanos. */
export const PLAN_TIERS: ReadonlyArray<{ people: number; priceNanos: number }> = [
	{ people: 3, priceNanos: 990_000_000 },
	{ people: 10, priceNanos: 2_990_000_000 },
	{ people: 25, priceNanos: 4_990_000_000 },
	{ people: 50, priceNanos: 7_990_000_000 },
	{ people: 100, priceNanos: 14_990_000_000 },
];

/** From 100 people the price rises evenly to $59 at 1,000, in whole dollars. */
const CURVE_END_PEOPLE = 1_000;
const CURVE_END_CENTS = 5_900;
/** Large workspaces pay at least $0.045 a person, in whole dollars (from about 1,300 people). */
const PER_PERSON_TENTHS_OF_CENTS = 45;

/** Monthly plan price for this many people who used the agent in the month. */
export function slackAgentPlanNanos(people: number): number {
	if (!Number.isFinite(people) || people <= 0) return 0;
	const count = Math.ceil(people);
	for (const tier of PLAN_TIERS) if (count <= tier.people) return tier.priceNanos;
	const top = PLAN_TIERS[PLAN_TIERS.length - 1];
	const topCents = top.priceNanos / 10_000_000;
	const curveCents = count >= CURVE_END_PEOPLE
		? CURVE_END_CENTS
		: topCents + ((CURVE_END_CENTS - topCents) * (count - top.people)) / (CURVE_END_PEOPLE - top.people);
	const dollars = Math.max(Math.round(curveCents / 100), Math.round((count * PER_PERSON_TENTHS_OF_CENTS) / 1_000));
	return dollars * NANOS_PER_USD;
}

export type SlackAgentMonthlyCharge = {
	people: number;
	answers: number;
	planNanos: number;
	includedAnswers: number;
	extraAnswers: number;
	extraNanos: number;
	/** Plan plus extra answers, before the spending cap. */
	totalNanos: number;
	/** What is taken from credits: totalNanos, never more than the spending cap. */
	chargeNanos: number;
};

/** The month's charge for the people who used the agent and their pooled answers. */
export function slackAgentMonthlyCharge(input: { people: number; answers: number; capNanos?: number | null }): SlackAgentMonthlyCharge {
	const people = Math.max(0, Math.floor(Number.isFinite(input.people) ? input.people : 0));
	const answers = Math.max(0, Math.floor(Number.isFinite(input.answers) ? input.answers : 0));
	const planNanos = slackAgentPlanNanos(people);
	const includedAnswers = people * INCLUDED_ANSWERS_PER_PERSON;
	const extraAnswers = Math.max(0, answers - includedAnswers);
	const extraNanos = extraAnswers * EXTRA_ANSWER_NANOS;
	const totalNanos = planNanos + extraNanos;
	const cap = input.capNanos == null ? null : Math.max(0, Math.floor(input.capNanos));
	return {
		people,
		answers,
		planNanos,
		includedAnswers,
		extraAnswers,
		extraNanos,
		totalNanos,
		chargeNanos: cap == null ? totalNanos : Math.min(totalNanos, cap),
	};
}
