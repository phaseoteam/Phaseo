type EmptyLeaderboardPreviewProps = {
	title: string;
	description: string;
};

const PLACEHOLDER_ROWS = Array.from({ length: 10 }, (_, index) => index + 1);
const ROW_SHAPES = [
	{ name: "w-44", org: "w-24", value: "w-20", change: "w-10" },
	{ name: "w-36", org: "w-20", value: "w-16", change: "w-12" },
	{ name: "w-40", org: "w-28", value: "w-[4.5rem]", change: "w-9" },
	{ name: "w-32", org: "w-16", value: "w-14", change: "w-11" },
	{ name: "w-48", org: "w-24", value: "w-20", change: "w-8" },
];

export function EmptyLeaderboardPreview({
	title,
	description,
}: EmptyLeaderboardPreviewProps) {
	const midpoint = Math.ceil(PLACEHOLDER_ROWS.length / 2);
	const columns = [
		PLACEHOLDER_ROWS.slice(0, midpoint),
		PLACEHOLDER_ROWS.slice(midpoint),
	];

	return (
		<div
			className="relative min-h-[360px] overflow-hidden py-3"
			aria-label={title}
		>
			<div className="grid gap-x-16 gap-y-1 opacity-75 md:grid-cols-2">
				{columns.map((column, columnIndex) => (
					<div key={`empty-column-${columnIndex}`} className="space-y-1">
						{column.map((rank) => {
							const shape = ROW_SHAPES[(rank - 1) % ROW_SHAPES.length];
							return (
								<div
									key={rank}
									className="grid min-h-16 grid-cols-[2.25rem_2rem_minmax(0,1fr)_auto] items-center gap-3 py-2"
								>
									<div className="text-base tabular-nums text-muted-foreground/70">
										{rank}.
									</div>
									<div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/80 bg-transparent dark:border-zinc-800">
										<div className="h-4 w-4 rounded bg-muted/60" />
									</div>
									<div className="min-w-0 space-y-2">
										<div
											className={`h-4 max-w-full rounded bg-muted/70 ${shape.name}`}
										/>
										<div className="flex items-center gap-1.5">
											<div className="h-2.5 w-3 rounded bg-muted/45" />
											<div
												className={`h-2.5 rounded bg-muted/45 ${shape.org}`}
											/>
										</div>
									</div>
									<div className="flex min-w-[5.5rem] flex-col items-end gap-2 text-right">
										<div
											className={`h-3.5 rounded bg-muted/70 ${shape.value}`}
										/>
										<div
											className={`h-2.5 rounded bg-muted/45 ${shape.change}`}
										/>
									</div>
								</div>
							);
						})}
					</div>
				))}
			</div>
			<div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/70 to-background/15" />
			<div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6 text-center">
				<div className="max-w-md">
					<div className="text-sm font-medium text-foreground/75">{title}</div>
					<p className="mt-1 text-sm leading-5 text-muted-foreground/85">
						{description}
					</p>
				</div>
			</div>
			<div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
				<div className="h-4 w-24 rounded bg-muted/45" />
			</div>
		</div>
	);
}
