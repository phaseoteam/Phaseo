import { describe, expect, it } from "vitest";
import { capitaliseFirst } from "./renderChartShareImage";

describe("capitaliseFirst", () => {
	it("capitalises a subtitle that starts with a unit word", () => {
		expect(capitaliseFirst("users per week", "en-GB")).toBe("Users per week");
		expect(capitaliseFirst("utilisateurs par semaine · 7 derniers jours", "fr-FR")).toBe("Utilisateurs par semaine · 7 derniers jours");
	});

	it("leaves already-capitalised and caseless text unchanged", () => {
		expect(capitaliseFirst("Effective · Input text tokens · 1 month", "en-GB")).toBe("Effective · Input text tokens · 1 month");
		expect(capitaliseFirst("1週間あたりのユーザー", "ja")).toBe("1週間あたりのユーザー");
		expect(capitaliseFirst("", "en-GB")).toBe("");
	});
});
