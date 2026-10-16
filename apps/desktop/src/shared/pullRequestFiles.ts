/** `commit` reads that one commit's own changes instead of the whole pull request. */
export type PullRequestFilesQuery = { number: number; page: number; headOid: string; baseOid: string; commit?: string };
export type PullRequestFile = { filename: string; previousFilename?: string; status: string; additions: number; deletions: number; blobOid: string; patch?: string; preview: "available" | "unavailable" | "too-large" };
export type PullRequestFilesPage = { repository: string; number: number; headOid: string; baseOid: string; page: number; total: number; files: PullRequestFile[]; hasNext: boolean; limitReached: boolean };
export function validatePullRequestFilesQuery(value: unknown): PullRequestFilesQuery {
 if(!value||typeof value!=="object")throw Error("Invalid pull-request files request.");const query=value as PullRequestFilesQuery;
 if(!Number.isSafeInteger(query.number)||query.number<1||query.number>2147483647||!Number.isSafeInteger(query.page)||query.page<1||query.page>30||[query.headOid,query.baseOid].some(value=>typeof value!=="string"||!/^[a-f0-9]{40}$/i.test(value))||(query.commit!==undefined&&(typeof query.commit!=="string"||!/^[a-f0-9]{40}$/i.test(query.commit))))throw Error("Invalid pull-request files request.");
 return {number:query.number,page:query.page,headOid:query.headOid,baseOid:query.baseOid,...(query.commit?{commit:query.commit.toLowerCase()}:{})};
}

/** GitHub's own record of which files this reader has marked viewed. `dismissed` is viewed, then pushed to since. */
export type PullRequestFileViewedState = "viewed" | "unviewed" | "dismissed";
export type PullRequestFilesViewed = { files: { path: string; state: PullRequestFileViewedState }[]; truncated: boolean };
export type PullRequestSetFilesViewed = { number: number; files: { path: string; viewed: boolean }[] };
const viewedPath = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.includes("\0");
export function validateSetFilesViewed(value: unknown): PullRequestSetFilesViewed {
 const request = value && typeof value === "object" ? value as Record<string, unknown> : {};
 if (!Number.isSafeInteger(request.number) || Number(request.number) < 1 || Number(request.number) > 2147483647 || !Array.isArray(request.files) || !request.files.length || request.files.length > 100) throw Error("Invalid viewed-files request.");
 const files = request.files.map(entry => { const file = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; if (!viewedPath(file.path) || typeof file.viewed !== "boolean") throw Error("Invalid viewed-files request."); return { path: file.path, viewed: file.viewed }; });
 return { number: Number(request.number), files };
}
