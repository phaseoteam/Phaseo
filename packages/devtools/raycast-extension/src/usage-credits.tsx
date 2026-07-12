import React from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { clearAPICache, getCredits, ManagementKeyRequiredError } from "./api";
import { formatMoneyFromNanos } from "./utils";

export default function Command() {
  const { data, error, isLoading, revalidate } = useCachedPromise(
    getCredits,
    [],
    {
      keepPreviousData: true,
      onError: (error) => {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load usage and credits",
          message: error.message,
        });
      },
    },
  );

  const credits = data?.credits;
  const refresh = () => {
    clearAPICache();
    void revalidate();
  };

  if (error) {
    const managementKeyIsMissing = error instanceof ManagementKeyRequiredError;

    return (
      <Detail
        markdown={`# ${managementKeyIsMissing ? "Management API Key Required" : "Unable to Load Usage & Credits"}\n\n${error.message}\n\nAdd a management API key in extension preferences, then refresh this command. Your existing API key continues to power the catalogue commands.`}
        navigationTitle="Usage & Credits"
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

  const markdown = credits
    ? `
# Usage & Credits

## Available now

# ${formatMoneyFromNanos(credits.available_nanos)}

| Balance | Reserved | 30-day usage | 30-day requests |
| --- | --- | --- | --- |
| ${formatMoneyFromNanos(credits.balance_nanos)} | ${formatMoneyFromNanos(credits.reserved_nanos)} | ${formatMoneyFromNanos(credits.thirty_day_usage)} | ${credits.thirty_day_requests.toLocaleString()} |

_Balance values are shown in USD. Data is cached locally for 15 minutes; use Refresh for a live value._
`
    : "# Usage & Credits\n\nLoading your current Phaseo balance...";

  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      navigationTitle="Usage & Credits"
      actions={
        <ActionPanel>
          <Action
            title="Refresh Usage & Credits"
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
  );
}
