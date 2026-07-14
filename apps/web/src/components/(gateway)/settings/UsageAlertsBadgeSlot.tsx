import { fetchSettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/fetchSettingsUsageAlertsInitialData";

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
	let warnings: Awaited<
		ReturnType<typeof fetchSettingsUsageAlertsInitialData>
	>["warnings"] = [];
	try {
		const data = await fetchSettingsUsageAlertsInitialData();
		if (!data.signedIn || !data.workspaceId) return null;
		warnings = data.warnings;
	} catch {
		return null;
	}
	const count = warnings.filter((w) => w.countAsAlert).length;
	return <Badge count={count} />;
}
