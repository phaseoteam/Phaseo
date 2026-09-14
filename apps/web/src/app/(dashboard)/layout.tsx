// app/(dashboard)/layout.tsx
import Header from "@/components/header/header";
import Footer from "@/components/footer";
import DashboardFooterGate from "@/components/layout/DashboardFooterGate";
import CatalogueScrollToTop from "@/components/layout/CatalogueScrollToTop";
import PublicDataFeedbackGate from "@/components/layout/PublicDataFeedbackGate";

function DashboardFrame({ children }: { children: React.ReactNode }) {
	return (
		<div id="dashboard-shell" className="flex min-h-dvh flex-col">
			<Header />
			<main className="flex-1 min-h-0 flex flex-col">{children}</main>
			<PublicDataFeedbackGate />
			<CatalogueScrollToTop />
			<DashboardFooterGate>
				<Footer />
			</DashboardFooterGate>
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
