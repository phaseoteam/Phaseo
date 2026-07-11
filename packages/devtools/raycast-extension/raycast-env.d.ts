/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Key - Your Phaseo API key */
  "apiKey": string,
  /** Management API Key - Required only for Usage & Credits and Recent Gateway Activity. Create a Raycast-scoped management key in Phaseo Settings. */
  "managementApiKey"?: string,
  /** API URL - Custom API URL (optional) */
  "apiUrl": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `models` command */
  export type Models = ExtensionPreferences & {}
  /** Preferences accessible in the `organisations` command */
  export type Organisations = ExtensionPreferences & {}
  /** Preferences accessible in the `providers` command */
  export type Providers = ExtensionPreferences & {}
  /** Preferences accessible in the `usage-credits` command */
  export type UsageCredits = ExtensionPreferences & {}
  /** Preferences accessible in the `recent-activity` command */
  export type RecentActivity = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `models` command */
  export type Models = {}
  /** Arguments passed to the `organisations` command */
  export type Organisations = {}
  /** Arguments passed to the `providers` command */
  export type Providers = {}
  /** Arguments passed to the `usage-credits` command */
  export type UsageCredits = {}
  /** Arguments passed to the `recent-activity` command */
  export type RecentActivity = {}
}

