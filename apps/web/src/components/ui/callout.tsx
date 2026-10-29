import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// The coloured, icon-led box the model pages use for notices. Use it for any
// explanation, warning or error shown inline on a page, instead of a grey box
// with a coloured left edge.

export type CalloutTone = "info" | "success" | "warning" | "critical";

export const CALLOUT_TONES: Record<CalloutTone, { icon: LucideIcon; className: string; descriptionClassName: string }> = {
	info: {
		icon: Info,
		className: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-50",
		descriptionClassName: "text-sky-900/90 dark:text-sky-100/90",
	},
	success: {
		icon: CheckCircle2,
		className: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-50",
		descriptionClassName: "text-emerald-900/90 dark:text-emerald-100/90",
	},
	warning: {
		icon: AlertTriangle,
		className: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50",
		descriptionClassName: "text-amber-900/90 dark:text-amber-100/90",
	},
	critical: {
		icon: AlertCircle,
		className: "border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-50",
		descriptionClassName: "text-red-900/90 dark:text-red-100/90",
	},
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
