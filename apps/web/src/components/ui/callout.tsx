import type { ReactNode } from "react";
import { CALLOUT_TONES as CALLOUT_TONE_CLASSES, type CalloutTone } from "@phaseo/app-kit/ui-recipes";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// The coloured, icon-led box the model pages use for notices. Use it for any
// explanation, warning or error shown inline on a page, instead of a grey box
// with a coloured left edge. The tone classes are shared with the mobile app's
// Callout (packages/shared/app-kit/src/ui-recipes/callout.ts).

export type { CalloutTone };

const CALLOUT_ICONS: Record<CalloutTone, LucideIcon> = {
	info: Info,
	success: CheckCircle2,
	warning: AlertTriangle,
	critical: AlertCircle,
};

const toneStyle = (tone: CalloutTone) => ({
	icon: CALLOUT_ICONS[tone],
	className: `${CALLOUT_TONE_CLASSES[tone].surface} ${CALLOUT_TONE_CLASSES[tone].title}`,
	descriptionClassName: CALLOUT_TONE_CLASSES[tone].description,
});

export const CALLOUT_TONES: Record<CalloutTone, { icon: LucideIcon; className: string; descriptionClassName: string }> = {
	info: toneStyle("info"),
	success: toneStyle("success"),
	warning: toneStyle("warning"),
	critical: toneStyle("critical"),
};

export function Callout({
	tone = "info",
	title,
	icon,
	role = "note",
	className,
	children,
}: {
	tone?: CalloutTone;
	title?: ReactNode;
	/** Replaces the tone's icon. */
	icon?: LucideIcon;
	/** "note" for static explanations; "status" or "alert" when the box appears in response to something. */
	role?: "note" | "status" | "alert";
	className?: string;
	children?: ReactNode;
}) {
	const style = CALLOUT_TONES[tone];
	const Icon = icon ?? style.icon;
	return (
		<Alert role={role} className={cn(style.className, className)}>
			<Icon className="h-4 w-4" aria-hidden="true" />
			{title ? <AlertTitle>{title}</AlertTitle> : null}
			{children ? <AlertDescription className={style.descriptionClassName}>{children}</AlertDescription> : null}
		</Alert>
	);
}
