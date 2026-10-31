import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { SearchWrapper } from "@/components/header/Search/SearchWrapper";
import { shellDataQuery } from "@/components/header/shellData";
import { toAccountQueryScope } from "@/lib/query/queryKeys";

export function SearchWithCapabilities(props: { className?: string }) {
	const locale = useLocale();
	const { data } = useSuspenseQuery(shellDataQuery(locale));
	const authHeader = data.account;

	return (
		<SearchWrapper
			{...props}
			isAdmin={Boolean(authHeader?.user?.id) && authHeader?.userRole === "admin"}
			capabilities={data.capabilities}
			accountQueryScope={toAccountQueryScope({
				userId: authHeader?.user?.id,
				workspaceId: authHeader?.currentTeamId,
			})}
		/>
	);
}
