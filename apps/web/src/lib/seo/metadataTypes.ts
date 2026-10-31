// `next` is only imported for types (Metadata, Viewport...).
// The build strips type-only imports; these are the shapes the app uses.
/* eslint-disable @typescript-eslint/no-explicit-any -- Next's metadata is an open-ended object */

export type Metadata = { [key: string]: any };
export type Viewport = { [key: string]: any };
export type ResolvingMetadata = Promise<Metadata>;
export type NextPage<P = object> = (props: P) => unknown;
