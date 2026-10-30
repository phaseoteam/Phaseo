import { useTranslations } from "next-intl";
import { parseAppCategories } from "@/lib/appCategories";

export default function AppCategoryTags({
	categoryCsv,
	className = "",
}: {
	categoryCsv?: string | null;
	className?: string;
}) {
	const t = useTranslations("SettingsUI");
	const categories = parseAppCategories(categoryCsv);
	if (categories.length === 0) return null;

	return (
		<div className={`flex min-w-0 flex-wrap gap-1.5 ${className}`}>
			{categories.map((category) => (
				<span
					key={category}
					className="inline-flex rounded-md border border-border/70 bg-muted/35 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-muted-foreground"
				>
					{t(`apps.categories.${category}` as never)}
				</span>
			))}
		</div>
	);
}
