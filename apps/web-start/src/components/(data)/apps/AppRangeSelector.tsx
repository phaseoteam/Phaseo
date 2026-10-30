"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

interface AppRangeSelectorProps {
	value: RangeKey;
	onValueChange: (value: RangeKey) => void;
}

export default function AppRangeSelector({ value, onValueChange }: AppRangeSelectorProps) {
	const t = useTranslations("Common.timeRange");
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm font-medium">{t("label")}:</span>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger className="w-[120px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="1h">{t("lastHour")}</SelectItem>
					<SelectItem value="1d">{t("lastDay")}</SelectItem>
					<SelectItem value="1w">{t("lastWeek")}</SelectItem>
					<SelectItem value="4w">{t("lastFourWeeks")}</SelectItem>
					<SelectItem value="1m">{t("lastMonth")}</SelectItem>
					<SelectItem value="1y">{t("lastYear")}</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
