import { AlertTriangle, Info, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ModelStatusBannerProps {
	status?: string | null;
	className?: string;
}

const RUMOURED_DISCORD_LINK = "https://discord.gg/aQyywCvgZ5";

export default function ModelStatusBanner({
	status,
	className,
}: ModelStatusBannerProps) {
	const t = useTranslations("Catalogue.models.detail.statusBanner");

	if (status === "Rumoured") {
		return (
			<Alert
				className={cn(
					"border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50",
					className,
				)}
			>
				<AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
				<AlertTitle>{t("rumouredTitle")}</AlertTitle>
				<AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
					{t.rich("rumouredDescription", {
						discord: (chunks) => (
							<a
								href={RUMOURED_DISCORD_LINK}
								target="_blank"
								rel="noreferrer"
								className="font-medium underline underline-offset-4"
							>
								{chunks}
							</a>
						),
					})}
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Announced") {
		return (
			<Alert
				className={cn(
					"border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-50",
					className,
				)}
			>
				<Info className="h-4 w-4 text-sky-700 dark:text-sky-300" />
				<AlertTitle>{t("announcedTitle")}</AlertTitle>
				<AlertDescription className="text-sky-900/90 dark:text-sky-100/90">
					{t("announcedDescription")}
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Withheld") {
		return (
			<Alert
				className={cn(
					"border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-50",
					className,
				)}
			>
				<Info className="h-4 w-4 text-violet-700 dark:text-violet-300" />
				<AlertTitle>{t("withheldTitle")}</AlertTitle>
				<AlertDescription className="text-violet-900/90 dark:text-violet-100/90">
					{t("withheldDescription")}
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Preview") {
		return (
			<Alert
				className={cn(
					"border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/20 dark:text-cyan-50",
					className,
				)}
			>
				<Info className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
				<AlertTitle>{t("previewTitle")}</AlertTitle>
				<AlertDescription className="text-cyan-900/90 dark:text-cyan-100/90">
					{t("previewDescription")}
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Limited Access") {
		return (
			<Alert
				className={cn(
					"border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/20 dark:text-fuchsia-50",
					className,
				)}
			>
				<Info className="h-4 w-4 text-fuchsia-700 dark:text-fuchsia-300" />
				<AlertTitle>{t("limitedAccessTitle")}</AlertTitle>
				<AlertDescription className="text-fuchsia-900/90 dark:text-fuchsia-100/90">
					{t("limitedAccessDescription")}
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Deprecated") {
		return (
			<Alert
				className={cn(
					"border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/20 dark:text-orange-50",
					className,
				)}
			>
				<AlertTriangle className="h-4 w-4 text-orange-700 dark:text-orange-300" />
				<AlertTitle>{t("deprecatedTitle")}</AlertTitle>
				<AlertDescription className="text-orange-900/90 dark:text-orange-100/90">
					{t("deprecatedDescription")}
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Retired") {
		return (
			<Alert
				className={cn(
					"border-red-500/30 bg-muted/40 text-foreground dark:border-red-500/35 dark:bg-muted/25",
					className,
				)}
			>
				<XCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
				<AlertTitle>{t("retiredTitle")}</AlertTitle>
				<AlertDescription className="text-muted-foreground">
					{t("retiredDescription")}
				</AlertDescription>
			</Alert>
		);
	}

	return null;
}
