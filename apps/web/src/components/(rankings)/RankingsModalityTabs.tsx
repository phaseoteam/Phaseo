"use client";

import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { getModalityTone } from "@/lib/models/modalityStyles";

type RankingsModalityItem = {
	id: string;
	label: string;
	href: string;
	icon: LucideIcon;
};

const ITEMS: RankingsModalityItem[] = [
	{ id: "text", label: "Text", href: "/rankings", icon: TypeIcon },
	{ id: "image", label: "Image", href: "/rankings/image", icon: ImageIcon },
	{ id: "embeddings", label: "Embeddings", href: "/rankings/embeddings", icon: Binary },
	{ id: "rerank", label: "Rerank", href: "/rankings/rerank", icon: ArrowUpDown },
	{ id: "audio", label: "Audio", href: "/rankings/audio", icon: Headphones },
	{ id: "video", label: "Video", href: "/rankings/video", icon: Video },
	{ id: "speech", label: "Speech", href: "/rankings/speech", icon: Speech },
	{
		id: "transcription",
		label: "Transcription",
		href: "/rankings/transcription",
		icon: Captions,
	},
];

export function RankingsModalityTabs({
	currentModality,
}: {
	currentModality: string;
}) {
	return (
		<div className="w-full touch-pan-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			<nav
				aria-label="Ranking modalities"
				className="flex min-w-max items-center gap-1.5 pr-4"
			>
				{ITEMS.map((item) => {
					const isActive = item.id === currentModality;
					const Icon = item.icon;
					const tone = getModalityTone(item.id);

					return (
						<Link
							key={item.id}
							href={item.href}
							aria-current={isActive ? "page" : undefined}
							className={cn(
								"group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
								isActive
									? cn("bg-muted text-foreground", tone.badgeClassName)
									: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
							)}
						>
							<span
								className={cn(
									"inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
									isActive
										? tone.iconClassName
										: cn(
											"text-muted-foreground transition-colors",
											tone.ghostIconHoverClassName,
										),
								)}
							>
								<Icon className="size-3.5" />
							</span>
							<span>{item.label}</span>
						</Link>
					);
				})}
			</nav>
		</div>
	);
}
