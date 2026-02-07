// Centralised sidebar config used by SettingsSidebar

export type NavItem = {
    href: string;
    label: string;
    badge?: string;
    disabled?: boolean;
    external?: boolean; // when true, opens in new tab and shows a link icon
};

export type NavGroup = {
    heading: string;
    items: NavItem[];
};

export const SETTINGS_SIDEBAR: NavGroup[] = [
    {
        heading: "General",
        items: [
            { href: "/settings/account", label: "Account" },
            { href: "/settings/teams", label: "Teams" },
            { href: "/settings/management-api-keys", label: "Management API Keys", badge: "Beta" },
            { href: "/settings/authorized-apps", label: "Authorized Apps", badge: "Alpha" },
            { href: "/settings/privacy", label: "Training, Logging, & Privacy", disabled: true },
        ],
    },
	{
		heading: "AI Gateway",
		items: [
			{ href: "/settings/keys", label: "API Keys" },
			{ href: "/settings/byok", label: "BYOK" },
			{ href: "/settings/routing", label: "Routing" },
			{ href: "/settings/presets", label: "Presets", badge: "Beta" },
			{ href: "/settings/apps", label: "Apps" },
		],
	},
    {
        heading: "Billing",
        items: [
            { href: "/settings/credits", label: "Credits" },
            { href: "/settings/tiers", label: "Tiers & Discounts" },
            { href: "/settings/payment-methods", label: "Payment Methods" },
        ],
    },
	{
		heading: "Developer",
		items: [
			{ href: "/settings/oauth-apps", label: "OAuth Apps", badge: "Alpha" },
			{ href: "/settings/sdk", label: "SDKs" },
		],
	},

    // Example external group (remove or edit as needed):
    // {
    //   heading: "Resources",
    //   items: [{ href: "https://docs.yoursite.com", label: "Docs", external: true }],
    // },
];
