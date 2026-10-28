import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { ArrowUpRight, Bot, BrainCircuit, ChevronDown, CircleDollarSign, Code2, ExternalLink } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { Logo } from "@/components/Logo";
import { Icon, Select, Text, useToneColor } from "@/components/ui";
import { getBenchmarkRankings, getEpochLeaderboard, type ModelBenchmark, type ModelBenchmarkResult } from "@/lib/api/models";
import { cn } from "@/lib/cn";
import { WEB_ORIGIN } from "@/lib/config";
import { useAppearance } from "@/providers/AppearanceProvider";
import {
  AA_METRICS, aaConfigurations, aaRank, aaScoresFor, aaTileScore, aaVersion, configurationLabel, defaultConfiguration, epochNeighbours, formatAaScore, isEpochCapabilitiesIndex,
  localScores, otherHighlights, parseEpochConfidenceInterval, summariseRankings, type AaMetricKey,
} from "./benchmarks";
import { SubHeading } from "./parts";

const METRIC_ICONS: Record<AaMetricKey, typeof BrainCircuit> = { intelligence: BrainCircuit, coding: Code2, agentic: Bot, cost: CircleDollarSign };

/** Artificial Analysis tiles for one model configuration, the Epoch Capabilities Index, then other benchmarks. */
export function BenchmarksSection({ modelId, highlights, results }: { modelId: string; highlights: ModelBenchmark[]; results: ModelBenchmarkResult[] }) {
  const others = otherHighlights(highlights);
  return (
    <View className="gap-8">
      <ArtificialAnalysis modelId={modelId} highlights={highlights} results={results} />
      <Epoch modelId={modelId} highlights={highlights} />
      {others.length ? <OtherBenchmarks highlights={others} /> : null}
    </View>
  );
}

function ArtificialAnalysis({ modelId, highlights, results }: { modelId: string; highlights: ModelBenchmark[]; results: ModelBenchmarkResult[] }) {
  const configurations = useMemo(() => aaConfigurations(results), [results]);
  const [configuration, setConfiguration] = useState(() => defaultConfiguration(configurations));
  // Ranks count every evaluated configuration of every model, from the public leaderboard (kept as a small summary).
  const ranks = useQuery({ queryKey: ["public", "benchmark-rank-summaries"], queryFn: async () => summariseRankings(await getBenchmarkRankings()), staleTime: 6 * 60 * 60_000 });
  const scores = aaScoresFor(configuration, results, highlights);
  if (!scores.length) return null;
  const versions = [...new Set(scores.map((item) => aaVersion(item.otherInfo)).filter(Boolean))];
  return (
    <View>
      <View className="flex-row items-center gap-3">
        <Image source={{ uri: `${WEB_ORIGIN}/benchmarks/artificial-analysis_purple.svg` }} cachePolicy="disk" style={{ width: 32, height: 32 }} contentFit="contain" accessibilityLabel="Artificial Analysis" />
        <View className="flex-1">
          <Text variant="label">Artificial Analysis</Text>
          <Text variant="caption">Independent evaluations{versions.length ? ` · Index v${versions.join(" / v")}` : ""}</Text>
        </View>
      </View>
      {configurations.length > 1 ? (
        <View className="mt-4 flex-row items-center gap-3">
          <Text variant="muted">Model configuration</Text>
          <Select className="flex-1" title="Model configuration" value={configuration} options={configurations.map((value) => ({ value, label: configurationLabel(value) }))} onChange={setConfiguration} />
        </View>
      ) : null}
      <View className="mt-4 flex-row flex-wrap border-t border-border">
        {AA_METRICS.map((metric, index) => {
          const result = aaTileScore(scores, metric.key);
          const id = result?.benchmarkId ?? metric.id;
          const version = aaVersion(result?.otherInfo);
          const rank = result?.score == null ? null : aaRank(ranks.data?.[id], result.score, modelId, version, localScores(results, id, version));
          return (
            <View key={metric.key} className={cn("w-1/2 py-3", index % 2 ? "border-l border-border pl-4" : "pr-4", index > 1 && "border-t border-border")} accessibilityLabel={rank ? `${metric.label}: rank ${rank.rank} of ${rank.total} evaluated configurations` : undefined}>
              <View className="flex-row items-center gap-2">
                <Icon icon={METRIC_ICONS[metric.key]} tone="muted" size={16} />
                <Text variant="small" className="font-medium">{metric.label}</Text>
              </View>
              <View className="mt-2 flex-row items-baseline gap-1.5">
                <Text className="text-[18px] font-semibold leading-6 tracking-tight text-foreground">{result?.score == null ? "—" : formatAaScore(id, result.score)}</Text>
                {result?.score != null && rank ? <Text variant="small" className="font-medium text-muted-foreground">(#{rank.rank})</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      <View className="mt-3 flex-row flex-wrap items-center justify-between gap-3">
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/rankings#benchmarks`)} className="flex-row items-center gap-1">
          <Text variant="caption">View full leaderboard</Text>
          <Icon icon={ArrowUpRight} tone="muted" size={14} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(scores[0]?.sourceLink || "https://artificialanalysis.ai/models")} className="flex-row items-center gap-1">
          <Text variant="caption">Source: Artificial Analysis</Text>
          <Icon icon={ExternalLink} tone="muted" size={14} />
        </Pressable>
      </View>
    </View>
  );
}

const number = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Epoch({ modelId, highlights }: { modelId: string; highlights: ModelBenchmark[] }) {
  const { resolved } = useAppearance();
  const [open, setOpen] = useState(false);
  const leaderboard = useQuery({ queryKey: ["model-page", "epoch-leaderboard"], queryFn: getEpochLeaderboard, enabled: open, staleTime: 6 * 60 * 60_000 });
  const result = highlights.find((item) => isEpochCapabilitiesIndex(item.benchmarkId) && item.score != null);
  if (!result || result.score == null) return null;
  const interval = parseEpochConfidenceInterval(result.otherInfo);
  return (
    <View>
      <Image source={{ uri: `${WEB_ORIGIN}/benchmarks/${resolved === "dark" ? "epoch-ai_dark" : "epoch-ai"}.svg` }} cachePolicy="disk" style={{ width: 127, height: 22 }} contentFit="contain" contentPosition="left" accessibilityLabel="Epoch AI" />
      <Text variant="caption" className="mt-1.5">Capabilities Index</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="mt-4 flex-row items-center justify-between gap-6 border-y border-border py-5">
        <View className="flex-1">
          <Text variant="small" className="font-medium">Epoch Capabilities Index</Text>
          <View className="mt-2 flex-row flex-wrap items-baseline gap-x-4 gap-y-2">
            <Text className="text-[18px] font-semibold leading-6 tracking-tight text-foreground">{result.score.toLocaleString("en-US", { maximumFractionDigits: 2 })}</Text>
            {interval ? (
              <View className="flex-row items-baseline gap-2 border-l border-border pl-4">
                <Text variant="caption">95% confidence interval</Text>
                <Text variant="small" className="font-medium">{number(interval.low)}–{number(interval.high)}</Text>
              </View>
            ) : null}
          </View>
          {result.rank ? <Text variant="caption" className="mt-1 font-medium">{result.totalModels ? `Ranked #${result.rank} of ${result.totalModels}` : `Ranked #${result.rank}`}</Text> : null}
        </View>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><Icon icon={ChevronDown} tone="muted" size={20} /></View>
      </Pressable>
      {open ? (
        <View className="border-b border-border py-5">
          <Text variant="small" className="font-medium">ECI leaderboard</Text>
          <Text variant="caption">Higher is better · bars show the published 95% confidence interval</Text>
          {leaderboard.data?.length ? <EpochChart modelId={modelId} entries={epochNeighbours(leaderboard.data, modelId)} /> : <Text variant="muted" className="py-4">{leaderboard.isLoading ? "Loading…" : "Leaderboard data is not available yet."}</Text>}
          <View className="mt-4 flex-row flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(result.sourceLink ?? "https://epoch.ai/eci")} className="flex-row items-center gap-1">
              <Text variant="caption">Source: Epoch AI</Text>
              <Icon icon={ArrowUpRight} tone="muted" size={14} />
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/benchmarks/epoch-capabilities-index`)} className="flex-row items-center gap-1 rounded-md border border-border px-3 py-1.5">
              <Text variant="caption" className="text-foreground">View full leaderboard</Text>
              <Icon icon={ArrowUpRight} tone="muted" size={14} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function EpochChart({ modelId, entries }: { modelId: string; entries: Awaited<ReturnType<typeof getEpochLeaderboard>> }) {
  const router = useRouter();
  const foreground = useToneColor("foreground");
  const muted = useToneColor("muted");
  const values = entries.flatMap((entry) => {
    const ci = parseEpochConfidenceInterval(entry.otherInfo);
    return ci ? [ci.low, ci.high] : [entry.score];
  });
  const min = Math.min(...values);
  const span = Math.max(Math.max(...values) - min, 1);
  const width = 120;
  const at = (value: number) => ((value - min) / span) * width;
  return (
    <View className="mt-4 gap-2.5">
      {entries.map((entry) => {
        const ci = parseEpochConfidenceInterval(entry.otherInfo);
        const selected = entry.modelId === modelId;
        const colour = selected ? foreground : muted;
        return (
          <Pressable key={entry.modelId} accessibilityRole="link" onPress={selected ? undefined : () => router.push(`/models/${entry.modelId}`)} className="flex-row items-center gap-2">
            <Text variant="caption" className="w-8 text-right">#{entry.rank}</Text>
            <Logo id={entry.organisationId ?? entry.modelId} label={entry.modelName} size={18} />
            <Text variant="caption" numberOfLines={1} className={cn("flex-1", selected && "font-semibold text-foreground")}>{entry.modelName}</Text>
            <Svg width={width + 8} height={14}>
              {ci ? (
                <>
                  <Line x1={4 + at(ci.low)} x2={4 + at(ci.high)} y1={7} y2={7} stroke={colour} strokeWidth={1} />
                  <Line x1={4 + at(ci.low)} x2={4 + at(ci.low)} y1={3} y2={11} stroke={colour} strokeWidth={1} />
                  <Line x1={4 + at(ci.high)} x2={4 + at(ci.high)} y1={3} y2={11} stroke={colour} strokeWidth={1} />
                </>
              ) : null}
              <Circle cx={4 + at(entry.score)} cy={7} r={selected ? 4.5 : 3.5} fill={colour} />
            </Svg>
            <Text variant="caption" className={cn("w-14 text-right", selected && "font-semibold text-foreground")}>{number(entry.score)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OtherBenchmarks({ highlights }: { highlights: ModelBenchmark[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="border-t border-border">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="flex-row items-center justify-between py-4">
        <SubHeading>Other benchmarks</SubHeading>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><Icon icon={ChevronDown} tone="muted" size={18} /></View>
      </Pressable>
      {open ? (
        <View className="overflow-hidden rounded-md border border-border">
          {highlights.map((item, index) => (
            <Pressable key={item.benchmarkId || index} disabled={!item.sourceLink} onPress={() => void Linking.openURL(item.sourceLink!)} className={cn("flex-row items-center gap-3 px-3 py-3 active:bg-accent", index < highlights.length - 1 && "border-b border-border")}>
              <View className="flex-1">
                <Text variant="small" className="font-medium">{item.benchmarkName ?? item.benchmarkId}</Text>
                {item.rank && item.totalModels ? <Text variant="caption">Ranked #{item.rank} of {item.totalModels}{item.isSelfReported ? " · Self-reported" : ""}</Text> : item.isSelfReported ? <Text variant="caption">Self-reported</Text> : null}
              </View>
              <Text variant="small" className="font-semibold">{item.scoreDisplay ?? (item.score != null ? String(item.score) : "—")}{item.isPercentage ? "%" : ""}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
