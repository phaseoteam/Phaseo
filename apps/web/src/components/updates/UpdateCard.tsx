import Link from "next/link";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type React from "react";
import { Logo } from "@/components/Logo";
import TimeDisplay from "./TimeDisplay";
import { Archive, Ban, Globe, Megaphone, MonitorPlay, Rocket } from "lucide-react";

export type UpdateBadgeIconName =
	| "archive"
	| "ban"
	| "globe"
	| "megaphone"
	| "monitor-play"
	| "rocket";

const BADGE_ICONS: Record<
	UpdateBadgeIconName,
	React.ComponentType<{ className?: string }>
> = {
	archive: Archive,
	ban: Ban,
	globe: Globe,
	megaphone: Megaphone,
	"monitor-play": MonitorPlay,
	rocket: Rocket,
};

export type UpdateBadge = {
	label: string;
	// many callers use React.ComponentType<{ className?: string }>
	icon?: React.ComponentType<{ className?: string }> | null;
	iconName?: UpdateBadgeIconName | null;
	className?: string;
};

export type UpdateLink = {
	href: string;
	external?: boolean;
	cta?: string | null;
};

export type UpdateAvatar = {
	organisationId: string;
	name?: string | null;
};

type Props = {
	id?: string | number;
	badges?: UpdateBadge[];
	hideBadges?: boolean;
	avatar?: UpdateAvatar | null;
	source?: string | null;
	tags?: string[] | null;
	title: string;
	subtitle?: string | null;
	link: UpdateLink;
	dateIso?: string | null;
	isReleaseToday?: boolean;
	accentClass?: string | null;
	className?: string;
	compact?: boolean;
	hideFooterLink?: boolean;
	metaPlacement?: "footer" | "header";
	providerDateInline?: boolean;
	showAccentDot?: boolean;
};

export default function UpdateCard({
	id,
	badges = [],
	hideBadges = false,
	avatar,
	title,
	subtitle,
	source: _source,
	tags: _tags,
	link,
	dateIso,
	isReleaseToday = false,
	accentClass,
	className,
	compact = false,
	hideFooterLink = false,
	metaPlacement = "footer",
	providerDateInline = false,
	showAccentDot = true,
}: Props) {
	const isModelRelease = badges.some((b) => b.label === "Release");
	const visibleBadges = hideBadges ? [] : badges;
	const providerInlineDateIso =
		providerDateInline && avatar?.name && dateIso ? dateIso : null;
	const canShowProviderInlineTime = Boolean(providerInlineDateIso);
	const headerDateIso =
		metaPlacement === "header" && dateIso && !canShowProviderInlineTime
			? dateIso
			: null;
	const showHeaderTime =
		Boolean(headerDateIso);
	const showFooterMeta =
		metaPlacement === "footer" &&
		(Boolean(dateIso) || (Boolean(accentClass) && showAccentDot));
	const showFooterLink = !hideFooterLink;
	const showFooter = showFooterMeta || showFooterLink;
	const showHeaderMetaRow = visibleBadges.length > 0 || showHeaderTime;

	return (
		<Card
			key={id}
			className={cn(
				"flex h-full flex-col border border-zinc-200 bg-white transition hover:-translate-y-1 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950",
				isReleaseToday &&
					"border-amber-300 dark:border-amber-500 bg-amber-50/60 dark:bg-amber-900/20",
				className
			)}
		>
			<CardHeader className={cn("space-y-3 p-4", compact && "space-y-2.5 p-3")}>
				{showHeaderMetaRow ? (
					<div
						className={cn(
							"flex gap-2",
							showHeaderTime
								? "items-start justify-between"
								: "flex-wrap items-center"
						)}
					>
						<div className="flex flex-wrap items-center gap-2">
							{visibleBadges.map((badge) => {
								const Icon =
									badge.icon ??
									(badge.iconName ? BADGE_ICONS[badge.iconName] : null);
								return (
									<span
										key={`${id}-${badge.label}`}
										className={cn(
											"inline-flex items-center gap-1 rounded-full",
											badge.className
										)}
									>
										{Icon ? <Icon className="h-3.5 w-3.5" /> : null}
										{badge.label}
									</span>
								);
							})}
						</div>
						{headerDateIso ? (
							<div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
								<TimeDisplay
									dateIso={headerDateIso}
									isModelRelease={isModelRelease}
								/>
							</div>
						) : null}
					</div>
				) : null}

				<div className="flex min-w-0 items-center gap-3">
					{avatar ? (
						<Link
							href={`/organisations/${encodeURIComponent(
								avatar.organisationId
							)}`}
							className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50"
						>
							<span className="relative h-7 w-7 overflow-hidden rounded-lg">
								<Logo
									id={avatar.organisationId}
									alt={avatar.name ?? avatar.organisationId}
									fill
									className="object-contain"
								/>
							</span>
						</Link>
					) : null}

					<div className="min-w-0 flex-1 space-y-1">
						<CardTitle className="text-base sm:text-lg leading-tight">
							<Link
								href={link.href}
								className="inline-flex items-start gap-1 text-zinc-900 dark:text-zinc-50"
								target={link.external ? "_blank" : undefined}
								rel={
									link.external
										? "noopener noreferrer"
										: undefined
								}
							>
								<span className="wrap-break-word line-clamp-2 underline decoration-2 underline-offset-2 decoration-transparent hover:decoration-current transition-colors duration-200">
									{title}
								</span>
							</Link>
						</CardTitle>

						{avatar?.name ? (
							<div
								className={cn(
									"min-w-0 w-full text-xs text-zinc-500 dark:text-zinc-400",
									providerDateInline
										? "flex items-center justify-between gap-3"
										: "truncate"
								)}
							>
								<Link
									href={`/organisations/${encodeURIComponent(
										avatar.organisationId
									)}`}
									className={cn(
										"inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400",
										providerDateInline ? "min-w-0 flex-1 truncate" : ""
									)}
								>
									<span className="truncate underline decoration-transparent transition-colors duration-200 hover:decoration-current">
										{avatar.name}
									</span>
								</Link>
								{providerInlineDateIso ? (
									<div className="ml-auto shrink-0 whitespace-nowrap text-right text-xs text-zinc-500 dark:text-zinc-400">
										<TimeDisplay
											dateIso={providerInlineDateIso}
											isModelRelease={isModelRelease}
										/>
									</div>
								) : null}
							</div>
						) : subtitle ? (
							<CardDescription className="truncate text-xs tracking-wide text-zinc-500 dark:text-zinc-400">
								{subtitle}
							</CardDescription>
						) : null}
					</div>
				</div>
			</CardHeader>

			{showFooter ? (
				<CardFooter
					className={cn(
						"mt-auto flex items-center justify-between border-t border-zinc-200/60 p-4 text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-400",
						compact && "p-3",
						!showFooterMeta && "justify-end",
						!showFooterLink && "justify-start"
					)}
				>
					{showFooterMeta ? (
						<div className="flex items-center gap-2">
							{accentClass && showAccentDot ? (
								<span
									className={cn("h-2 w-2 rounded-full", accentClass)}
									aria-hidden="true"
								/>
							) : null}
							{dateIso ? (
								<TimeDisplay
									dateIso={dateIso}
									isModelRelease={isModelRelease}
								/>
							) : null}
						</div>
					) : null}

					{showFooterLink ? (
						<Link
							href={link.href}
							className="inline-flex items-center gap-1 font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
							target={link.external ? "_blank" : undefined}
							rel={link.external ? "noopener noreferrer" : undefined}
						>
							{link.cta ?? "Open"}
						</Link>
					) : null}
				</CardFooter>
			) : null}
		</Card>
	);
}
