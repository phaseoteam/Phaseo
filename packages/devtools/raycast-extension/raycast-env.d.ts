/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Key - Your Phaseo API key */
  "apiKey": string,
  /** API URL - Custom API URL (optional) */
  "apiUrl": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `models` command */
  export type Models = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `models` command */
  export type Models = {}
}

