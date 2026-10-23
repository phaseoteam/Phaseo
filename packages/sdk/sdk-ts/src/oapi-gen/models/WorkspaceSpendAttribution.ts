/**
 * How spend rules count a person's spend toward departments when their key has no department of its own: all counts it toward every department they belong to; primary counts it toward their primary department only. A key's own department always wins.
 */
export type WorkspaceSpendAttribution = "all" | "primary";
