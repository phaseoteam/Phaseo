import {
	ArrowUpRight,
	AudioLines,
	Binary,
	ImageIcon,
	Shield,
	Type,
	Video,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { APIProviderCard as APIProviderCardType } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
	api_provider: APIProviderCardType;
};

type ModalityMeta = {
	key: keyof APIProviderCardType["modality_support"];
	label: string;
	Icon: LucideIcon;
};

const MODALITIES: ModalityMeta[] = [
	{ key: "text", label: "Text", Icon: Type },
	{ key: "image", label: "Image", Icon: ImageIcon },
	{ key: "video", label: "Video", Icon: Video },
	{ key: "audio", label: "Audio", Icon: AudioLines },
	{ key: "moderation", label: "Moderation", Icon: Shield },
	{ key: "embedding", label: "Embedding", Icon: Binary },
];

function formatTokens(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0";

	const thresholds = [
		{ value: 1_000_000_000_000_000, suffix: "Q" }, // Quadrillion
		{ value: 1_000_000_000_000, suffix: "T" }, // Trillion
		{ value: 1_000_000_000, suffix: "B" }, // Billion
		{ value: 1_000_000, suffix: "M" }, // Million
		{ value: 1_000, suffix: "K" }, // Thousand
	] as const;

	for (const threshold of thresholds) {
		if (value >= threshold.value) {
			const scaled = value / threshold.value;
			const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
			const compact = scaled.toFixed(decimals).replace(/\.?0+$/, "");
			return `${compact}${threshold.suffix}`;
		}
	}

	return Math.round(value).toLocaleString("en-US");
}

export default function APIProviderCard({ api_provider }: Props) {
	const id = api_provider.api_provider_id;
	const name = api_provider.api_provider_name;
	const totalModels = Number(api_provider.total_models ?? 0);
	const freeModels = Number(api_provider.free_models ?? 0);
	const dailyTokens = Number(api_provider.total_daily_tokens ?? 0);
	const monthlyTokens = Number(api_provider.total_monthly_tokens ?? 0);
	const modalitySupport = api_provider.modality_support;
	const rowStyle: CSSProperties & Record<string, string | undefined> = {
		"--provider-accent": api_provider.colour ?? undefined,
	};
	const supportedModalities = MODALITIES.filter(({ key }) => {
		const counts = modalitySupport[key];
		return (counts?.input ?? 0) + (counts?.output ?? 0) > 0;
	});

	return (
		<div
			className="group px-3 py-3 transition-colors hover:bg-muted/20 md:px-4 md:py-4"
			style={rowStyle}
		>
			<div className="space-y-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<Link
							href={`/api-providers/${id}`}
							prefetch={false}
							className="flex items-center gap-3"
						>
							<div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
								<div className="relative h-6 w-6">
									<Logo
										id={id}
										alt={name}
										className="object-contain"
										fill
									/>
								</div>
							</div>
							<span className="line-clamp-1 text-sm font-semibold text-foreground transition-colors hover:underline underline-offset-4">
								{name}
							</span>
						</Link>
					</div>

					<div className="flex shrink-0 items-center gap-2 text-sm">
						<div className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1">
							<span className="text-xs text-muted-foreground">Models</span>
							<span className="font-semibold tabular-nums">{totalModels}</span>
						</div>
						{freeModels > 0 ? (
							<div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1">
								<span className="text-xs text-muted-foreground">Free</span>
								<span className="font-semibold tabular-nums">{freeModels}</span>
							</div>
						) : null}
					</div>
				</div>

				{supportedModalities.length > 0 ? (
					<div className="flex flex-wrap items-center gap-1.5">
						{supportedModalities.map(({ key, label, Icon }) => {
						const counts = modalitySupport[key];
						const total = (counts?.input ?? 0) + (counts?.output ?? 0);
						const hasSupport = total > 0;
						return (
							<Tooltip key={key}>
								<TooltipTrigger asChild>
									<span
										className={cn(
											"inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
											hasSupport
												? "border-border text-foreground"
												: "border-border/50 text-muted-foreground/50"
										)}
									>
										<Icon className="h-4 w-4" />
									</span>
								</TooltipTrigger>
								<TooltipContent side="top">
									<div className="text-xs">
										<div className="font-bold">{label}</div>
										<div>
											Input: {counts?.input ?? 0}
										</div>
										<div>
											Output: {counts?.output ?? 0}
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						);
					})}
					</div>
				) : null}

				<div className="flex items-center justify-between gap-3">
					<div className="grid flex-1 grid-cols-2 gap-3">
						<div className="space-y-0.5">
							<div className="text-[10px] tracking-wide text-muted-foreground/80">
								Daily Tokens
							</div>
							<div className="text-sm font-medium tabular-nums text-foreground/80">
								{formatTokens(dailyTokens)}
							</div>
						</div>
						<div className="space-y-0.5">
							<div className="text-[10px] tracking-wide text-muted-foreground/80">
								Monthly Tokens
							</div>
							<div className="text-sm font-medium tabular-nums text-foreground/80">
								{formatTokens(monthlyTokens)}
							</div>
						</div>
					</div>
					<Button
						asChild
						size="icon"
						variant="ghost"
						className="h-8 w-8 shrink-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
					>
						<Link
							href={`/api-providers/${id}`}
							prefetch={false}
							aria-label={`Open ${name} provider page`}
							className="group/open"
						>
							<ArrowUpRight
								className={cn(
									"h-4 w-4 text-muted-foreground transition-colors",
									api_provider.colour
										? "group-hover:text-[var(--provider-accent)]"
										: "group-hover:text-primary",
								)}
							/>
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

