"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type LinkRow = {
	id: string;
	platform: string;
	url: string;
};

const PLATFORM_OPTIONS = [
	{ value: "discord", label: "Discord" },
	{ value: "github", label: "GitHub" },
	{ value: "hugging_face", label: "Hugging Face" },
	{ value: "instagram", label: "Instagram" },
	{ value: "linkedin", label: "LinkedIn" },
	{ value: "reddit", label: "Reddit" },
	{ value: "threads", label: "Threads" },
	{ value: "tiktok", label: "TikTok" },
	{ value: "website", label: "Website" },
	{ value: "x", label: "X" },
	{ value: "youtube", label: "YouTube" },
] as const;

const PLATFORM_VALUE_SET: Set<string> = new Set(PLATFORM_OPTIONS.map((platform) => platform.value));
const PLATFORM_ALIASES: Record<string, string> = {
	dicsord: "discord",
	twitter: "x",
	web: "website",
	site: "website",
};

function normalizePlatform(rawPlatform: string) {
	const value = rawPlatform.trim().toLowerCase();
	const canonical = PLATFORM_ALIASES[value] ?? value;
	return PLATFORM_VALUE_SET.has(canonical) ? canonical : "";
}

function toRow(link: { platform: string; url: string }, idx: number): LinkRow {
	return {
		id: `existing-${idx}-${link.platform}`,
		platform: normalizePlatform(link.platform),
		url: link.url,
	};
}

export default function OrganisationLinksFieldset({
	initialLinks = [],
}: {
	initialLinks?: Array<{ platform: string; url: string }>;
}) {
	const [links, setLinks] = useState<LinkRow[]>(initialLinks.map(toRow).filter((link) => link.platform));
	const usedPlatforms = useMemo(() => new Set(links.map((link) => link.platform)), [links]);
	const canAddMore = usedPlatforms.size < PLATFORM_OPTIONS.length;

	const payload = useMemo(
		() =>
			JSON.stringify(
				Array.from(
					new Map(
						links
							.map((link) => ({
								platform: normalizePlatform(link.platform),
								url: link.url.trim(),
							}))
							.filter((link) => link.platform && link.url)
							.sort((a, b) => {
								const indexA = PLATFORM_OPTIONS.findIndex((option) => option.value === a.platform);
								const indexB = PLATFORM_OPTIONS.findIndex((option) => option.value === b.platform);
								if (indexA !== indexB) return indexA - indexB;
								return a.url.localeCompare(b.url);
							})
							.map((link) => [link.platform, link] as const)
					).values()
				)
			),
		[links]
	);

	return (
		<div className="space-y-3 rounded-lg border p-3">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium">Social links</h3>
					<p className="text-xs text-muted-foreground">Add organisation profiles and website links.</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						if (!canAddMore) return;
						const nextPlatform = PLATFORM_OPTIONS.find((option) => !usedPlatforms.has(option.value))?.value ?? "website";
						setLinks((prev) => [
							...prev,
							{ id: `new-${Date.now()}`, platform: nextPlatform, url: "" },
						]);
					}}
					disabled={!canAddMore}
				>
					<Plus className="mr-1 h-4 w-4" />
					Add link
				</Button>
			</div>

			<input type="hidden" name="social_links_payload" value={payload} />

			{links.length === 0 ? (
				<p className="text-xs text-muted-foreground">No social links yet.</p>
			) : (
				<div className="space-y-2">
					{links.map((link) => (
						<div key={link.id} className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr_auto]">
							<div>
								<Label className="mb-1 block text-xs text-muted-foreground">Platform</Label>
								<Select
									value={link.platform}
									onValueChange={(value) =>
										setLinks((prev) => {
											const normalized = normalizePlatform(value);
											if (!normalized) return prev;
											const duplicate = prev.some(
												(row) => row.id !== link.id && row.platform === normalized
											);
											if (duplicate) return prev;
											return prev.map((row) =>
												row.id === link.id ? { ...row, platform: normalized } : row
											);
										})
									}
								>
									<SelectTrigger className="w-full text-sm">
										<SelectValue placeholder="Select platform" />
									</SelectTrigger>
									<SelectContent>
										{PLATFORM_OPTIONS.map((option) => {
											const usedByOther = links.some(
												(row) => row.id !== link.id && row.platform === option.value
											);
											return (
											<SelectItem key={option.value} value={option.value} disabled={usedByOther}>
												{option.label}
											</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label className="mb-1 block text-xs text-muted-foreground">URL</Label>
								<Input
									type="url"
									value={link.url}
									onChange={(event) =>
										setLinks((prev) =>
											prev.map((row) =>
												row.id === link.id ? { ...row, url: event.target.value } : row
											)
										)
									}
									placeholder="https://..."
								/>
							</div>
							<div className="flex items-end">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => setLinks((prev) => prev.filter((row) => row.id !== link.id))}
									aria-label="Remove social link"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
