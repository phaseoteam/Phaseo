import { DEFAULT_THEME, type ThemeFields } from "./model";
import {
  decideSync,
  INITIAL_APPEARANCE,
  mergeThemeIntoPreferences,
  parseStoredAppearance,
  withAccountTheme,
  withLocalChange,
  type StoredAppearance,
} from "./sync";

const EMBER: ThemeFields = { lightPalette: "warm", darkPalette: "midnight", lightAccent: "#c2410c", darkAccent: "#fb923c" };
const CUSTOM: ThemeFields = { ...DEFAULT_THEME, lightAccent: "#fbbf24" };
const state = (overrides: Partial<StoredAppearance>): StoredAppearance => ({ ...INITIAL_APPEARANCE, ...overrides });

describe("parseStoredAppearance", () => {
  it("starts from the old mode-only key when there's no record", () => {
    expect(parseStoredAppearance(null, "dark")).toEqual({ ...INITIAL_APPEARANCE, mode: "dark" });
    expect(parseStoredAppearance(null, null)).toEqual(INITIAL_APPEARANCE);
    expect(parseStoredAppearance("not json", "light").mode).toBe("light");
  });

  it("reads a stored record and drops anything malformed", () => {
    const stored = { mode: "light", theme: EMBER, pending: { userId: "user-1", changedAt: 5 }, synced: { userId: "user-1", theme: DEFAULT_THEME } };
    expect(parseStoredAppearance(JSON.stringify(stored), "dark")).toEqual(stored);
    expect(parseStoredAppearance(JSON.stringify({ mode: "sepia", theme: { lightAccent: "nope" }, pending: { userId: 7 }, synced: { theme: EMBER } }), null)).toEqual({
      mode: "system",
      theme: DEFAULT_THEME,
      pending: { userId: null, changedAt: 0 },
      synced: null,
    });
  });
});

describe("decideSync (last change wins)", () => {
  it("does nothing when the device and account agree", () => {
    expect(decideSync(state({ theme: EMBER, pending: { userId: "user-1", changedAt: 1 } }), "user-1", EMBER)).toEqual({ kind: "settled" });
  });

  it("takes the account's theme when nothing changed here", () => {
    expect(decideSync(state({ theme: DEFAULT_THEME }), "user-1", EMBER)).toEqual({ kind: "adopt", theme: EMBER });
  });

  it("saves a change made here for this account", () => {
    expect(decideSync(state({ theme: CUSTOM, pending: { userId: "user-1", changedAt: 1 } }), "user-1", EMBER)).toEqual({ kind: "push" });
  });

  it("saves a change made signed out to the account that signs in", () => {
    expect(decideSync(state({ theme: CUSTOM, pending: { userId: null, changedAt: 1 } }), "user-2", EMBER)).toEqual({ kind: "push" });
  });

  it("doesn't copy one account's unsaved change to another", () => {
    expect(decideSync(state({ theme: CUSTOM, pending: { userId: "user-1", changedAt: 1 } }), "user-2", EMBER)).toEqual({ kind: "adopt", theme: EMBER });
  });
});

describe("state changes", () => {
  it("marks a change made here as waiting for the signed-in account", () => {
    expect(withLocalChange(INITIAL_APPEARANCE, EMBER, "user-1", 10)).toEqual({ ...INITIAL_APPEARANCE, theme: EMBER, pending: { userId: "user-1", changedAt: 10 } });
    expect(withLocalChange(INITIAL_APPEARANCE, EMBER, null, 10).pending).toEqual({ userId: null, changedAt: 10 });
    expect(withLocalChange(INITIAL_APPEARANCE, DEFAULT_THEME, "user-1", 10)).toBe(INITIAL_APPEARANCE);
  });

  it("clears the pending change only once the account has that theme", () => {
    const pending = state({ theme: CUSTOM, pending: { userId: "user-1", changedAt: 1 } });
    expect(withAccountTheme(pending, "user-1", CUSTOM, false)).toEqual({ ...pending, pending: null, synced: { userId: "user-1", theme: CUSTOM } });
    // The save finished after another change here: keep that one for the next save.
    expect(withAccountTheme(pending, "user-1", EMBER, false)).toEqual({ ...pending, synced: { userId: "user-1", theme: EMBER } });
    expect(withAccountTheme(pending, "user-1", EMBER, true)).toEqual({ ...pending, theme: EMBER, pending: null, synced: { userId: "user-1", theme: EMBER } });
  });

  it("sends the account's other preferences back unchanged with the theme", () => {
    const account = { locale: "en-GB", timeZone: "Europe/London", lightPalette: "phaseo", darkPalette: "phaseo", lightAccent: "#0069a8", darkAccent: "#0078b8", maskSensitiveData: true, landingPage: "monitor" };
    expect(mergeThemeIntoPreferences(account, EMBER)).toEqual({ ...account, ...EMBER });
  });
});
