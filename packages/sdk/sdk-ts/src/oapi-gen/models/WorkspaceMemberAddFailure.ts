export interface WorkspaceMemberAddFailure {
  code: "forbidden" | "conflict" | "internal_error";
  message: string;
  user_id: string;
}
