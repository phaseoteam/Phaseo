import {
	ArrowUpRight,
	AudioLines,
	BadgeAlert,
	Binary,
	ImageIcon,
	Type,
	Video,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { APIProviderCard as APIProviderCardType } from "@/lib/fetchers/api-providers/providerDataTypes";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ProviderModalityBadge } from "./ProviderModalityBadge";
import { formatLocation } from "@/lib/locations";

type Props = {
	api_provider: APIProviderCardType;
};

function isExternalProvider(provider: APIProviderCardType): boolean {
	return String(provider.provider_status ?? "").trim().toLowerCase() === "external";
}

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
	{ key: "moderation", label: "Moderation", Icon: BadgeAlert },
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
	const location = formatLocation(api_provider.country_code, api_provider.subdivision_code);
	const isExternal = isExternalProvider(api_provider);
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
	const inputModalities = supportedModalities.filter(({ key }) => (modalitySupport[key]?.input ?? 0) > 0);
	const outputModalities = supportedModalities.filter(({ key }) => (modalitySupport[key]?.output ?? 0) > 0);
	const router = useRouter();
	const href = `/api-providers/${id}`;
	const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest("a,button,[role='button']")) return;
		router.push(href, { scroll: true });
	};
	const renderModalityRow = (label: string, items: typeof supportedModalities) => (
		<div className="flex min-w-0 items-center gap-2">
			<span className="w-11 shrink-0 text-[11px] text-muted-foreground">{label}</span>
			<div className="flex min-w-0 flex-wrap gap-1">
				{items.length ? items.map(({ key, label: modalityLabel, Icon }) => {
					const counts = modalitySupport[key];
					return <ProviderModalityBadge key={`${label}-${key}`} label={modalityLabel} modality={key} icon={Icon} inputCount={counts?.input ?? 0} outputCount={counts?.output ?? 0} />;
				}) : <span className="text-[11px] text-muted-foreground">—</span>}
			</div>
		</div>
	);

	return (
		<div
			className="group h-full w-full min-w-0 cursor-pointer bg-background py-4 transition-colors hover:bg-muted/20 md:py-5"
			style={rowStyle}
			onClick={handleCardClick}
		>
			<div className="flex h-full flex-col gap-4 px-4 md:px-3">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
					<div className="shrink-0">
						<Link
							href={href}
							prefetch={false}
							className="block"
						>
							<div className="relative ml-1 flex size-10 items-center justify-center rounded-lg border bg-background md:ml-0">
								<div className="relative h-6 w-6">
									<Logo
										id={id}
										alt={name}
										className="object-contain"
										fill
									/>
								</div>
							</div>
						</Link>
					</div>
					<div className="min-w-0 space-y-0.5 self-center">
						<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
							<Link href={href} prefetch={false} className="line-clamp-1 text-sm font-semibold leading-[1.1] text-foreground transition-colors hover:underline underline-offset-4">{name}</Link>
							{isExternal ? <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300"><ArrowUpRight className="size-3" />External</span> : null}
						</div>
						<div className="truncate font-mono text-xs leading-[1.15] text-muted-foreground">{id}</div>
						{location ? <div className="truncate text-xs leading-[1.15] text-muted-foreground">{location}</div> : null}
					</div>
					<Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0"><Link href={href} prefetch={false} aria-label={`Open ${name} provider page`} className="group/open"><ArrowUpRight className={cn("h-4 w-4 text-muted-foreground transition-colors", api_provider.colour ? "group-hover:text-[var(--provider-accent)]" : "group-hover:text-primary")} /></Link></Button>
				</div>

				<div className="flex flex-wrap items-center gap-1.5 text-[11px]">
					<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1"><span className="text-muted-foreground">Models</span><span className="font-medium tabular-nums text-foreground">{totalModels.toLocaleString()}</span></div>
					{freeModels > 0 ? <div className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2 py-1"><span className="text-muted-foreground">Free</span><span className="font-medium tabular-nums text-foreground">{freeModels.toLocaleString()}</span></div> : null}
				</div>

				<div className="space-y-1">{renderModalityRow("Input", inputModalities)}{renderModalityRow("Output", outputModalities)}</div>

				<div className="mt-auto grid grid-cols-2 gap-3 text-xs">
					<div><div className="text-[10px] tracking-wide text-muted-foreground/80">Daily Tokens</div><div className="text-sm font-medium tabular-nums text-foreground/80">{formatTokens(dailyTokens)}</div></div>
					<div><div className="text-[10px] tracking-wide text-muted-foreground/80">Monthly Tokens</div><div className="text-sm font-medium tabular-nums text-foreground/80">{formatTokens(monthlyTokens)}</div></div>
				</div>
			</div>
		</div>
	);
}
