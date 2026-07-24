export type PaletteAction =
	| "copy-current-url"
	| "copy-text"
	| "theme-dark"
	| "theme-light"
	| "theme-system"
	| "theme-toggle";

export type PaletteItem = {
	id: string;
	title: string;
	subtitle?: string | null;
	href?: string;
	logoId?: string | null;
	flagIso?: string;
	keywords?: readonly string[];
	external?: boolean;
	action?: PaletteAction;
	actionValue?: string;
	shortcut?: readonly [string, string];
};

// Types for curated/featured search items.
export type SearchResultItem = {
	id: string;
	title: string;
	subtitle?: string | null;
	href: string;
	icon: string;
	badge?: string;
	logoId?: string;
	flagIso?: string;
	leftLogoId?: string;
	rightLogoId?: string;
};

export type ResultGroup = {
	type: string;
	label: string;
	items: SearchResultItem[];
};
