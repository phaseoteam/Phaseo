"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Scale } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useStickyHeaderVisibility(observeId: string) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const target = document.getElementById(observeId);
		if (!target) return;

		const threshold = 76;
		let frameId = 0;

		const update = () => {
			frameId = 0;
			const rect = target.getBoundingClientRect();
			setVisible(rect.bottom <= threshold);
		};

		const requestUpdate = () => {
			if (frameId) return;
			frameId = window.requestAnimationFrame(update);
		};

		requestUpdate();
		window.addEventListener("scroll", requestUpdate, { passive: true });
		window.addEventListener("resize", requestUpdate);

		return () => {
			if (frameId) window.cancelAnimationFrame(frameId);
			window.removeEventListener("scroll", requestUpdate);
			window.removeEventListener("resize", requestUpdate);
		};
	}, [observeId]);

	return visible;
}

export default function ModelStickyHeader({
	modelId,
	organisationId,
	organisationName,
	modelName,
	observeId,
}: {
	modelId: string;
	organisationId: string;
	organisationName: string;
	modelName: string;
	observeId: string;
}) {
	const visible = useStickyHeaderVisibility(observeId);

	return (
		<div className="h-0">
			<div
				className={cn(
					"pointer-events-none fixed inset-x-0 top-[calc(var(--site-notice-height,0px)+var(--site-header-height,3.75rem))] z-40 transition-all duration-200",
					visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
				)}
			>
				<div className="pointer-events-auto border-b border-border/80 bg-background/95 shadow-sm backdrop-blur">
					<div className="container mx-auto flex items-center justify-between gap-3 px-4 py-2.5 md:px-6 xl:px-8">
						<div className="flex min-w-0 items-center gap-3">
							<Link
								href={`/organisations/${organisationId}`}
								className="relative flex h-8 w-8 shrink-0 items-center justify-center border bg-background transition-opacity hover:opacity-80"
								aria-label={`View ${organisationName}`}
							>
								<div className="relative h-6 w-6">
									<Logo
										id={organisationId}
										alt={modelName}
										className="object-contain"
										fill
									/>
								</div>
							</Link>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold leading-tight text-foreground">
									<Link
										href={`/organisations/${organisationId}`}
										className="hover:underline underline-offset-4"
									>
										{organisationName}
									</Link>
									<span>: {modelName}</span>
								</p>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Button asChild variant="outline" size="sm" className="hidden h-8 px-2.5 text-[13px] sm:inline-flex">
								<Link href={`/chat?model=${modelId}`}>
									<MessageSquare className="h-4 w-4" />
									Chat
								</Link>
							</Button>
							<Button asChild variant="outline" size="sm" className="hidden h-8 px-2.5 text-[13px] sm:inline-flex">
								<Link href={`/compare?models=${modelId}`}>
									<Scale className="h-4 w-4" />
									Compare
								</Link>
							</Button>
							<Button asChild variant="outline" size="icon-sm" className="sm:hidden">
								<Link href={`/chat?model=${modelId}`} aria-label="Chat about this model">
									<MessageSquare className="h-4 w-4" />
								</Link>
							</Button>
							<Button asChild variant="outline" size="icon-sm" className="sm:hidden">
								<Link href={`/compare?models=${modelId}`} aria-label="Compare this model">
									<Scale className="h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
