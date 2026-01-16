import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { safeDecodeURIComponent } from "@/lib/utils/safe-decode";

interface UnavailableProps {
	modelId: string;
}

export default function Unavailable({ modelId }: UnavailableProps) {
	const friendlyModelId = safeDecodeURIComponent(modelId);

	return (
		<Card className="border-dashed border-primary/40">
			<CardHeader>
				<CardTitle>Gateway availability</CardTitle>
				<CardDescription>
					This model does not yet have an active provider in the
					gateway.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Alert>
					<AlertTriangle className="h-4 w-4" />
					<AlertTitle>Currently unavailable</AlertTitle>
					<AlertDescription>
						<p>
							We&apos;re working on onboarding providers for{" "}
							<code className="font-mono break-all">
								{friendlyModelId || modelId}
							</code>
							{"."} Check back soon or request access below.
						</p>
					</AlertDescription>
				</Alert>
				<Link
					href="https://github.com/AI-Stats/AI-Stats/issues/new/choose"
					className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
				>
					Request provider support on Github
					<ArrowRight className="h-4 w-4" />
				</Link>
			</CardContent>
		</Card>
	);
}
