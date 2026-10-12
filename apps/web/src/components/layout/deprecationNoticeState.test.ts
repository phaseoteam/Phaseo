import type { DeprecationWarning } from "@/lib/fetchers/usage/types";
import { deprecationNoticeKey, fillNoticeTemplate, visibleDeprecationWarnings } from "./deprecationNoticeState";

function warning(overrides: Partial<DeprecationWarning> = {}): DeprecationWarning {
	return {
		modelId: "openai/old-model",
		modelName: "Old Model",
		organisationId: "openai",
		lastUsedAt: "2026-10-01T00:00:00.000Z",
		deprecationDate: "2026-10-20",
		retirementDate: "2026-12-01",
		deprecationDaysUntil: 8,
		retirementDaysUntil: 50,
		replacementModelId: "openai/new-model",
		previousModelId: null,
		countAsAlert: true,
		severity: "notice",
		...overrides,
	};
}

describe("model deprecation notice", () => {
	it("shows only warnings that count as alerts for this workspace", () => {
		const unused = warning({ modelId: "openai/unused", countAsAlert: false, severity: "fyi" });
		expect(visibleDeprecationWarnings([warning(), unused], new Set()).map((entry) => entry.modelId)).toEqual(["openai/old-model"]);
	});

	it("keeps a dismissal until the model's lifecycle dates change", () => {
		const dismissed = new Set([deprecationNoticeKey(warning())]);
		expect(visibleDeprecationWarnings([warning()], dismissed)).toEqual([]);
		expect(visibleDeprecationWarnings([warning({ retirementDate: "2027-01-15" })], dismissed)).toHaveLength(1);
	});

	it("fills named placeholders and leaves unknown ones alone", () => {
		expect(fillNoticeTemplate("{model} retires {date}. {other}", { model: "Old Model", date: "1 Dec 2026" })).toBe("Old Model retires 1 Dec 2026. {other}");
	});
});
