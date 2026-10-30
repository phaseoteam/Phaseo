import {
	dataPractices,
	deliberatelyUnclaimed,
	disclosedServiceProviders,
	trustDocuments,
	trustLastReviewed,
	trustPractices,
	trustStates,
} from "./trust-centre";

describe("trust centre claims", () => {
	it("defines every public claim state", () => {
		const states = new Set(trustStates.map((state) => state.id));
		for (const item of [...trustPractices, ...dataPractices]) {
			expect(states.has(item.state)).toBe(true);
		}
	});

	it("does not present an independent certification", () => {
		expect([...trustPractices, ...dataPractices]).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ state: "independently-certified" }),
			]),
		);
		expect(deliberatelyUnclaimed.join(" ")).toMatch(/SOC 2/);
	});

	it("discloses the provider categories named in the privacy posture", () => {
		expect(disclosedServiceProviders.map(({ name }) => name)).toEqual(
			expect.arrayContaining([
				"Cloudflare and Vercel",
				"Supabase",
				"Upstash",
				"Stripe",
				"Email and support providers",
				"Model providers",
			]),
		);
	});

	it("publishes the requested trust document set", () => {
		expect(trustDocuments.map(({ href }) => href)).toEqual([
			"/trust/security",
			"/trust/subprocessors",
			"/trust/dpa",
		]);
		expect(trustDocuments.find(({ href }) => href === "/trust/dpa")?.status).toMatch(/Legal review/);
	});

	it("states the verified gateway content-storage exceptions", () => {
		const copy = dataPractices.map(({ description }) => description).join(" ");
		expect(copy).toMatch(/Upstash/);
		expect(copy).toMatch(/five minutes/);
		expect(copy).toMatch(/90, 180, or 365 days/);
		expect(copy).toMatch(/30 days/);
	});

	it("uses an explicit ISO review date", () => {
		expect(trustLastReviewed.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(Number.isNaN(Date.parse(trustLastReviewed.iso))).toBe(false);
	});
});
