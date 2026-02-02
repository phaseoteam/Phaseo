import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { SignInModel } from "@/lib/fetchers/landing/sign-in/getMainModels";
import { getMainModelsCached } from "@/lib/fetchers/landing/sign-in/getMainModels";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export default async function KeyModels() {
	// If consumer didn't provide data, fetch main models by ID from Supabase
	let models: SignInModel[] = [];

	// Default model ids to display on the sign-in page
	const defaultIds = [
		"gpt-5-2025-08-07",
		"claude-sonnet-4-5-20250929",
		"grok-4-0709",
		"gemini-2.5-pro",
		"omni-moderation-2024-09-26",
		"veo-3.1-generate-preview",
	];
	try {
		const includeHidden = await resolveIncludeHidden();
		models = await getMainModelsCached(defaultIds, includeHidden);
	} catch (e) {
		// On error, fallback to empty list
		console.error("getMainModelsCached error", e);
		models = [];
	}

	// Preserve the exact order from `defaultIds`. Map the fetched models into
	// that order and then append any extra models returned by the fetcher.
	const modelsById = new Map(models.map((m) => [m.model_id, m]));
	const ordered: SignInModel[] = [];
	for (const id of defaultIds) {
		const match = modelsById.get(id);
		if (match) ordered.push(match);
	}
	// Append any models that weren't in defaultIds at the end
	for (const m of models) {
		if (!defaultIds.includes(m.model_id)) ordered.push(m);
	}

	console.log("[KeyModels] rendering with models", { ordered });
	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-full border border-border bg-white/80 px-4 py-2 text-center text-sm font-medium text-muted-foreground shadow-sm dark:bg-black/70">
				Access an ever-growing catalog of curated models as soon as you sign in to the AI Stats Gateway.
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{ordered.map((m: SignInModel) => (
					<Card key={m.model_id} className="p-4">
						<CardHeader className="p-0 mb-2">
							<div className="flex items-start gap-3">
								<div className="flex-1 min-w-0">
									<CardTitle className="text-lg font-semibold">
										<Link
											href={`/models/${m.model_id}`}
											className="inline-flex min-w-0 text-current"
										>
											<span className="relative inline-flex max-w-full truncate font-semibold leading-tight text-current after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
												{m.name}
											</span>
										</Link>
									</CardTitle>
									<div className="text-sm text-gray-500">
										<Link
											href={`/organisations/${m.data_organisations.organisation_id}`}
											className="text-xs text-muted-foreground truncate flex items-center gap-1"
										>
											<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
												{m.data_organisations.name}
											</span>
										</Link>
									</div>
								</div>
							</div>
						</CardHeader>
					</Card>
				))}
			</div>
		</div>
	);
}
