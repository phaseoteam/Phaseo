/** The right pane's surfaces. Each is self-contained and fills the box it is mounted in. */
export { DiffSurface } from "./DiffSurface";
export { GitActions } from "./GitActions";
export { FileBrowserSurface } from "./FileBrowserSurface";
export { FileSurface } from "./FileSurface";
export { TerminalDrawer, TerminalSurface, TERMINAL_DRAWER_HEIGHT, createTerminal, closeTerminal, terminalsFor, terminalTitle, useTerminalSessions } from "../views/Terminals";
export { OPEN_PROJECT_FILE_EVENT, PROJECT_CHANGED_EVENT, announceProjectChange, openProjectFile, type OpenProjectFileDetail, type ProjectChangedDetail } from "./events";
export { REVIEW_COMMENT_ADDED_EVENT, REVIEW_COMMENT_REMOVED_EVENT, formatReviewComment, formatReviewComments, reviewComments, takeReviewComments, useReviewComments, type ReviewComment, type ReviewCommentAddedDetail, type ReviewCommentRemovedDetail } from "../lib/reviewComments";
