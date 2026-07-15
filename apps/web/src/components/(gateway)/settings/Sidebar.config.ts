// Centralised sidebar config used by SettingsSidebar

import type { LucideIcon } from "lucide-react";
import {
	AppWindow,
	BarChart3,
	Beaker,
	CreditCard,
	EyeOff,
	KeyRound,
	Package,
	RadioTower,
	ShieldCheck,
	User,
	Users,
	WalletCards,
	Webhook,
	Waypoints,
	Workflow,
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

export type ResolvedSettingsNav = {
	group: NavGroup;
	item: NavItem;
};

const BASE_SETTINGS_SIDEBAR: NavGroup[] = [
	{
		heading: "Account",
		items: [
			{
				href: "/settings/profile",
				label: "Profile",
				icon: User,
				match: ["/settings/profile"],
			},
			{
				href: "/settings/account",
				label: "Account",
				icon: User,
				match: ["/settings/account"],
			},
			{
				href: "/settings/credits",
				label: "Billing",
				icon: CreditCard,
				match: [
					"/settings/credits",
					"/settings/credits/onboarding",
					"/settings/credits/transactions",
					"/settings/payment-methods",
					"/settings/tiers",
				],
			},
			{
				href: "/settings/workspaces/members",
				label: "Members",
				icon: Users,
				match: [
					"/settings/workspaces",
					"/settings/teams",
					"/settings/teams/members",
				],
			},
			{
				href: "/settings/workspaces/access",
				label: "Access",
				icon: KeyRound,
				match: ["/settings/teams/access"],
			},
			{
				href: "/settings/workspaces/settings",
				label: "Workspace",
				icon: Workflow,
				match: ["/settings/teams/settings"],
			},
		],
	},
	{
		heading: "Workspace",
		items: [
			{
				href: "/settings/keys",
				label: "API Keys",
				icon: KeyRound,
				match: ["/settings/keys"],
			},
			{
				href: "/settings/management-api-keys",
				label: "Management Keys",
				icon: WalletCards,
				badge: "Beta",
				match: ["/settings/management-api-keys", "/settings/provisioning-keys"],
			},
			{
				href: "/settings/apps",
				label: "Apps",
				icon: AppWindow,
				match: ["/settings/apps"],
			},
			{
				href: "/settings/sdk",
				label: "SDKs",
				icon: Package,
				match: ["/settings/sdk"],
			},
			{
				href: "/settings/usage",
				label: "Observability",
				icon: BarChart3,
				match: ["/settings/usage", "/settings/usage/logs", "/settings/usage/alerts"],
			},
			{
				href: "/settings/routing",
				label: "Routing",
				icon: Waypoints,
				match: ["/settings/routing"],
			},
			{
				href: "/settings/presets",
				label: "Presets",
				icon: Workflow,
				badge: "Beta",
				match: ["/settings/presets"],
			},
			{
				href: "/settings/byok",
				label: "BYOK",
				icon: KeyRound,
				match: ["/settings/byok"],
			},
			{
				href: "/settings/guardrails",
				label: "Guardrails",
				icon: ShieldCheck,
				match: ["/settings/guardrails"],
			},
			{
				href: "/settings/privacy",
				label: "Privacy",
				icon: EyeOff,
				badge: "Alpha",
				match: ["/settings/privacy"],
			},
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
			{
				href: "/settings/webhooks",
				label: "Webhooks",
				icon: Webhook,
				badge: "Beta",
				match: ["/settings/webhooks"],
			},
			{
				href: "/settings/beta",
				label: "Feature Preview",
				icon: Beaker,
				match: ["/settings/beta"],
			},
		],
	},

    // Example external group (remove or edit as needed):
    // {
    //   heading: "Resources",
    //   items: [{ href: "https://docs.yoursite.com", label: "Docs", external: true }],
    // },
];

export function getSettingsSidebar(options?: { showBroadcast?: boolean; showWebhooks?: boolean }): NavGroup[] {
	const showBroadcast = options?.showBroadcast ?? true;
	const showWebhooks = options?.showWebhooks ?? true;
	return BASE_SETTINGS_SIDEBAR.map((group) => ({
		...group,
		items: group.items.filter((item) =>
			(showBroadcast ? true : item.href !== "/settings/broadcast") &&
			(showWebhooks ? true : item.href !== "/settings/webhooks"),
		),
	})).filter((group) => group.items.length > 0);
}

export function getActiveSettingsNav(
	pathname: string,
	options?: { showBroadcast?: boolean; showWebhooks?: boolean },
): ResolvedSettingsNav | null {
	const navGroups = getSettingsSidebar(options);

	function matchScore(item: NavItem) {
		if (item.disabled || item.external) return null;

		if (pathname === item.href) return { exact: true, len: item.href.length };
		if (pathname.startsWith(item.href + "/"))
			return { exact: true, len: item.href.length };

		let best = 0;
		for (const prefix of item.match ?? []) {
			if (pathname === prefix || pathname.startsWith(prefix + "/")) {
				best = Math.max(best, prefix.length);
			}
		}
		if (best > 0) return { exact: false, len: best };
		return null;
	}

	const matches = navGroups.flatMap((group) =>
		group.items
			.map((item) => ({ group, item, score: matchScore(item) }))
			.filter((entry) => entry.score !== null),
	);

	return (
		matches.sort((a, b) => {
			if (a.score!.exact !== b.score!.exact) return a.score!.exact ? -1 : 1;
			return b.score!.len - a.score!.len;
		})[0] ?? null
	);
}

export const SETTINGS_SIDEBAR: NavGroup[] = getSettingsSidebar({
	showBroadcast: true,
	showWebhooks: true,
});
