// app/(dashboard)/layout.tsx
import Header from "@/components/header/header";
import Footer from "@/components/footer";

function DashboardFrame({ children }: { children: React.ReactNode }) {
	return (
		<div id="dashboard-shell" className="flex min-h-dvh flex-col">
			<Header />
			<main className="flex-1 flex flex-col">{children}</main>
			<Footer />
		</div>
	);
}

export default function SiteTemplate({
	children,
}: {
	children: React.ReactNode;
}) {
	return <DashboardFrame>{children}</DashboardFrame>;
}
