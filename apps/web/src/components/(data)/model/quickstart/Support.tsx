"use client";

import { useEffect } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	LifeBuoy,
	Mail,
	BookOpen,
	ArrowUpRight,
	MessageSquare,
} from "lucide-react";
import {
	formatSupportWait,
	getSupportAvailability,
	getLondonInfo,
} from "@/lib/support/schedule";

type IconPair = { light: string; dark: string };

type Item = {
	key: string;
	title: string;
	href?: string;
	description: string;
	badge?: string;
	external?: boolean;
	icon?: ComponentType<any>;
	iconSrc?: string;
	iconPair?: IconPair;
	onClick?: () => void;
};

function BrandIcon({
	icon: Icon,
	iconSrc,
	iconPair,
	alt,
}: {
	icon?: ComponentType<any>;
	iconSrc?: string;
	iconPair?: IconPair;
	alt: string;
}) {
	return (
		<div className="shrink-0 rounded-xl p-2 bg-primary/10 text-primary">
			{iconPair ? (
				<>
					<Image
						src={iconPair.light}
						alt={alt}
						width={20}
						height={20}
						className="h-5 w-5 block dark:hidden"
						priority={false}
					/>
					<Image
						src={iconPair.dark}
						alt={alt}
						width={20}
						height={20}
						className="h-5 w-5 hidden dark:block"
						priority={false}
					/>
				</>
			) : iconSrc ? (
				<Image
					src={iconSrc}
					alt={alt}
					width={20}
					height={20}
					className="h-5 w-5"
				/>
			) : Icon ? (
				<Icon className="h-5 w-5" />
			) : (
				<MessageSquare className="h-5 w-5" />
			)}
		</div>
	);
}

export default function Support() {
	const { isOpen, minutesUntilNextWindow } = getSupportAvailability();
	const availabilityText = isOpen
		? "Live chat is available now."
		: minutesUntilNextWindow
		? `Live chat replies resume in ${formatSupportWait(
				minutesUntilNextWindow
		  )}.`
		: "Live chat replies resume soon.";
	useEffect(() => {
		const { date, day, minutes } = getLondonInfo();
		console.log(
			"[support] London",
			date.toISOString(),
			`day=${day}`,
			`minuteOfDay=${minutes}`,
			`open=${isOpen}`,
			`wait=${minutesUntilNextWindow ?? "n/a"}`
		);
	}, [isOpen, minutesUntilNextWindow]);
	const availabilityDotColor = isOpen ? "bg-emerald-500" : "bg-amber-500";
	const availabilityDotRing = isOpen
		? "ring-emerald-400/60"
		: "ring-amber-400/60";
	const availabilityBadge = isOpen ? "Available" : "Outside hours";

	const supportDescription =
		"This is a direct line of contact to me, and I will reply as soon as I can!";
	const supportItem: Item = {
		key: "contact",
		title: "Contact Support",
		href: "/contact",
		description: supportDescription,
		icon: MessageSquare,
		badge: "Fastest",
	};
	const otherItems: Item[] = [
		{
			key: "discord",
			title: "Discord",
			href: "/discord",
			description: "Quick answers from the community.",
			iconSrc: "/social/discord.svg",
			badge: "Faster",
		},
		{
			key: "email",
			title: "Email",
			href: "mailto:support@phaseo.ai",
			description: "Private support for billing or account issues.",
			icon: Mail,
			badge: "Tracked",
			external: true,
		},
		{
			key: "docs",
			title: "Docs",
			href: "/docs",
			description: "Guides, API reference, quick starts.",
			icon: BookOpen,
		},
		{
			key: "x",
			title: "X (Twitter)",
			href: "/x",
			description: "Product updates and release notes.",
			iconPair: {
				light: "/social/x_light.svg",
				dark: "/social/x_dark.svg",
			},
		},
		{
			key: "github",
			title: "GitHub",
			href: "/github",
			description:
				"Open issues for any problems you face with the API and view the changelog.",
			iconPair: {
				light: "/social/github_light.svg",
				dark: "/social/github_dark.svg",
			},
		},
	];
	const displayedItems: Item[] = isOpen
		? [supportItem, ...otherItems]
		: [otherItems[0], otherItems[1], supportItem, ...otherItems.slice(2)];

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center gap-2">
					<span
						className="relative flex h-2.5 w-2.5"
						aria-hidden="true"
					>
						{isOpen && (
							<span
								className={`absolute inline-flex h-full w-full animate-ping rounded-full ${availabilityDotRing
									.replace("ring-", "bg-")
									.replace("/60", "")} opacity-75`}
							></span>
						)}
						<span
							className={`relative inline-flex h-full w-full rounded-full ${availabilityDotColor}`}
						></span>
					</span>
					<CardTitle className="flex items-center gap-2">
						<LifeBuoy className="h-5 w-5 text-primary" />
						Support
						<Badge variant="outline" className="text-[10px]">
							{availabilityBadge}
						</Badge>
					</CardTitle>
				</div>
				<CardDescription>
					We are here to help. Whatever you need. Whenever you need
					it.
				</CardDescription>
				<div className="mt-1 text-xs text-muted-foreground">
					{availabilityText}
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid gap-3 sm:grid-cols-2 auto-rows-fr">
					{displayedItems.map(
						({
							key,
							title,
							href,
							description,
							icon,
							iconSrc,
							iconPair,
							badge,
							external,
							onClick,
						}) => (
							<div key={key} className="relative group h-full">
								<Card className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30">
									<div className="absolute inset-0 rounded-xl ring-0 ring-primary/0 group-hover:ring-2 group-hover:ring-primary/20 pointer-events-none" />
									<div className="flex flex-1 items-center gap-4">
										<BrandIcon
											icon={icon}
											iconSrc={iconSrc}
											iconPair={iconPair}
											alt={`${title} logo`}
										/>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<h3 className="font-medium leading-none">
													{title}
												</h3>
												{badge ? (
													<Badge
														variant="secondary"
														className="text-[10px]"
													>
														{badge}
													</Badge>
												) : null}
											</div>
										</div>
										<ArrowUpRight className="ml-auto h-4 w-4 opacity-0 group-hover:opacity-100 transition" />
									</div>
									<p className="mt-2 text-sm text-muted-foreground line-clamp-3">
										{description}
									</p>
									{href ? (
										<Link
											href={href}
											aria-label={title}
											className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
											{...(external
												? {
														target: "_blank",
														rel: "noreferrer",
												  }
												: {})}
										/>
									) : onClick ? (
										<button
											type="button"
											onClick={(event) => {
												event.preventDefault();
												onClick();
											}}
											className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
											aria-label={title}
										/>
									) : null}
								</Card>
							</div>
						)
					)}
				</div>
			</CardContent>
		</Card>
	);
}
