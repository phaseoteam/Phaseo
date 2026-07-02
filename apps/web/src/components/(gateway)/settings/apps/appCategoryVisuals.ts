import {
	Bot,
	BriefcaseBusiness,
	CircleDollarSign,
	Code2,
	Film,
	GraduationCap,
	Search,
	ShoppingBag,
	Sparkles,
} from "lucide-react";
import type { AppCategory } from "@/lib/appCategories";

export const APP_CATEGORY_VISUALS = {
	chat: {
		Icon: Bot,
		iconClassName:
			"text-sky-600 dark:text-sky-300 group-hover/category:text-sky-500 group-focus/category:text-sky-500",
		badgeClassName:
			"border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
	"developer-tools": {
		Icon: Code2,
		iconClassName:
			"text-violet-600 dark:text-violet-300 group-hover/category:text-violet-500 group-focus/category:text-violet-500",
		badgeClassName:
			"border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
	},
	research: {
		Icon: Search,
		iconClassName:
			"text-cyan-600 dark:text-cyan-300 group-hover/category:text-cyan-500 group-focus/category:text-cyan-500",
		badgeClassName:
			"border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
	},
	productivity: {
		Icon: BriefcaseBusiness,
		iconClassName:
			"text-emerald-600 dark:text-emerald-300 group-hover/category:text-emerald-500 group-focus/category:text-emerald-500",
		badgeClassName:
			"border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	education: {
		Icon: GraduationCap,
		iconClassName:
			"text-amber-600 dark:text-amber-300 group-hover/category:text-amber-500 group-focus/category:text-amber-500",
		badgeClassName:
			"border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	commerce: {
		Icon: ShoppingBag,
		iconClassName:
			"text-rose-600 dark:text-rose-300 group-hover/category:text-rose-500 group-focus/category:text-rose-500",
		badgeClassName:
			"border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
	},
	media: {
		Icon: Film,
		iconClassName:
			"text-fuchsia-600 dark:text-fuchsia-300 group-hover/category:text-fuchsia-500 group-focus/category:text-fuchsia-500",
		badgeClassName:
			"border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
	},
	finance: {
		Icon: CircleDollarSign,
		iconClassName:
			"text-lime-700 dark:text-lime-300 group-hover/category:text-lime-600 group-focus/category:text-lime-600",
		badgeClassName:
			"border-lime-500/25 bg-lime-500/10 text-lime-700 dark:text-lime-300",
	},
	other: {
		Icon: Sparkles,
		iconClassName:
			"text-muted-foreground group-hover/category:text-foreground group-focus/category:text-foreground",
		badgeClassName: "border-border/70 bg-muted/30 text-muted-foreground",
	},
} satisfies Record<
	AppCategory,
	{
		Icon: typeof Bot;
		iconClassName: string;
		badgeClassName: string;
	}
>;
