import type { ReactNode } from "react";
import { CALLOUT_TONES, type CalloutTone } from "@phaseo/app-kit/ui-recipes";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const icons: Record<CalloutTone, LucideIcon> = { info: Info, success: CheckCircle2, warning: AlertTriangle, critical: AlertCircle };

/**
 * The coloured, icon-led box for an explanation, warning or error shown inline, with the tones the website and mobile
 * app share (app-kit's ui-recipes). The desktop app keeps its corners at rounded-md.
 */
export function Callout({ tone = "info", title, icon, role = "note", className, children }: { tone?: CalloutTone; title?: ReactNode; icon?: LucideIcon; role?: "note" | "status" | "alert"; className?: string; children?: ReactNode }) {
	const style = CALLOUT_TONES[tone], Icon = icon ?? icons[tone];
	return <div role={role} className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", style.surface, className)}>
		<Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.title)} />
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			{title && <div className={cn("font-medium", style.title)}>{title}</div>}
			{children && <div className={style.description}>{children}</div>}
		</div>
	</div>;
}
