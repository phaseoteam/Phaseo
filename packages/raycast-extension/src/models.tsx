import { useState, useEffect } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  Detail,
  showToast,
  Toast,
} from "@raycast/api";
import { getModels, APIError } from "./api";
import type { Model } from "./types";
import {
  formatDate,
  getModelURL,
  getOrganisationURL,
  getStatusColor,
  getStatusText,
  getModelDisplayName,
  getModelOrganisationName,
  modelMatchesSearch,
  countryCodeToFlag,
} from "./utils";

type SortBy = "release_date" | "organisation" | "status" | "name";

export default function Command() {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("release_date");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function fetchModels() {
      try {
        setIsLoading(true);
        const response = await getModels(250, 0); // Fetch more models for better UX
        setModels(response.models);
      } catch (error) {
        if (error instanceof APIError) {
          showToast({
            style: Toast.Style.Failure,
            title: "Failed to load models",
            message: error.message,
          });
        } else {
          showToast({
            style: Toast.Style.Failure,
            title: "Failed to load models",
            message: "An unknown error occurred",
          });
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchModels();
  }, []);

  // Filter models by search text
  const filteredModels = models.filter((model) => modelMatchesSearch(model, searchText));

  // Sort models
  const sortedModels = [...filteredModels].sort((a, b) => {
    switch (sortBy) {
      case "release_date": {
        const aDate = a.release_date ? new Date(a.release_date).getTime() : 0;
        const bDate = b.release_date ? new Date(b.release_date).getTime() : 0;
        if (aDate !== bDate) return bDate - aDate; // Newest first
        return getModelDisplayName(a).localeCompare(getModelDisplayName(b));
      }
      case "organisation": {
        const aOrg = getModelOrganisationName(a);
        const bOrg = getModelOrganisationName(b);
        if (aOrg !== bOrg) return aOrg.localeCompare(bOrg);
        return getModelDisplayName(a).localeCompare(getModelDisplayName(b));
      }
      case "status": {
        const aStatus = a.status || "unknown";
        const bStatus = b.status || "unknown";
        if (aStatus !== bStatus) return aStatus.localeCompare(bStatus);
        return getModelDisplayName(a).localeCompare(getModelDisplayName(b));
      }
      case "name": {
        return getModelDisplayName(a).localeCompare(getModelDisplayName(b));
      }
      default:
        return 0;
    }
  });

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search models by name, organisation, or endpoint..."
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort by"
          value={sortBy}
          onChange={(value) => setSortBy(value as SortBy)}
        >
          <List.Dropdown.Item title="Release Date (Newest First)" value="release_date" />
          <List.Dropdown.Item title="Organisation" value="organisation" />
          <List.Dropdown.Item title="Status" value="status" />
          <List.Dropdown.Item title="Name" value="name" />
        </List.Dropdown>
      }
    >
      {sortedModels.length === 0 && !isLoading && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No models found"
          description="Try adjusting your search query"
        />
      )}
      {sortedModels.map((model) => (
        <List.Item
          key={model.model_id}
          title={getModelDisplayName(model)}
          subtitle={getModelOrganisationName(model)}
          accessories={[
            {
              tag: {
                value: getStatusText(model.status),
                color: getStatusColor(model.status) as Color.ColorLike,
              },
            },
            { text: formatDate(model.release_date) },
            { text: `${model.endpoints?.length || 0} endpoints` },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Details"
                icon={Icon.Eye}
                target={<ModelDetail model={model} />}
              />
              <Action.OpenInBrowser
                title="Open in AI Stats"
                url={getModelURL(model.model_id)}
                icon={Icon.Globe}
              />
              <Action.CopyToClipboard
                title="Copy Model ID"
                content={model.model_id}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              {model.organisation_id && (
                <Action.OpenInBrowser
                  title="View Organisation"
                  url={getOrganisationURL(model.organisation_id)}
                  icon={Icon.Building}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function ModelDetail({ model }: { model: Model }) {
  const markdown = `
# ${getModelDisplayName(model)}

**Model ID:** \`${model.model_id}\`
**Organisation:** ${getModelOrganisationName(model)}
**Status:** ${getStatusText(model.status)}
**Release Date:** ${formatDate(model.release_date)}

---

## Capabilities

**Input Types:** ${model.input_types?.join(", ") || "None"}
**Output Types:** ${model.output_types?.join(", ") || "None"}
**Endpoints:** ${model.endpoints?.join(", ") || "None"}

---

## API Providers

${
  model.providers && model.providers.length > 0
    ? model.providers
        .map((p) => {
          const paramsText = p.params && p.params.length > 0 ? ` (${p.params.join(", ")})` : "";
          return `- **${p.api_provider_id}**${paramsText}`;
        })
        .join("\n")
    : "_No providers available_"
}

---

## Aliases

${model.aliases && model.aliases.length > 0 ? model.aliases.map((a) => `- \`${a}\``).join("\n") : "_No aliases_"}

---

[View on AI Stats](${getModelURL(model.model_id)})
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={getModelDisplayName(model)}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open in AI Stats"
            url={getModelURL(model.model_id)}
            icon={Icon.Globe}
          />
          <Action.CopyToClipboard
            title="Copy Model ID"
            content={model.model_id}
            icon={Icon.Clipboard}
          />
          {model.organisation_id && (
            <Action.OpenInBrowser
              title="View Organisation"
              url={getOrganisationURL(model.organisation_id)}
              icon={Icon.Building}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
