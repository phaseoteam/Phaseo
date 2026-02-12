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

export type UpdateBadge = {
	label: string;
	// many callers use React.ComponentType<{ className?: string }>
	icon?: React.ComponentType<{ className?: string }> | null;
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
};

export default function UpdateCard({
	id,
	badges = [],
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
}: Props) {
	const isModelRelease = badges.some((b) => b.label === "Release");

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
			<CardHeader className="space-y-3 p-4">
				<div className="flex flex-wrap items-center gap-2">
					{badges.map((badge) => {
						const Icon = badge.icon;
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

				<div className="flex items-center gap-3 min-w-0">
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

					<div className="min-w-0 space-y-1">
						<CardTitle className="text-base sm:text-lg leading-tight">
							<Link
								href={link.href}
								className="inline-flex items-start gap-1 text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
								target={link.external ? "_blank" : undefined}
								rel={
									link.external
										? "noopener noreferrer"
										: undefined
								}
							>
								<span className="wrap-break-word line-clamp-2 relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
									{title}
								</span>
							</Link>
						</CardTitle>

						{avatar?.name ? (
							<CardDescription className="truncate text-xs text-zinc-500 dark:text-zinc-400">
								<Link
									href={`/organisations/${encodeURIComponent(
										avatar.organisationId
									)}`}
									className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
										{avatar.name}
									</span>
								</Link>
							</CardDescription>
						) : subtitle ? (
							<CardDescription className="truncate text-xs tracking-wide text-zinc-500 dark:text-zinc-400">
								{subtitle}
							</CardDescription>
						) : null}
					</div>
				</div>
			</CardHeader>

			<CardFooter className="mt-auto flex items-center justify-between border-t border-zinc-200/60 p-4 text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-400">
				<div className="flex items-center gap-2">
					{accentClass ? (
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

				<Link
					href={link.href}
					className="inline-flex items-center gap-1 font-semibold text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-200"
					target={link.external ? "_blank" : undefined}
					rel={link.external ? "noopener noreferrer" : undefined}
				>
					{link.cta ?? "Open"}
				</Link>
			</CardFooter>
		</Card>
	);
}
