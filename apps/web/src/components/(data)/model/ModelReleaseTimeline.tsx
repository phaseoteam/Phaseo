import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { getModelTimelineCached } from "@/lib/fetchers/models/getModelTimeline";

type RawEvent = {
	date: string;
	eventType: string; // "ModelEvent" | "PreviousModel" | "FutureModel" | "Deprecated" | "Retired" | ...
	eventName?: string; // "Released" | "Announced" | "Deprecated" | "Retired" | ...
	description?: string;
	modelId?: string;
	modelName?: string;
};

interface ModelReleaseTimelineProps {
	modelTimeline?: { events: RawEvent[] };
}

type Kind =
	| "announced"
	| "released"
	| "deprecated"
	| "retired"
	| "version"
	| "default";

const STYLES: Record<Kind, { border: string; text: string; dot: string }> = {
	announced: {
		border: "border-b-blue-400 dark:border-b-blue-700",
		text: "text-blue-800 dark:text-blue-300",
		dot: "bg-blue-500",
	},
	released: {
		border: "border-b-green-400 dark:border-b-green-700",
		text: "text-green-800 dark:text-green-300",
		dot: "bg-green-500",
	},
	deprecated: {
		border: "border-b-red-400 dark:border-b-red-700",
		text: "text-red-800 dark:text-red-300",
		dot: "bg-red-500",
	},
	retired: {
		border: "border-b-zinc-500 dark:border-b-zinc-600",
		text: "text-zinc-800 dark:text-zinc-300",
		dot: "bg-black",
	},
	version: {
		border: "border-b-zinc-400 dark:border-b-zinc-500",
		text: "text-zinc-700 dark:text-zinc-200",
		dot: "bg-zinc-400",
	},
	default: {
		border: "border-b-gray-300 dark:border-b-gray-600",
		text: "text-zinc-800 dark:text-zinc-300",
		dot: "bg-zinc-400",
	},
};

type Normalised =
	| {
			date: string;
			type: Exclude<Kind, "version" | "default">;
			label: string;
			description: string;
			modelId?: string;
	  }
	| {
			date: string;
			type: "version";
			label: string;
			description: "Previous version" | "Future version";
			modelId?: string;
	  }
	| {
			date: string;
			type: "default";
			label: string;
			description: string;
			modelId?: string;
	  };

function normaliseEvents(raws: RawEvent[]): Normalised[] {
	// Reference point for inferring previous/future if needed
	const currentReleaseTs = (() => {
		const findTs = (n: string) =>
			raws.find(
				(e) =>
					e.eventType === "ModelEvent" &&
					(e.eventName ?? "").toLowerCase() === n
			)?.date;
		const released = findTs("released");
		if (released) return new Date(released).getTime();
		const announced = findTs("announced");
		if (announced) return new Date(announced).getTime();
		const any = raws
			.filter((e) => e.eventType === "ModelEvent" && e.date)
			.map((e) => new Date(e.date).getTime());
		return any.length ? Math.max(...any) : undefined;
	})();

	return raws.map<Normalised>((r) => {
		const t = (r.eventType ?? "").toLowerCase();
		const n = (r.eventName ?? "").toLowerCase();

		// Handle ModelEvent variations, including Deprecated/Retired coming via eventName
		if (t === "modelevent") {
			if (n === "announced")
				return {
					date: r.date,
					type: "announced",
					label: "Model Announced",
					description: "Model first introduced to the public",
				};
			if (n === "released")
				return {
					date: r.date,
					type: "released",
					label: "Model Released",
					description: "Model first made available to the public",
				};
			if (n === "deprecated")
				return {
					date: r.date,
					type: "deprecated",
					label: "Model Deprecated",
					description: "Model no longer supported or maintained",
				};
			if (n === "retired")
				return {
					date: r.date,
					type: "retired",
					label: "Model Retired",
					description: "Model no longer available or supported",
				};
			const label = r.eventName || "Model event";
			return {
				date: r.date,
				type: "default",
				label,
				description: r.description ?? label,
			};
		}

		// Deprecated/Retired also supported if sent as eventType directly
		if (t === "deprecated")
			return {
				date: r.date,
				type: "deprecated",
				label: "Model Deprecated",
				description: "Model no longer supported or maintained",
			};
		if (t === "retired")
			return {
				date: r.date,
				type: "retired",
				label: "Model Retired",
				description: "Model no longer available or supported",
			};

		// Version hops
		if (t === "previousmodel" || t === "futuremodel") {
			const ts = r.date ? new Date(r.date).getTime() : undefined;
			const inferFuture =
				t === "futuremodel" ||
				(currentReleaseTs !== undefined && ts !== undefined
					? ts > currentReleaseTs
					: false);

			return {
				date: r.date,
				type: "version",
				label: r.modelName || r.modelId || "Model",
				description: inferFuture
					? "Future version"
					: "Previous version",
				modelId: r.modelId,
			};
		}

		// Fallback
		const label = r.eventName || r.modelName || r.modelId || "Event";
		return {
			date: r.date,
			type: "default",
			label,
			description: r.description ?? label,
			modelId: r.modelId,
		};
	});
}

const formatDate = (iso: string) =>
	new Date(iso).toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});

export default async function ModelReleaseTimeline({
	// params,
	modelId,
	includeHidden = false,
}: {
	// params: Promise<{ modelId: string }>;
	modelId: string;
	includeHidden?: boolean;
}) {
	// const modelId = (await params).modelId;
	const modelTimeline = await getModelTimelineCached(modelId, includeHidden);

	const events = modelTimeline?.events ?? [];
	if (!events.length) return null;

	const timeline = normaliseEvents(events)
		.slice()
		.sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
		);

	return (
		<div className="w-full mx-auto mb-8">
			<h2 className="text-xl font-semibold mb-4">Model Timeline</h2>
			<div className="space-y-6">
				{timeline.map((ev, idx) => {
					const s = STYLES[ev.type] ?? STYLES.default;

					return (
						<Card
							key={`${ev.type}-${ev.date}-${idx}`}
							className={`relative flex items-center pl-0 overflow-visible border border-gray-200 dark:border-gray-700 border-b-2 ${s.border} rounded-lg bg-white shadow-none`}
						>
							{/* Dot */}
							<div className="absolute -left-2.5 top-1/2 -translate-y-1/2">
								<span
									className={`block w-4 h-4 rounded-full border-2 border-white shadow-xs ${s.dot}`}
								/>
							</div>

							<CardContent className="pl-6 py-4">
								<div className="text-xs mb-1 text-zinc-500">
									{formatDate(ev.date)}
								</div>

								<div
									className={`font-bold text-lg mb-0.5 ${s.text}`}
								>
									{ev.type === "version" && ev.modelId ? (
										<Link href={`/models/${ev.modelId}`}>
											<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
												{ev.label}
											</span>
										</Link>
									) : (
										ev.label
									)}
								</div>

								<div className="text-zinc-500 text-sm">
									{ev.description}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
