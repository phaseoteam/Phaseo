"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type RankingsNavItem = {
	id: string;
	label: string;
	href: string;
};

const ITEMS: RankingsNavItem[] = [
	{ id: "text", label: "Text", href: "/rankings" },
	{ id: "image", label: "Image", href: "/rankings/image" },
	{ id: "embeddings", label: "Embeddings", href: "/rankings/embeddings" },
	{ id: "rerank", label: "Rerank", href: "/rankings/rerank" },
	{ id: "audio", label: "Audio", href: "/rankings/audio" },
	{ id: "video", label: "Video", href: "/rankings/video" },
	{ id: "speech", label: "Speech", href: "/rankings/speech" },
	{ id: "transcription", label: "Transcription", href: "/rankings/transcription" },
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
								<span className="truncate text-sm font-medium text-foreground">
									{activeItem.label}
								</span>
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{ITEMS.map((item) => (
								<SelectItem key={item.id} value={item.id}>
									{item.label}
								</SelectItem>
							))}
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
