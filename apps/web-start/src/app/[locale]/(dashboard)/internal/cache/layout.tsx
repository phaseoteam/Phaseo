// The admin gate (requireInternalAdmin("/internal")) runs in the route's beforeLoad.
export default function InternalCacheLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}
