import type { ReactNode } from "react";
import { History } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Alert } from "@/components/ui/alert";
import { CALLOUT_TONES } from "@/components/ui/callout";
import { cn } from "@/lib/utils";

/**
 * "Been here before? [Sign in]" on the sign-up step, for a browser that has signed in before
 * (the last method is remembered in localStorage, never the account). The action is passed in:
 * a social provider signs straight in; email moves to the sign-in step.
 * One line down to 360 px wide: the clock icon drops out below 380 px to make room.
 */
export function ReturningUserCallout({ action, className }: { action: ReactNode; className?: string }) {
	const t = useTranslations("Auth.signUp");
	return (
		<Alert
			role="note"
			className={cn(
				CALLOUT_TONES.info.className,
				// A row, not the alert's icon/title grid: the prompt and its action sit side by side.
				"flex items-center gap-2.5 py-2 ps-3.5 pe-2 *:[svg]:translate-y-0",
				className,
			)}
		>
			<History aria-hidden="true" className="size-4 shrink-0 max-[380px]:hidden" />
			<p className="min-w-0 flex-1 text-sm leading-snug">{t("returningPrompt")}</p>
			<div className="shrink-0">{action}</div>
		</Alert>
	);
}
