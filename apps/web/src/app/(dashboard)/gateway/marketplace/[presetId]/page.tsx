import React from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Copy, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/utils/supabase/server";
import CopyPresetButton from "@/components/(gateway)/marketplace/CopyPresetButton";

export const metadata = {
	title: "Preset Details - Gateway Marketplace",
};

export default async function PresetMarketplaceDetailPage({
	params,
}: {
	params: { presetId: string };
}) {
	const supabase = await createClient();
	const { presetId } = params;

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const { data: preset } = await supabase
		.from("presets")
		.select("id, name, description, config, visibility, created_at, source_preset_id")
		.eq("id", presetId)
		.maybeSingle();

	if (!preset || preset.visibility !== "public") {
		return (
			<div className="space-y-4">
				<Link
					href="/gateway/marketplace"
					className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to marketplace
				</Link>
				<Card>
					<CardHeader>
						<CardTitle>Preset not available</CardTitle>
						<CardDescription>
							This preset is private or no longer available.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const sourcePreset = preset.source_preset_id
		? await supabase
				.from("presets")
				.select("id, name")
				.eq("id", preset.source_preset_id)
				.maybeSingle()
		: null;

	return (
		<div className="space-y-6">
			<Link
				href="/gateway/marketplace"
				className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ArrowLeft className="mr-2 h-4 w-4" />
				Back to marketplace
			</Link>

			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-semibold">{preset.name}</h1>
						<Badge variant="outline">Public</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						{preset.description ?? "No description yet."}
					</p>
					{sourcePreset?.data && (
						<div className="text-xs text-muted-foreground">
							Forked from{" "}
							<Link
								href={`/gateway/marketplace/${sourcePreset.data.id}`}
								className="underline"
							>
								{sourcePreset.data.name}
							</Link>
						</div>
					)}
				</div>

				<div className="flex items-center gap-3">
					{user ? (
						<CopyPresetButton sourcePresetId={preset.id} />
					) : (
						<Button asChild variant="outline">
							<Link href="/sign-in">Sign in to copy</Link>
						</Button>
					)}
					<Button variant="ghost" className="gap-2" disabled>
						<Copy className="h-4 w-4" />
						Copy name
					</Button>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BadgeCheck className="h-4 w-4 text-muted-foreground" />
						Preset details
					</CardTitle>
					<CardDescription>
						View the preset configuration before you copy it.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 text-sm">
						<div>
							<div className="text-xs text-muted-foreground">Visibility</div>
							<div className="font-medium">Public</div>
						</div>
						<div>
							<div className="text-xs text-muted-foreground">Source</div>
							<div className="font-medium">
								{preset.source_preset_id ? "Fork" : "Original"}
							</div>
						</div>
					</div>

					<Separator />

					<div className="space-y-2">
						<div className="text-xs text-muted-foreground">Config snapshot</div>
						<pre className="rounded-lg border border-border bg-muted/50 p-4 text-xs overflow-auto">
							{JSON.stringify(preset.config ?? {}, null, 2)}
						</pre>
					</div>
				</CardContent>
			</Card>

			<Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-900/10">
				<CardHeader className="flex flex-row items-start gap-3">
					<Shield className="h-4 w-4 text-amber-700 dark:text-amber-300" />
					<div>
						<CardTitle className="text-sm">Fork attribution</CardTitle>
						<CardDescription>
							Copies are private by default and preserve the original source.
						</CardDescription>
					</div>
				</CardHeader>
			</Card>
		</div>
	);
}
