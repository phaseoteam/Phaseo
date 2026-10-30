"use client";

import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";

export default function UnreleasedBadge({ compact = false }: { compact?: boolean }) {
	const t = useTranslations("Common.ui.localisationGaps");
	return (
		<span
			role="img"
			aria-label={t("unreleased")}
			title={t("unreleased")}
			className={`inline-flex shrink-0 items-center justify-center text-blue-400 ${compact ? "size-4" : "size-5"}`}
		>
			<FlaskConical className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
		</span>
	);
}
