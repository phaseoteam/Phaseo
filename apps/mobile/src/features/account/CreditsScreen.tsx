import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus } from "lucide-react-native";
import { RefreshControl, ScrollView, View } from "react-native";
import { Button, ErrorState, Fact, Header, Icon, LoadingState, ReadableWidth, Row, Screen, Section, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { formatDate, formatTimestamp, formatUsd, nanosToUsd } from "@/lib/format";
import { openWeb } from "@/lib/web";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { projectCreditRunway, transactionLabel, transactionStatus } from "./credits";
import { accountKeys, useCredits, useTransactions } from "./queries";

const SHOWN_TRANSACTIONS = 15;

/** The website's Credits page, read-only: balance and how long it lasts, auto top-up, low-balance email, recent credit. */
export function CreditsScreen({ workspaceId }: { workspaceId: string }) {
  const { split } = useLayout();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const credits = useCredits(workspaceId);
  const transactions = useTransactions(workspaceId);
  const data = credits.data;
  const wallet = data?.wallet;
  const balanceUsd = data?.initialBalance ?? null;
  const runway = data?.recentCreditSpend && balanceUsd != null ? projectCreditRunway({
    balanceNanos: balanceUsd * 1_000_000_000,
    dailyNanos: data.recentCreditSpend.dailyNanos,
    observedAt: data.recentCreditSpend.observedAt,
    autoTopUpEnabled: Boolean(wallet?.auto_top_up_enabled),
    autoTopUpThresholdNanos: wallet?.low_balance_threshold ?? 0,
  }) : null;
  const refresh = () => {
    void credits.refetch();
    void transactions.refetch();
    void queryClient.invalidateQueries({ queryKey: accountKeys.balance(workspaceId) });
  };

  return (
    <Screen>
      <Header back={!split} title="Credits & billing" subtitle={workspace?.name} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={credits.isRefetching} onRefresh={refresh} />}>
        <ReadableWidth>
          {credits.isLoading ? <LoadingState /> : credits.isError || !data ? <ErrorState error={credits.error} onRetry={refresh} /> : (
            <>
              <View className="px-4 pt-2">
                <Text variant="caption">Balance</Text>
                <Text variant="display">{formatUsd(balanceUsd)}</Text>
                <Text variant="muted" className="mt-0.5">
                  {!runway ? "Credit is used as requests are made, including chat."
                    : runway.kind === "beyond" ? `At your recent pace (${formatUsd(runway.dailyUsd)} a day) this lasts more than ${runway.days} days.`
                    : runway.kind === "auto_top_up" ? `At your recent pace (${formatUsd(runway.dailyUsd)} a day) auto top-up adds credit around ${formatDate(runway.at)}.`
                    : `At your recent pace (${formatUsd(runway.dailyUsd)} a day) this runs out around ${formatDate(runway.at)}.`}
                </Text>
                {/* Paying happens on phaseo.app in the in-app browser. Before a Google Play release, check this against
                    Play's payments policy for digital goods (a link to a web checkout may not be allowed). */}
                <Button label="Add credits on phaseo.app" icon={Plus} className="mt-4" onPress={() => void openWeb("/settings/credits")} />
              </View>
              <Section title="Automatic top-up">
                <Fact label="Auto top-up" value={wallet?.auto_top_up_enabled ? "On" : "Off"} />
                {wallet?.auto_top_up_enabled ? <Fact label="Adds" value={`${formatUsd(nanosToUsd(wallet.auto_top_up_amount ?? 0))} when the balance falls below ${formatUsd(nanosToUsd(wallet.low_balance_threshold ?? 0))}`} /> : null}
                <Fact label="Low-balance email" value={data.lowBalanceEmailEnabled ? `Below ${formatUsd(data.lowBalanceEmailThresholdUsd ?? 0)}` : "Off"} />
                {data.latestPaymentSuccessAt ? <Fact label="Last payment" value={formatDate(data.latestPaymentSuccessAt)} /> : null}
                <Row title="Change on phaseo.app" chevron={false} trailing={<Icon icon={ExternalLink} tone="muted" size={15} />} onPress={() => void openWeb("/settings/credits")} last />
              </Section>
              <Section title="Recent credit" description="Top-ups, refunds and credit added. Spending is on the Usage page.">
                {transactions.isLoading ? <LoadingState /> : transactions.isError ? <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} /> : transactions.data?.isEnterpriseInvoiceMode ? (
                  <Text variant="muted" className="px-4 py-3">This workspace is billed by invoice. Invoices are on phaseo.app.</Text>
                ) : !transactions.data?.transactions.length ? (
                  <Text variant="muted" className="px-4 py-3">No credit added yet.</Text>
                ) : transactions.data.transactions.slice(0, SHOWN_TRANSACTIONS).map((entry) => {
                  const amount = nanosToUsd(entry.amount_nanos) ?? 0;
                  const status = transactionStatus(entry.status);
                  return (
                    <Row
                      key={entry.id}
                      title={transactionLabel(entry.kind, entry.description)}
                      subtitle={[entry.created_at ? formatTimestamp(entry.created_at) : null, status].filter(Boolean).join(" · ")}
                      trailing={<Text variant="small" className={amount < 0 ? "font-semibold text-foreground" : "font-semibold text-success"}>{`${amount > 0 ? "+" : ""}${formatUsd(amount)}`}</Text>}
                    />
                  );
                })}
                <Row title={transactions.data?.isEnterpriseInvoiceMode ? "Invoices on phaseo.app" : "All transactions on phaseo.app"} chevron={false} trailing={<Icon icon={ExternalLink} tone="muted" size={15} />} onPress={() => void openWeb("/settings/credits/transactions")} last />
              </Section>
            </>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
