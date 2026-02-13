import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { getDeprecationWarningsForTeam } from "@/lib/fetchers/usage/deprecationWarnings";

function Badge({ count }: { count: number }) {
	if (!count || count <= 0) return null;
	return (
		<span
			className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold leading-none text-white"
			aria-label={`${count} alert${count === 1 ? "" : "s"}`}
		>
			{count}
		</span>
	);
}

export default async function UsageAlertsBadgeSlot() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return null;

	const teamId = await getTeamIdFromCookie();
	if (!teamId) return null;

	const warnings = await getDeprecationWarningsForTeam(teamId);
	const count = warnings.filter((w) => w.countAsAlert).length;
	return <Badge count={count} />;
}
