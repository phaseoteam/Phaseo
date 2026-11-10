import React from "react";
import Link from "@/components/link";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	HoverCardBadgeRow,
	HoverCardBody,
	HoverCardFacts,
	HoverCardHeadline,
	HoverCardTitle,
	type HoverCardFact,
} from "@/components/ui/hover-card-layout";
import { useTranslations } from "@/i18n/react";
import { cn } from "@/lib/utils";

export type UsageEntityHoverCardRow = HoverCardFact;

const TRIGGER_CLASS =
	"inline-flex min-w-0 items-center gap-2 rounded-sm text-foreground underline decoration-transparent decoration-1 underline-offset-4 outline-none transition-[text-decoration-color] duration-200 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

function stopPropagation(event: React.MouseEvent) {
	event.stopPropagation();
}

/**
 * A model, provider, key or app in the usage pages, with a hover card. The
 * trigger is the link when there is an href (so the card has no "View" button),
 * otherwise a focusable span.
 */
export default function UsageEntityHoverCard({
	children,
	title,
	meta,
	headline,
	headlineLabel,
	href,
	rows = [],
	badges,
	visual,
	requestedAs,
	triggerClassName,
	disabled = false,
}: {
	/** The trigger's content; the card wraps it in the link or focusable span. */
	children: React.ReactNode;
	title: string;
	/** Muted line under the title; parts are usually joined with " · ". */
	meta?: React.ReactNode;
	headline?: React.ReactNode;
	headlineLabel?: React.ReactNode;
	href?: string | null;
	rows?: ReadonlyArray<UsageEntityHoverCardRow | null | false | undefined>;
	badges?: React.ReactNode;
	visual?: React.ReactNode;
	/** The model id the client asked for; shown only when it differs from the routed one. */
	requestedAs?: { id: string; routedId: string | null } | null;
	triggerClassName?: string;
	disabled?: boolean;
}) {
	const t = useTranslations("Common.ui.hoverCards");
	const trigger = href ? (
		<Link href={href} className={cn(TRIGGER_CLASS, triggerClassName)} onClick={stopPropagation}>
			{children}
		</Link>
	) : (
		<span tabIndex={disabled ? undefined : 0} className={cn(TRIGGER_CLASS, !disabled && "cursor-help", triggerClassName)}>
			{children}
		</span>
	);
	if (disabled) return trigger;

	const showRequestedAs = Boolean(
		requestedAs?.id && requestedAs.routedId && requestedAs.id !== requestedAs.routedId,
	);

	return (
		<HoverCard>
			<HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
			<HoverCardContent align="start" className="w-[min(86vw,288px)]">
				<HoverCardBody>
					<HoverCardTitle icon={visual} title={title} meta={meta} />
					{headline != null && headline !== "" ? (
						<HoverCardHeadline label={headlineLabel}>{headline}</HoverCardHeadline>
					) : null}
					<HoverCardFacts
						rows={[
							...rows,
							showRequestedAs && requestedAs
								? {
										key: "requested-as",
										label: t("requestedAs"),
										value: <code className="font-mono text-[11px]">{requestedAs.id}</code>,
									}
								: null,
						]}
					/>
					{badges ? <HoverCardBadgeRow>{badges}</HoverCardBadgeRow> : null}
				</HoverCardBody>
			</HoverCardContent>
		</HoverCard>
	);
}
