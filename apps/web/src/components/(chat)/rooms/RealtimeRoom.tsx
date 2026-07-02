"use client";

import { Radio, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RealtimeRoom() {
	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<header className="flex h-[57px] shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<Radio className="h-4 w-4 text-muted-foreground" />
					<h1 className="truncate text-sm font-medium">Realtime</h1>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Realtime settings"
					disabled
				>
					<Settings2 className="h-4 w-4" />
				</Button>
			</header>
			<section className="flex min-h-0 flex-1 items-center justify-center px-4">
				<div className="w-full max-w-lg rounded-2xl border border-dashed border-border bg-background px-5 py-6 text-center">
					<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
						<Radio className="h-5 w-5" />
					</div>
					<h2 className="mt-4 text-base font-semibold">Realtime is coming soon</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						Realtime voice and multimodal sessions will have their own model
						picker, settings, and history when this room is enabled.
					</p>
				</div>
			</section>
		</main>
	);
}
