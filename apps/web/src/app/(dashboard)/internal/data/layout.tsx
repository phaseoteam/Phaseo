import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";

export default async function InternalDataLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireInternalAdmin("/internal");

	return <>{children}</>;
}
