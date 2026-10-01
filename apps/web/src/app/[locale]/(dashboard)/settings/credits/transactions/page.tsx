import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import RecentTransactions from "@/components/(gateway)/credits/RecentTransactions";
import EnterpriseInvoices from "@/components/(gateway)/credits/EnterpriseInvoices";
import type { Metadata } from "next";
import { fetchSettingsCreditsTransactionsInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsTransactionsInitialData";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("transactions") };
}

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
					titleKey="headers.invoices"
					description="Enterprise billing records and invoice documents."
					descriptionKey="headers.invoicesDescription"
				/>
				<EnterpriseInvoices invoices={initialData.invoices} />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader title="Transactions" titleKey="headers.transactions" />
			<RecentTransactions
				transactions={initialData.transactions}
				stripeCustomerId={initialData.stripeCustomerId}
			/>
		</div>
	);
}
