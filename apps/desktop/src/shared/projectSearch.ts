/** One line of a project content search. `column` is where the match starts in `text`, 1-based. */
export type ProjectContentMatch = { path: string; line: number; column: number; text: string };
/** `truncated` when there were more matches than a search returns. */
export type ProjectContentSearch = { matches: ProjectContentMatch[]; truncated: boolean };
