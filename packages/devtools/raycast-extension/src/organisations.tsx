import React, { useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Color,
} from "@raycast/api";
import { clearAPICache, getOrganisations } from "./api";
import {
  getOrganisationURL,
  getOrganisationDisplayName,
  organisationMatchesSearch,
  countryCodeToFlag,
  truncate,
} from "./utils";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const {
    data: response,
    isLoading,
    revalidate,
  } = useCachedPromise(getOrganisations, [250, 0], {
    keepPreviousData: true,
    onError: (error) => {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load organisations",
        message: error.message,
      });
    },
  });
  const organisations = response?.organisations ?? [];
  const refresh = () => {
    clearAPICache();
    void revalidate();
  };

  // Filter organisations by search text
  const filteredOrganisations = organisations.filter((org) =>
    organisationMatchesSearch(org, searchText),
  );

  // Sort organisations alphabetically by name
  const sortedOrganisations = [...filteredOrganisations].sort((a, b) =>
    getOrganisationDisplayName(a).localeCompare(getOrganisationDisplayName(b)),
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search organisations by name or country..."
      onSearchTextChange={setSearchText}
    >
      {sortedOrganisations.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No organisations found"
          description="Try adjusting your search query"
        />
      )}
      {sortedOrganisations.map((org) => (
        <List.Item
          key={org.organisation_id}
          title={getOrganisationDisplayName(org)}
          subtitle={org.description ? truncate(org.description, 60) : undefined}
          icon={{
            source: Icon.Building,
            tintColor: org.colour
              ? (org.colour as Color.ColorLike)
              : Color.Blue,
          }}
          accessories={[
            {
              text: countryCodeToFlag(org.country_code),
              tooltip: org.country_code || "Unknown",
            },
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Organisation Page"
                url={getOrganisationURL(org.organisation_id)}
                icon={Icon.Globe}
              />
              <Action.CopyToClipboard
                title="Copy Organisation ID"
                content={org.organisation_id}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action
                title="Refresh Organisations"
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
