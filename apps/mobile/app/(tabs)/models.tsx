import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Search } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ProviderLogo } from "@/components/ProviderLogo";
import { EmptyState, PageIntro, Row, Screen, usePalette } from "@/components/ui";
import { getModels, getModelsPage, MODELS_PAGE_SIZE } from "@/lib/api";
import { colour, font, radius, space } from "@/theme";

export default function ModelsScreen() {
  const p = usePalette();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const hasSearch = debouncedQuery.length > 0;
  const catalogue = useInfiniteQuery({
    queryKey: ["models", "catalogue"],
    queryFn: ({ pageParam }) => getModelsPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: page => {
      const nextOffset = page.offset + page.models.length;
      return nextOffset < page.total ? nextOffset : undefined;
    },
    enabled: !hasSearch
  });
  const search = useQuery({
    queryKey: ["models", "search", debouncedQuery],
    queryFn: () => getModels(debouncedQuery),
    enabled: hasSearch,
    placeholderData: previous => previous
  });

  const catalogueModels = useMemo(() => catalogue.data?.pages.flatMap(page => page.models) ?? [], [catalogue.data]);
  const models = hasSearch ? search.data ?? [] : catalogueModels;
  const isLoading = hasSearch ? search.isLoading : catalogue.isLoading;
  const isError = models.length === 0 && (hasSearch ? search.isError : catalogue.isError);
  const isRefreshing = hasSearch ? search.isRefetching : catalogue.isRefetching && !catalogue.isFetchingNextPage;

  const loadMore = () => {
    if (!hasSearch && catalogue.hasNextPage && !catalogue.isFetchingNextPage) void catalogue.fetchNextPage();
  };
  const refresh = () => { void (hasSearch ? search.refetch() : catalogue.refetch()); };

  return <Screen>
    <PageIntro eyebrow="Catalogue" title="Explore models" body="Browse AI models by provider, capability, pricing and availability." />
    <View style={[styles.search, { borderColor: p.border, backgroundColor: p.surface }]}>
      <Search size={17} color={p.muted} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Search models, creators or IDs" placeholderTextColor={p.muted} style={[styles.input, { color: p.text }]} autoCapitalize="none" autoCorrect={false} />
    </View>
    {isLoading ? <ActivityIndicator style={styles.loader} color={colour.blue} /> : <FlatList
      data={isError ? [] : models}
      keyExtractor={item => item.id}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colour.blue} />}
      contentContainerStyle={models.length && !isError ? styles.list : styles.fill}
      ListEmptyComponent={isError ? <EmptyState title="Catalogue unavailable" body="Pull to try loading the catalogue again." /> : <EmptyState title="No models found" body="Try a broader model name, creator or model ID." />}
      ListFooterComponent={!hasSearch && catalogue.isFetchingNextPage ? <ActivityIndicator style={styles.footerLoader} color={colour.blue} /> : !hasSearch && catalogue.isFetchNextPageError ? <Pressable onPress={loadMore} style={styles.retry}><Text style={[styles.retryText, { color: colour.blue }]}>Couldn&apos;t load more. Tap to retry.</Text></Pressable> : models.length > MODELS_PAGE_SIZE && !hasSearch && !catalogue.hasNextPage ? <Text style={[styles.endText, { color: p.muted }]}>All {models.length.toLocaleString()} models loaded</Text> : null}
      renderItem={({ item }) => <Row leading={<ProviderLogo id={item.organisation_id ?? item.id.split("/")[0]} label={item.organisation?.name ?? item.organisation_name ?? item.id.split("/")[0]} />} title={item.name ?? item.id.split("/").at(-1) ?? item.id} subtitle={`${item.organisation?.name ?? item.organisation_name ?? item.id.split("/")[0]} · ${item.id}`} onPress={() => router.push({ pathname: "/model/[id]", params: { id: item.id } })} />}
    />}
  </Screen>;
}

const styles = StyleSheet.create({
  search: { margin: space.lg, marginTop: space.xl, height: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
  input: { flex: 1, fontFamily: font.regular, fontSize: 14 },
  loader: { marginTop: 48 },
  list: { paddingBottom: 40 },
  fill: { flexGrow: 1, justifyContent: "center" },
  footerLoader: { paddingVertical: space.xl },
  retry: { padding: space.xl, alignItems: "center" },
  retryText: { fontFamily: font.semibold, fontSize: 12 },
  endText: { paddingVertical: space.xl, textAlign: "center", fontFamily: font.regular, fontSize: 11 }
});
