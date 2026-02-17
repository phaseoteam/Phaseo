import * as React from "react";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Book } from "lucide-react";
import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { ProviderLogoName } from "../ProviderLogoName";

function getMonthDiff(date1: Date, date2: Date) {
	const years = date1.getFullYear() - date2.getFullYear();
	const months = date1.getMonth() - date2.getMonth();
	return years * 12 + months;
}

function formatDate(dateStr: string | null | undefined) {
	if (!dateStr) return "-";
	const date = new Date(dateStr);
	if (isNaN(date.getTime())) return "-";
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

export default function KnowledgeCutoffTimeline({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const modelsWithCutoff = selectedModels.filter((m) => m.knowledge_cutoff);
	if (modelsWithCutoff.length < 1) return null;

	const modelsSorted = [...modelsWithCutoff].sort(
		(a, b) =>
			new Date(a.knowledge_cutoff!).getTime() -
			new Date(b.knowledge_cutoff!).getTime()
	);
	const oldest = modelsSorted[0];
	const newest = modelsSorted[modelsSorted.length - 1];
	const diffMonths = getMonthDiff(
		new Date(newest.knowledge_cutoff!),
		new Date(oldest.knowledge_cutoff!)
	);
	const badgeColor =
		diffMonths > 0
			? "bg-blue-100 text-blue-800 border-blue-300"
			: "bg-red-100 text-red-700 border-red-300";
	const badgeVariant = diffMonths > 0 ? "default" : "destructive";

	const spanMonths = getMonthDiff(
		new Date(newest.knowledge_cutoff!),
		new Date(oldest.knowledge_cutoff!)
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

	const oldestDate = formatDate(oldest.knowledge_cutoff);
	const newestDate = formatDate(newest.knowledge_cutoff);

	const summarySection = (
		<Card className="mb-4 border border-border/60 bg-background/60 shadow-none">
			<Card className="flex items-center gap-2 p-4 border-none bg-transparent">
				<span className="relative flex h-4 w-4 items-center justify-center mr-4 shrink-0">
					<span className="absolute h-6 w-6 rounded-full bg-blue-400/30" />
					<Book className="relative h-full w-full text-blue-500" />
				</span>
				<div className="text-sm">
					{modelsWithCutoff.length === 1 ? (
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
								has knowledge cutoff at {oldestDate}.
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
								has knowledge up to {newestDate}, while{" "}
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
								stops at {oldestDate}.
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
								</Link>
								&apos;s knowledge is {Math.abs(diffMonths)}{" "}
								month
								{Math.abs(diffMonths) !== 1 ? "s" : ""} more
								recent than{" "}
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
								&apos;s.
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
					<h2 className="text-lg font-semibold">Knowledge cutoff</h2>
					<p className="text-sm text-muted-foreground">
						Most recent training data date (when available).
					</p>
				</div>
				{modelsWithCutoff.length > 1 ? (
					<Badge
						variant={badgeVariant}
						className={
							badgeColor +
							" px-3 py-1 text-xs font-semibold mt-1 transition-colors duration-150 hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400 dark:hover:bg-blue-900 dark:hover:text-blue-100"
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
											{formatDate(model.knowledge_cutoff)}
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
									const isNewest = idx === modelsSorted.length - 1;
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
												className={
													isNewest
														? "rounded-md ring-2 ring-blue-400 ring-offset-2 ring-offset-background"
														: "rounded-md"
												}
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
