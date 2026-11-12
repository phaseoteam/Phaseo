import { AUDIO_FAMILY_GROUPS, isAudioFamilyOpen, toggleOutputModality } from "./audioFamily";

export const DECISIONS_FAMILY_GROUPS = ["decision", "extraction"] as const;
export function outputFamily(value: string): "audio" | "decisions" | null {
  if (value === "audio" || (AUDIO_FAMILY_GROUPS as readonly string[]).includes(value)) return "audio";
  if (value === "decisions" || (DECISIONS_FAMILY_GROUPS as readonly string[]).includes(value)) return "decisions";
  return null;
}
export function selectedOutputFamily(selected: readonly string[]): "audio" | "decisions" | null {
  if (selected.some(value => outputFamily(value) === "decisions")) return "decisions";
  return isAudioFamilyOpen(selected) ? "audio" : null;
}
export function toggleOutputFamily(selected: readonly string[], value: string): string[] {
  if (outputFamily(value) !== "decisions") return toggleOutputModality(selected, value);
  const rest = selected.filter(item => outputFamily(item) !== "decisions");
  if (value === "decisions") return selected.some(item => outputFamily(item) === "decisions") ? rest : [...rest, value];
  return [...rest, selected.includes(value) ? "decisions" : value];
}
