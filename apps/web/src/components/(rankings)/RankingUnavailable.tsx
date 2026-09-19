"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RankingUnavailable({ id, title }: { id?: string; title: string }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	return (
		<section id={id} className="scroll-mt-32 space-y-3 py-8" aria-live="polite">
			<h2 className="text-xl font-semibold">{title}</h2>
			<p className="text-sm text-muted-foreground">This ranking is temporarily unavailable.</p>
			<Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
				{pending ? "Retrying…" : "Try again"}
			</Button>
		</section>
	);
}
