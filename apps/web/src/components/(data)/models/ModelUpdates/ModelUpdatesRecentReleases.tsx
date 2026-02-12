import UpdateCard, { type UpdateBadge } from "@/components/updates/UpdateCard";
import type {
	EventType,
	ModelEvent,
} from "@/lib/fetchers/updates/getModelUpdates";
import type React from "react";

interface EventTypeOption {
	type: EventType;
	label: string;
	icon: React.ReactNode;
	badgeClass: string;
}

interface ModelUpdatesRecentReleasesProps {
	events: ModelEvent[];
	eventTypeOptions: EventTypeOption[];
	title: string;
	getRelativeLabel: (dateStr: string) => string | null;
	emptyMessage?: string;
}

export default function ModelUpdatesRecentReleases({
	events,
	eventTypeOptions,
	title,
	getRelativeLabel,
	emptyMessage,
}: ModelUpdatesRecentReleasesProps) {
	const isUtcToday = (iso: string) => {
		const now = new Date();
		const date = new Date(iso);
		return (
			now.getUTCFullYear() === date.getUTCFullYear() &&
			now.getUTCMonth() === date.getUTCMonth() &&
			now.getUTCDate() === date.getUTCDate()
		);
	};

	if (events.length === 0) {
		return (
			<div className="mb-6">
				<h1 className="mb-2 text-xl font-bold">{title}</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					{emptyMessage ?? "No updates available right now."}
				</p>
			</div>
		);
	}

	return (
		<div className="mb-6">
			<h1 className="mb-2 text-xl font-bold">{title}</h1>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{events.map((event) => {
					const { model } = event;

					// map event types to UpdateCard badges
					const badges: UpdateBadge[] = event.types
						.map((t) =>
							eventTypeOptions.find((option) => option.type === t)
						)
						.filter(
							(opt): opt is EventTypeOption =>
								opt !== undefined && opt !== null
						)
						.map((opt) => {
							// opt.icon may be a JSX element (e.g. <Rocket />) or a component.
							// UpdateCard expects a component type, so wrap JSX into a small component that accepts className.
							let IconComp: React.ComponentType<{
								className?: string;
							}> | null = null;
							if (opt.icon) {
								IconComp =
									typeof opt.icon === "function"
										? (opt.icon as React.ComponentType<{
												className?: string;
										  }>)
										: ({
												className,
										  }: {
												className?: string;
										  }) => (
												<span className={className}>
													{opt.icon}
												</span>
										  );
							}

							return {
								label: opt.label,
								icon: IconComp,
								className: opt.badgeClass,
							};
						});

					const accentMap: Record<string, string> = {
						Released: "bg-green-500",
						Announced: "bg-blue-500",
						Deprecated: "bg-red-500",
						Retired: "bg-zinc-500",
					};

					const primaryType = event.types[0];
					const accentClass = accentMap[primaryType] ?? null;
					const dateIso = new Date(event.date).toISOString();
					const hasReleaseType = event.types.includes("Released");

					return (
						<UpdateCard
							key={
								model.model_id +
								"-" +
								event.types.join("+") +
								"-" +
								event.date
							}
							id={`${model.model_id}-${event.date}`}
							badges={badges}
							avatar={{
								organisationId: (
									model.organisation.organisation_id || ""
								).toLowerCase(),
								name: model.organisation.name,
							}}
							title={model.name}
							subtitle={model.organisation.name}
							source={model.organisation.name}
							link={{
								href: `/models/${model.model_id}`,
								external: false,
								cta: "View",
							}}
							dateIso={dateIso}
							isReleaseToday={hasReleaseType && isUtcToday(dateIso)}
							// relative={getRelativeLabel(event.date)}
							accentClass={accentClass}
						/>
					);
				})}
			</div>
		</div>
	);
}
