import { Logo } from "@/components/Logo";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import TimeDisplay from "@/components/updates/TimeDisplay";
import type { EventType, ModelEvent } from "@/lib/fetchers/updates/types";
import Link from "next/link";
import type React from "react";

export interface EventTypeOption {
	type: EventType;
	label: string;
	icon: React.ReactNode;
	badgeClass: string;
}

interface ModelUpdateCardProps {
	event: ModelEvent;
	eventTypeOptions: EventTypeOption[];
}

const EVENT_TYPE_PRIORITY: Record<EventType, number> = {
	Announced: 0,
	Released: 1,
	Deprecated: 2,
	Retired: 3,
};

export default function ModelUpdateCard({
	event,
	eventTypeOptions,
}: ModelUpdateCardProps) {
	const t = useTranslations("Catalogue.updates.models");
	const { model } = event;
	const modelHref = `/models/${model.model_id}`;
	const organisationId = model.organisation.organisation_id.toLowerCase();
	const latestEventType = event.types.reduce<EventType | null>((latest, type) => {
		if (!latest || EVENT_TYPE_PRIORITY[type] > EVENT_TYPE_PRIORITY[latest]) {
			return type;
		}
		return latest;
	}, null);
	const latestEventOption = eventTypeOptions.find(
		(option) => option.type === latestEventType
	);

	return (
		<Card size="sm" className="gap-0 rounded-md py-0 shadow-none">
			<CardContent className="flex h-full flex-col gap-3 p-3">
				{latestEventOption ? (
					<div>
						<span className={`${latestEventOption.badgeClass} w-fit rounded-md`}>
							{latestEventOption.icon}
							{latestEventOption.label}
						</span>
					</div>
				) : null}

				<div className="flex min-w-0 items-center gap-2.5">
					<Link
						href={`/organisations/${encodeURIComponent(organisationId)}`}
						className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<Logo
							id={organisationId}
							alt={model.organisation.name ?? organisationId}
							fill
							className="object-contain p-1"
						/>
					</Link>
					<div className="min-w-0">
						<Link href={modelHref} className="line-clamp-2 font-semibold leading-snug hover:underline">
							{model.name}
						</Link>
						<p className="truncate text-xs text-muted-foreground">
							{model.organisation.name}
						</p>
					</div>
				</div>

				<div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-200 pt-2 text-xs text-muted-foreground dark:border-zinc-800">
					<TimeDisplay
						dateIso={new Date(event.date).toISOString()}
						isModelRelease={event.types.includes("Released")}
					/>
					<Link href={modelHref} className="font-semibold text-foreground hover:underline">
						{t("viewModel")}
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
