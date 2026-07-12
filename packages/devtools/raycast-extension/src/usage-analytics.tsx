import React, { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { clearAPICache, getUsageAnalytics } from "./api";
import type { AnalyticsUsageEntry } from "./types";
import { formatDate, formatMoneyFromNanos, getModelURL } from "./utils";

type SortBy = "usage" | "requests" | "model";

type UsageSummary = {
  key: string;
  model: string;
  modelPermaslug: string;
  provider: string;
  usageNanos: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  latestDate: string;
};

function summariseUsage(rows: AnalyticsUsageEntry[]): UsageSummary[] {
  const summaries = new Map<string, UsageSummary>();

  for (const row of rows) {
    const key = `${row.model_permaslug}:${row.provider_name}`;
    const existing = summaries.get(key) ?? {
      key,
      model: row.model,
      modelPermaslug: row.model_permaslug,
      provider: row.provider_name,
      usageNanos: 0,
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      latestDate: row.date,
    };

    existing.usageNanos += Math.round(row.usage * 1_000_000_000);
    existing.requests += row.requests;
    existing.promptTokens += row.prompt_tokens;
    existing.completionTokens += row.completion_tokens;
    if (row.date > existing.latestDate) existing.latestDate = row.date;
    summaries.set(key, existing);
  }

  return Array.from(summaries.values());
}

export default function Command() {
  const [sortBy, setSortBy] = useState<SortBy>("usage");
  const { data, error, isLoading, revalidate } = useCachedPromise(
    getUsageAnalytics,
    [],
    {
      keepPreviousData: true,
      onError: (error) => {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load usage by model",
          message: error.message,
        });
      },
    },
  );

  const usage = useMemo(() => {
    const summaries = summariseUsage(data?.data ?? []);
    return summaries.sort((left, right) => {
      if (sortBy === "requests") return right.requests - left.requests;
      if (sortBy === "model") return left.model.localeCompare(right.model);
      return right.usageNanos - left.usageNanos;
    });
  }, [data, sortBy]);

  const refresh = () => {
    clearAPICache();
    void revalidate();
  };

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Usage by Model"
      searchBarPlaceholder="Search models or providers..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort usage"
          value={sortBy}
          onChange={(value) => setSortBy(value as SortBy)}
        >
          <List.Dropdown.Item title="Highest Cost" value="usage" />
          <List.Dropdown.Item title="Most Requests" value="requests" />
          <List.Dropdown.Item title="Model Name" value="model" />
        </List.Dropdown>
      }
    >
      <List.Section title="Last 30 completed days">
        {usage.map((entry) => (
          <List.Item
            key={entry.key}
            title={entry.model}
            subtitle={entry.provider}
            keywords={[entry.modelPermaslug, entry.provider]}
            accessories={[
              {
                tag: {
                  value: formatMoneyFromNanos(entry.usageNanos),
                  color: Color.Green,
                },
                tooltip: "Estimated gateway usage",
              },
              { text: `${entry.requests.toLocaleString()} requests` },
              { text: `Last used ${formatDate(entry.latestDate)}` },
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open Model Page"
                  url={getModelURL(entry.modelPermaslug)}
                  icon={Icon.Globe}
                />
                <Action.CopyToClipboard
                  title="Copy Model ID"
                  content={entry.modelPermaslug}
                  icon={Icon.Clipboard}
                />
                <Action
                  title="Refresh Usage"
                  icon={Icon.ArrowClockwise}
                  onAction={refresh}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {usage.length === 0 && !isLoading && !error && (
        <List.EmptyView
          icon={Icon.BarChart}
          title="No completed usage yet"
          description="Usage appears here once Phaseo has completed a daily roll-up."
        />
      )}
    </List>
  );
}
