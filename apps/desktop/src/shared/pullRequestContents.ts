import type { PullRequestFilesQuery } from "./pullRequestFiles";
export type PullRequestContentsQuery = PullRequestFilesQuery & { filename: string };
export type PullRequestContents = { mergeBaseOid: string; headOid: string; oldFile: {name:string;contents:string} | null; newFile: {name:string;contents:string} | null };
