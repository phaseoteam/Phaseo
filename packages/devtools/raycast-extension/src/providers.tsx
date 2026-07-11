import React, { useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Detail,
  showToast,
  Toast,
} from "@raycast/api";
import { clearAPICache, getProviders } from "./api";
import type { Provider } from "./types";
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
              <Action.Push
                title="View Details"
                icon={Icon.Eye}
                target={<ProviderDetail provider={provider} />}
              />
              {provider.link && (
                <Action.OpenInBrowser
                  title="Open Provider Docs"
                  url={provider.link}
                  icon={Icon.Book}
                />
              )}
              <Action.OpenInBrowser
                title="Open in Phaseo"
                url={getProviderURL(provider.api_provider_id)}
                icon={Icon.Globe}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
              />
              <Action.CopyToClipboard
                title="Copy Provider ID"
                content={provider.api_provider_id}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
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

function ProviderDetail({ provider }: { provider: Provider }) {
  const markdown = `
# ${getProviderDisplayName(provider)}

**Provider ID:** \`${provider.api_provider_id}\`
**Country:** ${countryCodeToFlag(provider.country_code)} ${provider.country_code || "Unknown"}

---

## Description

${provider.description || "_No description available_"}

---

## Links

${provider.link ? `[Provider Documentation](${provider.link})` : "_No documentation link available_"}

[View on Phaseo](${getProviderURL(provider.api_provider_id)})
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={getProviderDisplayName(provider)}
      actions={
        <ActionPanel>
          {provider.link && (
            <Action.OpenInBrowser
              title="Open Provider Docs"
              url={provider.link}
              icon={Icon.Book}
            />
          )}
          <Action.OpenInBrowser
            title="Open in Phaseo"
            url={getProviderURL(provider.api_provider_id)}
            icon={Icon.Globe}
          />
          <Action.CopyToClipboard
            title="Copy Provider ID"
            content={provider.api_provider_id}
            icon={Icon.Clipboard}
          />
        </ActionPanel>
      }
    />
  );
}
