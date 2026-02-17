// Centralised sidebar config used by SettingsSidebar

import type { LucideIcon } from "lucide-react";
import {
	AppWindow,
	BarChart3,
	CreditCard,
	KeyRound,
	Package,
	RadioTower,
	User,
	Users,
} from "lucide-react";

export type NavItem = {
    href: string;
    label: string;
	icon?: LucideIcon;
    badge?: string;
    disabled?: boolean;
    external?: boolean; // when true, opens in new tab and shows a link icon
	/**
	 * Optional route prefixes that should highlight this item as active.
	 * Useful when the sidebar links to a "section home" but the section has
	 * multiple subpages rendered as tabs.
	 */
	match?: string[];
};

export type NavGroup = {
    heading?: string;
    items: NavItem[];
};

const BASE_SETTINGS_SIDEBAR: NavGroup[] = [
    {
        heading: undefined,
        items: [
			{
				href: "/settings/account",
				label: "Account",
				icon: User,
				match: ["/settings/account"],
			},
            {
				href: "/settings/teams",
				label: "Team",
				icon: Users,
				match: ["/settings/teams"],
			},
        ],
    },
	{
		heading: undefined,
		items: [
			{
				href: "/settings/keys",
				label: "API",
				icon: KeyRound,
				match: [
					"/settings/keys",
					"/settings/apps",
					"/settings/management-api-keys",
					"/settings/provisioning-keys",
					"/settings/routing",
					"/settings/byok",
					"/settings/presets",
					"/settings/guardrails",
					"/settings/privacy",
				],
			},
		],
	},
    {
        heading: undefined,
        items: [
			{
				href: "/settings/credits",
				label: "Billing",
				icon: CreditCard,
				match: [
					"/settings/credits",
					"/settings/credits/transactions",
					"/settings/payment-methods",
					"/settings/tiers",
				],
			},
			{
				href: "/settings/usage",
				label: "Usage",
				icon: BarChart3,
				match: ["/settings/usage", "/settings/usage/logs", "/settings/usage/alerts"],
			},
        ],
    },
	{
		heading: "Developer",
		items: [
			{
				href: "/settings/oauth-apps",
				label: "OAuth Apps",
				icon: AppWindow,
				badge: "Alpha",
				match: ["/settings/oauth-apps", "/settings/authorized-apps"],
			},
			{
				href: "/settings/broadcast",
				label: "Broadcast",
				icon: RadioTower,
				badge: "Pre-Release",
				match: ["/settings/broadcast", "/settings/observability"],
			},
			{ href: "/settings/sdk", label: "SDKs", icon: Package, match: ["/settings/sdk"] },
		],
	},

    // Example external group (remove or edit as needed):
    // {
    //   heading: "Resources",
    //   items: [{ href: "https://docs.yoursite.com", label: "Docs", external: true }],
    // },
];

export function getSettingsSidebar(options?: { showBroadcast?: boolean }): NavGroup[] {
	const showBroadcast = options?.showBroadcast ?? true;
	return BASE_SETTINGS_SIDEBAR.map((group) => ({
		...group,
		items: group.items.filter((item) =>
			showBroadcast ? true : item.href !== "/settings/broadcast",
		),
	})).filter((group) => group.items.length > 0);
}

export const SETTINGS_SIDEBAR: NavGroup[] = getSettingsSidebar({
	showBroadcast: true,
});
