import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";

export default async function InternalCreditsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireInternalAdmin("/internal");

	return <>{children}</>;
}
