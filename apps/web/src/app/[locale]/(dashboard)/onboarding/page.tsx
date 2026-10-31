import type { Metadata } from "next";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import InteractiveOnboarding, {
	type OnboardingWorkspace,
} from "@/components/(gateway)/onboarding/InteractiveOnboarding";
import { onboardingPageQuery } from "./onboarding.functions";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.interactiveOnboarding");
	return {
		title: t("pageTitle"),
		description: t("pageDescription"),
		robots: { index: false, follow: false },
	};
}

// The provider-mode and signed-out redirects run in the route's beforeLoad
// (onboardingPageQuery); the curated model list is picked on the server.
export default function OnboardingPage() {
	const t = useTranslations("Product.interactiveOnboarding");
	const settingsT = useTranslations("SettingsUI.strings");
	const { data: page } = useSuspenseQuery(onboardingPageQuery());
	if (!page.accountAvailable) return <main className="container mx-auto max-w-xl px-4 py-16"><h1 className="text-xl font-semibold">{t("accountUnavailable")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("accountVerificationFailed")}</p><Link className="mt-5 inline-flex text-sm font-medium underline underline-offset-4" href="/onboarding">{t("retryAccount")}</Link></main>;
	const onboarding = page.onboarding;
	const userRow = onboarding.user;
	const workspaceRows = onboarding.workspaces;

	const workspaces: OnboardingWorkspace[] = [];
	const seenWorkspaceIds = new Set<string>();
	for (const row of workspaceRows ?? []) {
		const workspace = Array.isArray(row.workspaces)
			? row.workspaces[0]
			: row.workspaces;
		const id = String(workspace?.id ?? row.workspace_id ?? "").trim();
		const name = String(workspace?.name ?? settingsT("Workspace")).trim();
		if (!id || seenWorkspaceIds.has(id)) continue;
		seenWorkspaceIds.add(id);
		workspaces.push({ id, name, role: String(row.role ?? "member") });
	}

	const cookieWorkspaceId = page.cookieWorkspaceId;
	const savedState =
		userRow?.onboarding_state && typeof userRow.onboarding_state === "object"
			? (userRow.onboarding_state as Record<string, unknown>)
			: {};
	const preferredWorkspaceId =
		String(savedState.workspaceId ?? "").trim() ||
		String(cookieWorkspaceId ?? "").trim() ||
		String(userRow?.default_workspace_id ?? "").trim();
	const initialWorkspace =
		workspaces.find((workspace) => workspace.id === preferredWorkspaceId) ??
		workspaces[0] ??
		null;

	return (
		<>
			<NoFooterStyle />
			<div className="mx-auto w-full max-w-5xl px-6 pt-6 text-right text-sm">
				<Link href="/settings/account/providers" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">{t("becomeProvider")}</Link>
			</div>
			<InteractiveOnboarding
				initialState={savedState}
				initialCountryCode={userRow?.declared_country_code ?? null}
				countryStorageAvailable={onboarding.countryStorageAvailable !== false}
				initialCompletedAt={userRow?.onboarding_completed_at ?? null}
				models={page.models}
				workspaces={workspaces}
				initialWorkspaceId={initialWorkspace?.id ?? null}
			/>
		</>
	);
}
