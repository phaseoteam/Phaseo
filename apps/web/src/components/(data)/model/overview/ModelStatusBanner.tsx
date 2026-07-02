import { AlertTriangle, Info, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ModelStatusBannerProps {
	status?: string | null;
	className?: string;
}

const RUMOURED_DISCORD_LINK = "https://discord.gg/zDw73wamdX";

export default function ModelStatusBanner({
	status,
	className,
}: ModelStatusBannerProps) {
	if (status === "Rumoured") {
		return (
			<Alert
				className={cn(
					"border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-50",
					className,
				)}
			>
				<AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
				<AlertTitle>Rumoured Model</AlertTitle>
				<AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
					This model is rumoured to be coming soon. Any data here is subject
					to change until the release is confirmed. Join our{" "}
					<a
						href={RUMOURED_DISCORD_LINK}
						target="_blank"
						rel="noreferrer"
						className="font-medium underline underline-offset-4"
					>
						Discord
					</a>{" "}
					to be notified of new models and updates.
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
				<AlertTitle>Announced Model</AlertTitle>
				<AlertDescription className="text-sky-900/90 dark:text-sky-100/90">
					This model has been announced, but not released. We await the full
					release to make more information available.
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
				<AlertTitle>Withheld Model</AlertTitle>
				<AlertDescription className="text-violet-900/90 dark:text-violet-100/90">
					This model was announced with preliminary details but is currently
					withheld and may never be released publicly. Information may change
					at any time.
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
				<AlertTitle>Limited Access Model</AlertTitle>
				<AlertDescription className="text-fuchsia-900/90 dark:text-fuchsia-100/90">
					This model is known to exist, but access is limited to selected
					customers, trusted partners, or private preview programs. It is not
					generally available through public routes.
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
				<AlertTitle>Deprecated Model</AlertTitle>
				<AlertDescription className="text-orange-900/90 dark:text-orange-100/90">
					This model has been marked deprecated. It is likely to be retired
					soon. You should look to move off this model and onto a newer model
					if you are using it.
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "Retired") {
		return (
			<Alert
				className={cn(
					"border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-50",
					className,
				)}
			>
				<XCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
				<AlertTitle>Retired Model</AlertTitle>
				<AlertDescription className="text-red-900/90 dark:text-red-100/90">
					This model has reached end of life, and can no longer be used. This
					page will likely receive no updates from now on.
				</AlertDescription>
			</Alert>
		);
	}

	return null;
}
