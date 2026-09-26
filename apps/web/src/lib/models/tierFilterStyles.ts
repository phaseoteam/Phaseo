import {
	BadgeCheck,
	Boxes,
	CircleDot,
	Layers3,
	Rocket,
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
		iconClassName: "text-orange-600 dark:text-orange-400",
		filterIconHoverClassName:
			"group-hover:text-orange-600 dark:group-hover:text-orange-400",
	},
	free: {
		icon: BadgeCheck,
		iconClassName: "text-emerald-600 dark:text-emerald-400",
		filterIconHoverClassName:
			"group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
	},
	flex: {
		icon: Shuffle,
		iconClassName: "text-sky-600 dark:text-sky-400",
		filterIconHoverClassName:
			"group-hover:text-sky-600 dark:group-hover:text-sky-400",
	},
	priority: {
		icon: Zap,
		iconClassName: "text-violet-600 dark:text-violet-400",
		filterIconHoverClassName:
			"group-hover:text-violet-600 dark:group-hover:text-violet-400",
	},
	ultrafast: {
		icon: Rocket,
		iconClassName: "text-fuchsia-600 dark:text-fuchsia-400",
		filterIconHoverClassName:
			"group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-400",
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
