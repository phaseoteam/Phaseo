import * as React from "react";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { ProviderLogoName } from "../../ProviderLogoName";

function getMonthDiff(date1: Date, date2: Date) {
	const years = date1.getFullYear() - date2.getFullYear();
	const months = date1.getMonth() - date2.getMonth();
	return years * 12 + months;
}

function formatDate(dateStr: string) {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function positionStyle(idx: number, total: number): React.CSSProperties {
	if (total <= 1) {
		return { left: "50%", transform: "translateX(-50%)" };
	}
	const pct = (idx / (total - 1)) * 100;
	if (idx === 0) return { left: "0%", transform: "translateX(0%)" };
	if (idx === total - 1) return { left: "100%", transform: "translateX(-100%)" };
	return { left: `${pct}%`, transform: "translateX(-50%)" };
}

export default function ReleaseTimeline({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const modelsWithDates = selectedModels.filter(
		(model): model is ExtendedModel & { release_date: string } =>
			model.release_date !== null
	);

	if (!modelsWithDates || modelsWithDates.length < 1) {
		return null;
	}

	const modelsSorted = [...modelsWithDates].sort(
		(a, b) =>
			new Date(a.release_date).getTime() -
			new Date(b.release_date).getTime()
	);

	const oldest = modelsSorted[0];
	const newest = modelsSorted[modelsSorted.length - 1];
	const diffMonths = getMonthDiff(
		new Date(newest.release_date),
		new Date(oldest.release_date)
	);
	const badgeColor =
		diffMonths > 0
			? "bg-green-100 text-green-800 border-green-300"
			: "bg-red-100 text-red-700 border-red-300";
	const badgeVariant = diffMonths > 0 ? "default" : "destructive";

	// Calculate time span between oldest and newest
	const spanMonths = getMonthDiff(
		new Date(newest.release_date),
		new Date(oldest.release_date)
	);
	const spanYears = Math.floor(spanMonths / 12);
	const spanRemMonths = Math.abs(spanMonths % 12);
	const spanString =
		[
			spanYears > 0 ? `${spanYears}y` : null,
			spanRemMonths > 0 ? `${spanRemMonths}m` : null,
		]
			.filter(Boolean)
			.join(" ") || "0m";

	// Build summary mini-section comparing oldest and newest
	const oldestDate = formatDate(oldest.release_date);
	const newestDate = formatDate(newest.release_date);
	const summarySection = (
		<Card className="mb-4 border border-border/60 bg-background/60 shadow-none">
			<Card className="flex items-center gap-2 p-4 border-none bg-transparent">
				<span className="relative flex h-4 w-4 items-center justify-center mr-4 shrink-0">
					<span className="absolute h-6 w-6 rounded-full bg-emerald-400/20" />
					<Calendar className="relative h-full w-full text-emerald-700 dark:text-emerald-400" />
				</span>
				<div className="text-sm">
					{modelsWithDates.length === 1 ? (
						<>
							<span className="block font-medium">
								<Link
									href={`/models/${encodeURIComponent(
										oldest.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{oldest.name}
									</span>
								</Link>{" "}
								was released on {oldestDate}.
							</span>
						</>
					) : (
						<>
							<span className="block font-medium">
								<Link
									href={`/models/${encodeURIComponent(
										newest.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{newest.name}
									</span>
								</Link>{" "}
								was released on {newestDate}, while{" "}
								<Link
									href={`/models/${encodeURIComponent(
										oldest.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{oldest.name}
									</span>
								</Link>{" "}
								was released on {oldestDate}.
							</span>
							<span className="block text-xs text-muted-foreground mt-1">
								<Link
									href={`/models/${encodeURIComponent(
										newest.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{newest.name}
									</span>
								</Link>{" "}
								is {Math.abs(diffMonths)} month
								{Math.abs(diffMonths) !== 1 ? "s" : ""} newer
								than{" "}
								<Link
									href={`/models/${encodeURIComponent(
										oldest.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
										{oldest.name}
									</span>
								</Link>
								.
							</span>
						</>
					)}
				</div>
			</Card>
		</Card>
	);

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Release timeline</h2>
					<p className="text-sm text-muted-foreground">
						Model release chronology.
					</p>
				</div>
				{modelsWithDates.length > 1 ? (
					<Badge
						variant={badgeVariant}
						className={
							badgeColor +
							" px-3 py-1 text-xs font-semibold mt-1 transition-colors duration-150 hover:bg-green-200 hover:text-green-900 hover:border-green-400 dark:hover:bg-green-900 dark:hover:text-green-100"
						}
					>
						{spanString} span
					</Badge>
				) : null}
			</header>

			<div className="space-y-4">
				{summarySection}
				<div className="rounded-xl border border-border/60 bg-card p-4">
					{/* Timeline visualization */}
					<div className="relative flex flex-col items-center w-full px-2">
							<div className="relative w-full h-5 mb-2">
								{modelsSorted.map((model, idx) => (
									<div
										key={model.id}
										className="absolute top-0"
										style={positionStyle(idx, modelsSorted.length)}
									>
										<span
											className={`block text-xs font-medium max-w-[160px] truncate whitespace-nowrap ${
												idx === 0
													? "text-left"
													: idx === modelsSorted.length - 1
														? "text-right"
														: "text-center"
											}`}
										>
											<Link
												href={`/models/${encodeURIComponent(
													model.id
												)}`}
												className="group"
											>
												<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
													{formatDate(model.release_date)}
												</span>
											</Link>
										</span>
									</div>
								))}
							</div>
							<div className="relative w-full h-6 flex items-center">
								<div
									className="absolute left-0 right-0 top-1/2 h-1 bg-zinc-200 rounded-full"
									style={{ zIndex: 0 }}
								/>
								{modelsSorted.map((model, idx) => {
									const pos = positionStyle(idx, modelsSorted.length);
									const providerId =
										model.provider?.provider_id ??
										model.provider?.name ??
										"unknown";
									const providerName =
										model.provider?.name ?? providerId ?? "Unknown";
									return (
										<div
											key={model.id}
											className="absolute top-1/2"
											style={{
												left: pos.left,
												transform: `${pos.transform} translateY(-50%)`,
												zIndex: 1,
											}}
										>
											<ProviderLogoName
												id={providerId}
												name={providerName}
												href={`/organisations/${providerId}`}
												size="xs"
												mobilePopover
												className="rounded-md"
											/>
										</div>
									);
								})}
							</div>
							<div className="relative w-full h-5 mt-2">
								{modelsSorted.map((model, idx) => (
									<div
										key={model.id}
										className="absolute top-0"
										style={positionStyle(idx, modelsSorted.length)}
									>
										<span
											className={`block text-xs font-semibold text-zinc-700 max-w-[200px] truncate ${
												idx === 0
													? "text-left"
													: idx === modelsSorted.length - 1
														? "text-right"
														: "text-center"
											}`}
										>
											<Link
												href={`/models/${encodeURIComponent(
													model.id
												)}`}
												className="group"
											>
												<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
													{model.name}
												</span>
											</Link>
										</span>
									</div>
								))}
							</div>
						</div>
				</div>
			</div>
		</section>
	);
}
