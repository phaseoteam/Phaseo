import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTranslations } from "next-intl/server";

type PendingBannerSurface = "benchmarks" | "performance" | "providers" | "pricing";

export default async function ModelPendingApiReleaseBanner({
	modelName,
	surface,
}: {
	modelName: string;
	surface: PendingBannerSurface;
}) {
	const t = await getTranslations(
		"Catalogue.modelDetail.metadata.pendingApiRelease",
	);

	return (
		<Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50">
			<AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
			<AlertTitle>{t(`${surface}.title`)}</AlertTitle>
			<AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
				{t(`${surface}.description`, { model: modelName })}
			</AlertDescription>
		</Alert>
	);
}
