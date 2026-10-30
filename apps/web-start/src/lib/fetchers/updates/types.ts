import type { UpdateBadgeIconName } from "@/components/updates/UpdateCard";

export type UpdateCardProps = {
	id?: string | number;
	badges?: Array<{
		label: string;
		iconName?: UpdateBadgeIconName | null;
		className?: string;
	}>;
	avatar?: { organisationId: string; name?: string | null } | null;
	source?: string | null;
	tags?: string[] | null;
	title: string;
	subtitle?: string | null;
	link: { href: string; external?: boolean; cta?: string | null };
	dateIso?: string | null;
	relative?: string | null;
	accentClass?: string | null;
	className?: string;
};

export type ModelEventType = "Announced" | "Released" | "Deprecated" | "Retired";
export type EventType = ModelEventType;

export interface ModelEvent {
	model: {
		model_id: string;
		name: string;
		organisation_id: string;
		organisation: { organisation_id: string; name?: string | null };
	};
	types: ModelEventType[];
	date: string;
}

export interface ModelEventSegments {
	past: ModelEvent[];
	future: ModelEvent[];
}
