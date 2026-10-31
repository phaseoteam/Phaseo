/**
 * How spend rules, department budgets and department rate limits count a person's requests toward departments when their key has no department of its own: all counts them toward every department they belong to; primary counts them toward their primary department only. A key's own department and a member's directory override always win.
 */
export type WorkspaceSpendAttribution = "all" | "primary";
