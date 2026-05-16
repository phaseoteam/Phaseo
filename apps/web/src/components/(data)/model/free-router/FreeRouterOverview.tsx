import Link from "next/link";
import { getFreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";
import { FREE_ROUTER_MODEL_ID } from "@/lib/models/freeRouter";
import { Badge } from "@/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function formatCostNanos(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "$0.00";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: value / 1e9 >= 1 ? 2 : 5,
	}).format(value / 1e9);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatDate(value: string | null): string {
	if (!value) return "Never";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "Never";
	return parsed.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatModality(value: string): string {
	return value
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function ModelModalityBadges({ values }: { values: string[] }) {
	if (!values.length) return <span className="text-xs text-muted-foreground">Unknown</span>;
	return (
		<div className="flex flex-wrap gap-1">
			{values.map((value) => (
				<Badge key={value} variant="outline" className="text-[11px] font-normal">
					{formatModality(value)}
				</Badge>
			))}
		</div>
	);
}

function SummaryMetric({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description: string;
}) {
	return (
		<div className="space-y-1 rounded-xl border border-border/70 px-4 py-3">
			<p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</p>
			<p className="text-2xl font-semibold tracking-tight">{value}</p>
			<p className="text-xs text-muted-foreground">{description}</p>
		</div>
	);
}

export default async function FreeRouterOverview() {
	const overview = await getFreeRouterOverview();

	return (
		<div className="space-y-8">
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">Free model pool</h2>
					<p className="text-sm text-muted-foreground">
						These are the currently eligible models behind{" "}
						<span className="font-mono text-foreground">{FREE_ROUTER_MODEL_ID}</span>.
						Usage below is counted only when requests were made through the router itself.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<SummaryMetric
						label="Eligible models"
						value={formatNumber(overview.summary.eligibleModels)}
						description="Canonical models currently reachable via the free router."
					/>
					<SummaryMetric
						label="Eligible providers"
						value={formatNumber(overview.summary.eligibleProviders)}
						description="Active provider/model routes contributing to the free pool."
					/>
					<SummaryMetric
						label="Requests (30d)"
						value={formatNumber(overview.summary.routedRequests30d)}
						description="Requests that entered through the router in the last 30 days."
					/>
					<SummaryMetric
						label="Spend (30d)"
						value={formatCostNanos(overview.summary.totalCostNanos30d)}
						description="Billed spend on router traffic over the last 30 days."
					/>
				</div>
			</section>

			<section className="space-y-3 border-t border-border/60 pt-6">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">Eligible models</h2>
					<p className="text-sm text-muted-foreground">
						Usage is grouped by canonical model and shows the active free API model ID when it is unambiguous.
					</p>
				</div>
				{overview.models.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Model</TableHead>
								<TableHead>Providers</TableHead>
								<TableHead>Input</TableHead>
								<TableHead>Output</TableHead>
								<TableHead className="text-right">Requests (30d)</TableHead>
								<TableHead className="text-right">Spend (30d)</TableHead>
								<TableHead className="text-right">Last routed</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{overview.models.map((model) => (
								<TableRow key={model.modelId}>
									<TableCell className="min-w-[220px]">
										<div className="space-y-1">
											<Link
												href={`/models/${model.modelId}`}
												className="font-medium underline-offset-4 hover:underline"
											>
												{model.organisationName}: {model.name}
											</Link>
											<p className="text-xs text-muted-foreground">{model.displayApiModelId}</p>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{model.providerCount}</Badge>
									</TableCell>
									<TableCell>
										<ModelModalityBadges values={model.inputModalities} />
									</TableCell>
									<TableCell>
										<ModelModalityBadges values={model.outputModalities} />
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatNumber(model.usage.requests30d)}
									</TableCell>
									<TableCell className="text-right font-mono">
										{formatCostNanos(model.usage.totalCostNanos30d)}
									</TableCell>
									<TableCell className="text-right text-sm text-muted-foreground">
										{formatDate(model.usage.lastRoutedAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<Empty className="rounded-lg border p-8">
						<EmptyHeader>
							<EmptyTitle>No eligible free models right now</EmptyTitle>
							<EmptyDescription>
								The free router currently has no active eligible models for normal text routing.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</section>
		</div>
	);
}
