import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import RecentTransactions from "@/components/(gateway)/credits/RecentTransactions";
import EnterpriseInvoices from "@/components/(gateway)/credits/EnterpriseInvoices";
import type { Metadata } from "next";
import { fetchSettingsCreditsTransactionsInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsTransactionsInitialData";

export const metadata: Metadata = {
	title: "Transactions - Settings",
};

export default function TransactionsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<TransactionsContent />
			</Suspense>
		</div>
	);
}

async function TransactionsContent() {
	const initialData = await fetchSettingsCreditsTransactionsInitialData();

	if (initialData.isEnterpriseInvoiceMode) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Invoices"
					description="Enterprise billing records and invoice documents."
				/>
				<EnterpriseInvoices invoices={initialData.invoices} />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader title="Transactions" />
			<RecentTransactions
				transactions={initialData.transactions}
				stripeCustomerId={initialData.stripeCustomerId}
			/>
		</div>
	);
}

