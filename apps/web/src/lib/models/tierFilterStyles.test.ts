import { BadgeCheck, Boxes, Layers3, Shuffle, Zap } from "lucide-react";
import { getTierFilterMeta } from "./tierFilterStyles";

describe("getTierFilterMeta", () => {
	it.each([
		[
			"standard",
			Layers3,
			"text-blue-600 dark:text-blue-400",
			"group-hover:text-blue-600 dark:group-hover:text-blue-400",
		],
		[
			"batch",
			Boxes,
			"text-violet-600 dark:text-violet-400",
			"group-hover:text-violet-600 dark:group-hover:text-violet-400",
		],
		[
			"free",
			BadgeCheck,
			"text-emerald-600 dark:text-emerald-400",
			"group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
		],
		[
			"flex",
			Shuffle,
			"text-teal-600 dark:text-teal-400",
			"group-hover:text-teal-600 dark:group-hover:text-teal-400",
		],
		[
			"priority",
			Zap,
			"text-violet-600 dark:text-violet-400",
			"group-hover:text-violet-600 dark:group-hover:text-violet-400",
		],
	])(
		"returns the shared visual for %s",
		(tier, icon, iconClassName, filterIconHoverClassName) => {
			expect(getTierFilterMeta(tier)).toEqual({
				icon,
				iconClassName,
				filterIconHoverClassName,
			});
		},
	);

	it("normalizes tier values", () => {
		expect(getTierFilterMeta(" Priority ")).toEqual(
			getTierFilterMeta("priority"),
		);
	});
});
