import { describe, expect, it } from "vitest";
import {
	EXTRA_ANSWER_NANOS,
	INCLUDED_ANSWERS_PER_PERSON,
	NANOS_PER_USD,
	PLAN_TIERS,
	slackAgentMonthlyCharge,
	slackAgentPlanNanos,
} from "@/billing/slackAgentPricing";

// Cloudflare cost of one answer (Workers, Durable Objects, Workflows steps and
// storage, logs), estimated 2026-10-20 at $0.1175 per 1,000 answers. Model
// tokens are billed separately through the gateway key.
const COST_PER_ANSWER_NANOS = 117_500;
const usd = (nanos: number) => nanos / NANOS_PER_USD;

describe("slackAgentPlanNanos", () => {
	it("charges the chosen ladder", () => {
		const ladder: Array<[number, number]> = [
			[1, 0.99], [3, 0.99], [4, 2.99], [10, 2.99], [11, 4.99], [25, 4.99], [26, 7.99], [50, 7.99],
			[51, 14.99], [100, 14.99], [101, 15], [550, 37], [1_000, 59], [1_311, 59], [1_323, 60],
			[2_000, 90], [10_000, 450], [100_000, 4_500],
		];
		for (const [people, price] of ladder) expect(usd(slackAgentPlanNanos(people)), `${people} people`).toBe(price);
	});

	it("is free with nobody and never decreases as people are added", () => {
		expect(slackAgentPlanNanos(0)).toBe(0);
		expect(slackAgentPlanNanos(-5)).toBe(0);
		expect(slackAgentPlanNanos(Number.NaN)).toBe(0);
		let previous = 0;
		for (let people = 1; people <= 20_000; people += 1) {
			const price = slackAgentPlanNanos(people);
			expect(price, `${people} people`).toBeGreaterThanOrEqual(previous);
			previous = price;
		}
	});

	it("covers our cost even when every person uses their whole allowance", () => {
		for (const people of [1, 3, 10, 25, 50, 100, 101, 500, 1_000, 1_311, 1_400, 5_000, 50_000, 1_000_000]) {
			const cost = people * INCLUDED_ANSWERS_PER_PERSON * COST_PER_ANSWER_NANOS;
			expect(slackAgentPlanNanos(people), `${people} people`).toBeGreaterThan(cost);
		}
	});

	it("prices extra answers at least twice their cost", () => {
		expect(EXTRA_ANSWER_NANOS).toBe(250_000);
		expect(EXTRA_ANSWER_NANOS).toBeGreaterThanOrEqual(2 * COST_PER_ANSWER_NANOS);
	});

	it("lists plan tiers in order with their own prices", () => {
		for (const tier of PLAN_TIERS) expect(slackAgentPlanNanos(tier.people)).toBe(tier.priceNanos);
		expect(PLAN_TIERS.map((tier) => tier.people)).toEqual([3, 10, 25, 50, 100]);
	});
});

describe("slackAgentMonthlyCharge", () => {
	it("pools the allowance and charges only answers beyond it", () => {
		expect(slackAgentMonthlyCharge({ people: 3, answers: 900 })).toEqual({
			people: 3, answers: 900, planNanos: 990_000_000, includedAnswers: 900,
			extraAnswers: 0, extraNanos: 0, totalNanos: 990_000_000, chargeNanos: 990_000_000,
		});
		const over = slackAgentMonthlyCharge({ people: 3, answers: 1_060 });
		expect([over.extraAnswers, over.extraNanos, over.totalNanos]).toEqual([160, 40_000_000, 1_030_000_000]);
	});

	it("never charges more than the spending cap", () => {
		const capped = slackAgentMonthlyCharge({ people: 10, answers: 100_000, capNanos: 5 * NANOS_PER_USD });
		expect(capped.totalNanos).toBe(2_990_000_000 + 97_000 * EXTRA_ANSWER_NANOS);
		expect(capped.chargeNanos).toBe(5 * NANOS_PER_USD);
		expect(slackAgentMonthlyCharge({ people: 10, answers: 1, capNanos: 5 * NANOS_PER_USD }).chargeNanos).toBe(2_990_000_000);
	});

	it("treats missing or bad input as nothing used", () => {
		const none = slackAgentMonthlyCharge({ people: Number.NaN, answers: -3 });
		expect([none.people, none.answers, none.chargeNanos]).toEqual([0, 0, 0]);
		expect(slackAgentMonthlyCharge({ people: 2.7, answers: 10.9 }).people).toBe(2);
	});
});
