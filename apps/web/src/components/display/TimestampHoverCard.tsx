import * as React from "react";

import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	HoverCardBody,
	HoverCardFacts,
	HoverCardHeadline,
	HoverCardTitle,
	joinMeta,
	type HoverCardFact,
} from "@/components/ui/hover-card-layout";
import { useRelativeNow } from "@/hooks/useRelativeNow";
import { useTranslations } from "@/i18n/react";
import type { DisplayDateValue } from "@/lib/displayPreferences";
import { cn } from "@/lib/utils";

type SharedProps = {
	/** The trigger's text, or with asChild the trigger element itself. */
	children: React.ReactNode;
	/** Use the child element as the trigger instead of the default dotted-underline span. */
	asChild?: boolean;
	/** Set false when the trigger has its own tap action. */
	openOnTap?: boolean;
	triggerClassName?: string;
	/** Rows added after the time rows, such as a session's requests and cost. */
	extraRows?: ReadonlyArray<HoverCardFact | null | false | undefined>;
	/** Replaces the default title (the local date and time). */
	title?: React.ReactNode;
	/** Replaces the default meta line ("3 minutes ago · Europe/London"). */
	meta?: React.ReactNode;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom" | "left" | "right";
};

type PeriodProps = {
	variant: "period";
	start: DisplayDateValue;
	end: DisplayDateValue;
	/** The muted word before the duration; "Duration" by default. */
	durationLabel?: React.ReactNode;
};

export type TimestampHoverCardProps = SharedProps &
	(
		| { variant?: "instant"; value: DisplayDateValue }
		| PeriodProps
		| { variant: "date"; value: DisplayDateValue }
	);

function toDate(value: DisplayDateValue): Date | null {
	if (value == null || value === "") return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * A timestamp with a hover card that shows it in local time, UTC and Unix, plus
 * how long ago it was. Variants: an instant, a period (start to end, with its
 * duration) and a calendar date.
 */
export function TimestampHoverCard(props: TimestampHoverCardProps) {
	const {
		children,
		asChild = false,
		openOnTap,
		triggerClassName,
		align = "start",
		side,
	} = props;
	const anchor = props.variant === "period" ? props.start : props.value;
	if (!toDate(anchor)) return <>{children}</>;

	return (
		<HoverCard>
			<HoverCardTrigger asChild openOnTap={openOnTap}>
				{asChild ? (
					(children as React.ReactElement)
				) : (
					<span
						tabIndex={0}
						className={cn(
							"cursor-help rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
							triggerClassName,
						)}
					>
						{children}
					</span>
				)}
			</HoverCardTrigger>
			<HoverCardContent align={align} side={side} className="w-auto min-w-56 max-w-[min(86vw,320px)]">
				<TimestampCardBody {...props} />
			</HoverCardContent>
		</HoverCard>
	);
}

// Rendered only while the card is open, so closed cards never read the clock.
function TimestampCardBody(props: TimestampHoverCardProps) {
	const t = useTranslations("Common.ui.hoverCards");
	const format = useDisplayFormatters();
	const nowMs = useRelativeNow();
	const now = nowMs === null ? null : new Date(nowMs);
	const timeZone = format.timeZone();

	if (props.variant === "period") {
		const start = toDate(props.start);
		const end = toDate(props.end) ?? start;
		if (!start || !end) return null;
		const title = props.title ?? format.dateTimeRange(start, end);
		const meta = props.meta ?? joinMeta([now ? format.relative(end, now) : null, timeZone]);
		return (
			<HoverCardBody>
				<HoverCardTitle title={title} meta={meta} />
				<HoverCardHeadline prefix={props.durationLabel ?? t("duration")}>
					{format.elapsed(end.getTime() - start.getTime())}
				</HoverCardHeadline>
				<HoverCardFacts
					rows={[
						{ key: "start", label: t("start"), value: format.dateTime(start, { includeSeconds: true }) },
						{ key: "end", label: t("end"), value: format.dateTime(end, { includeSeconds: true }) },
						{ key: "utc", label: t("utc"), value: <span className="font-mono">{format.utcDateTime(start)}</span> },
						...(props.extraRows ?? []),
					]}
				/>
			</HoverCardBody>
		);
	}

	const date = toDate(props.value);
	if (!date) return null;

	if (props.variant === "date") {
		const title = props.title ?? format.date(date);
		const meta = props.meta ?? (now ? format.relative(date, now, "day") : null);
		return (
			<HoverCardBody>
				<HoverCardTitle title={title} meta={meta} />
				<HoverCardFacts
					rows={[
						{ key: "utc", label: t("utc"), value: format.calendarDate(date) },
						...(props.extraRows ?? []),
					]}
				/>
			</HoverCardBody>
		);
	}

	const title = props.title ?? format.dateTime(date, { includeSeconds: true });
	const meta = props.meta ?? joinMeta([now ? format.relative(date, now) : null, timeZone]);
	return (
		<HoverCardBody>
			<HoverCardTitle title={title} meta={meta} />
			<HoverCardFacts
				rows={[
					{ key: "utc", label: t("utc"), value: <span className="font-mono">{format.utcDateTime(date)}</span> },
					{ key: "unix", label: t("unix"), value: <span className="font-mono tabular-nums">{Math.floor(date.getTime() / 1000)}</span> },
					...(props.extraRows ?? []),
				]}
			/>
		</HoverCardBody>
	);
}
