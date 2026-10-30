import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { ModalityLeaderboardEntry } from "@/components/(rankings)/ModalityLeaderboards";
import { HorizontalRankingChart } from "@/components/(rankings)/HorizontalRankingChart";
import { getModelDetailsHref } from "@/lib/models/modelHref";

type RankingBarTableProps = {
	title: string;
	description: string;
	entries: ModalityLeaderboardEntry[];
	lowerIsBetter?: boolean;
};

export function RankingBarTable({
	title,
	description,
	entries,
	lowerIsBetter = false,
}: RankingBarTableProps) {
	const visibleEntries = entries.slice(0, 20);
	if (!visibleEntries.length) return null;

	return (
		<div className="min-w-0 space-y-5">
			<div className="space-y-0.5">
				<h3 className="text-lg font-semibold">{title}</h3>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>

			<HorizontalRankingChart
				lowerIsBetter={lowerIsBetter}
				entries={visibleEntries.map((entry) => ({
					key: `bar:${entry.key}`,
					label: entry.model_name,
					value: entry.value,
					valueLabel: entry.value_label,
					logoId: entry.organisation_id ?? entry.model_id,
				}))}
			/>

			<div className="border-t border-border/70">
				{visibleEntries.map((entry, index) => {
					const organisationId = entry.organisation_id ?? null;
					const providerId = entry.provider_id ?? null;
					const modelHref = getModelDetailsHref(organisationId, entry.model_id);
					return (
						<div
							key={`row:${entry.key}`}
							className="grid min-h-12 grid-cols-[1.5rem_1.75rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 py-2"
						>
							<span className="text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
							<span className="relative size-6">
								<Logo id={organisationId ?? entry.model_id} alt="" fill className="object-contain" />
							</span>
							<div className="min-w-0">
								{modelHref ? (
									<Link
										href={modelHref}
										className="block truncate text-sm font-medium underline decoration-transparent underline-offset-2 hover:decoration-current"
									>
										{entry.model_name}
									</Link>
								) : (
									<span className="block truncate text-sm font-medium">{entry.model_name}</span>
								)}
								{providerId ? (
									<Link
										href={`/api-providers/${encodeURIComponent(providerId)}`}
										className="block truncate text-xs text-muted-foreground underline decoration-transparent underline-offset-2 hover:decoration-current"
									>
										{entry.provider_name ?? providerId}
									</Link>
								) : entry.organisation_name ? (
									<span className="block truncate text-xs text-muted-foreground">{entry.organisation_name}</span>
								) : null}
							</div>
							<div className="pl-3 text-right">
								<div className="whitespace-nowrap text-sm font-medium tabular-nums">{entry.value_label}</div>
								{entry.tertiary ? <div className="text-xs text-muted-foreground">{entry.tertiary}</div> : null}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
