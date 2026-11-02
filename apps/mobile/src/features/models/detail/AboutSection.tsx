import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Archive, ArrowLeft, ArrowRight, Ban, ChevronRight, ExternalLink, FileAudio, FileImage, Megaphone, Rocket, ShieldCheck, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button, Icon, Text } from "@/components/ui";
import type { ModelDetail, ModelSubscription } from "@/lib/api/models";
import { cn } from "@/lib/cn";
import { WEB_ORIGIN } from "@/lib/config";
import { MONEY_LOCALE } from "@/lib/format";
import { useAppearance } from "@/providers/AppearanceProvider";
import { detailValue, formatKeyDate, formatLongCount, genericLinks, licenceLabel, licenceUrl, linkLabel, modalityTags, parseTypes, relativeDateLabel, type Lineage } from "./about";
import { ModalityTag, SubHeading } from "./parts";

const KEY_DATES: { key: "announcement_date" | "release_date" | "deprecation_date" | "retirement_date"; label: string; icon: LucideIcon; light: string; dark: string }[] = [
  { key: "announcement_date", label: "Announcement", icon: Megaphone, light: "#1d4ed8", dark: "#93c5fd" },
  { key: "release_date", label: "Release", icon: Rocket, light: "#047857", dark: "#6ee7b7" },
  { key: "deprecation_date", label: "Deprecation", icon: Ban, light: "#b45309", dark: "#fcd34d" },
  { key: "retirement_date", label: "Retirement", icon: Archive, light: "#3f3f46", dark: "#d4d4d8" },
];

function GridCell({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <View className={cn("px-3 py-2.5", !last && "border-b border-border")}>
      <Text variant="caption">{label}</Text>
      <View className="mt-1">{children}</View>
    </View>
  );
}

const NotListed = () => <Text variant="small" className="font-medium text-muted-foreground">Not listed</Text>;

/** "Key dates, capabilities, and model metadata": timeline cards, model details, modalities, links and related models. */
export function AboutSection({ model, related }: { model: ModelDetail; related: Lineage }) {
  const router = useRouter();
  const { resolved } = useAppearance();
  const inputs = modalityTags(parseTypes(model.input_types ?? model.input_modalities));
  const outputs = modalityTags(parseTypes(model.output_types ?? model.output_modalities));
  const licenceLink = licenceUrl(model);
  const licence = licenceLabel(detailValue(model, "license") ?? model.license ?? null);
  const details: [string, string | null][] = [
    ["Parameters", formatLongCount(detailValue(model, "parameter_count"))],
    ["Active parameters", formatLongCount(detailValue(model, "active_parameter_count"))],
  ];
  const links = genericLinks(model.model_links);
  return (
    <View className="gap-2">
      <View className="overflow-hidden rounded-md border border-border">
        {KEY_DATES.map((entry, index) => {
          const value = model[entry.key];
          const accent = value ? (resolved === "dark" ? entry.dark : entry.light) : undefined;
          const relative = value ? relativeDateLabel(value) : null;
          return (
            <View key={entry.key} className={cn("px-3 py-3", index < KEY_DATES.length - 1 && "border-b border-border")}>
              <View className="flex-row items-center gap-1.5">
                <Icon icon={entry.icon} tone="muted" size={14} color={accent} />
                <Text variant="caption" className="font-medium" style={accent ? { color: accent } : undefined}>{entry.label}</Text>
              </View>
              {value ? (
                <View className="mt-2 flex-row flex-wrap items-baseline gap-x-1.5">
                  <Text variant="label" style={{ color: accent }}>{formatKeyDate(value)}</Text>
                  {relative ? <><Text variant="caption" className="opacity-50">·</Text><Text variant="caption">{relative}</Text></> : null}
                </View>
              ) : (
                <Text variant="small" className="mt-2 font-medium text-muted-foreground">Not listed</Text>
              )}
            </View>
          );
        })}
      </View>

      <View className="overflow-hidden rounded-md border border-border">
        {details.map(([label, value]) => (
          <GridCell key={label} label={label}>{value ? <Text variant="small" className="font-semibold capitalize">{value}</Text> : <NotListed />}</GridCell>
        ))}
        <GridCell label="License">
          {licenceLink ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(licenceLink)} className="flex-row items-center gap-1">
              <Text variant="small" numberOfLines={1} className="shrink font-semibold">{licence ?? "View license"}</Text>
              <Icon icon={ExternalLink} tone="muted" size={14} />
            </Pressable>
          ) : licence ? <Text variant="small" className="font-semibold">{licence}</Text> : <NotListed />}
        </GridCell>
        <GridCell label="Training tokens" last>{formatLongCount(detailValue(model, "training_tokens")) ? <Text variant="small" className="font-semibold capitalize">{formatLongCount(detailValue(model, "training_tokens"))}</Text> : <NotListed />}</GridCell>
      </View>

      <View className="overflow-hidden rounded-md border border-border">
        {([["Input", inputs], ["Output", outputs]] as const).map(([label, tags], index) => (
          <GridCell key={label} label={label} last={index === 1}>
            {tags.length ? (
              <View className="flex-row flex-wrap gap-1.5">
                {tags.map((tag) => <ModalityTag key={tag.key} modality={tag.key} label={tag.label} icon={tag.icon} />)}
              </View>
            ) : <NotListed />}
          </GridCell>
        ))}
      </View>

      {links.length ? (
        <View className="mt-4 gap-2">
          <SubHeading>Links</SubHeading>
          <View className="overflow-hidden rounded-md border border-border">
            {links.map((link, index) => (
              <Pressable key={link.url} accessibilityRole="link" onPress={() => void Linking.openURL(link.url)} className={cn("flex-row items-center gap-3 px-3 py-3 active:bg-accent", index < links.length - 1 && "border-b border-border")}>
                <View className="flex-1">
                  <Text variant="small" className="font-semibold">{linkLabel(link)}</Text>
                  <Text variant="caption" numberOfLines={1}>{hostOf(link.url)}</Text>
                </View>
                <Icon icon={ExternalLink} tone="muted" size={16} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {related.previous || related.next || model.family_id ? (
        <View className="mt-4 gap-2">
          <SubHeading>Related models</SubHeading>
          {related.previous ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/models/${related.previous!.modelId}`)} className="flex-row items-center gap-3 rounded-md border border-border px-3 py-3 active:bg-accent">
              <Icon icon={ArrowLeft} tone="muted" size={16} />
              <View className="flex-1">
                <Text variant="caption">Previous model</Text>
                <Text variant="small" numberOfLines={1} className="font-semibold">{related.previous.modelName}</Text>
              </View>
            </Pressable>
          ) : null}
          {related.next ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/models/${related.next!.modelId}`)} className="flex-row items-center gap-3 rounded-md border border-border px-3 py-3 active:bg-accent">
              <View className="flex-1">
                <Text variant="caption">Next model</Text>
                <Text variant="small" numberOfLines={1} className="font-semibold">{related.next.modelName}</Text>
              </View>
              <Icon icon={ArrowRight} tone="muted" size={16} />
            </Pressable>
          ) : null}
          {model.family_id ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/families/${model.family_id}`)} className="flex-row items-center justify-between gap-3 rounded-md border border-border px-3 py-3 active:bg-accent">
              <Text variant="small" numberOfLines={1} className="flex-1 font-semibold">View model family</Text>
              <Icon icon={ChevronRight} tone="muted" size={16} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function hostOf(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

/** "Check generated media for known OpenAI provenance signals", for models that make images or audio. */
export function VerificationBlock({ outputTypes }: { outputTypes: string[] }) {
  const joined = outputTypes.join(",");
  const image = /(^|[^a-z])image([^a-z]|$)/i.test(joined);
  const audio = /(^|[^a-z])(audio|speech|music|tts)([^a-z]|$)/i.test(joined);
  return (
    <View className="rounded-md border border-border bg-muted/30 p-4">
      <View className="flex-row gap-4">
        <View className="h-11 w-11 items-center justify-center rounded-md border border-border bg-background"><Icon icon={ShieldCheck} tone="link" size={20} /></View>
        <View className="flex-1">
          <Text variant="label">Verify a generated file</Text>
          <Text variant="muted" className="mt-1">{`Upload ${image && audio ? "an image or audio file" : image ? "an image" : "an audio file"} to look for supported C2PA and SynthID signals. A negative result does not prove that a file is human-made.`}</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {image ? <View className="flex-row items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1"><Icon icon={FileImage} tone="muted" size={14} /><Text variant="caption">Images</Text></View> : null}
            {audio ? <View className="flex-row items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1"><Icon icon={FileAudio} tone="muted" size={14} /><Text variant="caption">Audio</Text></View> : null}
          </View>
        </View>
      </View>
      <Button className="mt-4" label="Open checker" variant="outline" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/tools/content-provenance`)} />
    </View>
  );
}

const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount); } catch { return `${amount} ${currency}`; }
};

/** Plans that include the model ("Commercial plans and bundled access that currently include this model"). */
export function SubscriptionsList({ plans }: { plans: ModelSubscription[] }) {
  return (
    <View className="gap-2">
      {plans.map((plan, index) => (
        <Pressable key={plan.plan_id ?? plan.name ?? index} accessibilityRole={plan.link ? "link" : undefined} disabled={!plan.link} onPress={() => void Linking.openURL(plan.link!)} className="rounded-md border border-border p-4 active:bg-accent">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text variant="label">{plan.name ?? "Plan"}</Text>
              {plan.organisation?.name ? <Text variant="caption" className="mt-0.5">{plan.organisation.name}</Text> : null}
              {plan.description ? <Text variant="muted" numberOfLines={3} className="mt-1.5">{plan.description}</Text> : null}
            </View>
            {plan.prices[0] ? <Text variant="small" className="font-semibold">{money(plan.prices[0].price, plan.prices[0].currency)} / {plan.prices[0].frequency}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
