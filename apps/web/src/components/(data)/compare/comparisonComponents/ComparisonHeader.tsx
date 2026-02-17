import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderLogo } from "../ProviderLogo";

function formatTokens(val: number | null | undefined): string {
	if (val == null) return "-";
	if (val >= 1_000_000_000)
		return (val / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
	if (val >= 1_000_000)
		return (val / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
	if (val >= 1_000)
		return (val / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
	return val.toLocaleString();
}

function toTypeList(value: ExtendedModel["input_types"]): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return String(value)
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
}

function normalizeTypeLabel(value: string): string {
	const v = value.trim().toLowerCase();
	if (v === "text") return "Text";
	if (v === "image") return "Vision";
	if (v === "audio") return "Audio";
	if (v === "video") return "Video";
	if (v === "embedding" || v === "embeddings") return "Embeddings";
	return value;
}

function formatUsdPerM(pricePerToken: number | null | undefined): string {
	if (pricePerToken == null || !Number.isFinite(pricePerToken)) return "-";
	return `$${(pricePerToken * 1_000_000).toFixed(2)}`;
}

export default function ComparisonHeader({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const count = selectedModels.length;
	return (
		<Card className="border-border/60 bg-card shadow-sm">
			<CardHeader className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary" className="text-[11px]">
						Comparison
					</Badge>
					<Badge variant="outline" className="text-[11px]">
						{count} model{count === 1 ? "" : "s"}
					</Badge>
				</div>
				<CardTitle className="text-2xl font-semibold tracking-tight">
					Model comparison
				</CardTitle>
				<CardDescription className="text-sm">
					Key facts and links for the selected models.
				</CardDescription>
			</CardHeader>

			<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{selectedModels.map((m) => {
					const pricing = m.prices?.[0] ?? null;
					const inputTypes = toTypeList(m.input_types).map(normalizeTypeLabel);
					const outputTypes = toTypeList(m.output_types).map(normalizeTypeLabel);
					const modalityChips = Array.from(new Set([...inputTypes, ...outputTypes])).slice(
						0,
						4
					);

					return (
						<div
							key={m.id}
							className="rounded-xl border border-border/60 bg-background/60 p-4"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<Link
											href={`/organisations/${m.provider.provider_id}`}
											aria-label={`View ${m.provider.name}`}
											className="shrink-0"
										>
											<ProviderLogo
												id={m.provider.provider_id}
												alt={m.provider.name}
												size="xs"
											/>
										</Link>
										<div className="min-w-0">
											<Link
												href={`/models/${encodeURIComponent(m.id)}`}
												className="block truncate font-semibold text-foreground hover:underline"
											>
												{m.name}
											</Link>
											<Link
												href={`/organisations/${m.provider.provider_id}`}
												className="block truncate text-xs text-muted-foreground hover:underline"
											>
												{m.provider.name}
											</Link>
										</div>
									</div>

									<div className="mt-2 font-mono text-[11px] text-muted-foreground break-all">
										{m.id}
									</div>
								</div>
							</div>

							<div className="mt-4 grid grid-cols-2 gap-3 text-sm">
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Input $/M
									</div>
									<div className="font-mono font-semibold text-foreground">
										{formatUsdPerM(pricing?.input_token_price)}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Output $/M
									</div>
									<div className="font-mono font-semibold text-foreground">
										{formatUsdPerM(pricing?.output_token_price)}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Context
									</div>
									<div className="font-mono text-xs text-foreground">
										{formatTokens(m.input_context_length)} / {formatTokens(m.output_context_length)}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Modalities
									</div>
									<div className="flex flex-wrap gap-1.5">
										{modalityChips.length ? (
											modalityChips.map((chip) => (
												<Badge key={`${m.id}-${chip}`} variant="outline" className="text-[10px]">
													{chip}
												</Badge>
											))
										) : (
											<span className="text-xs text-muted-foreground">-</span>
										)}
									</div>
								</div>
							</div>

							<div className="mt-4 flex flex-wrap gap-2">
								{m.api_reference_link ? (
									<Link
										href={m.api_reference_link}
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
									>
										Docs
									</Link>
								) : null}
								{m.repository_link ? (
									<Link
										href={m.repository_link}
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
									>
										Repo
									</Link>
								) : null}
								{m.paper_link ? (
									<Link
										href={m.paper_link}
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
									>
										Paper
									</Link>
								) : null}
								{m.announcement_link ? (
									<Link
										href={m.announcement_link}
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
									>
										Announcement
									</Link>
								) : null}
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
