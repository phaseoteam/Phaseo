"use client";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import RecentTransactions from "@/components/(gateway)/credits/RecentTransactions";
import EnterpriseInvoices from "@/components/(gateway)/credits/EnterpriseInvoices";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsCreditsTransactionsInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("transactions", function TransactionsContent({ initialData }: { initialData: SettingsCreditsTransactionsInitialData }) {

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
});
