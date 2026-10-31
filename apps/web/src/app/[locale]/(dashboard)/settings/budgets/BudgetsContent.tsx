"use client";
import { useTranslations } from "@/i18n/react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import BudgetsSettingsClient from "@/components/(gateway)/settings/budgets/BudgetsSettingsClient";
import DepartmentBudgetsSection from "@/components/(gateway)/settings/budgets/DepartmentBudgetsSection";
import { BudgetAlertShortcut } from "@/components/(gateway)/settings/spend-rules/SpendAlertShortcuts";
import type { SettingsBudgetsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export default withSettingsResource("budgets", function BudgetsContent({ initialData }: { initialData: SettingsBudgetsInitialData }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("budgets.title")}
				description={t("budgets.description")}
				actions={<ProductFeedbackButton surface="settings_budgets" prompt={t("budgets.feedback")} />}
			/>
			<BudgetsSettingsClient data={initialData} renderBudgetActions={(budget) => <BudgetAlertShortcut interval={budget.interval} />} />
			<DepartmentBudgetsSection data={initialData} />
		</div>
	);
});
