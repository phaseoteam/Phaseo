import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ExternalLink, Scale } from "lucide-react-native";
import { useDeferredValue, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, EmptyState, Fact, Header, ReadableWidth, Row, Screen, SearchField, Section, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { formatNumber } from "@/lib/format";
import { openWeb } from "@/lib/web";
import { findLicence, licenceName, licencePackages, licenceSections, licenceText, shownCopyright, type Licence } from "./licences";

type Item = { type: "header"; key: string; licence: string; count: number } | { type: "package"; key: string; entry: Licence };

/** Every open source package in the app, grouped by licence and searchable; each opens its full licence text. */
export function LicencesScreen() {
  const router = useRouter();
  const { split } = useLayout();
  const packages = licencePackages();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const items = useMemo<Item[]>(() => licenceSections(packages, deferred).flatMap((section) => [
    { type: "header" as const, key: `h:${section.licence}`, licence: section.licence, count: section.packages.length },
    ...section.packages.map((entry) => ({ type: "package" as const, key: `${entry.name}@${entry.version}`, entry })),
  ]), [packages, deferred]);

  return (
    <Screen>
      <Header back={!split} title="Open source licences" subtitle={`${formatNumber(packages.length)} packages`} />
      <View className="gap-2 px-4 pb-2">
        <Text variant="muted">Phaseo is built with these open source packages. Thank you to everyone who makes them.</Text>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search packages or licences" />
      </View>
      <View className="flex-1 overflow-hidden">
        <LegendList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          estimatedItemSize={56}
          recycleItems
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState icon={Scale} title="No packages found" body="Search looks through package names, licences and copyright holders." />}
          renderItem={({ item }) => item.type === "header" ? (
            <View className="flex-row items-baseline justify-between px-4 pb-1 pt-5">
              <Text variant="label">{licenceName(item.licence)}</Text>
              <Text variant="caption">{`${formatNumber(item.count)} ${item.count === 1 ? "package" : "packages"}`}</Text>
            </View>
          ) : (
            <Row
              title={item.entry.name}
              subtitle={[item.entry.version, shownCopyright(item.entry)?.split("\n")[0]].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/account/licence", params: { name: item.entry.name, version: item.entry.version } })}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
    </Screen>
  );
}

/** One package: its version, licence, copyright and the licence text it ships with. */
export function LicenceScreen() {
  const { name, version } = useLocalSearchParams<{ name: string; version: string }>();
  const entry = name && version ? findLicence(name, version) : null;
  const text = entry ? licenceText(entry) : null;
  return (
    <Screen>
      <Header back title={entry?.name ?? "Licence"} subtitle={entry ? `${entry.version} · ${licenceName(entry.licence)}` : null} />
      {!entry ? <EmptyState title="Package not found" /> : (
        <ScrollView contentContainerClassName="pb-16">
          <ReadableWidth>
            <Section className="mt-2">
              <Fact label="Version" value={entry.version} />
              <Fact label="Licence" value={licenceName(entry.licence)} />
              <Fact label="Copyright" value={shownCopyright(entry) ?? "Not stated"} last />
            </Section>
            <Section title="Licence text">
              {text ? (
                <Text variant="mono" selectable className="px-4 text-[12px] leading-[18px] text-foreground">{text}</Text>
              ) : (
                <View className="gap-3 px-4">
                  <Text variant="muted">{`This package doesn't include a licence file. Its package information says it's published under ${licenceName(entry.licence)}.`}</Text>
                  {/^[A-Za-z0-9.-]+$/.test(entry.licence) ? <Button label={`Read ${entry.licence} on spdx.org`} icon={ExternalLink} variant="outline" onPress={() => void openWeb(`https://spdx.org/licenses/${entry.licence}.html`)} /> : null}
                </View>
              )}
            </Section>
          </ReadableWidth>
        </ScrollView>
      )}
    </Screen>
  );
}
