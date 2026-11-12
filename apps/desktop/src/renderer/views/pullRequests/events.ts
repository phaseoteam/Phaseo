/**
 * Asks the right pane to open a pull request in its own tab (or the chat's linked list), from anywhere: a stack menu,
 * a chat row's badge, a link in a message. The pane belongs to the open chat, so the request carries no chat.
 */
export const OPEN_PULL_REQUEST_EVENT = "phaseo:open-pull-request";
export type OpenPullRequestDetail = { number: number } | { list: true };
export const openPullRequest = (detail: OpenPullRequestDetail) => window.dispatchEvent(new CustomEvent<OpenPullRequestDetail>(OPEN_PULL_REQUEST_EVENT, { detail }));
