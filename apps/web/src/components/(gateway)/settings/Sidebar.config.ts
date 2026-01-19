// Centralised sidebar config used by SettingsSidebar

export type NavItem = {
    href: string;
    label: string;
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
            { href: "/settings/provisioning-keys", label: "Provisioning Keys", disabled: true },
            { href: "/settings/privacy", label: "Training, Logging, & Privacy", disabled: true },
        ],
    },
    {
        heading: "AI Conduit",
        items: [
            { href: "/settings/keys", label: "API Keys" },
            { href: "/settings/byok", label: "BYOK" },
            { href: "/settings/presets", label: "Presets", disabled: true },
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
		items: [{ href: "/settings/sdk", label: "SDKs" }],
	},

    // Example external group (remove or edit as needed):
    // {
    //   heading: "Resources",
    //   items: [{ href: "https://docs.yoursite.com", label: "Docs", external: true }],
    // },
];
