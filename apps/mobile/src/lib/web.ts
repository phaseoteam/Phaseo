import * as WebBrowser from "expo-web-browser";
import { WEB_ORIGIN } from "./config";

/** A phaseo.app page ("/settings/credits") as a full address. */
export const webUrl = (path: string) => new URL(path, WEB_ORIGIN).toString();

/**
 * Opens a page in the in-app browser (Chrome Custom Tabs), which shares the phone browser's phaseo.app sign-in.
 * Used for what the app links out to: settings without an app screen, legal pages and docs.
 */
export function openWeb(pathOrUrl: string) {
  return WebBrowser.openBrowserAsync(pathOrUrl.startsWith("http") ? pathOrUrl : webUrl(pathOrUrl)).catch(() => undefined);
}
