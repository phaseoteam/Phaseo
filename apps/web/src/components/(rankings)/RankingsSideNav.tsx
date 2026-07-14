"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	ArrowUpDown,
	Binary,
	Captions,
	Headphones,
	ImageIcon,
	Speech,
	Type as TypeIcon,
	Video,
	type LucideIcon,
} from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";

type RankingsNavItem = {
	id: string;
	label: string;
	href: string;
	icon: LucideIcon;
};

const ITEMS: RankingsNavItem[] = [
	{ id: "text", label: "Text", href: "/rankings", icon: TypeIcon },
	{ id: "image", label: "Image", href: "/rankings/image", icon: ImageIcon },
	{ id: "embeddings", label: "Embeddings", href: "/rankings/embeddings", icon: Binary },
	{ id: "rerank", label: "Rerank", href: "/rankings/rerank", icon: ArrowUpDown },
	{ id: "audio", label: "Audio", href: "/rankings/audio", icon: Headphones },
	{ id: "video", label: "Video", href: "/rankings/video", icon: Video },
	{ id: "speech", label: "Speech", href: "/rankings/speech", icon: Speech },
	{ id: "transcription", label: "Transcription", href: "/rankings/transcription", icon: Captions },
];

export function RankingsSideNav({
	className,
	currentModality = "text",
}: {
	className?: string;
	currentModality?: string;
}) {
	const router = useRouter();
	const activeItem =
		ITEMS.find((item) => item.id === currentModality) ?? ITEMS[0];
	const ActiveIcon = activeItem.icon;
	const activeTone = getModalityTone(activeItem.id);

	return (
		<div className={cn("min-w-0 lg:h-full", className)}>
			<div className="lg:hidden">
				<div className="mb-2 px-1 text-sm font-medium text-foreground">
					Rankings
				</div>
				<div className="rounded-2xl border border-border/70 bg-background/90 p-2.5">
					<Select
						value={activeItem.id}
						onValueChange={(value) => {
							const next = ITEMS.find((item) => item.id === value);
							if (next) router.push(next.href);
						}}
					>
						<SelectTrigger className="h-10 rounded-xl border-0 bg-transparent px-3 text-left shadow-none focus:ring-0">
							<SelectValue placeholder="Choose leaderboard">
								<span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
									<ActiveIcon
										className={cn("size-4 shrink-0", activeTone.iconClassName)}
									/>
									<span className="truncate">{activeItem.label}</span>
								</span>
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{ITEMS.map((item) => {
								const Icon = item.icon;
								const isSelected = item.id === activeItem.id;
								const tone = getModalityTone(item.id);
								return (
									<SelectItem key={item.id} value={item.id}>
										<span className="flex items-center gap-2">
											<Icon
												className={cn(
													"size-4",
													isSelected ? tone.iconClassName : "text-muted-foreground",
												)}
											/>
											<span>{item.label}</span>
										</span>
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				</div>
			</div>

			<aside className="hidden h-full lg:block">
				<div className="sticky top-[calc(var(--site-header-height,3.75rem)+4.25rem)]">
					<nav className="space-y-3">
						<div className="px-2.5 text-sm font-medium text-foreground">
							Rankings
						</div>
						<div className="relative flex flex-col gap-1">
							{ITEMS.map((item) => {
								const isActive = item.id === activeItem.id;
								const Icon = item.icon;
								const tone = getModalityTone(item.id);
								return (
									<Link
										key={item.id}
										href={item.href}
										aria-current={isActive ? "page" : undefined}
										className={cn(
											"relative z-10 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-left text-[13px] transition-colors duration-200 motion-reduce:transition-none",
											isActive
												? "bg-muted text-foreground"
												: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
										)}
									>
										<Icon
											className={cn(
												"size-4 shrink-0 transition-colors",
												isActive ? tone.iconClassName : "text-muted-foreground",
											)}
										/>
										<span className="truncate">{item.label}</span>
									</Link>
								);
							})}
						</div>
					</nav>
				</div>
			</aside>
		</div>
	);
}
