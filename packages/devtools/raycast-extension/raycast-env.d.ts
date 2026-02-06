/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Key - Your AI Stats API key from api.phaseo.app */
  "apiKey": string,
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
}

declare namespace Arguments {
  /** Arguments passed to the `models` command */
  export type Models = {}
  /** Arguments passed to the `organisations` command */
  export type Organisations = {}
  /** Arguments passed to the `providers` command */
  export type Providers = {}
}

