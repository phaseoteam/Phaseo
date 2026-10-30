import { parseCatalogueTierFilters } from "./catalogueTierFilters";

describe("catalogue tier URLs", () => {
	it("normalizes saved provider aliases and deduplicates selections", () => {
		expect(parseCatalogueTierFilters("priority,highspeed,fast,production,tier_2,default")).toEqual(["fast", "standard"]);
	});
	it("retains free and workspace private filters", () => {
		expect(parseCatalogueTierFilters("free,private,flex,batch,ultrafast")).toEqual(["free", "private", "flex", "batch", "ultrafast"]);
	});
	it("ignores empty selections", () => {
		expect(parseCatalogueTierFilters(" , ")).toEqual([]);
	});
});
