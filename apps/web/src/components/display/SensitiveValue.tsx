"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";

import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { cn } from "@/lib/utils";

export function SensitiveValue({
	children,
	className,
	contentClassName,
	inline = false,
	label,
}: {
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
	inline?: boolean;
	label?: string;
}) {
	const t = useTranslations("SettingsUI");
	const knownLabels: Record<string, string> = {
		"sensitive value": t("sensitiveValues.value"),
		"email address": t("strings.Email"),
		"new email address": t("strings.New email"),
		"card number": t("billingCopy.cardNumber"),
		"card expiry": t("sensitiveValues.cardExpiry"),
	};
	const translatedLabel = label ? knownLabels[label] ?? label : t("sensitiveValues.value");
	const { preferences } = useDisplayPreferences();
	const [revealed, setRevealed] = React.useState(false);
	const Tag = inline ? "span" : "div";

	return (
		<Tag className={cn(inline ? "inline-flex items-center gap-1" : "relative", className)}>
			<Tag
				data-pii="true"
				data-pii-revealed={revealed ? "true" : undefined}
				className={cn(!inline && preferences.maskSensitiveData && "[&_input]:pr-10", contentClassName)}
			>
				{children}
			</Tag>
			{preferences.maskSensitiveData ? (
				<button
					type="button"
					aria-label={t(revealed ? "sensitiveValues.mask" : "sensitiveValues.reveal", { label: translatedLabel })}
					aria-pressed={revealed}
					title={t(revealed ? "sensitiveValues.mask" : "sensitiveValues.reveal", { label: translatedLabel })}
					onClick={() => setRevealed((current) => !current)}
					className={cn(
						"z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						!inline && "absolute right-1 top-1/2 -translate-y-1/2 bg-background/90",
					)}
				>
					{revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
				</button>
			) : null}
		</Tag>
	);
}
