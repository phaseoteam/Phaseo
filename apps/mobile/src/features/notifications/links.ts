import type { ModelCard } from "@/lib/api/models";
import { organisationName } from "@/lib/catalogue";

/** Where a tapped notification opens. The app has no lab page, so a lab opens Models filtered to it. */
export type NotificationTarget = { kind: "model"; id: string } | { kind: "lab"; slug: string } | { kind: "provider"; id: string } | { kind: "home" };

// The push contract's paths, plus the website's own, in case the server sends those instead.
const LAB_ROOTS = new Set(["labs", "organisations"]);
const PROVIDER_ROOTS = new Set(["providers", "api-providers"]);

function segments(path: string) {
  return (path.split(/[?#]/)[0] ?? "").split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
}

/** Maps a push's website-style `href` (/models/<lab>/<model>, /labs/<lab>, /providers/<provider>) to a screen; anything else is Home. */
export function targetForHref(href: string): NotificationTarget {
  const [root, first, second] = segments(href);
  // Model pages can have sub-paths on the website; the model ID is always the first two parts.
  if (root === "models" && first && second) return { kind: "model", id: `${first}/${second}` };
  if (root && LAB_ROOTS.has(root) && first) return { kind: "lab", slug: first };
  if (root && PROVIDER_ROOTS.has(root) && first) return { kind: "provider", id: first };
  return { kind: "home" };
}

/** A summary push ("DeepSeek released 12 models") opens the whole group: the lab's models, the provider, or the repriced model. */
function targetForGroup(group: unknown): NotificationTarget | null {
  if (!group || typeof group !== "object") return null;
  const { key, count } = group as { key?: unknown; count?: unknown };
  if (typeof key !== "string" || typeof count !== "number" || count < 2) return null;
  const split = key.indexOf(":");
  // Tolerates the tag form too (the group key plus a UTC date).
  const value = key.slice(split + 1).replace(/:\d{4}-\d{2}-\d{2}$/, "");
  if (split < 1 || !value) return null;
  switch (key.slice(0, split)) {
    case "release": return { kind: "lab", slug: value };
    case "provider": return { kind: "provider", id: value };
    case "price": return value.includes("/") ? { kind: "model", id: value } : null;
    default: return null;
  }
}

/** Where a notification's `data` points. Null when it names nothing, so the tap just opens the app. */
export function notificationTarget(data: Record<string, unknown> | null | undefined): NotificationTarget | null {
  if (!data) return null;
  const group = targetForGroup(data.group);
  if (group) return group;
  if (typeof data.href === "string" && data.href.startsWith("/")) return targetForHref(data.href);
  if (typeof data.modelId === "string" && data.modelId.includes("/")) return { kind: "model", id: data.modelId.trim() };
  return null;
}

/** The Labs filter works on display names; this finds the one for a lab slug. Null for a lab the catalogue doesn't have. */
export function labFilterName(models: Pick<ModelCard, "organisation_id" | "organisation_name" | "model_id">[], slug: string): string | null {
  const model = models.find((entry) => entry.organisation_id === slug) ?? models.find((entry) => entry.model_id.startsWith(`${slug}/`));
  return model ? organisationName(model) : null;
}
