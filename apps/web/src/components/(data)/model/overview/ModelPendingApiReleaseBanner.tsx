import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type PendingBannerSurface = "benchmarks" | "performance" | "providers" | "pricing";

const PENDING_COPY: Record<
	PendingBannerSurface,
	{ title: string; description: (modelName: string) => string }
> = {
	benchmarks: {
		title: "Benchmark updates coming soon",
		description: (modelName) =>
			`${modelName} is not fully available on the API yet. Benchmark results will be published here as soon as rollout is complete. Please check back soon.`,
	},
	performance: {
		title: "Performance data coming soon",
		description: (modelName) =>
			`${modelName} is not fully available on the API yet. Latency and throughput telemetry will appear here once live API traffic starts.`,
	},
	providers: {
		title: "Provider rollout in progress",
		description: (modelName) =>
			`${modelName} is not fully available on the API yet. Provider availability and pricing will appear here as soon as rollout is complete.`,
	},
	pricing: {
		title: "Pricing insights coming soon",
		description: (modelName) =>
			`${modelName} is not fully available on the API yet. Pricing insights and history will appear here once provider pricing is live.`,
	},
};

export default function ModelPendingApiReleaseBanner({
	modelName,
	surface,
}: {
	modelName: string;
	surface: PendingBannerSurface;
}) {
	const content = PENDING_COPY[surface];

	return (
		<Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50">
			<AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
			<AlertTitle>{content.title}</AlertTitle>
			<AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
				{content.description(modelName)}
			</AlertDescription>
		</Alert>
	);
}
