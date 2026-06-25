import { AlertCircle, AlertTriangle, Info, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ModelStatusBannerProps {
	status?: string | null;
	className?: string;
}

type StatusBannerContent = {
	title: string;
	description: string;
	icon: typeof Info;
	className: string;
	descriptionClassName: string;
	iconClassName?: string;
};

const STATUS_BANNERS: Record<string, StatusBannerContent> = {
	Rumoured: {
		title: "Rumoured model",
		description:
			"This model is rumoured and has not been confirmed by the model creator. Pricing, availability, provider support, technical limits, and benchmark data may be incomplete or change without notice.",
		icon: AlertTriangle,
		className:
			"border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50",
		descriptionClassName: "text-amber-900/90 dark:text-amber-100/90",
		iconClassName: "text-amber-700 dark:text-amber-300",
	},
	Announced: {
		title: "Announced model",
		description:
			"This model has been announced but is not generally available yet. Pricing, routing availability, technical details, and benchmark data may change as release plans are finalized.",
		icon: Info,
		className:
			"border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-50",
		descriptionClassName: "text-sky-900/90 dark:text-sky-100/90",
		iconClassName: "text-sky-700 dark:text-sky-300",
	},
	Withheld: {
		title: "Withheld model",
		description:
			"This model was announced with preliminary details but is currently withheld and may never become publicly accessible. Information on this page is provisional and can change at any time.",
		icon: AlertCircle,
		className:
			"border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-50",
		descriptionClassName: "text-violet-900/90 dark:text-violet-100/90",
		iconClassName: "text-violet-700 dark:text-violet-300",
	},
	Deprecated: {
		title: "Deprecated model",
		description:
			"This model has been marked deprecated and may be retired soon. If you use it in production, plan a migration to a newer supported model.",
		icon: AlertTriangle,
		className:
			"border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/20 dark:text-orange-50",
		descriptionClassName: "text-orange-900/90 dark:text-orange-100/90",
		iconClassName: "text-orange-700 dark:text-orange-300",
	},
	Retired: {
		title: "Retired model",
		description:
			"This model has reached end of life and is no longer available for new usage. This page is kept for historical reference.",
		icon: XCircle,
		className:
			"border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-50",
		descriptionClassName: "text-red-900/90 dark:text-red-100/90",
		iconClassName: "text-red-700 dark:text-red-300",
	},
};

export default function ModelStatusBanner({
	status,
	className,
}: ModelStatusBannerProps) {
	if (!status) return null;

	const content = STATUS_BANNERS[status];
	if (!content) return null;

	const Icon = content.icon;

	return (
		<Alert className={cn(content.className, className)}>
			<Icon className={cn("h-4 w-4", content.iconClassName)} />
			<AlertTitle>{content.title}</AlertTitle>
			<AlertDescription className={content.descriptionClassName}>
				{content.description}
			</AlertDescription>
		</Alert>
	);
}
