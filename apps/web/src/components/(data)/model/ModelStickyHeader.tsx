"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Scale } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { UseModelSheet } from "./UseModelSheet";
import UnreleasedBadge from "./UnreleasedBadge";

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
	chatModelId,
	organisationId,
	organisationName,
	modelName,
	observeId,
	canChat = true,
	canCompare = true,
	organisationHref,
	gatewayMetadata,
	showUnreleased = false,
	isSystemOneModel = false,
}: {
	modelId: string;
	chatModelId?: string;
	organisationId: string;
	organisationName: string;
	modelName: string;
	observeId: string;
	canChat?: boolean;
	canCompare?: boolean;
	organisationHref?: string;
	gatewayMetadata?: ModelGatewayMetadata | null;
	showUnreleased?: boolean;
	isSystemOneModel?: boolean;
}) {
	const visible = useStickyHeaderVisibility(observeId);
	const organisationUrl = organisationHref ?? `/organisations/${organisationId}`;

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
								href={organisationUrl}
								className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background transition-opacity hover:opacity-80"
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
						<div className="flex min-w-0 items-center gap-2">
							<p className="min-w-0 truncate text-sm font-semibold leading-tight text-foreground">
									<Link
										href={organisationUrl}
										className="hover:underline underline-offset-4"
									>
										{organisationName}
									</Link>
									<span>: {modelName}</span>
								</p>
							{showUnreleased ? <UnreleasedBadge compact /> : null}
						</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{canChat ? (
								<Button asChild variant="outline" size="sm" className="hidden h-8 rounded-lg px-2.5 text-[13px] sm:inline-flex">
									<Link href={`${isSystemOneModel ? "/chat/systemone" : "/chat"}?model=${encodeURIComponent(chatModelId ?? modelId)}`}>
										<MessageSquare className="h-4 w-4" />
										{isSystemOneModel ? "Decisions" : "Chat"}
									</Link>
								</Button>
							) : null}
							{canCompare ? <Button asChild variant="outline" size="sm" className="hidden h-8 rounded-lg px-2.5 text-[13px] sm:inline-flex">
								<Link href={`/compare?models=${modelId}`}>
									<Scale className="h-4 w-4" />
									Compare
								</Link>
							</Button> : null}
							{canChat ? (
								<Button asChild variant="outline" size="icon-sm" className="rounded-lg sm:hidden">
									<Link href={`${isSystemOneModel ? "/chat/systemone" : "/chat"}?model=${encodeURIComponent(chatModelId ?? modelId)}`} aria-label={isSystemOneModel ? "Open Decisions playground" : "Chat about this model"}>
										<MessageSquare className="h-4 w-4" />
									</Link>
								</Button>
							) : null}
			{canCompare ? <Button asChild variant="outline" size="icon-sm" className="rounded-lg sm:hidden">
								<Link href={`/compare?models=${modelId}`} aria-label="Compare this model">
									<Scale className="h-4 w-4" />
								</Link>
							</Button> : null}
							{canChat && !isSystemOneModel ? <UseModelSheet modelId={modelId} requestModelId={chatModelId} modelName={modelName} gatewayMetadata={gatewayMetadata} className="hidden h-8 px-2.5 text-[13px] sm:inline-flex" /> : null}
							{canChat && !isSystemOneModel ? (
								<UseModelSheet modelId={modelId} requestModelId={chatModelId} modelName={modelName} gatewayMetadata={gatewayMetadata} compact className="sm:hidden" />
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
