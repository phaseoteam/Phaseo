import {
	BadgeCheck,
	Boxes,
	CircleDot,
	Layers3,
	Shuffle,
	Zap,
	type LucideIcon,
} from "lucide-react";

type TierFilterMeta = {
	icon: LucideIcon;
	iconClassName: string;
	filterIconHoverClassName: string;
};

const TIER_FILTER_META: Record<string, TierFilterMeta> = {
	standard: {
		icon: Layers3,
		iconClassName: "text-blue-600 dark:text-blue-400",
		filterIconHoverClassName:
			"group-hover:text-blue-600 dark:group-hover:text-blue-400",
	},
	batch: {
		icon: Boxes,
		iconClassName: "text-violet-600 dark:text-violet-400",
		filterIconHoverClassName:
			"group-hover:text-violet-600 dark:group-hover:text-violet-400",
	},
	free: {
		icon: BadgeCheck,
		iconClassName: "text-emerald-600 dark:text-emerald-400",
		filterIconHoverClassName:
			"group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
	},
	flex: {
		icon: Shuffle,
		iconClassName: "text-teal-600 dark:text-teal-400",
		filterIconHoverClassName:
			"group-hover:text-teal-600 dark:group-hover:text-teal-400",
	},
	priority: {
		icon: Zap,
		iconClassName: "text-violet-600 dark:text-violet-400",
		filterIconHoverClassName:
			"group-hover:text-violet-600 dark:group-hover:text-violet-400",
	},
};

export function getTierFilterMeta(value: string): TierFilterMeta {
	return (
		TIER_FILTER_META[
			String(value ?? "")
				.trim()
				.toLowerCase()
		] ?? {
			icon: CircleDot,
			iconClassName: "text-muted-foreground",
			filterIconHoverClassName: "group-hover:text-foreground",
		}
	);
}
