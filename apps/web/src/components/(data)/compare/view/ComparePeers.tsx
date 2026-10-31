import { Fragment } from "react";
import Link from "@/components/link";
import { useTranslations } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { MODEL_COLOURS } from "./CompareGrid";
import type { ComparePeerBoard, CompareViewModel } from "./types";

function PeerBoard({ board, models }: { board: ComparePeerBoard; models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const colourOf = new Map(models.map((model, index) => [model.id, MODEL_COLOURS[index]]));
	const scores = board.entries.map((entry) => entry.score);
	const best = board.lowerIsBetter ? Math.min(...scores) : Math.max(...scores);
	const width = (score: number) => `${Math.max(4, (board.lowerIsBetter ? best / score : score / best) * 100)}%`;
	return (
		<div className="min-w-0 space-y-2">
			<h4 className="flex items-baseline justify-between gap-2 text-sm font-medium">
				<span className="truncate">{board.name}</span>
				<span className="shrink-0 text-xs font-normal text-muted-foreground">{t("peerModels", { count: board.total })}</span>
			</h4>
			<ol className="space-y-1">
				{board.entries.map((entry, index) => {
					const colour = colourOf.get(entry.modelId);
					const gap = index > 0 && entry.rank > board.entries[index - 1]!.rank + 1;
					return (
						<Fragment key={entry.modelId}>
							{gap ? <li aria-hidden className="pl-8 text-xs leading-none text-muted-foreground">⋯</li> : null}
							<li className="grid grid-cols-[1.75rem_minmax(0,9rem)_minmax(0,1fr)_2.75rem] items-center gap-2 text-xs">
								<span className="text-right tabular-nums text-muted-foreground">#{entry.rank}</span>
								<Link href={`/models/${entry.modelId}`} className={cn("truncate hover:underline", colour ? "font-semibold" : "text-muted-foreground")}>
									{entry.name}
								</Link>
								<span className="h-2 overflow-hidden rounded-sm bg-muted" aria-hidden>
									<span className={cn("block h-full rounded-sm", !colour && "bg-muted-foreground/30")} style={{ width: width(entry.score), background: colour }} />
								</span>
								<span className={cn("text-right tabular-nums", colour ? "font-semibold" : "text-muted-foreground")}>{entry.score.toFixed(1)}</span>
							</li>
						</Fragment>
					);
				})}
			</ol>
		</div>
	);
}

/** Where the compared models sit on the main capability leaderboards: the leaders, then each compared model. */
export function ComparePeers({ boards, models }: { boards: ComparePeerBoard[]; models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	if (!boards.length) return null;
	return (
		<div className="space-y-3 rounded-md border border-border p-4">
			<div>
				<h3 className="text-sm font-semibold">{t("peersTitle")}</h3>
				<p className="text-xs text-muted-foreground">{t("peersSub")}</p>
			</div>
			<div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
				{boards.map((board) => <PeerBoard key={board.id} board={board} models={models} />)}
			</div>
		</div>
	);
}
