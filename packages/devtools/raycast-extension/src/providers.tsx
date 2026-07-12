import React, { useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Keyboard,
  showToast,
  Toast,
} from "@raycast/api";
import { clearAPICache, getProviders } from "./api";
import {
  getProviderURL,
  getProviderDisplayName,
  providerMatchesSearch,
  countryCodeToFlag,
  truncate,
} from "./utils";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const {
    data: response,
    isLoading,
    revalidate,
  } = useCachedPromise(getProviders, [250, 0], {
    keepPreviousData: true,
    onError: (error) => {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load providers",
        message: error.message,
      });
    },
  });
  const providers = response?.providers ?? [];
  const refresh = () => {
    clearAPICache();
    void revalidate();
  };

  // Filter providers by search text
  const filteredProviders = providers.filter((provider) =>
    providerMatchesSearch(provider, searchText),
  );

  // Sort providers alphabetically by name
  const sortedProviders = [...filteredProviders].sort((a, b) =>
    getProviderDisplayName(a).localeCompare(getProviderDisplayName(b)),
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search providers by name or country..."
      onSearchTextChange={setSearchText}
    >
      {sortedProviders.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No providers found"
          description="Try adjusting your search query"
        />
      )}
      {sortedProviders.map((provider) => (
        <List.Item
          key={provider.api_provider_id}
          title={getProviderDisplayName(provider)}
          subtitle={
            provider.description
              ? truncate(provider.description, 60)
              : undefined
          }
          icon={Icon.Network}
          accessories={[
            {
              text: countryCodeToFlag(provider.country_code),
              tooltip: provider.country_code || "Unknown",
            },
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Provider Page"
                url={getProviderURL(provider.api_provider_id)}
                icon={Icon.Globe}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
              />
              {provider.link && (
                <Action.OpenInBrowser
                  title="Open Provider Docs"
                  url={provider.link}
                  icon={Icon.Book}
                />
              )}
              <Action.CopyToClipboard
                title="Copy Provider ID"
                content={provider.api_provider_id}
                icon={Icon.Clipboard}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              <Action
                title="Refresh Providers"
                icon={Icon.ArrowClockwise}
                onAction={refresh}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
