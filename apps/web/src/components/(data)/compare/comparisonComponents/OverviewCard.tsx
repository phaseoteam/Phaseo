import type { ExtendedModel } from "@/data/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProviderLogo } from "../ProviderLogo";

function formatMonthYear(value: string | null | undefined): string {
	if (!value) return "-";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "-";
	return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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

function formatLicenseLabel(value: string | null | undefined): string {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw) return "-";
	const lower = raw.toLowerCase();
	if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "tbd")
		return "Unknown";
	return raw;
}

export default function OverviewCard({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	if (!selectedModels || selectedModels.length === 0) return null;
	return (
		<section className="space-y-3">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold">Overview</h2>
				<p className="text-sm text-muted-foreground">
					Capabilities, modalities, and lifecycle fields pulled from the model
					database.
				</p>
			</header>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{selectedModels.map((m) => {
					const inputTypes = toTypeList(m.input_types).map(normalizeTypeLabel);
					const outputTypes = toTypeList(m.output_types).map(normalizeTypeLabel);
					const modalities = Array.from(new Set([...inputTypes, ...outputTypes])).slice(
						0,
						6
					);

					const capabilities: string[] = [];
					if (m.reasoning) capabilities.push("Reasoning");
					if (m.web_access) capabilities.push("Web access");

					return (
						<div
							key={m.id}
							className="rounded-xl border border-border/60 bg-background/60 p-4"
						>
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
									className="block truncate font-semibold hover:underline"
								>
									{m.name}
								</Link>
								<div className="text-xs text-muted-foreground truncate">
									{m.provider.name}
								</div>
							</div>
						</div>

						<div className="mt-4 space-y-3 text-sm">
							<div className="space-y-1">
								<div className="text-[11px] font-medium text-muted-foreground">
									Modalities
								</div>
								<div className="flex flex-wrap gap-1.5">
									{modalities.length ? (
										modalities.map((chip) => (
											<Badge
												key={`${m.id}-${chip}`}
												variant="outline"
												className="text-[10px]"
											>
												{chip}
											</Badge>
										))
									) : (
										<span className="text-xs text-muted-foreground">-</span>
									)}
								</div>
							</div>
							<div className="space-y-1">
								<div className="text-[11px] font-medium text-muted-foreground">
									Capabilities
								</div>
								<div className="flex flex-wrap gap-1.5">
									{capabilities.length ? (
										capabilities.map((chip) => (
											<Badge
												key={`${m.id}-${chip}`}
												variant="secondary"
												className="text-[10px] bg-background/60"
											>
												{chip}
											</Badge>
										))
									) : (
										<span className="text-xs text-muted-foreground">-</span>
									)}
								</div>
							</div>
						</div>

						<div className="mt-4 space-y-2 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">Release</span>
								<span className="font-mono text-xs text-foreground">
									{formatMonthYear(m.release_date)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">Cutoff</span>
								<span className="font-mono text-xs text-foreground">
									{formatMonthYear(m.knowledge_cutoff)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-xs text-muted-foreground">License</span>
								<span className="text-xs text-foreground">
									{formatLicenseLabel(m.license) !== "-" ? (
										<Badge variant="outline" className="text-[10px]">
											{formatLicenseLabel(m.license)}
										</Badge>
									) : (
										"-"
									)}
								</span>
							</div>
						</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
