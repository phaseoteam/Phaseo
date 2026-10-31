import { useSuspenseQuery } from "@tanstack/react-query";
import { usageAlertsCountQuery } from "./UsageAlertsBadgeSlot.functions";

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

export default function UsageAlertsBadgeSlot() {
	// null: signed out, no workspace, or the alerts failed to load.
	const { data: count } = useSuspenseQuery(usageAlertsCountQuery());
	if (count === null) return null;
	return <Badge count={count} />;
}
