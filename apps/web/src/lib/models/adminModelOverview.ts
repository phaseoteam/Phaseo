import type { AdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";

export function toAdminModelOverview(source: AdminModelSource): ModelOverviewPage | null {
	const model = source.model;
	if (!model?.hidden) return null;
	const lab = Array.isArray(model.lab) ? model.lab[0] : model.lab;
	return {
		...model,
		model_id: String(model.model_id ?? source.canonicalApiId),
		name: String(model.name ?? source.canonicalApiId),
		organisation_id: String(model.organisation_id ?? model.lab_slug),
		organisation: model.organisation ?? lab ?? { name: model.lab_slug },
		status: "Withheld",
		aliases: source.aliases.map((alias) => alias.alias_slug),
		model_links: source.links ?? [],
		model_details: source.details ?? [],
	};
}
