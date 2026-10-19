/**
 * Android notification channels, scheme 2 of the push v2 contract. The server picks a push's channel
 * from its category, but only for phones registered with `channelScheme: 2`; older registrations get
 * everything on the scheme-1 channel, `model-updates`. Android doesn't show a push whose channel the
 * phone lacks, so the old channel stays until a server has accepted scheme 2 (see registration.ts).
 *
 * No native imports here, so the table and its rules can be tested; device.ts creates the channels.
 */

export type ChannelImportance = "low" | "default" | "high";
export type ChannelSpec = { id: string; name: string; importance: ChannelImportance; description: string };

/** Matches the expo-notifications plugin colour in app.json. */
export const BRAND_COLOR = "#2563eb";

// Low is silent with no pop-up; default makes a sound; high makes a sound and pops up.
// The descriptions also show in Android's settings and as the category rows on the Notifications screen.
export const CHANNELS = [
  { id: "new-models", name: "New models", importance: "default", description: "New releases and models that become available on Phaseo" },
  { id: "prices-providers", name: "Prices and providers", importance: "low", description: "Price changes and new providers, without sound" },
  { id: "deprecations", name: "Deprecations", importance: "default", description: "Deprecations and retirements, including models your workspace uses" },
  { id: "money", name: "Money", importance: "high", description: "Low balance, failed top-ups and expiring payment methods" },
  { id: "traffic", name: "Your traffic", importance: "high", description: "Rate limiting and model substitutions on your requests" },
  { id: "security", name: "Security", importance: "high", description: "API key activity and leaked keys" },
  { id: "jobs", name: "Jobs", importance: "default", description: "Batches and other long-running jobs when they finish" },
  { id: "account", name: "Account", importance: "default", description: "Changes to your account and team" },
  { id: "digest", name: "Digest", importance: "low", description: "Your Phaseo week, once a week, without sound" },
  { id: "tests", name: "Tests", importance: "default", description: "Test notifications you send from the app" },
] as const satisfies readonly ChannelSpec[];

export type ChannelId = (typeof CHANNELS)[number]["id"];

/** Scheme 1's only channel. Old builds have just this one, and old servers send everything to it. */
export const LEGACY_CHANNEL: ChannelSpec = {
  id: "model-updates",
  name: "Model updates",
  importance: "default",
  description: "New models, availability on Phaseo, price changes and deprecations that match your rules.",
};

/** The test push is always allowed, so it has a channel but no category. */
export const TEST_CHANNEL_ID = "tests";

export type Category = Exclude<ChannelId, typeof TEST_CHANNEL_ID>;
export const CATEGORY_CHANNELS = CHANNELS.filter((channel): channel is Extract<(typeof CHANNELS)[number], { id: Category }> => channel.id !== TEST_CHANNEL_ID);
export const CATEGORIES: Category[] = CATEGORY_CHANNELS.map((channel) => channel.id);

/**
 * The server's `categories`, with every category this app knows filled in (a missing one means its
 * default, which is on for all of them). Null when the server predates categories, so the screen can
 * hide them rather than show switches that do nothing.
 */
export function categoriesFrom(raw: unknown): Record<Category, boolean> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = raw as Record<string, unknown>;
  return Object.fromEntries(CATEGORIES.map((category) => [category, typeof values[category] === "boolean" ? values[category] : true])) as Record<Category, boolean>;
}

export type ChannelInput = { name: string; description: string; importance: ChannelImportance; lightColor: string };
export type ChannelApi = { set(id: string, channel: ChannelInput): Promise<unknown>; remove(id: string): Promise<unknown> };

export function channelInput(channel: ChannelSpec): ChannelInput {
  return { name: channel.name, description: channel.description, importance: channel.importance, lightColor: BRAND_COLOR };
}

/** Creates the scheme-2 channels, or renames them if they exist (Android keeps the user's own changes to them). */
export async function createChannels(api: ChannelApi) {
  await Promise.all(CHANNELS.map((channel) => api.set(channel.id, channelInput(channel))));
}
