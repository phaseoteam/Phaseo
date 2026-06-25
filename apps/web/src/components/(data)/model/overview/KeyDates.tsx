import { Megaphone, Rocket, Archive, Ban } from "lucide-react";
import RelativeDateBadge from "./RelativeDateBadge";
import { formatModelLifecycleDate } from "@/lib/dates/modelLifecycleDates";

interface KeyDatesProps {
	announced?: string;
	released?: string;
	deprecated?: string;
	retired?: string;
	showHeading?: boolean;
}

export default function KeyDates({
	announced,
	released,
	deprecated,
	retired,
	showHeading = true,
}: KeyDatesProps) {
	const entries = [
		{
			key: "announced",
			label: "Announcement",
			value: announced,
			Icon: Megaphone,
			className:
				"border-blue-200/80 bg-blue-50/50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
		},
		{
			key: "released",
			label: "Release",
			value: released,
			Icon: Rocket,
			className:
				"border-emerald-200/80 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
		},
		{
			key: "deprecated",
			label: "Deprecation",
			value: deprecated,
			Icon: Ban,
			className:
				"border-amber-200/80 bg-amber-50/50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
		},
		{
			key: "retired",
			label: "Retirement",
			value: retired,
			Icon: Archive,
			className:
				"border-zinc-200/80 bg-zinc-50/60 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
		},
	].filter((entry) => Boolean(entry.value));

	if (entries.length === 0) return null;

	return (
		<div className="space-y-2">
			{showHeading ? <h3 className="text-base font-semibold">Key Dates</h3> : null}
			<div className="grid gap-2 md:grid-cols-2">
				{entries.map(({ key, label, value, Icon, className }) => (
					<div
						key={key}
						className={`rounded-lg border px-3 py-3 ${className}`}
					>
						<div className="flex flex-wrap items-start justify-between gap-2">
							<div className="flex items-center gap-1.5 text-xs font-medium">
								<Icon className="h-3.5 w-3.5" />
								<span>{label}</span>
							</div>
							{value ? <RelativeDateBadge date={value} /> : null}
						</div>
						<p className="mt-2 text-sm font-semibold">
							{formatModelLifecycleDate(value)}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
