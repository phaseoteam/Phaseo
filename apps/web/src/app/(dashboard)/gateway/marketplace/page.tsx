import React from "react";
import Link from "next/link";
import {
	ArrowLeft,
	BadgeCheck,
	Compass,
	Flame,
	Search,
	Sparkles,
	Store,
	TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
	title: "Gateway Marketplace - AI Stats",
};

type MarketplacePreset = {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	source_preset_id: string | null;
};

export default async function GatewayMarketplacePage() {
	const supabase = await createClient();

	const { data } = await supabase
		.from("presets")
		.select("id, name, description, created_at, source_preset_id")
		.eq("visibility", "public")
		.order("created_at", { ascending: false });

	const presets = data ?? [];
	const featured = presets.slice(0, 6);
	const community = presets.slice(6, 14);
	const trending = presets.slice(0, 3);

	return (
		<div className="min-h-screen bg-white dark:bg-zinc-950">
			<div className="container mx-auto space-y-8 px-4 py-8">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Compass className="h-4 w-4" />
					<span>Gateway Marketplace</span>
				</div>

				<div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<h1 className="text-3xl font-semibold tracking-tight">
								AI Stats Gateway Marketplace
							</h1>
							<Badge variant="outline">Beta</Badge>
						</div>
						<p className="text-sm text-muted-foreground max-w-2xl">
							Browse community and team presets built for the AI Stats Gateway.
							Copy a preset to your account and customize it from there.
						</p>
						<div className="flex flex-wrap items-center gap-3">
							<Button variant="default" className="gap-2" disabled>
								<Store className="h-4 w-4" />
								Publish preset
							</Button>
							<Button variant="outline" className="gap-2" asChild>
								<Link href="/settings/presets" target="_blank" rel="noreferrer">
									Manage my presets
								</Link>
							</Button>
						</div>
					</div>

					<div className="relative w-full md:w-72">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input placeholder="Search presets" className="pl-9" disabled />
					</div>
				</div>

				<Card className="border-dashed">
					<CardHeader className="space-y-2">
						<CardTitle className="flex items-center gap-2">
							<Sparkles className="h-4 w-4 text-muted-foreground" />
							Featured presets
						</CardTitle>
						<CardDescription>
							Curated presets from the AI Stats team for high impact workflows.
						</CardDescription>
					</CardHeader>
					<CardContent className="relative">
						{featured.length === 0 ? (
							<EmptyState />
						) : (
							<Carousel opts={{ align: "start" }}>
								<CarouselContent>
									{featured.map((preset) => (
										<CarouselItem
											key={preset.id}
											className="md:basis-1/2 lg:basis-1/3"
										>
											<MarketplaceCard preset={preset} tag="Featured" />
										</CarouselItem>
									))}
								</CarouselContent>
								<CarouselPrevious />
								<CarouselNext />
							</Carousel>
						)}
					</CardContent>
				</Card>

				<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
					<Card>
						<CardHeader className="space-y-2">
							<CardTitle className="flex items-center gap-2">
								<BadgeCheck className="h-4 w-4 text-muted-foreground" />
								Community picks
							</CardTitle>
							<CardDescription>
								Popular public presets with consistent results.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-3">
							{community.length === 0 ? (
								<EmptyState />
							) : (
								community.map((preset) => (
									<CompactPresetRow key={preset.id} preset={preset} />
								))
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="space-y-2">
							<CardTitle className="flex items-center gap-2">
								<Flame className="h-4 w-4 text-muted-foreground" />
								Trending now
							</CardTitle>
							<CardDescription>
								Fast growing presets across the Gateway community.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{trending.length === 0 ? (
								<EmptyState />
							) : (
								trending.map((preset) => (
									<Card
										key={preset.id}
										className="border-slate-200/60 dark:border-zinc-800/60"
									>
										<CardHeader className="space-y-1">
											<CardTitle className="text-base">
												{preset.name}
											</CardTitle>
											<CardDescription>
												{preset.description ?? "No description yet."}
											</CardDescription>
										</CardHeader>
										<CardContent className="flex items-center justify-between text-xs text-muted-foreground">
											<span>Community</span>
											<span className="flex items-center gap-1">
												<TrendingUp className="h-3.5 w-3.5" />
												New
											</span>
										</CardContent>
									</Card>
								))
							)}
						</CardContent>
					</Card>
				</div>

				<Separator />

				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<div className="flex items-center gap-2">
						<ArrowLeft className="h-4 w-4" />
						<Link href="/" className="hover:text-foreground transition-colors">
							Back to home
						</Link>
					</div>
					<span>Public presets shown. Sign in to copy and customize.</span>
				</div>
			</div>
		</div>
	);
}

function MarketplaceCard({
	preset,
	tag,
}: {
	preset: MarketplacePreset;
	tag: string;
}) {
	return (
		<Card className="h-full">
			<CardHeader className="space-y-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-base">
						<Link
							href={`/gateway/marketplace/${preset.id}`}
							className="hover:underline"
						>
							{preset.name}
						</Link>
					</CardTitle>
					<Badge variant="secondary">{tag}</Badge>
				</div>
				<CardDescription>{preset.description ?? "No description yet."}</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center justify-between text-xs text-muted-foreground">
				<span className="flex items-center gap-1">
					<BadgeCheck className="h-3.5 w-3.5" />
					Community
				</span>
				<span>Public preset</span>
			</CardContent>
		</Card>
	);
}

function CompactPresetRow({
	preset,
}: {
	preset: MarketplacePreset;
}) {
	return (
		<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
			<div>
				<div className="font-medium text-sm">
					<Link
						href={`/gateway/marketplace/${preset.id}`}
						className="hover:underline"
					>
						{preset.name}
					</Link>
				</div>
				<div className="text-xs text-muted-foreground">
					{preset.description ?? "No description yet."}
				</div>
			</div>
			<div className="text-right text-xs text-muted-foreground">
				<div>Community</div>
				<div>Public preset</div>
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
			No public presets yet. Check back soon.
		</div>
	);
}
