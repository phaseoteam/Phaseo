// Page metadata shapes used by the SEO helpers and route `head` builders.
/* eslint-disable @typescript-eslint/no-explicit-any -- page metadata is an open-ended object */

export type PageMetadata = { [key: string]: any };
export type PageViewport = { [key: string]: any };
export type ResolvingMetadata = Promise<PageMetadata>;
