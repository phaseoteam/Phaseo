type EmptyChartPreviewProps = {
	title: string;
	description: string;
	heightClassName?: string;
};

const SAMPLE_BARS = [
	28, 86, 54, 112, 74, 132, 96, 154, 62, 116, 44, 142, 88, 164, 108, 136,
	72, 158, 94, 128, 56, 146, 82, 118, 68, 152, 104, 174, 76, 138, 58, 126,
	92, 156, 116, 84,
];

export function EmptyChartPreview({
	title,
	description,
	heightClassName = "h-[320px]",
}: EmptyChartPreviewProps) {
	return (
		<div
			className={`relative w-full overflow-hidden bg-background ${heightClassName}`}
			aria-label={title}
		>
			<div className="absolute left-0 top-4 flex items-center gap-2 opacity-80">
				<div className="h-5 w-5 rounded-full bg-muted/65" />
				<div className="h-5 w-36 rounded-md bg-muted/65" />
			</div>
			<div className="absolute right-0 top-4 h-9 w-44 rounded-lg bg-muted/55 opacity-80" />
			<div className="absolute left-0 top-16 h-4 w-80 max-w-[45%] rounded-md bg-muted/50" />
			<div className="absolute inset-x-0 top-24 space-y-12">
				<div className="h-px bg-muted/55" />
				<div className="h-px bg-muted/45" />
				<div className="h-px bg-muted/35" />
			</div>
			<div className="absolute inset-x-0 bottom-8 flex h-52 items-end gap-1.5 opacity-80 sm:gap-2">
				{SAMPLE_BARS.map((height, index) => (
					<div
						key={`${height}-${index}`}
						className="min-w-0 flex-1 rounded-t bg-muted/65"
						style={{ height }}
					/>
				))}
			</div>
			<div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/45 to-background/15" />
			<div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6 text-center">
				<div className="max-w-md">
					<div className="text-sm font-medium text-foreground/75">{title}</div>
					<p className="mt-1 text-sm leading-5 text-muted-foreground/85">
						{description}
					</p>
				</div>
			</div>
		</div>
	);
}
