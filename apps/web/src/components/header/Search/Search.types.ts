// Types for curated/featured search items
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