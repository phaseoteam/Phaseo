"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";

import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { obfuscatedPlaceholder } from "@/lib/obfuscation";

type SensitiveValueProps = {
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
	inline?: boolean;
	label?: string;
	reveal?: boolean;
};

function maskedContent(children: React.ReactNode, label: string): React.ReactNode {
	return React.Children.map(children, (child) => {
		if (typeof child === "string" || typeof child === "number") {
			return <span data-pii-hidden="true" aria-hidden="true">{obfuscatedPlaceholder(String(child))}</span>;
		}
		if (!React.isValidElement(child)) return child;
		if (child.type === Input || child.type === "input") {
			const input = child as React.ReactElement<React.ComponentProps<typeof Input>>;
			return React.cloneElement(input, {
				value: obfuscatedPlaceholder(String(input.props.value ?? input.props.defaultValue ?? "")),
				defaultValue: undefined,
				type: "text",
				readOnly: true,
				"aria-label": label,
				className: cn(input.props.className, "select-none text-transparent [text-shadow:0_0_4px_var(--muted-foreground)]"),
			});
		}
		const element = child as React.ReactElement<{ children?: React.ReactNode }>;
		return React.cloneElement(element, {}, maskedContent(element.props.children, label));
	});
}

export function SensitiveValue(props: SensitiveValueProps) {
	const { preferences } = useDisplayPreferences();
	return <SensitiveValueContent key={String(preferences.maskSensitiveData)} {...props} masked={preferences.maskSensitiveData} />;
}

function SensitiveValueContent({
	children,
	className,
	contentClassName,
	inline = false,
	label,
	reveal = true,
	masked,
}: SensitiveValueProps & { masked: boolean }) {
	const t = useTranslations("SettingsUI");
	const knownLabels: Record<string, string> = {
		"sensitive value": t("sensitiveValues.value"),
		"email address": t("strings.Email"),
		"new email address": t("strings.New email"),
		"card number": t("billingCopy.cardNumber"),
		"card expiry": t("sensitiveValues.cardExpiry"),
	};
	const translatedLabel = label ? knownLabels[label] ?? label : t("sensitiveValues.value");
	const [revealed, setRevealed] = React.useState(false);
	const hidden = masked && !revealed;
	const Tag = inline ? "span" : "div";

	return (
		<Tag className={cn(inline ? "inline-flex items-center gap-1" : "relative", className)}>
			<Tag
				data-pii="true"
				data-pii-revealed={revealed ? "true" : undefined}
				className={cn(!inline && masked && reveal && "[&_input]:pr-10", contentClassName)}
			>
				{hidden ? maskedContent(children, translatedLabel) : children}
				{hidden && inline ? <span className="sr-only">{translatedLabel}</span> : null}
			</Tag>
			{masked && reveal ? (
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
