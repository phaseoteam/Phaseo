export type PullRequestFilesQuery = { number: number; page: number; headOid: string; baseOid: string };
export type PullRequestFile = { filename: string; previousFilename?: string; status: string; additions: number; deletions: number; blobOid: string; patch?: string; preview: "available" | "unavailable" | "too-large" };
export type PullRequestFilesPage = { repository: string; number: number; headOid: string; baseOid: string; page: number; total: number; files: PullRequestFile[]; hasNext: boolean; limitReached: boolean };
export function validatePullRequestFilesQuery(value: unknown): PullRequestFilesQuery {
 if(!value||typeof value!=="object")throw Error("Invalid pull-request files request.");const query=value as PullRequestFilesQuery;
 if(!Number.isSafeInteger(query.number)||query.number<1||query.number>2147483647||!Number.isSafeInteger(query.page)||query.page<1||query.page>30||[query.headOid,query.baseOid].some(value=>typeof value!=="string"||!/^[a-f0-9]{40}$/i.test(value)))throw Error("Invalid pull-request files request.");return query;
}
