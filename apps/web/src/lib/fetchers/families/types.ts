export type FamilyCard = {
	family_id: string;
	family_name: string;
	organisation_id: string;
};

export type FamilyModelStatus =
	| "Rumoured"
	| "Announced"
	| "Limited Access"
	| "Withheld"
	| "Available"
	| "Deprecated"
	| "Retired"
	| null;

export interface FamilyModelItem {
	model_id: string;
	name: string;
	organisation_id: string;
	status?: FamilyModelStatus;
	release_date?: string | null;
	announcement_date?: string | null;
	organisation?: {
		name?: string | null;
		colour?: string | null;
		country_code?: string | null;
	} | null;
}

export interface FamilyInfo {
	family_id: string;
	family_name: string;
	models: FamilyModelItem[];
}
