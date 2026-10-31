// components/header/AuthControls.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import HeaderClient from "./HeaderClient";
import { shellDataQuery } from "./shellData";

export default function AuthControls({
	variant,
}: {
	variant?: "mobile" | "desktop";
}) {
	const locale = useLocale();
	const { data } = useSuspenseQuery(shellDataQuery(locale));
	const account = data.account;

	if (!account.isLoggedIn) {
		return (
			<HeaderClient
				isLoggedIn={false}
				user={undefined}
				teams={[]}
				displayPreferences={undefined}
				currentTeamId={undefined}
				userRole={undefined}
				variant={variant}
			/>
		);
	}

	return (
		<HeaderClient
			isLoggedIn={true}
			user={account.user}
			teams={account.teams}
			displayPreferences={account.displayPreferences}
			currentTeamId={account.currentTeamId}
			userRole={account.userRole}
			providerMode={account.providerMode}
			variant={variant}
		/>
	);
}
