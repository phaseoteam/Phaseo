"use client";

import useSWR from "swr";
import type { AdminModelPreview } from "@/lib/models/adminModelPreview";

async function fetchPreview(url: string): Promise<AdminModelPreview> {
	const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
	if (!response.ok) throw new Error("Unable to refresh hidden model preview");
	return response.json() as Promise<AdminModelPreview>;
}

export default function AdminHiddenModelPreview({ initial }: { initial: AdminModelPreview }) {
	const { data } = useSWR(
		`/api/internal/model-preview/${encodeURIComponent(initial.modelId)}`,
		fetchPreview,
		{ fallbackData: initial },
	);
	const model = data ?? initial;
	return (
		<div className="container mx-auto space-y-8 px-4 py-8">
			<div>
				<p className="text-sm text-muted-foreground">Admin preview · Hidden model</p>
				<h1 className="mt-2 text-3xl font-bold">{model.name}</h1>
				<p className="mt-2 font-mono text-sm text-muted-foreground">{model.modelId}</p>
				{model.status ? <p className="mt-2 text-sm">{model.status}</p> : null}
			</div>
			<section aria-labelledby="hidden-model-providers" className="space-y-3">
				<h2 id="hidden-model-providers" className="text-xl font-semibold">Providers ({model.providers.length})</h2>
				<div className="divide-y rounded-lg border">
					{model.providers.length ? model.providers.map((provider) => (
						<div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
							<span>{provider.name}</span>
							<span className="font-mono text-muted-foreground">{provider.modelId} · {provider.status}</span>
						</div>
					)) : <p className="px-4 py-3 text-sm text-muted-foreground">No providers yet.</p>}
				</div>
			</section>
		</div>
	);
}
