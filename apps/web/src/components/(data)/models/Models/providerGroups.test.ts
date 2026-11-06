import { describe, test, expect } from "vitest";
import { groupProviders, variantRegionCode } from "./providerGroups";

describe("groupProviders", () => {
	test("folds regional and data-policy routes into their provider", () => {
		const groups = groupProviders([
			{ id: "amazon-bedrock-eu", name: "Amazon Bedrock", is_active: false, status: "coming_soon" },
			{ id: "amazon-bedrock-global", name: "Amazon Bedrock", is_active: true, status: "active" },
			{ id: "wafer", name: "Wafer", is_active: true, status: "active" },
			{ id: "wafer-zdr", name: "Wafer (ZDR)", is_active: true, status: "active" },
			{ id: "mistral-eu", name: "Mistral", is_active: true, status: "active" },
			{ id: "mistral", name: "Mistral", is_active: false, status: "coming_soon" },
		]);

		expect(groups.map((group) => [group.key, group.name, group.isActive])).toEqual([
			["amazon-bedrock", "Amazon Bedrock", true],
			["mistral", "Mistral", true],
			["wafer", "Wafer", true],
		]);
		expect(groups[0].logoId).toBe("amazon-bedrock");
		expect(groups[0].options.map((option) => option.variant)).toEqual(["global", "eu"]);
		expect(groups[1].options.map((option) => option.variant)).toEqual(["eu", null]);
		expect(groups[2].options.map((option) => option.variant)).toEqual([null, "zdr"]);
	});

	test("keeps fast tiers and other products separate", () => {
		const groups = groupProviders([
			{ id: "moonshotai", name: "Moonshot AI", is_active: true, status: "active" },
			{ id: "moonshotai-turbo", name: "Moonshot AI Turbo", is_active: true, status: "active" },
			{ id: "anthropic", name: "Anthropic", is_active: true, status: "active" },
			{ id: "anthropic-aws-us", name: "Anthropic", is_active: true, status: "active" },
		]);

		expect(groups.map((group) => group.name)).toEqual([
			"Anthropic",
			"Claude Platform for AWS",
			"Moonshot AI",
			"Moonshot AI Turbo",
		]);
	});

	test("recognises encrypted and city-coded regional routes", () => {
		const groups = groupProviders([
			{ id: "venice", name: "Venice", is_active: true, status: "active" },
			{ id: "venice-e2ee", name: "Venice (E2EE)", is_active: true, status: "active" },
			{ id: "xiaomi-token-plan-ams", name: "Xiaomi Token Plan (Europe)", is_active: true, status: "active" },
			{ id: "xiaomi-token-plan-sgp", name: "Xiaomi Token Plan (Singapore)", is_active: true, status: "active" },
		]);
		expect(groups.map((group) => [group.name, group.options.map((option) => option.variant)])).toEqual([
			["Venice", [null, "e2ee"]],
			["Xiaomi Token Plan", ["ams", "sgp"]],
		]);
		expect(variantRegionCode("ams")).toBe("150");
		expect(variantRegionCode("jp")).toBe("JP");
	});

	test("names a lone regional route after its provider", () => {
		const [group] = groupProviders([
			{ id: "siliconflow-cn", name: "SiliconFlow (China)", is_active: true, status: "active" },
		]);
		expect(group.name).toBe("SiliconFlow");
		expect(group.options[0].variant).toBe("cn");
	});
});
