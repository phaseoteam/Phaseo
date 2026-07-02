import { Megaphone, Rocket, Archive, Ban } from "lucide-react";
import RelativeDateBadge from "./RelativeDateBadge";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";

interface KeyDatesProps {
	announced?: string;
	released?: string;
	deprecated?: string;
	retired?: string;
	showHeading?: boolean;
	showEmpty?: boolean;
}

export default function KeyDates({
	announced,
	released,
	deprecated,
	retired,
	showHeading = true,
	showEmpty = false,
}: KeyDatesProps) {
	const entries = [
		{
			key: "announced",
			label: "Announcement",
			value: announced,
			Icon: Megaphone,
			accentClassName: "text-blue-700 dark:text-blue-300",
		},
		{
			key: "released",
			label: "Release",
			value: released,
			Icon: Rocket,
			accentClassName: "text-emerald-700 dark:text-emerald-300",
		},
		{
			key: "deprecated",
			label: "Deprecation",
			value: deprecated,
			Icon: Ban,
			accentClassName: "text-amber-700 dark:text-amber-300",
		},
		{
			key: "retired",
			label: "Retirement",
			value: retired,
			Icon: Archive,
			accentClassName: "text-zinc-700 dark:text-zinc-300",
		},
	];
	const visibleEntries = showEmpty
		? entries
		: entries.filter((entry) => Boolean(entry.value));

	if (visibleEntries.length === 0) return null;

	return (
		<div className="space-y-2">
			{showHeading ? <h3 className="text-base font-semibold">Key Dates</h3> : null}
			<div className="grid overflow-hidden rounded-lg border border-border/70 bg-card md:grid-cols-4">
				{visibleEntries.map(({ key, label, value, Icon, accentClassName }) => (
					<div
						key={key}
						className="border-b border-border/70 px-3 py-3 text-foreground last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
					>
						<div
							className={`flex items-center gap-1.5 text-xs font-medium ${
								value ? accentClassName : "text-muted-foreground"
							}`}
						>
							<Icon className="h-3.5 w-3.5" />
							<span>{label}</span>
						</div>
						<p
							className={
								value
									? `mt-2 flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold leading-5 ${accentClassName}`
									: "mt-2 text-sm font-medium text-muted-foreground"
							}
						>
							{value ? (
								<>
									<span>{formatModelLifecycleDate(value)}</span>
									<span className="text-muted-foreground/50">·</span>
									<RelativeDateBadge
										date={value}
										className="border-transparent bg-transparent px-0 py-0 text-[11px] font-medium text-muted-foreground hover:text-foreground"
									/>
								</>
							) : (
								"Not listed"
							)}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
