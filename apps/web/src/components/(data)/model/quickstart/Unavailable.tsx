import { useTranslations } from "@/i18n/react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "@/components/link";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";

interface UnavailableProps {
	modelId: string;
}

export default function Unavailable({ modelId }: UnavailableProps) {
	const t = useTranslations("Catalogue.models.detail.quickstart");
	const friendlyModelId = safeDecodeURIComponent(modelId);

	return (
		<Card className="border-dashed border-primary/40">
			<CardHeader>
				<CardTitle>{t("gatewayAvailabilityTitle")}</CardTitle>
				<CardDescription>
					{t("gatewayUnavailableDescription")}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Alert>
					<AlertTriangle className="h-4 w-4" />
						<AlertTitle>{t("currentlyUnavailable")}</AlertTitle>
					<AlertDescription>
						<p>
							{t.rich("gatewayOnboardingDescription", {
								model: () => (
									<code className="font-mono break-all">
										{friendlyModelId || modelId}
									</code>
								),
							})}
						</p>
					</AlertDescription>
				</Alert>
				<Link
					href="https://github.com/phaseoteam/Phaseo/issues/new/choose"
					className="inline-flex items-center gap-2 text-sm font-medium text-primary underline decoration-transparent hover:decoration-current transition-colors duration-200"
				>
					{t("requestProviderSupport")}
					<ArrowRight className="h-4 w-4" />
				</Link>
			</CardContent>
		</Card>
	);
}
