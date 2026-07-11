import React, { useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import {
  clearAPICache,
  getRecentActivity,
  ManagementKeyRequiredError,
} from "./api";
import type { WorkspaceActivityEntry } from "./types";
import { formatDateTime, formatMoneyFromCents } from "./utils";

const PERIODS = [
  { title: "Last 24 Hours", value: "1" },
  { title: "Last 7 Days", value: "7" },
  { title: "Last 30 Days", value: "30" },
] as const;

export default function Command() {
  const [days, setDays] = useState<(typeof PERIODS)[number]["value"]>("7");
  const { data, error, isLoading, revalidate } = useCachedPromise(
    getRecentActivity,
    [Number(days), 50, 0],
    {
      keepPreviousData: true,
      onError: (error) => {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load gateway activity",
          message: error.message,
        });
      },
    },
  );
  const activity = data?.activity ?? [];
  const refresh = () => {
    clearAPICache();
    void revalidate();
  };

  if (error) {
    const managementKeyIsMissing = error instanceof ManagementKeyRequiredError;

    return (
      <Detail
        markdown={`# ${managementKeyIsMissing ? "Management API Key Required" : "Unable to Load Gateway Activity"}\n\n${error.message}\n\nAdd a management API key in extension preferences, then refresh this command. Your existing API key continues to power the catalogue commands.`}
        navigationTitle="Recent Gateway Activity"
        actions={
          <ActionPanel>
            <Action
              title="Configure Management Key"
              icon={Icon.Gear}
              onAction={() => void openExtensionPreferences()}
            />
            <Action
              title="Try Again"
              icon={Icon.ArrowClockwise}
              onAction={refresh}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Recent Gateway Activity"
      searchBarPlaceholder="Search recent requests by model, provider, or endpoint..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Period"
          value={days}
          onChange={(value) => setDays(value as typeof days)}
        >
          {PERIODS.map((period) => (
            <List.Dropdown.Item key={period.value} {...period} />
          ))}
        </List.Dropdown>
      }
    >
      {activity.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.Clock}
          title="No recent activity"
          description="No requests were recorded for this period."
          actions={
            <ActionPanel>
              <Action
                title="Refresh Activity"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
              />
            </ActionPanel>
          }
        />
      )}
      {activity.map((entry, index) => (
        <List.Item
          key={entry.request_id ?? `${entry.timestamp}-${index}`}
          title={entry.model || "Unknown model"}
          subtitle={entry.provider || "Unknown provider"}
          keywords={[entry.endpoint ?? "", entry.request_id ?? ""]}
          accessories={[
            {
              text: formatMoneyFromCents(entry.cost_cents),
              tooltip: "Request cost",
            },
            ...(entry.latency_ms === null
              ? []
              : [{ text: `${entry.latency_ms}ms`, tooltip: "Latency" }]),
            { text: formatDateTime(entry.timestamp), tooltip: "Timestamp" },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Request Details"
                icon={Icon.Eye}
                target={<ActivityDetail entry={entry} />}
              />
              {entry.request_id && (
                <Action.CopyToClipboard
                  title="Copy Request ID"
                  icon={Icon.Clipboard}
                  content={entry.request_id}
                />
              )}
              <Action
                title="Refresh Activity"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
              />
              <Action.OpenInBrowser
                title="Open Phaseo"
                url="https://phaseo.app"
                icon={Icon.Globe}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ActivityDetail({ entry }: { entry: WorkspaceActivityEntry }) {
  const markdown = `
# ${entry.model || "Unknown model"}

**Provider:** ${entry.provider || "Unknown"}
**Endpoint:** ${entry.endpoint || "Unknown"}
**Timestamp:** ${formatDateTime(entry.timestamp)}
**Latency:** ${entry.latency_ms === null ? "Unknown" : `${entry.latency_ms}ms`}
**Cost:** ${formatMoneyFromCents(entry.cost_cents)}

---

## Usage


\`\`\`json
${JSON.stringify(entry.usage ?? {}, null, 2)}
\`\`\`
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle="Gateway Request"
      actions={
        <ActionPanel>
          {entry.request_id && (
            <Action.CopyToClipboard
              title="Copy Request ID"
              icon={Icon.Clipboard}
              content={entry.request_id}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
