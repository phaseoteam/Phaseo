import { useState, useEffect } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Detail,
  showToast,
  Toast,
  Color,
} from "@raycast/api";
import { getOrganisations, APIError } from "./api";
import type { Organisation } from "./types";
import {
  getOrganisationURL,
  getOrganisationDisplayName,
  organisationMatchesSearch,
  countryCodeToFlag,
  truncate,
} from "./utils";

export default function Command() {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function fetchOrganisations() {
      try {
        setIsLoading(true);
        const response = await getOrganisations(250, 0);
        setOrganisations(response.organisations);
      } catch (error) {
        if (error instanceof APIError) {
          showToast({
            style: Toast.Style.Failure,
            title: "Failed to load organisations",
            message: error.message,
          });
        } else {
          showToast({
            style: Toast.Style.Failure,
            title: "Failed to load organisations",
            message: "An unknown error occurred",
          });
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrganisations();
  }, []);

  // Filter organisations by search text
  const filteredOrganisations = organisations.filter((org) =>
    organisationMatchesSearch(org, searchText)
  );

  // Sort organisations alphabetically by name
  const sortedOrganisations = [...filteredOrganisations].sort((a, b) =>
    getOrganisationDisplayName(a).localeCompare(getOrganisationDisplayName(b))
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
            tintColor: org.colour ? (org.colour as Color.ColorLike) : Color.Blue,
          }}
          accessories={[
            {
              text: countryCodeToFlag(org.country_code),
              tooltip: org.country_code || "Unknown",
            },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Details"
                icon={Icon.Eye}
                target={<OrganisationDetail organisation={org} />}
              />
              <Action.OpenInBrowser
                title="Open in AI Stats"
                url={getOrganisationURL(org.organisation_id)}
                icon={Icon.Globe}
              />
              <Action.CopyToClipboard
                title="Copy Organisation ID"
                content={org.organisation_id}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function OrganisationDetail({ organisation }: { organisation: Organisation }) {
  const markdown = `
# ${getOrganisationDisplayName(organisation)}

**Organisation ID:** \`${organisation.organisation_id}\`
**Country:** ${countryCodeToFlag(organisation.country_code)} ${organisation.country_code || "Unknown"}

---

## Description

${organisation.description || "_No description available_"}

---

[View on AI Stats](${getOrganisationURL(organisation.organisation_id)})
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={getOrganisationDisplayName(organisation)}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open in AI Stats"
            url={getOrganisationURL(organisation.organisation_id)}
            icon={Icon.Globe}
          />
          <Action.CopyToClipboard
            title="Copy Organisation ID"
            content={organisation.organisation_id}
            icon={Icon.Clipboard}
          />
        </ActionPanel>
      }
    />
  );
}
